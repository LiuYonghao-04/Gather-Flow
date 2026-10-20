export const settlementMigration = {
  version: 4,
  sql: `
    ALTER TABLE activities ADD COLUMN archived_at TEXT;
    ALTER TABLE activities ADD COLUMN archived_by TEXT REFERENCES users(id);
    CREATE TABLE settlements (
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id),
      sequence INTEGER NOT NULL CHECK(sequence > 0), finance_version TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
      reopened_by TEXT REFERENCES users(id), reopened_at TEXT,
      UNIQUE(activity_id, sequence),
      CHECK((reopened_by IS NULL) = (reopened_at IS NULL))
    );
    CREATE UNIQUE INDEX one_current_settlement ON settlements(activity_id) WHERE reopened_at IS NULL;
    CREATE TABLE settlement_transfers (
      id TEXT PRIMARY KEY, settlement_id TEXT NOT NULL REFERENCES settlements(id),
      from_user_id TEXT NOT NULL REFERENCES users(id), to_user_id TEXT NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      received_by TEXT REFERENCES users(id), received_at TEXT,
      CHECK(from_user_id <> to_user_id),
      CHECK((received_by IS NULL AND received_at IS NULL) OR (received_by = to_user_id AND received_at IS NOT NULL))
    );
    CREATE INDEX transfers_settlement ON settlement_transfers(settlement_id);
    CREATE TRIGGER immutable_settlement BEFORE UPDATE OF activity_id, sequence, finance_version, snapshot_json, created_by, created_at ON settlements BEGIN SELECT RAISE(ABORT, 'immutable settlement'); END;
    CREATE TRIGGER immutable_transfer BEFORE UPDATE OF settlement_id, from_user_id, to_user_id, amount_cents ON settlement_transfers BEGIN SELECT RAISE(ABORT, 'immutable transfer'); END;
    CREATE TRIGGER immutable_receipt BEFORE UPDATE ON settlement_transfers WHEN OLD.received_at IS NOT NULL BEGIN SELECT RAISE(ABORT, 'immutable receipt'); END;
  `,
};
