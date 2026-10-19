export const financeMigration = {
  version: 3,
  sql: `
    CREATE TABLE evidence (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), task_id TEXT NOT NULL REFERENCES tasks(id), proposal_id TEXT REFERENCES proposals(id), proposal_version INTEGER, uploader_id TEXT NOT NULL REFERENCES users(id), caption TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL, image_data BLOB NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX evidence_activity ON evidence(activity_id);
    CREATE TABLE expenses (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), recorder_id TEXT NOT NULL REFERENCES users(id), current_revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE expense_revisions (expense_id TEXT NOT NULL REFERENCES expenses(id), revision INTEGER NOT NULL, input_json TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(expense_id, revision));
    CREATE TABLE expense_confirmations (expense_id TEXT NOT NULL, revision INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY(expense_id, revision, user_id), FOREIGN KEY(expense_id, revision) REFERENCES expense_revisions(expense_id, revision));
    CREATE TABLE expense_disputes (id TEXT PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses(id), revision INTEGER NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at TEXT NOT NULL, withdrawn_at TEXT, FOREIGN KEY(expense_id, revision) REFERENCES expense_revisions(expense_id, revision));
    CREATE UNIQUE INDEX one_expense_dispute ON expense_disputes(expense_id, user_id) WHERE withdrawn_at IS NULL;
    CREATE INDEX expenses_activity ON expenses(activity_id);
  `,
};
