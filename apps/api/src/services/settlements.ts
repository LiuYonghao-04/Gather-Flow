import { createHash, randomUUID } from 'node:crypto';
import {
  matchTransfers,
  type FinanceWorkspace,
  type Settlement,
  type SettlementSnapshot,
  type SettlementWorkspace,
  type ActivityArchive,
} from '@gatherflow/shared';
import { ExpenseService } from './expenses';
import { ensure } from '../errors';

export class SettlementService extends ExpenseService {
  private financeVersion(finance: FinanceWorkspace): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          members: finance.members.map((x) => x.id).sort(),
          expenses: finance.expenses
            .map((x) => ({ id: x.id, revision: x.revision, status: x.status }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }),
      )
      .digest('hex');
  }

  private historyOf(activityId: string): Settlement[] {
    const rows = this.db
      .prepare(
        `SELECT id, sequence, finance_version AS financeVersion, snapshot_json AS snapshotJson,
      created_by AS createdBy, created_at AS createdAt, reopened_by AS reopenedBy, reopened_at AS reopenedAt
      FROM settlements WHERE activity_id = ? ORDER BY sequence DESC`,
      )
      .all(activityId) as (Omit<Settlement, 'snapshot' | 'transfers'> & { snapshotJson: string })[];
    return rows.map(({ snapshotJson, ...row }) => ({
      ...row,
      snapshot: JSON.parse(snapshotJson) as SettlementSnapshot,
      transfers: this.db
        .prepare(
          `SELECT id, from_user_id AS fromUserId, to_user_id AS toUserId, amount_cents AS amountCents,
        received_by AS receivedBy, received_at AS receivedAt FROM settlement_transfers WHERE settlement_id = ? ORDER BY rowid`,
        )
        .all(row.id) as Settlement['transfers'],
    }));
  }

  settlement(activityId: string, actor: string): SettlementWorkspace {
    // A read transaction keeps metadata, bills and receipts in one SQLite snapshot.
    return this.db.transaction(() => {
      const activity = this.detail(activityId, actor);
      const finance = this.finance(activityId, actor);
      const history = this.historyOf(activityId);
      const current = history.find((x) => !x.reopenedAt) ?? null;
      const freezeReasons: string[] = [];
      const closeReasons: string[] = [];
      if (activity.status === 'ARCHIVED') {
        freezeReasons.push('活动已归档，只能查看');
        closeReasons.push('活动已结束并归档');
      }
      if (activity.ownerId !== actor) {
        freezeReasons.push('只有房主可以冻结最终清算');
        closeReasons.push('只有房主可以结束活动');
      }
      if (finance.estimate.pendingCount) {
        const reason = `${finance.estimate.pendingCount} 笔账单仍待其他分摊成员确认`;
        freezeReasons.push(reason);
        closeReasons.push(reason);
      }
      if (finance.estimate.disputedCount) {
        const reason = `${finance.estimate.disputedCount} 笔账单有未撤销异议`;
        freezeReasons.push(reason);
        closeReasons.push(reason);
      }
      if (current) freezeReasons.push('已有最终清算，不能重复冻结');
      const financeVersion = this.financeVersion(finance);
      if (current && current.financeVersion !== financeVersion)
        closeReasons.push('账单与快照不一致，请核对历史记录');
      if (!current && finance.expenses.some((x) => x.status === 'CONFIRMED'))
        closeReasons.push('请先冻结最终清算');
      const remaining = current?.transfers.filter((x) => !x.receivedAt).length ?? 0;
      if (remaining) closeReasons.push(`${remaining} 笔转账尚待收款人确认到账`);
      const archived = this.db
        .prepare(
          'SELECT archived_at AS archivedAt, archived_by AS archivedBy FROM activities WHERE id = ?',
        )
        .get(activityId) as Pick<SettlementWorkspace, 'archivedAt' | 'archivedBy'>;
      return {
        activity,
        financeVersion,
        current,
        history,
        freezeReasons,
        closeReasons,
        canFreeze: !freezeReasons.length,
        canReopen:
          activity.status === 'ACTIVE' &&
          activity.ownerId === actor &&
          Boolean(current) &&
          !current!.transfers.some((x) => x.receivedAt),
        canClose: !closeReasons.length,
        ...archived,
      };
    })();
  }

  private saveSnapshot(activityId: string, actor: string, finance: FinanceWorkspace): void {
    const id = randomUUID();
    const at = new Date().toISOString();
    const sequence = (
      this.db
        .prepare(
          'SELECT COALESCE(MAX(sequence),0) + 1 AS next FROM settlements WHERE activity_id = ?',
        )
        .get(activityId) as { next: number }
    ).next;
    const snapshot: SettlementSnapshot = {
      members: finance.members,
      expenses: finance.expenses.map((e) => {
        ensure(
          e.status === 'CONFIRMED' || e.status === 'PERSONAL_ONLY',
          409,
          'BILLS_NOT_READY',
          '请先处理所有待确认和异议账单',
        );
        return {
          id: e.id,
          revision: e.revision,
          status: e.status,
          recorderId: e.recorderId,
          input: e.revisions[0]!.input,
        };
      }),
      balances: finance.estimate.balances,
      confirmedTotalCents: finance.estimate.confirmedTotalCents,
    };
    this.db
      .prepare(
        'INSERT INTO settlements (id,activity_id,sequence,finance_version,snapshot_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        id,
        activityId,
        sequence,
        this.financeVersion(finance),
        JSON.stringify(snapshot),
        actor,
        at,
      );
    const transfers = matchTransfers(snapshot.balances);
    for (const t of transfers)
      this.db
        .prepare(
          'INSERT INTO settlement_transfers (id,settlement_id,from_user_id,to_user_id,amount_cents) VALUES (?,?,?,?,?)',
        )
        .run(randomUUID(), id, t.fromUserId, t.toUserId, t.amountCents);
    this.audit(activityId, actor, 'SETTLEMENT_FROZEN', id, null, {
      sequence,
      confirmedTotalCents: snapshot.confirmedTotalCents,
      transferCount: transfers.length,
    });
  }

  freeze(activityId: string, actor: string, expectedFinanceVersion: string): SettlementWorkspace {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor, true);
        const state = this.settlement(activityId, actor);
        ensure(
          state.financeVersion === expectedFinanceVersion,
          409,
          'FINANCE_CHANGED',
          '账单或成员已变化，请刷新后核对再冻结',
        );
        ensure(state.canFreeze, 409, 'SETTLEMENT_NOT_READY', state.freezeReasons.join('；'));
        this.saveSnapshot(activityId, actor, this.finance(activityId, actor));
        return this.settlement(activityId, actor);
      })
      .immediate();
  }

  private requireCurrent(activityId: string, actor: string, settlementId: string): Settlement {
    const current = this.settlement(activityId, actor).current;
    ensure(
      current?.id === settlementId,
      409,
      'SETTLEMENT_CHANGED',
      '这份清算已失效或更新，请刷新后查看当前清算',
    );
    return current;
  }

  reopen(activityId: string, actor: string, settlementId: string): SettlementWorkspace {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor, true);
        const current = this.requireCurrent(activityId, actor, settlementId);
        ensure(
          !current.transfers.some((t) => t.receivedAt),
          409,
          'RECEIPTS_EXIST',
          '已有到账确认，不能重开或覆盖历史，请人工核对；当前不支持收款后的更正流程',
        );
        const at = new Date().toISOString();
        this.db
          .prepare('UPDATE settlements SET reopened_by = ?, reopened_at = ? WHERE id = ?')
          .run(actor, at, current.id);
        this.audit(
          activityId,
          actor,
          'SETTLEMENT_REOPENED',
          current.id,
          { sequence: current.sequence, frozen: true },
          { frozen: false, reopenedAt: at },
        );
        return this.settlement(activityId, actor);
      })
      .immediate();
  }

  receive(
    activityId: string,
    actor: string,
    settlementId: string,
    transferId: string,
  ): SettlementWorkspace {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const current = this.requireCurrent(activityId, actor, settlementId);
        const transfer = current.transfers.find((t) => t.id === transferId);
        ensure(transfer, 404, 'TRANSFER_NOT_FOUND', '这笔转账不属于当前清算');
        ensure(
          transfer.toUserId === actor,
          403,
          'RECEIVER_REQUIRED',
          '只有这笔转账的最终收款人可以确认到账',
        );
        if (!transfer.receivedAt) {
          const at = new Date().toISOString();
          this.db
            .prepare(
              'UPDATE settlement_transfers SET received_by = ?, received_at = ? WHERE id = ? AND received_at IS NULL',
            )
            .run(actor, at, transfer.id);
          this.audit(
            activityId,
            actor,
            'SETTLEMENT_RECEIVED',
            transfer.id,
            { receivedAt: null },
            {
              settlementId,
              fromUserId: transfer.fromUserId,
              toUserId: actor,
              amountCents: transfer.amountCents,
              receivedAt: at,
            },
          );
        }
        return this.settlement(activityId, actor);
      })
      .immediate();
  }

  close(
    activityId: string,
    actor: string,
    expectedFinanceVersion: string,
    expectedSettlementId: string | null,
  ): SettlementWorkspace {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor, true);
        const state = this.settlement(activityId, actor);
        ensure(
          state.financeVersion === expectedFinanceVersion &&
            (state.current?.id ?? null) === expectedSettlementId,
          409,
          'FINANCE_CHANGED',
          '财务状态已变化，请刷新后核对再结束',
        );
        ensure(state.canClose, 409, 'CANNOT_CLOSE', state.closeReasons.join('；'));
        // With no shared bills, the owner's explicit close creates a settled zero-transfer snapshot.
        if (!state.current) this.saveSnapshot(activityId, actor, this.finance(activityId, actor));
        const at = new Date().toISOString();
        this.db
          .prepare(
            "UPDATE activities SET status = 'ARCHIVED', archived_at = ?, archived_by = ? WHERE id = ?",
          )
          .run(at, actor, activityId);
        this.audit(
          activityId,
          actor,
          'ACTIVITY_ARCHIVED',
          activityId,
          { status: 'ACTIVE' },
          { status: 'ARCHIVED', archivedAt: at, settlementId: this.historyOf(activityId)[0]!.id },
        );
        return this.settlement(activityId, actor);
      })
      .immediate();
  }

  archive(activityId: string, actor: string): ActivityArchive {
    return this.db.transaction(() => {
      const settlement = this.settlement(activityId, actor);
      ensure(
        settlement.activity.status === 'ARCHIVED',
        409,
        'NOT_ARCHIVED',
        '活动尚未结束，请先查看最终清算',
      );
      return {
        settlement,
        workspace: this.workspace(activityId, actor),
        finance: this.finance(activityId, actor),
        evidence: this.listEvidence(activityId, actor),
      };
    })();
  }
}
