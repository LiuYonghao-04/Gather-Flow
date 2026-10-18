export const migrations = [
  {
    version: 1,
    sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, tagline TEXT NOT NULL,
      auth_kind TEXT NOT NULL CHECK(auth_kind IN ('demo', 'wechat')),
      wechat_openid TEXT UNIQUE
    );
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      mode TEXT NOT NULL CHECK(mode IN ('demo', 'wechat')), expires_at TEXT NOT NULL
    );
    CREATE TABLE activities (
      id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
      type TEXT CHECK(type IN ('TRIP','MEAL','HANGOUT','OTHER')),
      description TEXT NOT NULL DEFAULT '', owner_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ARCHIVED')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE activity_members (
      activity_id TEXT NOT NULL REFERENCES activities(id), user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('OWNER','MEMBER')), joined_at TEXT NOT NULL,
      PRIMARY KEY(activity_id, user_id)
    );
    CREATE UNIQUE INDEX one_owner ON activity_members(activity_id) WHERE role = 'OWNER';
    CREATE INDEX members_by_user ON activity_members(user_id, activity_id);
    CREATE TABLE invite_tokens (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
      activity_id TEXT NOT NULL REFERENCES activities(id), creator_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('DIRECT','APPROVAL')), created_at TEXT NOT NULL,
      consumed_by TEXT REFERENCES users(id), consumed_at TEXT,
      CHECK((consumed_by IS NULL AND consumed_at IS NULL) OR
        (kind = 'DIRECT' AND consumed_by IS NOT NULL AND consumed_at IS NOT NULL))
    );
    CREATE TABLE join_applications (
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id),
      user_id TEXT NOT NULL REFERENCES users(id), invite_id TEXT NOT NULL REFERENCES invite_tokens(id),
      message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      created_at TEXT NOT NULL, reviewed_at TEXT, reviewer_id TEXT REFERENCES users(id)
    );
    CREATE UNIQUE INDEX one_pending_application ON join_applications(activity_id, user_id) WHERE status = 'PENDING';
    CREATE INDEX applications_by_activity ON join_applications(activity_id, created_at);
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id),
      actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, target_id TEXT NOT NULL,
      before_json TEXT, after_json TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX audit_by_activity ON audit_logs(activity_id, created_at);
  `,
  },
];
