import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type {
  Proposal,
  ProposalCreate,
  ProposalVersion,
  Task,
  TaskRevision,
  Workspace,
  Plan,
  responseSchema,
  preferenceSchema,
  commentSchema,
  taskCreateSchema,
} from '@gatherflow/shared';
import { ActivityService } from './activities';
import { ensure } from '../errors';

type TaskRow = Omit<
  Task,
  | 'needsConfirmation'
  | 'completed'
  | 'status'
  | 'assigneeIds'
  | 'suggestions'
  | 'handovers'
  | 'revisions'
  | 'proposalIds'
> & { needsConfirmation: number; completed: number };
type ProposalRow = Pick<
  Proposal,
  'id' | 'activityId' | 'authorId' | 'taskId' | 'version' | 'execution' | 'createdAt'
>;
const now = () => new Date().toISOString();

export class CollaborationService extends ActivityService {
  task(activityId: string, id: string, actor: string): Task {
    this.requireMember(activityId, actor);
    const row = this.db
      .prepare(
        `SELECT id, activity_id AS activityId, title, brief, creator_id AS creatorId, content, revision, needs_confirmation AS needsConfirmation, completed, created_at AS createdAt FROM tasks WHERE id = ? AND activity_id = ?`,
      )
      .get(id, activityId) as TaskRow | undefined;
    ensure(row, 404, 'TASK_NOT_FOUND', '任务不存在');
    const assigneeIds = (
      this.db
        .prepare('SELECT user_id AS id FROM task_assignees WHERE task_id = ? ORDER BY user_id')
        .all(id) as { id: string }[]
    ).map((x) => x.id);
    const handovers = this.db
      .prepare(
        `SELECT id, from_user_id AS fromUserId, to_user_id AS toUserId, note, status, created_at AS createdAt, accepted_at AS acceptedAt FROM task_handovers WHERE task_id = ? ORDER BY rowid DESC`,
      )
      .all(id) as Task['handovers'];
    return {
      ...row,
      needsConfirmation: !!row.needsConfirmation,
      completed: !!row.completed,
      assigneeIds,
      handovers,
      status: handovers.some((x) => x.status === 'PENDING')
        ? 'HANDOVER_PENDING'
        : row.completed
          ? 'COMPLETED'
          : assigneeIds.length
            ? 'IN_PROGRESS'
            : 'UNCLAIMED',
      suggestions: this.db
        .prepare(
          `SELECT id, author_id AS authorId, body, status, reviewer_id AS reviewerId, review_note AS reviewNote, created_at AS createdAt FROM task_suggestions WHERE task_id = ? ORDER BY rowid DESC`,
        )
        .all(id) as Task['suggestions'],
      revisions: this.db
        .prepare(
          `SELECT revision, content, actor_id AS actorId, created_at AS createdAt FROM task_revisions WHERE task_id = ? ORDER BY revision DESC`,
        )
        .all(id) as TaskRevision[],
      proposalIds: (
        this.db.prepare('SELECT id FROM proposals WHERE task_id = ? ORDER BY rowid').all(id) as {
          id: string;
        }[]
      ).map((x) => x.id),
    };
  }
  requireAssignee(task: Task, actor: string) {
    ensure(
      task.assigneeIds.includes(actor),
      403,
      'ASSIGNEE_REQUIRED',
      '只有任务负责人可以操作；其他成员可以留下建议',
    );
  }
  checkVersion(actual: number, expected: number) {
    ensure(actual === expected, 409, 'VERSION_CONFLICT', '内容已更新，请刷新后查看最新版本再操作');
  }
  createTask(activityId: string, actor: string, input: z.infer<typeof taskCreateSchema>): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const id = randomUUID();
        const at = now();
        this.db
          .prepare(
            'INSERT INTO tasks (id,activity_id,title,brief,creator_id,needs_confirmation,created_at) VALUES (?,?,?,?,?,?,?)',
          )
          .run(id, activityId, input.title, input.brief, actor, +input.needsConfirmation, at);
        this.db.prepare('INSERT INTO task_revisions VALUES (?,1,?,?,?)').run(id, '', actor, at);
        this.audit(activityId, actor, 'TASK_CREATED', id, null, input);
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  assign(activityId: string, id: string, actor: string, userId: string): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        this.requireMember(activityId, userId);
        const task = this.task(activityId, id, actor);
        if (userId !== actor) this.requireAssignee(task, actor);
        if (!task.assigneeIds.includes(userId)) {
          this.db.prepare('INSERT INTO task_assignees VALUES (?,?)').run(id, userId);
          this.audit(
            activityId,
            actor,
            'TASK_ASSIGNED',
            id,
            { assigneeIds: task.assigneeIds },
            { userId },
          );
        }
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  editTask(activityId: string, id: string, actor: string, expected: number, content: string): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const task = this.task(activityId, id, actor);
        this.requireAssignee(task, actor);
        this.checkVersion(task.revision, expected);
        ensure(
          !this.db
            .prepare(
              "SELECT id FROM proposals WHERE task_id = ? AND execution IN ('BOOKED','DONE')",
            )
            .get(id),
          409,
          'EXECUTION_LOCKED',
          '已预订或已执行的方案已留存，请新建补充任务记录变更',
        );
        if (task.content === content) return task;
        this.db
          .prepare(
            'UPDATE tasks SET content = ?, revision = revision + 1, completed = 0 WHERE id = ?',
          )
          .run(content, id);
        this.db
          .prepare('INSERT INTO task_revisions VALUES (?,?,?,?,?)')
          .run(id, task.revision + 1, content, actor, now());
        this.audit(
          activityId,
          actor,
          'TASK_REVISED',
          id,
          { revision: task.revision, content: task.content },
          { revision: task.revision + 1, content },
        );
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  completeTask(
    activityId: string,
    id: string,
    actor: string,
    expected: number,
    completed: boolean,
  ): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const task = this.task(activityId, id, actor);
        this.requireAssignee(task, actor);
        this.checkVersion(task.revision, expected);
        this.db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(+completed, id);
        this.audit(
          activityId,
          actor,
          'TASK_PROGRESS',
          id,
          { completed: task.completed },
          { completed, revision: expected },
        );
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  suggest(activityId: string, id: string, actor: string, body: string): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        this.task(activityId, id, actor);
        const suggestionId = randomUUID();
        this.db
          .prepare(
            'INSERT INTO task_suggestions (id,task_id,author_id,body,created_at) VALUES (?,?,?,?,?)',
          )
          .run(suggestionId, id, actor, body, now());
        this.audit(activityId, actor, 'TASK_SUGGESTED', id, null, { suggestionId, body });
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  reviewSuggestion(
    activityId: string,
    id: string,
    actor: string,
    suggestionId: string,
    decision: 'ACCEPTED' | 'REJECTED',
    note: string,
  ): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const task = this.task(activityId, id, actor);
        this.requireAssignee(task, actor);
        const item = task.suggestions.find((x) => x.id === suggestionId);
        ensure(item, 404, 'NOT_FOUND', '建议不存在');
        ensure(item.status === 'PENDING', 409, 'ALREADY_REVIEWED', '这条建议已处理');
        this.db
          .prepare(
            'UPDATE task_suggestions SET status = ?, reviewer_id = ?, review_note = ? WHERE id = ?',
          )
          .run(decision, actor, note, suggestionId);
        this.audit(
          activityId,
          actor,
          'SUGGESTION_REVIEWED',
          id,
          { suggestionId, status: item.status },
          { suggestionId, status: decision, note },
        );
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  handover(activityId: string, id: string, actor: string, toUserId: string, note: string): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        this.requireMember(activityId, toUserId);
        const task = this.task(activityId, id, actor);
        this.requireAssignee(task, actor);
        ensure(toUserId !== actor, 400, 'SAME_ASSIGNEE', '请选择另一位朋友接手');
        ensure(
          !task.handovers.some((x) => x.status === 'PENDING' && x.fromUserId === actor),
          409,
          'HANDOVER_PENDING',
          '已有交接等待接受，可先撤销原申请',
        );
        const handoverId = randomUUID();
        this.db
          .prepare(
            'INSERT INTO task_handovers (id,task_id,from_user_id,to_user_id,note,created_at) VALUES (?,?,?,?,?,?)',
          )
          .run(handoverId, id, actor, toUserId, note, now());
        this.audit(activityId, actor, 'HANDOVER_REQUESTED', id, null, {
          handoverId,
          fromUserId: actor,
          toUserId,
          note,
        });
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  resolveHandover(
    activityId: string,
    id: string,
    actor: string,
    handoverId: string,
    accept: boolean,
  ): Task {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const task = this.task(activityId, id, actor);
        const item = task.handovers.find((x) => x.id === handoverId);
        ensure(item, 404, 'NOT_FOUND', '交接不存在');
        ensure(item.status === 'PENDING', 409, 'HANDOVER_RESOLVED', '交接已处理');
        ensure(
          accept ? actor === item.toUserId : actor === item.fromUserId,
          403,
          'HANDOVER_FORBIDDEN',
          accept ? '只有被指定的接手人可以接受' : '只有发起人可以撤销交接',
        );
        if (accept) {
          // The recipient may already be a co-assignee. Always add before removing responsibility.
          this.db.prepare('INSERT OR IGNORE INTO task_assignees VALUES (?,?)').run(id, actor);
          this.db
            .prepare('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?')
            .run(id, item.fromUserId);
        }
        this.db
          .prepare('UPDATE task_handovers SET status = ?, accepted_at = ? WHERE id = ?')
          .run(accept ? 'ACCEPTED' : 'CANCELLED', accept ? now() : null, handoverId);
        this.audit(
          activityId,
          actor,
          accept ? 'HANDOVER_ACCEPTED' : 'HANDOVER_CANCELLED',
          id,
          { handoverId, fromUserId: item.fromUserId },
          { toUserId: item.toUserId },
        );
        return this.task(activityId, id, actor);
      })
      .immediate();
  }
  proposal(activityId: string, id: string, actor: string): Proposal {
    const activity = this.detail(activityId, actor);
    const row = this.db
      .prepare(
        'SELECT id, activity_id AS activityId, author_id AS authorId, task_id AS taskId, current_version AS version, execution, created_at AS createdAt FROM proposals WHERE id = ? AND activity_id = ?',
      )
      .get(id, activityId) as ProposalRow | undefined;
    ensure(row, 404, 'PROPOSAL_NOT_FOUND', '方案不存在');
    const versions = (
      this.db
        .prepare(
          'SELECT version, content_json AS contentJson, task_revision AS taskRevision, actor_id AS actorId, created_at AS createdAt FROM proposal_versions WHERE proposal_id = ? ORDER BY version DESC',
        )
        .all(id) as (Omit<ProposalVersion, 'content'> & { contentJson: string })[]
    ).map(({ contentJson, ...v }) => ({
      ...v,
      content: JSON.parse(contentJson) as ProposalVersion['content'],
    }));
    const current = versions[0]!;
    const ids = (
      this.db
        .prepare('SELECT user_id AS id FROM proposal_participants WHERE proposal_id = ?')
        .all(id) as { id: string }[]
    ).map((x) => x.id);
    const participants = activity.members.filter((x) => ids.includes(x.id));
    const responses = this.db
      .prepare(
        'SELECT user_id AS userId, actor_id AS actorId, response, reason, version, created_at AS createdAt FROM proposal_responses WHERE proposal_id = ? ORDER BY version, user_id',
      )
      .all(id) as Proposal['responses'];
    const active = responses.filter((x) => x.version === row.version);
    const task = row.taskId ? this.task(activityId, row.taskId, actor) : null;
    const stale = task && current.taskRevision !== task.revision;
    const confirmed =
      participants.every((p) =>
        active.some((r) => r.userId === p.id && r.response !== 'OBJECTION'),
      ) && active.some((r) => r.response === 'CONFIRM');
    const status: Proposal['status'] = stale ? 'STALE' : confirmed ? 'CONFIRMED' : 'DISCUSSING';
    return {
      ...row,
      status,
      execution:
        row.execution === 'BOOKED' || row.execution === 'DONE'
          ? row.execution
          : status === 'CONFIRMED'
            ? 'CONFIRMED'
            : 'PLANNED',
      versions,
      content: current.content,
      participants,
      responses,
      assigneeIds: task?.assigneeIds ?? [row.authorId],
      preferences: this.db
        .prepare(
          'SELECT user_id AS userId, kind, note, version, updated_at AS updatedAt FROM proposal_preferences WHERE proposal_id = ? ORDER BY version,user_id',
        )
        .all(id) as Proposal['preferences'],
      comments: this.db
        .prepare(
          'SELECT id, author_id AS authorId, version, body, created_at AS createdAt FROM proposal_comments WHERE proposal_id = ? ORDER BY rowid',
        )
        .all(id) as Proposal['comments'],
    };
  }
  createProposal(activityId: string, actor: string, input: ProposalCreate): Proposal {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const activity = this.detail(activityId, actor);
        const ids = input.participantIds ?? activity.members.map((x) => x.id);
        ensure(
          new Set(ids).size === ids.length &&
            ids.every((id) => activity.members.some((m) => m.id === id)),
          400,
          'INVALID_PARTICIPANTS',
          '参与者必须是不同的活动成员',
        );
        const task = input.taskId ? this.task(activityId, input.taskId, actor) : null;
        if (task) this.requireAssignee(task, actor);
        const id = randomUUID();
        const at = now();
        this.db
          .prepare(
            'INSERT INTO proposals (id,activity_id,author_id,task_id,created_at) VALUES (?,?,?,?,?)',
          )
          .run(id, activityId, actor, input.taskId, at);
        this.db
          .prepare('INSERT INTO proposal_versions VALUES (?,1,?,?,?,?)')
          .run(id, JSON.stringify(input.content), task?.revision ?? null, actor, at);
        for (const userId of ids)
          this.db.prepare('INSERT INTO proposal_participants VALUES (?,?)').run(id, userId);
        this.audit(activityId, actor, 'PROPOSAL_CREATED', id, null, {
          ...input,
          participantIds: ids,
          version: 1,
        });
        return this.proposal(activityId, id, actor);
      })
      .immediate();
  }
  requireUnlocked(proposal: Proposal) {
    ensure(
      !['BOOKED', 'DONE'].includes(proposal.execution),
      409,
      'EXECUTION_LOCKED',
      '已预订或已执行的方案已留存，请新建补充方案说明变更',
    );
  }
  reviseProposal(
    activityId: string,
    id: string,
    actor: string,
    expected: number,
    content: Proposal['content'],
    requestedTaskId?: string | null,
  ): Proposal {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const proposal = this.proposal(activityId, id, actor);
        this.checkVersion(proposal.version, expected);
        this.requireUnlocked(proposal);
        ensure(
          proposal.assigneeIds.includes(actor),
          403,
          'EDITOR_REQUIRED',
          '只有提案人或关联任务负责人可以修改方案',
        );
        ensure(
          !proposal.taskId || requestedTaskId === undefined || requestedTaskId === proposal.taskId,
          409,
          'TASK_LINK_LOCKED',
          '已有任务关联不能转移或解除；请新建补充方案',
        );
        const taskId = requestedTaskId ?? proposal.taskId;
        const task = taskId ? this.task(activityId, taskId, actor) : null;
        if (task) this.requireAssignee(task, actor);
        const taskRevision = task?.revision ?? null;
        this.db
          .prepare('INSERT INTO proposal_versions VALUES (?,?,?,?,?,?)')
          .run(id, expected + 1, JSON.stringify(content), taskRevision, actor, now());
        this.db
          .prepare(
            "UPDATE proposals SET current_version = current_version + 1, execution = 'PLANNED', task_id = ? WHERE id = ?",
          )
          .run(taskId, id);
        this.audit(
          activityId,
          actor,
          'PROPOSAL_REVISED',
          id,
          { version: expected, content: proposal.content, taskId: proposal.taskId },
          { version: expected + 1, content, taskId },
        );
        return this.proposal(activityId, id, actor);
      })
      .immediate();
  }
  respond(
    activityId: string,
    id: string,
    actor: string,
    input: z.infer<typeof responseSchema>,
  ): Proposal {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const proposal = this.proposal(activityId, id, actor);
        this.checkVersion(proposal.version, input.expectedVersion);
        this.requireUnlocked(proposal);
        ensure(
          proposal.status !== 'STALE',
          409,
          'TASK_CHANGED',
          '关联任务已变更，请负责人更新方案版本后再表态',
        );
        const userId = input.userId ?? actor;
        ensure(
          proposal.participants.some((x) => x.id === userId),
          403,
          'NOT_PARTICIPANT',
          '此方案只收集所选参与者的确认',
        );
        const previous = proposal.responses.find(
          (x) => x.userId === userId && x.version === proposal.version,
        );
        if (userId !== actor) {
          this.requireMember(activityId, actor, true);
          ensure(input.response !== 'OBJECTION', 403, 'PROXY_OBJECTION', '房主不能替成员提出异议');
          ensure(
            previous?.response !== 'OBJECTION',
            409,
            'OWN_OBJECTION_ONLY',
            '成员提出的异议须由本人更正，或更新方案后重新表态',
          );
        }
        ensure(
          input.response !== 'OBJECTION' || !!input.reason,
          400,
          'REASON_REQUIRED',
          '请说明需要继续商量的地方',
        );
        this.db
          .prepare(
            'INSERT INTO proposal_responses VALUES (?,?,?,?,?,?,?) ON CONFLICT(proposal_id,version,user_id) DO UPDATE SET actor_id=excluded.actor_id,response=excluded.response,reason=excluded.reason,created_at=excluded.created_at',
          )
          .run(id, proposal.version, userId, actor, input.response, input.reason, now());
        this.audit(activityId, actor, 'PROPOSAL_RESPONDED', id, previous ? { ...previous } : null, {
          userId,
          response: input.response,
          reason: input.reason,
          version: proposal.version,
          proxy: actor !== userId,
        });
        return this.proposal(activityId, id, actor);
      })
      .immediate();
  }
  preference(
    activityId: string,
    id: string,
    actor: string,
    input: z.infer<typeof preferenceSchema>,
  ): Proposal {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const p = this.proposal(activityId, id, actor);
        this.checkVersion(p.version, input.expectedVersion);
        this.db
          .prepare(
            'INSERT INTO proposal_preferences VALUES (?,?,?,?,?,?) ON CONFLICT(proposal_id,version,user_id) DO UPDATE SET kind=excluded.kind,note=excluded.note,updated_at=excluded.updated_at',
          )
          .run(id, p.version, actor, input.kind, input.note, now());
        this.audit(activityId, actor, 'PREFERENCE_UPDATED', id, null, input);
        return this.proposal(activityId, id, actor);
      })
      .immediate();
  }
  comment(
    activityId: string,
    id: string,
    actor: string,
    input: z.infer<typeof commentSchema>,
  ): Proposal {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const p = this.proposal(activityId, id, actor);
        this.checkVersion(p.version, input.expectedVersion);
        this.db
          .prepare('INSERT INTO proposal_comments VALUES (?,?,?,?,?,?)')
          .run(randomUUID(), id, p.version, actor, input.body, now());
        this.audit(activityId, actor, 'PROPOSAL_COMMENTED', id, null, input);
        return this.proposal(activityId, id, actor);
      })
      .immediate();
  }
  execute(
    activityId: string,
    id: string,
    actor: string,
    expected: number,
    execution: 'BOOKED' | 'DONE',
  ): Proposal {
    return this.db
      .transaction(() => {
        this.requireActive(activityId, actor);
        const p = this.proposal(activityId, id, actor);
        this.checkVersion(p.version, expected);
        ensure(
          p.assigneeIds.includes(actor),
          403,
          'ASSIGNEE_REQUIRED',
          '只有负责人可以登记执行进展',
        );
        ensure(p.status === 'CONFIRMED', 409, 'NOT_CONFIRMED', '方案尚未由全部实际参与者确认');
        ensure(
          p.execution !== 'DONE' || execution === 'DONE',
          409,
          'EXECUTION_LOCKED',
          '已完成的执行不能回退',
        );
        if (execution === 'BOOKED' || p.content.needsBooking)
          ensure(
            !!this.db
              .prepare('SELECT id FROM evidence WHERE proposal_id = ? AND proposal_version = ?')
              .get(id, expected),
            409,
            'EVIDENCE_REQUIRED',
            '请先为本版方案上传至少一份预订凭证',
          );
        this.db.prepare('UPDATE proposals SET execution = ? WHERE id = ?').run(execution, id);
        this.audit(
          activityId,
          actor,
          'EXECUTION_UPDATED',
          id,
          { execution: p.execution },
          { execution, version: expected },
        );
        return this.proposal(activityId, id, actor);
      })
      .immediate();
  }
  workspace(activityId: string, actor: string): Workspace {
    const activity = this.detail(activityId, actor);
    const proposals = (
      this.db
        .prepare('SELECT id FROM proposals WHERE activity_id = ? ORDER BY rowid DESC')
        .all(activityId) as { id: string }[]
    ).map((x) => this.proposal(activityId, x.id, actor));
    const tasks = (
      this.db
        .prepare('SELECT id FROM tasks WHERE activity_id = ? ORDER BY rowid DESC')
        .all(activityId) as { id: string }[]
    ).map((x) => this.task(activityId, x.id, actor));
    return {
      members: activity.members,
      financialFrozen: this.financialFrozen(activityId),
      ownerId: activity.ownerId,
      status: activity.status,
      proposals,
      tasks,
      currentUserId: actor,
      plan: buildPlan(proposals),
    };
  }
}

