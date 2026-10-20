import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { openDatabase } from '../apps/api/src/db/database';
import { seedDatabase } from '../apps/api/src/db/seed';
import { ExpenseService } from '../apps/api/src/services/expenses';

async function main() {
  const reports: object[] = [];
  for (const count of [50, 200, 1000]) {
    const db = openDatabase(':memory:');
    try {
      seedDatabase(db);
      const service = new ExpenseService(db);
      const activity = service.create('A', { name: '隔离性能样本' });
      const at = '2026-10-20T00:00:00.000Z';
      // Isolated benchmark fixture, never the user's database or demo flow.
      db.transaction(() => {
        for (const user of ['B', 'C', 'D', 'E'])
          db.prepare("INSERT INTO activity_members VALUES (?,?,'MEMBER',?)").run(
            activity.id,
            user,
            at,
          );
        for (let i = 0; i < count; i++) {
          const id = `benchmark-${i}`;
          db.prepare(
            'INSERT INTO expenses (id,activity_id,recorder_id,current_revision,created_at) VALUES (?,?,?,3,?)',
          ).run(id, activity.id, 'A', at);
          for (let revision = 1; revision <= 3; revision++) {
            const input = {
              description: `样本费用 ${i}`,
              category: 'OTHER',
              date: '2026-10-24',
              payerId: 'A',
              totalCents: 100,
              splitMode: 'EQUAL',
              shares: ['A', 'B', 'C', 'D', 'E'].map((userId) => ({ userId, amountCents: 20 })),
              taskId: null,
              evidenceIds: [],
            };
            db.prepare('INSERT INTO expense_revisions VALUES (?,?,?,?,?)').run(
              id,
              revision,
              JSON.stringify(input),
              'A',
              at,
            );
          }
          db.prepare('INSERT INTO expense_confirmations VALUES (?,3,?,?)').run(id, 'B', at);
        }
      })();
      service.finance(activity.id, 'A');
      const timings: number[] = [];
      let bytes = 0;
      for (let i = 0; i < 12; i++) {
        const start = performance.now();
        const result = service.finance(activity.id, 'A');
        const serialized = JSON.stringify(result);
        timings.push(performance.now() - start);
        bytes = Buffer.byteLength(serialized);
        assert.equal(result.estimate.confirmedTotalCents, count * 100);
        assert.equal(result.expenses.length, count);
      }
      timings.sort((a, b) => a - b);
      reports.push({
        bills: count,
        revisionsPerBill: 3,
        iterations: 12,
        medianMs: Number(timings[6]!.toFixed(2)),
        p95Ms: Number(timings[11]!.toFixed(2)),
        responseBytes: bytes,
      });
    } finally {
      db.close();
    }
  }
  const report = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    scope:
      'In-memory SQLite finance service plus JSON serialization; not network latency or mobile rendering',
    reports,
  };
  await mkdir('output', { recursive: true });
  const suffix = process.argv.includes('--baseline') ? 'baseline' : 'current';
  await writeFile(`output/benchmark-${suffix}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
