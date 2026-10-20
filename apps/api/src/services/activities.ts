import { randomUUID } from 'node:crypto';
import type {
  Activity,
  ActivityDetail,
  AuditEvent,
  CreateActivityInput,
  Member,
  Role,
  User,
} from '@gatherflow/shared';
import type { Db } from '../db/database';
import { ensure } from '../errors';

export class ActivityService {
  constructor(public db: Db) {}

  requireMember(
    activityId: string,
    userId: string,
    ownerOnly = false,
  ): { role: Role; status: Activity['status'] } {
    const membership = this.db
      .prepare(
        `SELECT m.role, a.status FROM activity_members m
      JOIN activities a ON a.id = m.activity_id WHERE m.activity_id = ? AND m.user_id = ?`,
      )
      .get(activityId, userId) as { role: Role; status: Activity['status'] } | undefined;
    ensure(membership, 403, 'NOT_MEMBER', '加入活动后才能查看这里');
    ensure(
      !ownerOnly || membership.role === 'OWNER',
      403,
      'OWNER_REQUIRED',
      '只有房主可以进行此操作',
    );
    return membership;
  }

  requireActive(activityId: string, userId: string, ownerOnly = false): void {
    const membership = this.requireMember(activityId, userId, ownerOnly);
    ensure(membership.status === 'ACTIVE', 409, 'ACTIVITY_ARCHIVED', '活动已归档，只能查看');
  }

  financialFrozen(activityId: string): boolean {
    return Boolean(
      this.db
        .prepare('SELECT 1 FROM settlements WHERE activity_id = ? AND reopened_at IS NULL')
        .get(activityId),
    );
  }

  requireFinanceOpen(activityId: string): void {
    ensure(
      !this.financialFrozen(activityId),
      409,
      'FINANCE_FROZEN',
      '最终清算已冻结，请在清算页核对；尚无到账记录时可由房主重新开放记账',
    );
  }

  audit(
    activityId: string,
    actorId: string,
    action: string,
    targetId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): void {
    this.db
      .prepare('INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        randomUUID(),
        activityId,
        actorId,
        action,
        targetId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        new Date().toISOString(),
      );
  }

  create(userId: string, input: CreateActivityInput, id: string = randomUUID()): ActivityDetail {
    return this.db
      .transaction(() => {
        const now = new Date().toISOString();
        this.db
          .prepare(
            'INSERT INTO activities (id, name, type, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(id, input.name, input.type ?? null, input.description ?? '', userId, now);
        this.db
          .prepare("INSERT INTO activity_members VALUES (?, ?, 'OWNER', ?)")
          .run(id, userId, now);
        this.audit(id, userId, 'ACTIVITY_CREATED', id, null, { name: input.name, role: 'OWNER' });
        return this.detail(id, userId);
      })
      .immediate();
  }

  list(userId: string): Activity[] {
    return this.db
      .prepare(
        `SELECT a.id, a.name, a.type, a.description, a.owner_id AS ownerId,
      a.status, a.created_at AS createdAt, m.role,
      (SELECT count(*) FROM activity_members WHERE activity_id = a.id) AS memberCount,
      CASE WHEN m.role = 'OWNER' THEN (SELECT count(*) FROM join_applications WHERE activity_id = a.id AND status = 'PENDING') ELSE 0 END AS pendingCount
      FROM activities a JOIN activity_members m ON m.activity_id = a.id
      WHERE m.user_id = ? ORDER BY a.created_at DESC, a.id`,
      )
      .all(userId) as Activity[];
  }

  detail(id: string, userId: string): ActivityDetail {
    this.requireMember(id, userId);
    const activity = this.list(userId).find((item) => item.id === id);
    ensure(activity, 404, 'NOT_FOUND', '活动不存在');
    const members = this.db
      .prepare(
        `SELECT u.id, u.name, u.color, u.tagline, m.role, m.joined_at AS joinedAt
      FROM activity_members m JOIN users u ON u.id = m.user_id WHERE m.activity_id = ?
      ORDER BY CASE WHEN m.role = 'OWNER' THEN 0 ELSE 1 END, m.joined_at, u.id`,
      )
      .all(id) as Member[];
    return { ...activity, members, financialFrozen: this.financialFrozen(id) };
  }

  history(activityId: string, userId: string, offset = 0): AuditEvent[] {
    this.requireMember(activityId, userId);
    const rows = this.db
      .prepare(
        `SELECT l.id, l.action, l.target_id AS targetId,
      l.before_json AS beforeJson, l.after_json AS afterJson, l.created_at AS createdAt,
      u.id AS actorId, u.name, u.color, u.tagline FROM audit_logs l JOIN users u ON u.id = l.actor_id
      WHERE l.activity_id = ? ORDER BY l.created_at DESC, l.rowid DESC LIMIT 50 OFFSET ?`,
      )
      .all(activityId, offset) as (Omit<AuditEvent, 'actor' | 'before' | 'after'> &
      User & {
        actorId: string;
        beforeJson: string | null;
        afterJson: string | null;
      })[];
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      targetId: row.targetId,
      createdAt: row.createdAt,
      actor: { id: row.actorId, name: row.name, color: row.color, tagline: row.tagline },
      before: row.beforeJson ? (JSON.parse(row.beforeJson) as Record<string, unknown>) : null,
      after: row.afterJson ? (JSON.parse(row.afterJson) as Record<string, unknown>) : null,
    }));
  }
}
