import { randomUUID } from 'node:crypto';
import type {
  ActivityType,
  ApplicationStatus,
  Invite,
  InvitePreview,
  JoinApplication,
  JoinResult,
  User,
} from '@gatherflow/shared';
import type { Db } from '../db/database';
import { ensure } from '../errors';
import { hashToken, secretToken } from '../security';
import { ActivityService } from './activities';

interface InviteRow {
  id: string;
  activityId: string;
  kind: 'DIRECT' | 'APPROVAL';
  consumedBy: string | null;
  name: string;
  type: ActivityType | null;
  status: 'ACTIVE' | 'ARCHIVED';
}
interface ApplicationRow {
  id: string;
  activityId: string;
  userId: string;
  message: string;
  status: ApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
}

export class InviteService {
  private activities: ActivityService;
  constructor(private db: Db) {
    this.activities = new ActivityService(db);
  }

  create(activityId: string, userId: string, kind: Invite['kind']): Invite {
    return this.db
      .transaction(() => {
        this.activities.requireActive(activityId, userId, kind === 'DIRECT');
        const token = secretToken();
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        this.db
          .prepare(
            'INSERT INTO invite_tokens (id, token_hash, activity_id, creator_id, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(id, hashToken(token), activityId, userId, kind, createdAt);
        this.activities.audit(activityId, userId, 'INVITE_CREATED', id, null, { kind });
        return { token, kind, activityId, createdAt, path: `/pages/invite/index?token=${token}` };
      })
      .immediate();
  }

  private lookup(token: string): InviteRow {
    const invite = this.db
      .prepare(
        `SELECT i.id, i.activity_id AS activityId, i.kind, i.consumed_by AS consumedBy,
      a.name, a.type, a.status FROM invite_tokens i JOIN activities a ON a.id = i.activity_id WHERE i.token_hash = ?`,
      )
      .get(hashToken(token)) as InviteRow | undefined;
    ensure(invite, 404, 'INVITE_NOT_FOUND', '邀请不存在，请朋友重新分享');
    return invite;
  }

  preview(token: string, userId?: string): InvitePreview {
    const invite = this.lookup(token);
    const isMember =
      !!userId &&
      !!this.db
        .prepare('SELECT 1 FROM activity_members WHERE activity_id = ? AND user_id = ?')
        .get(invite.activityId, userId);
    const application = userId
      ? (this.db
          .prepare(
            `SELECT status FROM join_applications WHERE activity_id = ? AND user_id = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`,
          )
          .get(invite.activityId, userId) as { status: ApplicationStatus } | undefined)
      : undefined;
    return {
      activity: {
        id: invite.activityId,
        name: invite.name,
        type: invite.type,
        status: invite.status,
      },
      mode: invite.kind === 'DIRECT' && !invite.consumedBy ? 'DIRECT' : 'APPROVAL',
      consumed: invite.consumedBy !== null,
      isMember,
      applicationStatus: application?.status ?? null,
    };
  }

  join(token: string, userId: string): JoinResult {
    // BEGIN IMMEDIATE serializes writers across connections/processes. No async work inside this transaction.
    return this.db
      .transaction(() => {
        const invite = this.lookup(token);
        ensure(invite.status === 'ACTIVE', 409, 'ACTIVITY_ARCHIVED', '活动已归档，不能再加入');
        const result = { activityId: invite.activityId };
        if (
          this.db
            .prepare('SELECT 1 FROM activity_members WHERE activity_id = ? AND user_id = ?')
            .get(invite.activityId, userId)
        ) {
          return { ...result, outcome: 'ALREADY_MEMBER' as const };
        }
        if (invite.kind !== 'DIRECT' || invite.consumedBy)
          return { ...result, outcome: 'APPROVAL_REQUIRED' as const };
        const now = new Date().toISOString();
        const consumed = this.db
          .prepare(
            `UPDATE invite_tokens SET consumed_by = ?, consumed_at = ?
        WHERE id = ? AND kind = 'DIRECT' AND consumed_by IS NULL`,
          )
          .run(userId, now, invite.id);
        ensure(consumed.changes === 1, 409, 'INVITE_CONSUMED', '邀请已使用，请申请加入');
        this.db
          .prepare("INSERT INTO activity_members VALUES (?, ?, 'MEMBER', ?)")
          .run(invite.activityId, userId, now);
        // A new direct invite can resolve a prior pending application, without inventing an owner approval.
        this.db
          .prepare(
            "UPDATE join_applications SET status = 'APPROVED', reviewed_at = ? WHERE activity_id = ? AND user_id = ? AND status = 'PENDING'",
          )
          .run(now, invite.activityId, userId);
        this.activities.audit(
          invite.activityId,
          userId,
          'MEMBER_JOINED_DIRECT',
          userId,
          { member: false, inviteConsumed: false },
          { member: true, inviteConsumed: true, inviteId: invite.id },
        );
        return { ...result, outcome: 'JOINED' as const };
      })
      .immediate();
  }

  apply(
    token: string,
    userId: string,
    message: string,
  ): { status: ApplicationStatus | 'ALREADY_MEMBER'; activityId: string } {
    return this.db
      .transaction(() => {
        const invite = this.lookup(token);
        ensure(invite.status === 'ACTIVE', 409, 'ACTIVITY_ARCHIVED', '活动已归档，不能再申请');
        if (
          this.db
            .prepare('SELECT 1 FROM activity_members WHERE activity_id = ? AND user_id = ?')
            .get(invite.activityId, userId)
        ) {
          return { status: 'ALREADY_MEMBER' as const, activityId: invite.activityId };
        }
        const pending = this.db
          .prepare(
            "SELECT id FROM join_applications WHERE activity_id = ? AND user_id = ? AND status = 'PENDING'",
          )
          .get(invite.activityId, userId);
        if (!pending) {
          const id = randomUUID();
          this.db
            .prepare(
              `INSERT INTO join_applications (id, activity_id, user_id, invite_id, message, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
            )
            .run(id, invite.activityId, userId, invite.id, message, new Date().toISOString());
          this.activities.audit(invite.activityId, userId, 'JOIN_REQUESTED', userId, null, {
            status: 'PENDING',
            applicationId: id,
          });
        }
        return { status: 'PENDING' as const, activityId: invite.activityId };
      })
      .immediate();
  }

  applications(activityId: string, userId: string): JoinApplication[] {
    this.activities.requireMember(activityId, userId, true);
    const rows = this.db
      .prepare(
        `SELECT id, activity_id AS activityId, user_id AS userId, message, status,
      created_at AS createdAt, reviewed_at AS reviewedAt, reviewer_id AS reviewerId FROM join_applications
      WHERE activity_id = ? AND status = 'PENDING' ORDER BY created_at, id`,
      )
      .all(activityId) as ApplicationRow[];
    const userQuery = this.db.prepare('SELECT id, name, color, tagline FROM users WHERE id = ?');
    return rows.map((row) => ({ ...row, user: userQuery.get(row.userId) as User }));
  }

  review(
    activityId: string,
    applicationId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
  ): void {
    this.db
      .transaction(() => {
        this.activities.requireActive(activityId, userId, true);
        const application = this.db
          .prepare(
            'SELECT id, user_id AS userId, status FROM join_applications WHERE id = ? AND activity_id = ?',
          )
          .get(applicationId, activityId) as
          | Pick<ApplicationRow, 'id' | 'userId' | 'status'>
          | undefined;
        ensure(application, 404, 'APPLICATION_NOT_FOUND', '申请不存在');
        ensure(
          application.status === 'PENDING',
          409,
          'ALREADY_REVIEWED',
          '这条申请已处理，请刷新查看',
        );
        const now = new Date().toISOString();
        this.db
          .prepare(
            'UPDATE join_applications SET status = ?, reviewed_at = ?, reviewer_id = ? WHERE id = ?',
          )
          .run(decision, now, userId, applicationId);
        if (decision === 'APPROVED') {
          this.db
            .prepare("INSERT OR IGNORE INTO activity_members VALUES (?, ?, 'MEMBER', ?)")
            .run(activityId, application.userId, now);
        }
        this.activities.audit(
          activityId,
          userId,
          `APPLICATION_${decision}`,
          application.userId,
          { status: 'PENDING' },
          { status: decision, applicationId },
        );
      })
      .immediate();
  }
}
