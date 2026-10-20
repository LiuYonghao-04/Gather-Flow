import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import type { Session, Expense, SettlementWorkspace, ActivityArchive } from '@gatherflow/shared';

// npm run demo:m4 first creates a fresh five-person M2/M3 activity.
const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const sessions = new Map<string, Session>();
async function call<T>(path: string, user: string, body?: object, expected = 200): Promise<T> {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(sessions.has(user) ? { Authorization: `Bearer ${sessions.get(user)!.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result: unknown = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result as T;
}
async function main() {
  const demo = JSON.parse(await readFile('output/m23-demo.json', 'utf8')) as {
    activityId: string;
    pendingExpenseId: string;
  };
  for (const id of ['A', 'B', 'C', 'D', 'E'])
    sessions.set(id, await call<Session>('/auth/demo-login', id, { userId: id }));
  const root = `/activities/${demo.activityId}`;
  let state = await call<SettlementWorkspace>(root + '/settlement', 'A');
  await call(root + '/settlement', 'A', { expectedFinanceVersion: state.financeVersion }, 409);
  const pending = await call<Expense>(root + '/expenses/' + demo.pendingExpenseId, 'A');
  const confirmer = pending.shares.find((s) => s.userId !== pending.recorderId)!.userId;
  await call(root + `/expenses/${pending.id}/confirmations`, confirmer, {
    expectedRevision: pending.revision,
  });
  state = await call<SettlementWorkspace>(root + '/settlement', 'A');
  if (process.argv.includes('--prepare')) {
    await writeFile(
      'output/m4-ui-demo.json',
      JSON.stringify({ activityId: demo.activityId }, null, 2),
    );
    console.log(`待页面验收：http://localhost:5173/#/pages/settlement/index?id=${demo.activityId}`);
    return;
  }
  state = await call<SettlementWorkspace>(
    root + '/settlement',
    'A',
    { expectedFinanceVersion: state.financeVersion },
    201,
  );
  const first = state.current!;
  await call(root + `/settlements/${first.id}/reopen`, 'A', {});
  await call(
    root + `/settlements/${first.id}/transfers/${first.transfers[0]!.id}/receipt`,
    first.transfers[0]!.toUserId,
    {},
    409,
  );
  state = await call<SettlementWorkspace>(
    root + '/settlement',
    'A',
    { expectedFinanceVersion: state.financeVersion },
    201,
  );
  const final = state.current!;
  assert.equal(final.sequence, 2);
  assert.deepEqual(final.snapshot, first.snapshot);
  await call(
    root + '/close',
    'A',
    { expectedFinanceVersion: state.financeVersion, expectedSettlementId: final.id },
    409,
  );
  console.log('PASS 冻结：待确认账单阻止清算；无人到账可重开，旧转账失效，新旧快照均保留。');
  for (const transfer of final.transfers) {
    await call(
      root + `/settlements/${final.id}/transfers/${transfer.id}/receipt`,
      transfer.fromUserId,
      {},
      403,
    );
    await call(
      root + `/settlements/${final.id}/transfers/${transfer.id}/receipt`,
      transfer.toUserId,
      {},
    );
  }
  await call(root + `/settlements/${final.id}/reopen`, 'A', {}, 409);
  await call(
    root + '/close',
    'B',
    { expectedFinanceVersion: state.financeVersion, expectedSettlementId: final.id },
    403,
  );
  state = await call<SettlementWorkspace>(root + '/close', 'A', {
    expectedFinanceVersion: state.financeVersion,
    expectedSettlementId: final.id,
  });
  assert.equal(state.activity.status, 'ARCHIVED');
  console.log(
    'PASS 收款：付款人不能确认，只有收款人逐笔确认；已有收款不能重开，全部结清后仅房主能结束。',
  );
  for (const user of ['A', 'B', 'C', 'D', 'E']) {
    const archive = await call<ActivityArchive>(root + '/archive', user);
    assert.equal(archive.settlement.current!.snapshot.confirmedTotalCents, 86800);
    assert.equal(archive.evidence.length, 1);
    assert.equal(archive.settlement.history.length, 2);
    assert.ok(archive.settlement.current!.transfers.every((t) => t.receivedAt));
    assert.equal(archive.workspace.status, 'ARCHIVED');
  }
  await call(root + '/tasks', 'A', { title: '不应写入归档' }, 409);
  await writeFile(
    'output/m4-demo.json',
    JSON.stringify({ activityId: demo.activityId, settlementId: final.id }, null, 2),
  );
  console.log('PASS 归档：五人均可读取行程、凭证、账单与到账记录；归档后写入被拒绝。');
  console.log(`相聚档案：http://localhost:5173/#/pages/archive/index?id=${demo.activityId}`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
