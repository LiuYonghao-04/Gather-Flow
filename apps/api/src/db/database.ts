import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { migrations } from './migrations';

export type Db = Database.Database;

export function openDatabase(filename: string): Db {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  db.transaction(() => {
    for (const migration of migrations) {
      if (
        db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version)
      )
        continue;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
    }
  }).immediate();
  return db;
}
