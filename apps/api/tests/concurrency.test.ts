import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { InviteService } from '../src/services/invites';
import type { JoinResult } from '@gatherflow/shared';

it('两个独立进程、两个 SQLite 连接同时抢同一直邀，仅一人直入且结果持久化', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gatherflow-race-'));
  const filename = join(directory, 'race.sqlite');
  const db = openDatabase(filename);
  seedDatabase(db);
  const card = new InviteService(db).create('demo-weekend', 'A', 'DIRECT');
  db.close();
  const workers = ['B', 'C'].map((userId) =>
    fork(
      fileURLToPath(new URL('./invite-worker.ts', import.meta.url)),
      [filename, card.token, userId],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    ),
  );
  try {
    const ready = workers.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          worker.on('error', reject);
          worker.on('message', (message: { ready?: boolean }) => {
            if (message.ready) resolve();
          });
          worker.on('exit', (code) => {
            if (code) reject(new Error(`Worker exited ${code}`));
          });
        }),
    );
    const results = workers.map(
      (worker) =>
        new Promise<JoinResult>((resolve, reject) => {
          worker.on('message', (message: { result?: JoinResult; error?: string }) => {
            if (message.result) resolve(message.result);
            if (message.error) reject(new Error(message.error));
          });
        }),
    );
    await Promise.all(ready);
    workers.forEach((worker) => worker.send('go'));
    const outcomes = await Promise.all(results);
    expect(outcomes.map((item) => item.outcome).sort()).toEqual(['APPROVAL_REQUIRED', 'JOINED']);
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve) => {
            if (worker.exitCode !== null) resolve();
            else worker.once('exit', () => resolve());
          }),
      ),
    );
    const reopened = openDatabase(filename);
    expect(
      reopened
        .prepare('SELECT count(*) AS n FROM activity_members WHERE activity_id = ?')
        .get('demo-weekend'),
    ).toEqual({ n: 2 });
    expect(
      reopened
        .prepare('SELECT count(*) AS n FROM invite_tokens WHERE consumed_by IS NOT NULL')
        .get(),
    ).toEqual({ n: 1 });
    reopened.close();
  } finally {
    workers.forEach((worker) => {
      if (worker.exitCode === null) worker.kill();
    });
    rmSync(directory, { recursive: true, force: true });
  }
});
