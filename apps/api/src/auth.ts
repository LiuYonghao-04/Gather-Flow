import type { Request } from 'express';
import type { Session, User } from '@gatherflow/shared';
import type { Db } from './db/database';
import { ensure } from './errors';
import { hashToken, secretToken } from './security';

export function authenticate(
  db: Db,
  req: Request,
  mode: Session['mode'],
  optional = false,
  wechatAppId?: string,
): string | undefined {
  const authorization = req.get('authorization');
  if (!authorization && optional) return undefined;
  ensure(
    authorization && /^Bearer [a-f0-9]{64}$/.test(authorization),
    401,
    'LOGIN_REQUIRED',
    '请先登录',
  );
  const token = authorization.slice(7);
  const session = db
    .prepare(
      `SELECT s.user_id AS userId FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.mode = ? AND u.auth_kind = ? AND s.expires_at > ?
    AND (s.mode != 'wechat' OR EXISTS (
      SELECT 1 FROM wechat_session_apps w WHERE w.token_hash = s.token_hash AND w.app_id = ?
    ))`,
    )
    .get(hashToken(token), mode, mode, new Date().toISOString(), wechatAppId ?? null) as
    | { userId: string }
    | undefined;
  ensure(session, 401, 'SESSION_EXPIRED', '登录已过期，请重新登录');
  return session.userId;
}

export function demoLogin(db: Db, userId: string): Session {
  const user = db
    .prepare("SELECT id, name, color, tagline FROM users WHERE id = ? AND auth_kind = 'demo'")
    .get(userId) as User | undefined;
  ensure(user, 404, 'DEMO_USER_NOT_FOUND', '演示身份尚未准备，请运行 db:seed');
  const token = secretToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    db.prepare("INSERT INTO sessions VALUES (?, ?, 'demo', ?)").run(
      hashToken(token),
      userId,
      expiresAt,
    );
  })();
  return { token, user, expiresAt, mode: 'demo' };
}
