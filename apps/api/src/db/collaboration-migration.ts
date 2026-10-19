export const collaborationMigration = {
  version: 2,
  sql: `
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), title TEXT NOT NULL,
      brief TEXT NOT NULL, creator_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1, needs_confirmation INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE task_assignees (task_id TEXT NOT NULL REFERENCES tasks(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(task_id, user_id));
    CREATE TABLE task_revisions (task_id TEXT NOT NULL REFERENCES tasks(id), revision INTEGER NOT NULL, content TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(task_id, revision));
    CREATE TABLE task_suggestions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', reviewer_id TEXT REFERENCES users(id), review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE task_handovers (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), from_user_id TEXT NOT NULL REFERENCES users(id), to_user_id TEXT NOT NULL REFERENCES users(id), note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL, accepted_at TEXT);
    CREATE UNIQUE INDEX one_handover ON task_handovers(task_id, from_user_id) WHERE status = 'PENDING';
    CREATE TABLE proposals (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), author_id TEXT NOT NULL REFERENCES users(id), task_id TEXT REFERENCES tasks(id), current_version INTEGER NOT NULL DEFAULT 1, execution TEXT NOT NULL DEFAULT 'PLANNED', created_at TEXT NOT NULL);
    CREATE TABLE proposal_versions (proposal_id TEXT NOT NULL REFERENCES proposals(id), version INTEGER NOT NULL, content_json TEXT NOT NULL, task_revision INTEGER, actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(proposal_id, version));
    CREATE TABLE proposal_participants (proposal_id TEXT NOT NULL REFERENCES proposals(id), user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(proposal_id, user_id));
    CREATE TABLE proposal_responses (proposal_id TEXT NOT NULL, version INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id), response TEXT NOT NULL CHECK(response IN ('CONFIRM','OBJECTION','OPT_OUT')), reason TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(proposal_id,version,user_id), FOREIGN KEY(proposal_id,version) REFERENCES proposal_versions(proposal_id,version));
    CREATE TABLE proposal_preferences (proposal_id TEXT NOT NULL, version INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('PREFER','ONLY')), note TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(proposal_id,version,user_id), FOREIGN KEY(proposal_id,version) REFERENCES proposal_versions(proposal_id,version));
    CREATE TABLE proposal_comments (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, version INTEGER NOT NULL, author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(proposal_id,version) REFERENCES proposal_versions(proposal_id,version));
    CREATE INDEX tasks_activity ON tasks(activity_id);
    CREATE INDEX proposals_activity ON proposals(activity_id);
  `,
};