export function buildPlan(proposals: Proposal[]): Plan {
  const items = proposals
    .filter((p) => p.status === 'CONFIRMED')
    .sort(
      (a, b) =>
        (a.content.date ?? '9999').localeCompare(b.content.date ?? '9999') ||
        (a.content.startTime ?? '').localeCompare(b.content.startTime ?? '') ||
        a.id.localeCompare(b.id),
    );
  const conflicts: Plan['conflicts'] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const ac = a.content;
      const bc = b.content;
      const confirmedIds = a.responses
        .filter((r) => r.version === a.version && r.response === 'CONFIRM')
        .map((r) => r.userId);
      if (
        !ac.date ||
        ac.date !== bc.date ||
        !ac.startTime ||
        !bc.startTime ||
        !b.responses.some(
          (r) =>
            r.version === b.version && r.response === 'CONFIRM' && confirmedIds.includes(r.userId),
        )
      )
        continue;
      const overlap =
        ac.startTime < (bc.endTime ?? bc.startTime) && bc.startTime < (ac.endTime ?? ac.startTime);
      const arrival =
        (ac.category === 'TRANSPORT' &&
          ac.endTime &&
          bc.category === 'ACTIVITY' &&
          bc.startTime < ac.endTime) ||
        (bc.category === 'TRANSPORT' &&
          bc.endTime &&
          ac.category === 'ACTIVITY' &&
          ac.startTime < bc.endTime);
      if (overlap || arrival || ac.startTime === bc.startTime)
        conflicts.push({
          firstId: a.id,
          secondId: b.id,
          message: `「${ac.title}」与「${bc.title}」${arrival ? '请核对抵达时间与游玩开始时间' : '时间重叠'}，有共同参与者，请一起核对。`,
        });
    }
  return { items, conflicts };
}
