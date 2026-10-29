import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
it('commits one mutation and durable receipt when two independent processes retry concurrently', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gatherflow-m6-'));
  const filename = join(directory, 'race.sqlite');
  const db = openDatabase(filename);
  seedDatabase(db);
  db.close();
  const workers = [0, 1].map(() =>
    fork(fileURLToPath(new URL('./idempotency-worker.ts', import.meta.url)), [filename], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    }),
  );
  try {
    const ready = workers.map(
      (worker) =>
        new Promise<void>((done, reject) => {
          worker.on('error', reject);
          worker.on('message', (msg: { ready?: boolean }) => {
            if (msg.ready) done();
          });
          worker.on('exit', (code) => {
            if (code) reject(new Error('Worker failed'));
          });
        }),
    );
    const outcomes = workers.map(
      (worker) =>
        new Promise<string>((done, reject) => {
          worker.on('error', reject);
          worker.on('message', (msg: { id?: string; error?: string }) => {
            if (msg.id) done(msg.id);
            if (msg.error) reject(new Error(msg.error));
          });
          worker.on('exit', (code) => {
            if (code) reject(new Error('Worker failed'));
          });
        }),
    );
    await Promise.all(ready);
    workers.forEach((worker) => worker.send('go'));
    const ids = await Promise.all(outcomes);
    expect(ids[0]).toBe(ids[1]);
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((done) => {
            if (worker.exitCode !== null) done();
            else worker.once('exit', () => done());
          }),
      ),
    );
    const reopened = openDatabase(filename);
    try {
      expect(
        reopened.prepare("SELECT count(*) AS n FROM activities WHERE name='跨进程重试'").get(),
      ).toEqual({ n: 1 });
      expect(reopened.prepare('SELECT count(*) AS n FROM idempotent_requests').get()).toEqual({
        n: 1,
      });
      expect(
        reopened.prepare('SELECT count(*) AS n FROM audit_logs WHERE target_id=?').get(ids[0]),
      ).toEqual({ n: 1 });
    } finally {
      reopened.close();
    }
  } finally {
    workers.forEach((worker) => {
      if (worker.exitCode === null) worker.kill();
    });
    if (dirname(resolve(directory)) !== resolve(tmpdir()))
      throw Error('Unexpected temporary directory');
    rmSync(directory, { recursive: true, force: true });
  }
});
