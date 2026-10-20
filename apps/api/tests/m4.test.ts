import request from 'supertest';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { SettlementService } from '../src/services/settlements';
import type { ExpenseInput, SettlementWorkspace, Settlement } from '@gatherflow/shared';

let db: Db;
let app: ReturnType<typeof createApp>;
let root: string;
let tokens: Record<string, string>;
const auth = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });
const post = (path: string, user = 'A', body: object = {}, status = 200) =>
  request(app)
    .post(root + path)
    .set(auth(user))
    .send(body)
    .expect(status);
const get = (path: string, user = 'A', status = 200) =>
  request(app)
    .get(root + path)
    .set(auth(user))
    .expect(status);
const input = (extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  description: '山间车票',
  category: 'TRANSPORT',
  date: '2026-10-24',
  payerId: 'A',
  totalCents: 80000,
  splitMode: 'EQUAL',
  shares: ['A', 'B', 'C', 'D'].map((userId) => ({ userId, amountCents: 0 })),
  taskId: null,
  evidenceIds: [],
  ...extra,
});
async function state(user = 'A'): Promise<SettlementWorkspace> {
  return (await get('/settlement', user)).body as SettlementWorkspace;
}
async function bill(extra: Partial<ExpenseInput> = {}) {
  const e = (await post('/expenses', 'A', input(extra), 201)).body as { id: string };
  await post(`/expenses/${e.id}/confirmations`, 'B', { expectedRevision: 1 });
  return e.id;
}
async function freeze(): Promise<Settlement> {
  return (
    await post('/settlement', 'A', { expectedFinanceVersion: (await state()).financeVersion }, 201)
  ).body.current as Settlement;
}
async function close(user = 'A', status = 200) {
  const s = await state(user);
  return post(
    '/close',
    user,
    { expectedFinanceVersion: s.financeVersion, expectedSettlementId: s.current?.id ?? null },
    status,
  );
}
beforeEach(async () => {
  db = openDatabase(':memory:');
  seedDatabase(db);
  app = createApp(db, { mode: 'demo', corsOrigin: 'http://localhost:5173' });
  tokens = {};
  for (const id of ['A', 'B', 'C', 'D', 'E'])
    tokens[id] = (await request(app).post('/auth/demo-login').send({ userId: id })).body
      .token as string;
  root =
    '/activities/' +
    (
      await request(app)
        .post('/activities')
        .set(auth('A'))
        .send({ name: 'M4 最终清算' })
        .expect(201)
    ).body.id;
  for (const id of ['B', 'C', 'D']) {
    const invite = await post('/invites', 'A', { kind: 'DIRECT' }, 201);
    await request(app)
      .post(`/invites/${invite.body.token}/join`)
      .set(auth(id))
      .send({})
      .expect(200);
  }
});
afterEach(() => db.close());

