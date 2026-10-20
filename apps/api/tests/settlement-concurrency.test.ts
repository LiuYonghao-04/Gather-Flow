import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { InviteService } from '../src/services/invites';
import { SettlementService } from '../src/services/settlements';

it('independent processes serialize receipt against reopen and persist exactly one outcome', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gatherflow-settlement-race-'));
  const filename = join(directory, 'race.sqlite');
  const db = openDatabase(filename);
  seedDatabase(db);
  const service = new SettlementService(db);
  const activity = service.create('A', { name: '清算并发' });
  const invite = new InviteService(db);
  invite.join(invite.create(activity.id, 'A', 'DIRECT').token, 'B');
  const bill = service.createExpense(activity.id, 'A', {
    description: '两人车票',
    date: '2026-10-24',
    category: 'TRANSPORT',
    payerId: 'A',
    totalCents: 100,
    splitMode: 'EQUAL',
    shares: [
      { userId: 'A', amountCents: 0 },
      { userId: 'B', amountCents: 0 },
    ],
    taskId: null,
    evidenceIds: [],
  });
  service.confirmExpense(activity.id, bill.id, 'B', 1);
  const frozen = service.freeze(
    activity.id,
    'A',
    service.settlement(activity.id, 'A').financeVersion,
  ).current!;
  db.close();
  const workers = ['reopen', 'receive'].map((operation) =>
    fork(
      fileURLToPath(new URL('./settlement-worker.ts', import.meta.url)),
      [filename, activity.id, frozen.id, frozen.transfers[0]!.id, operation],
      { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    ),
  );
  try {
    const ready = workers.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          worker.on('message', (message: { ready?: boolean }) => {
            if (message.ready) resolve();
          });
          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code) reject(new Error(`Worker exited ${code}`));
          });
        }),
    );
    const results = workers.map(
      (worker) =>
        new Promise<string>((resolve, reject) => {
          worker.on('message', (message: { result?: string }) => {
            if (message.result) resolve(message.result);
          });
          worker.on('error', reject);
          worker.on('exit', (code) => {
            if (code) reject(new Error(`Worker exited ${code}`));
          });
        }),
    );
    await Promise.all(ready);
    workers.forEach((worker) => worker.send('go'));
    const outcomes = await Promise.all(results);
    expect(outcomes.filter((x) => x === 'ok')).toHaveLength(1);
    expect(outcomes.some((x) => x === 'RECEIPTS_EXIST' || x === 'SETTLEMENT_CHANGED')).toBe(true);
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
    try {
      const state = new SettlementService(reopened).settlement(activity.id, 'A');
      expect(state.history[0]!.snapshot).toEqual(frozen.snapshot);
      if (state.current) expect(state.current.transfers[0]!.receivedBy).toBe('A');
      else {
        expect(state.history[0]!.reopenedBy).toBe('A');
        expect(state.history[0]!.transfers[0]!.receivedAt).toBeNull();
      }
    } finally {
      reopened.close();
    }
  } finally {
    workers.forEach((worker) => {
      if (worker.exitCode === null) worker.kill();
    });
    rmSync(directory, { recursive: true, force: true });
  }
});
