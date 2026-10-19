import { randomUUID } from 'node:crypto';
import {
  expenseInputSchema,
  splitEqually,
  netBalances,
  matchTransfers,
  type Expense,
  type ExpenseInput,
  type ExpenseRevision,
  type FinanceWorkspace,
} from '@gatherflow/shared';
import { EvidenceService } from './evidence';
import { ensure } from '../errors';

export class ExpenseService extends EvidenceService {
  expense(activityId: string, id: string, actor: string): Expense {
    this.requireMember(activityId, actor);
    const row = this.db
      .prepare(
        'SELECT id,activity_id AS activityId,recorder_id AS recorderId,current_revision AS revision,created_at AS createdAt FROM expenses WHERE id = ? AND activity_id = ?',
      )
      .get(id, activityId) as
      | Pick<Expense, 'id' | 'activityId' | 'recorderId' | 'revision' | 'createdAt'>
      | undefined;
    ensure(row, 404, 'EXPENSE_NOT_FOUND', '账单不存在');
    const revisions = (
      this.db
        .prepare(
          'SELECT revision,input_json AS inputJson,actor_id AS actorId,created_at AS createdAt FROM expense_revisions WHERE expense_id = ? ORDER BY revision DESC',
        )
        .all(id) as (Omit<ExpenseRevision, 'input'> & { inputJson: string })[]
    ).map(({ inputJson, ...v }) => ({ ...v, input: JSON.parse(inputJson) as ExpenseInput }));
    const input = revisions[0]!.input;
    const confirmations = this.db
      .prepare(
        'SELECT user_id AS userId, revision, created_at AS createdAt FROM expense_confirmations WHERE expense_id = ? ORDER BY revision,user_id',
      )
      .all(id) as Expense['confirmations'];
    const disputes = this.db
      .prepare(
        'SELECT id,user_id AS userId,reason,revision,created_at AS createdAt,withdrawn_at AS withdrawnAt FROM expense_disputes WHERE expense_id = ? ORDER BY rowid DESC',
      )
      .all(id) as Expense['disputes'];
    const personal = input.shares.length === 1 && input.shares[0]!.userId === input.payerId;
    const status: Expense['status'] = disputes.some((x) => !x.withdrawnAt)
      ? 'DISPUTED'
      : personal
        ? 'PERSONAL_ONLY'
        : confirmations.some(
              (x) =>
                x.revision === row.revision &&
                x.userId !== row.recorderId &&
                input.shares.some((s) => s.userId === x.userId),
            )
          ? 'CONFIRMED'
          : 'PENDING_CONFIRMATION';
    const evidence = this.listEvidence(activityId, actor).filter((x) =>
      input.evidenceIds.includes(x.id),
    );
    return { ...row, ...input, status, revisions, confirmations, disputes, evidence };
  }
  validateInput(activityId: string, actor: string, input: ExpenseInput): ExpenseInput {
    const parsed = expenseInputSchema.parse(input);
    const members = this.detail(activityId, actor).members.map((x) => x.id);
    ensure(
      members.includes(parsed.payerId) && parsed.shares.every((s) => members.includes(s.userId)),
      400,
      'INVALID_MEMBERS',
      '付款人和分摊人必须属于当前活动',
    );
    if (parsed.taskId) this.task(activityId, parsed.taskId, actor);
    const evidence = this.listEvidence(activityId, actor);
    ensure(
      parsed.evidenceIds.every((id) =>
        evidence.some((e) => e.id === id && (!parsed.taskId || e.taskId === parsed.taskId)),
      ),
      400,
      'INVALID_EVIDENCE',
      '凭证必须来自当前活动，且与所选任务一致',
    );
    return {
      ...parsed,
      shares:
        parsed.splitMode === 'EQUAL'
          ? splitEqually(
              parsed.totalCents,
              parsed.shares.map((s) => s.userId),
            )
          : [...parsed.shares].sort((a, b) => a.userId.localeCompare(b.userId)),
    };
  }
  createExpense(activityId: string, actor: string, input: ExpenseInput): Expense {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const valid = this.validateInput(activityId, actor, input);
        const id = randomUUID();
        const at = new Date().toISOString();
        this.db
          .prepare('INSERT INTO expenses (id,activity_id,recorder_id,created_at) VALUES (?,?,?,?)')
          .run(id, activityId, actor, at);
        this.db
          .prepare('INSERT INTO expense_revisions VALUES (?,1,?,?,?)')
          .run(id, JSON.stringify(valid), actor, at);
        this.audit(activityId, actor, 'EXPENSE_CREATED', id, null, { revision: 1, ...valid });
        return this.expense(activityId, id, actor);
      })
      .immediate();
  }
  reviseExpense(
    activityId: string,
    id: string,
    actor: string,
    expected: number,
    input: ExpenseInput,
  ): Expense {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const expense = this.expense(activityId, id, actor);
        this.checkVersion(expense.revision, expected);
        ensure(
          expense.recorderId === actor,
          403,
          'RECORDER_REQUIRED',
          '只有记账人可以修改账单，其他成员可提出异议',
        );
        const valid = this.validateInput(activityId, actor, input);
        this.db
          .prepare('INSERT INTO expense_revisions VALUES (?,?,?,?,?)')
          .run(id, expected + 1, JSON.stringify(valid), actor, new Date().toISOString());
        this.db
          .prepare('UPDATE expenses SET current_revision = current_revision + 1 WHERE id = ?')
          .run(id);
        // Outstanding disputes deliberately survive edits, even if their author is removed from shares.
        this.audit(
          activityId,
          actor,
          'EXPENSE_REVISED',
          id,
          { revision: expected, input: expense.revisions[0]!.input },
          { revision: expected + 1, input: valid },
        );
        return this.expense(activityId, id, actor);
      })
      .immediate();
  }
  confirmExpense(activityId: string, id: string, actor: string, expected: number): Expense {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const expense = this.expense(activityId, id, actor);
        this.checkVersion(expense.revision, expected);
        ensure(
          actor !== expense.recorderId && expense.shares.some((s) => s.userId === actor),
          403,
          'OTHER_SHARER_REQUIRED',
          '须由记账人以外的一位相关分摊成员确认',
        );
        const result = this.db
          .prepare('INSERT OR IGNORE INTO expense_confirmations VALUES (?,?,?,?)')
          .run(id, expected, actor, new Date().toISOString());
        if (result.changes)
          this.audit(activityId, actor, 'EXPENSE_CONFIRMED', id, null, { revision: expected });
        return this.expense(activityId, id, actor);
      })
      .immediate();
  }
  disputeExpense(
    activityId: string,
    id: string,
    actor: string,
    expected: number,
    reason: string,
  ): Expense {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const expense = this.expense(activityId, id, actor);
        this.checkVersion(expense.revision, expected);
        ensure(
          expense.payerId === actor || expense.shares.some((s) => s.userId === actor),
          403,
          'RELATED_MEMBER_REQUIRED',
          '只有付款人或分摊人可以对这笔费用提出异议',
        );
        ensure(
          !expense.disputes.some((x) => x.userId === actor && !x.withdrawnAt),
          409,
          'ALREADY_DISPUTED',
          '你已经提出异议，可在线下核对后自行撤销',
        );
        const disputeId = randomUUID();
        this.db
          .prepare(
            'INSERT INTO expense_disputes (id,expense_id,revision,user_id,reason,created_at) VALUES (?,?,?,?,?,?)',
          )
          .run(disputeId, id, expected, actor, reason, new Date().toISOString());
        this.audit(activityId, actor, 'EXPENSE_DISPUTED', id, null, {
          disputeId,
          revision: expected,
          reason,
        });
        return this.expense(activityId, id, actor);
      })
      .immediate();
  }
  withdrawDispute(activityId: string, id: string, actor: string, disputeId: string): Expense {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const expense = this.expense(activityId, id, actor);
        const dispute = expense.disputes.find((x) => x.id === disputeId);
        ensure(dispute, 404, 'NOT_FOUND', '异议不存在');
        ensure(dispute.userId === actor, 403, 'OWN_DISPUTE_ONLY', '只有提出这条异议的人可以撤销');
        ensure(!dispute.withdrawnAt, 409, 'ALREADY_WITHDRAWN', '这条异议已经撤销');
        this.db
          .prepare('UPDATE expense_disputes SET withdrawn_at = ? WHERE id = ?')
          .run(new Date().toISOString(), disputeId);
        this.audit(
          activityId,
          actor,
          'EXPENSE_DISPUTE_WITHDRAWN',
          id,
          { ...dispute },
          { disputeId, revision: expense.revision },
        );
        return this.expense(activityId, id, actor);
      })
      .immediate();
  }
  finance(activityId: string, actor: string): FinanceWorkspace {
    const members = this.detail(activityId, actor).members;
    const expenses = (
      this.db
        .prepare('SELECT id FROM expenses WHERE activity_id = ? ORDER BY rowid DESC')
        .all(activityId) as { id: string }[]
    ).map((x) => this.expense(activityId, x.id, actor));
    const balances = netBalances(
      members.map((x) => x.id),
      expenses,
    );
    const pendingCount = expenses.filter((x) => x.status === 'PENDING_CONFIRMATION').length;
    const disputedCount = expenses.filter((x) => x.status === 'DISPUTED').length;
    return {
      members,
      expenses,
      estimate: {
        balances,
        transfers: matchTransfers(balances),
        pendingCount,
        disputedCount,
        personalCount: expenses.filter((x) => x.status === 'PERSONAL_ONLY').length,
        confirmedTotalCents: expenses
          .filter((x) => x.status === 'CONFIRMED')
          .reduce((sum, x) => sum + x.totalCents, 0),
        readyForSettlement: !pendingCount && !disputedCount,
      },
    };
  }
}