describe('M4 final settlement and archive', () => {
  it('blocks pending bills, multiple disputes and stale finance views before freezing or closing', async () => {
    const initial = await state();
    const e = (await post('/expenses', 'A', input(), 201)).body as { id: string };
    await post('/settlement', 'A', { expectedFinanceVersion: initial.financeVersion }, 409);
    await post('/settlement', 'A', { expectedFinanceVersion: (await state()).financeVersion }, 409);
    await close('A', 409);
    await post(`/expenses/${e.id}/confirmations`, 'B', { expectedRevision: 1 });
    for (const user of ['B', 'C'])
      await post(`/expenses/${e.id}/disputes`, user, { expectedRevision: 1, reason: '核对分摊' });
    expect((await state()).closeReasons.join()).toContain('异议');
    const disputes = (await get(`/expenses/${e.id}`)).body.disputes as {
      id: string;
      userId: string;
    }[];
    await post(`/expenses/${e.id}/disputes/${disputes[0]!.id}/withdraw`, disputes[0]!.userId);
    await post('/settlement', 'A', { expectedFinanceVersion: (await state()).financeVersion }, 409);
    await post(`/expenses/${e.id}/disputes/${disputes[1]!.id}/withdraw`, disputes[1]!.userId);
    expect((await freeze()).snapshot.confirmedTotalCents).toBe(80000);
  });

  it('requires owner freeze and member reads; rejects forged body fields and cross-activity resources', async () => {
    await bill();
    const s = await state();
    await get('/settlement', 'E', 403);
    await get('/archive', 'E', 403);
    await post('/settlement', 'B', { expectedFinanceVersion: s.financeVersion }, 403);
    await post(
      '/settlement',
      'A',
      { expectedFinanceVersion: s.financeVersion, amountCents: 1 },
      400,
    );
    await get('/archive', 'A', 409);
    const frozen = await freeze();
    await post(`/settlements/${frozen.id}/transfers/missing/receipt`, 'A', {}, 404);
    await post(
      `/settlements/another-snapshot/transfers/${frozen.transfers[0]!.id}/receipt`,
      'A',
      {},
      409,
    );
  });

  it('freezes all financial writes, preserves original bills, and does not block nonfinancial work', async () => {
    const id = await bill();
    const f = await freeze();
    expect(f.snapshot.balances).toEqual([
      { userId: 'A', amountCents: 60000 },
      { userId: 'B', amountCents: -20000 },
      { userId: 'C', amountCents: -20000 },
      { userId: 'D', amountCents: -20000 },
    ]);
    expect(f.transfers).toHaveLength(3);
    await post('/expenses', 'A', input(), 409);
    await post(
      `/expenses/${id}/revisions`,
      'A',
      { expectedRevision: 1, input: input({ totalCents: 90000 }) },
      409,
    );
    await post(`/expenses/${id}/confirmations`, 'C', { expectedRevision: 1 }, 409);
    await post(`/expenses/${id}/disputes`, 'B', { expectedRevision: 1, reason: '核对' }, 409);
    await post(`/expenses/${id}/disputes/unknown/withdraw`, 'B', {}, 409);
    await post('/tasks', 'C', { title: '整理照片' }, 201);
    expect((await get(`/expenses/${id}`)).body.totalCents).toBe(80000);
    expect((await get('/finance')).body.frozen).toBe(true);
    expect(() =>
      db.prepare("UPDATE settlements SET snapshot_json = '{}' WHERE id = ?").run(f.id),
    ).toThrow('immutable settlement');
  });

  it('only the receiver can confirm, duplicates are idempotent and any receipt prevents reopening', async () => {
    await bill({ payerId: 'C' });
    const f = await freeze();
    const t = f.transfers[0]!;
    expect(t.toUserId).toBe('C');
    for (const user of ['A', t.fromUserId])
      await post(`/settlements/${f.id}/transfers/${t.id}/receipt`, user, {}, 403);
    await post(`/settlements/${f.id}/transfers/${t.id}/receipt`, 'C', { receivedBy: 'C' }, 400);
    const once = await post(`/settlements/${f.id}/transfers/${t.id}/receipt`, 'C');
    const twice = await post(`/settlements/${f.id}/transfers/${t.id}/receipt`, 'C');
    expect(twice.body.current.transfers).toEqual(once.body.current.transfers);
    expect(
      (await get('/audit')).body.filter(
        (x: { action: string }) => x.action === 'SETTLEMENT_RECEIVED',
      ),
    ).toHaveLength(1);
    await post(`/settlements/${f.id}/reopen`, 'A', {}, 409);
    await close('A', 409);
    expect((await state()).canReopen).toBe(false);
    expect(() =>
      db
        .prepare(
          'UPDATE settlement_transfers SET received_at = NULL, received_by = NULL WHERE id = ?',
        )
        .run(t.id),
    ).toThrow('immutable receipt');
  });

  it('reopens without receipts, invalidates stale actions and retains every previous snapshot', async () => {
    const id = await bill();
    const f = await freeze();
    await post(`/settlements/${f.id}/reopen`, 'B', {}, 403);
    await post(`/settlements/${f.id}/reopen`, 'A');
    await post(`/settlements/${f.id}/transfers/${f.transfers[0]!.id}/receipt`, 'A', {}, 409);
    await post(`/settlements/${f.id}/reopen`, 'A', {}, 409);
    await post(`/expenses/${id}/revisions`, 'A', {
      expectedRevision: 1,
      input: input({ totalCents: 10000 }),
    });
    await post('/settlement', 'A', { expectedFinanceVersion: (await state()).financeVersion }, 409);
    await post(`/expenses/${id}/confirmations`, 'B', { expectedRevision: 2 });
    const next = await freeze();
    expect(next.sequence).toBe(2);
    expect(next.id).not.toBe(f.id);
    expect(next.snapshot.confirmedTotalCents).toBe(10000);
    const history = (await state()).history;
    expect(history[1]!.snapshot).toEqual(f.snapshot);
    expect(history[1]!.reopenedBy).toBe('A');
    await post(`/settlements/${f.id}/transfers/${f.transfers[0]!.id}/receipt`, 'A', {}, 409);
  });

  it('closes only after every receipt, then denies writes across all modules while preserving reads', async () => {
    const id = await bill();
    const f = await freeze();
    await close('A', 409);
    await close('B', 403);
    for (const t of f.transfers)
      await post(`/settlements/${f.id}/transfers/${t.id}/receipt`, t.toUserId);
    const final = await close();
    expect(final.body.activity.status).toBe('ARCHIVED');
    expect(final.body.archivedBy).toBe('A');
    const archive = (await get('/archive', 'B')).body;
    expect(archive.finance.expenses[0].id).toBe(id);
    expect(archive.settlement.current.snapshot).toEqual(f.snapshot);
    expect(
      archive.settlement.current.transfers.every((t: { receivedAt: string }) =>
        Boolean(t.receivedAt),
      ),
    ).toBe(true);
    for (const [path, body] of [
      ['/tasks', { title: '归档后任务' }],
      ['/proposals', { content: { title: '归档后方案', category: 'OTHER' } }],
      ['/expenses', input()],
      ['/invites', { kind: 'DIRECT' }],
    ] as [string, object][])
      await post(path, 'A', body, 409);
    await post(`/expenses/${id}/disputes`, 'B', { expectedRevision: 1, reason: '归档后' }, 409);
    await request(app)
      .post(root + '/evidence')
      .set(auth('A'))
      .field('taskId', 'any')
      .attach('image', Buffer.from('fake'), 'a.png')
      .expect(409);
    await post(`/settlements/${f.id}/reopen`, 'A', {}, 409);
    await post(`/settlements/${f.id}/transfers/${f.transfers[0]!.id}/receipt`, 'A', {}, 409);
    await close('A', 409);
    for (const path of ['/workspace', '/finance', '/evidence', '/audit']) await get(path, 'B');
    expect(
      (await get('/audit')).body.filter(
        (x: { action: string }) => x.action === 'ACTIVITY_ARCHIVED',
      ),
    ).toHaveLength(1);
  });

  it('allows explicit owner closure of no shared bills, including personal-only bills and unfinished work', async () => {
    await post('/tasks', 'A', { title: '尚未整理的照片' }, 201);
    await post('/expenses', 'A', input({ shares: [{ userId: 'A', amountCents: 80000 }] }), 201);
    expect((await state()).canClose).toBe(true);
    await close('B', 403);
    const closed = await close();
    expect(closed.body.current.transfers).toEqual([]);
    expect(closed.body.current.snapshot.confirmedTotalCents).toBe(0);
    expect((await get('/archive')).body.workspace.tasks[0].completed).toBe(false);
  });

  it('requires a snapshot for shared bills with zero net balances and settles without phantom transfers', async () => {
    await bill({
      totalCents: 100,
      shares: [
        { userId: 'A', amountCents: 0 },
        { userId: 'B', amountCents: 0 },
      ],
    });
    await bill({
      payerId: 'B',
      totalCents: 100,
      shares: [
        { userId: 'A', amountCents: 0 },
        { userId: 'B', amountCents: 0 },
      ],
    });
    await close('A', 409);
    const f = await freeze();
    expect(f.transfers).toEqual([]);
    expect(f.snapshot.balances.every((b) => b.amountCents === 0)).toBe(true);
    await close();
  });

  it('blocks new members during freeze without consuming their invitation; permits joining after reopen', async () => {
    const card = (await post('/invites', 'A', { kind: 'DIRECT' }, 201)).body as { token: string };
    await bill();
    const f = await freeze();
    await request(app).post(`/invites/${card.token}/join`).set(auth('E')).send({}).expect(409);
    await post(`/settlements/${f.id}/reopen`, 'A');
    await request(app).post(`/invites/${card.token}/join`).set(auth('E')).send({}).expect(200);
    expect((await state()).activity.memberCount).toBe(5);
  });

  it('rejects duplicate freezes and a close based on an old settlement even when finance is unchanged', async () => {
    await bill();
    const before = await state();
    const f = await freeze();
    await post('/settlement', 'A', { expectedFinanceVersion: before.financeVersion }, 409);
    await post(`/settlements/${f.id}/reopen`, 'A');
    const next = await freeze();
    for (const t of next.transfers)
      await post(`/settlements/${next.id}/transfers/${t.id}/receipt`, t.toUserId);
    await post(
      '/close',
      'A',
      { expectedFinanceVersion: before.financeVersion, expectedSettlementId: f.id },
      409,
    );
    await close();
  });

  it('rolls back snapshot and close atomically when audit insertion fails', async () => {
    const service = new SettlementService(db);
    const activityId = root.split('/')[2]!;
    service.audit = () => {
      throw new Error('audit unavailable');
    };
    const version = (await state()).financeVersion;
    expect(() => service.close(activityId, 'A', version, null)).toThrow('audit unavailable');
    expect((await state()).current).toBeNull();
    expect((await state()).activity.status).toBe('ACTIVE');
    expect(db.prepare('SELECT count(*) AS n FROM settlements').get()).toEqual({ n: 0 });
  });
});
