import request from 'supertest';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { IdempotencyService } from '../src/services/idempotency';

let db: Db;
let app: ReturnType<typeof createApp>;
let token: string;
const key = 'm6_retry_same_operation';
const header = () => ({ Authorization: 'Bearer ' + token, 'Idempotency-Key': key });
const bill = {
  description: '车票',
  date: '2026-10-29',
  totalCents: 100,
  payerId: 'A',
  splitMode: 'EQUAL',
  shares: [{ userId: 'A', amountCents: 100 }],
};
beforeEach(async () => {
  db = openDatabase(':memory:');
  seedDatabase(db);
  app = createApp(db, { mode: 'demo', corsOrigin: 'http://localhost' });
  token = (await request(app).post('/auth/demo-login').send({ userId: 'A' })).body.token;
});
afterEach(() => db.close());

it('replays creation after a lost response without duplicating the activity or audit', async () => {
  const first = await request(app)
    .post('/activities')
    .set(header())
    .send({ name: '一次相聚' })
    .expect(201);
  const second = await request(app)
    .post('/activities')
    .set(header())
    .send({ name: '一次相聚' })
    .expect(201);
  expect(second.body).toEqual(first.body);
  expect(db.prepare("SELECT count(*) AS n FROM activities WHERE name='一次相聚'").get()).toEqual({
    n: 1,
  });
  expect(
    db.prepare('SELECT count(*) AS n FROM audit_logs WHERE target_id=?').get(first.body.id),
  ).toEqual({ n: 1 });
  await request(app).post('/activities').set(header()).send({ name: '改过的内容' }).expect(409);
});
it('does not duplicate an expense, and new keys still permit legitimate identical expenses', async () => {
  const first = await request(app)
    .post('/activities/demo-weekend/expenses')
    .set(header())
    .send(bill)
    .expect(201);
  const retry = await request(app)
    .post('/activities/demo-weekend/expenses')
    .set(header())
    .send({ ...bill, description: '车票' })
    .expect(201);
  expect(retry.body).toEqual(first.body);
  await request(app)
    .post('/activities/demo-weekend/expenses')
    .set({ ...header(), 'Idempotency-Key': key + '_new' })
    .send(bill)
    .expect(201);
  expect(db.prepare('SELECT count(*) AS n FROM expenses').get()).toEqual({ n: 2 });
});
it('scopes receipts by user and route, checks membership on replay, and rejects invalid keys', async () => {
  await request(app).post('/activities').set(header()).send({ name: 'A的活动' }).expect(201);
  const b = (await request(app).post('/auth/demo-login').send({ userId: 'B' })).body.token;
  await request(app)
    .post('/activities')
    .set({ ...header(), Authorization: 'Bearer ' + b })
    .send({ name: 'B的活动' })
    .expect(201);
  await request(app).post('/activities/demo-weekend/expenses').set(header()).send(bill).expect(201);
  await request(app)
    .post('/activities/demo-weekend/expenses')
    .set({ ...header(), Authorization: 'Bearer ' + b })
    .send(bill)
    .expect(403);
  await request(app)
    .post('/activities')
    .set({ ...header(), 'Idempotency-Key': 'bad' })
    .send({ name: '坏编号' })
    .expect(400);
  await request(app)
    .post('/activities')
    .set('Idempotency-Key', key)
    .send({ name: '未登录' })
    .expect(401);
});
it('rolls back both the business mutation and receipt on failure, then accepts a corrected retry', () => {
  const service = new IdempotencyService(db);
  const action = () => {
    db.prepare("UPDATE users SET name='未提交' WHERE id='A'").run();
    throw new Error('rollback');
  };
  expect(() => service.run('A', 'test', key, { a: 1 }, action)).toThrow('rollback');
  expect(db.prepare("SELECT name FROM users WHERE id='A'").get()).toEqual({ name: '林间' });
  expect(db.prepare('SELECT count(*) AS n FROM idempotent_requests').get()).toEqual({ n: 0 });
  expect(service.run('A', 'test', key, { a: 1 }, () => ({ ok: true }))).toEqual({ ok: true });
  const retry = vi.fn(() => ({ ok: false }));
  expect(new IdempotencyService(db).run('A', 'test', key, { a: 1 }, retry)).toEqual({ ok: true });
  expect(retry).not.toHaveBeenCalled();
});
it('replays proposal and expense revisions without advancing the version twice', async () => {
  const p = await request(app)
    .post('/activities/demo-weekend/proposals')
    .set(header())
    .send({ content: { title: '原方案', category: 'ACTIVITY' } })
    .expect(201);
  const proposalPath = '/activities/demo-weekend/proposals/' + p.body.id + '/revisions';
  const revision = { expectedVersion: 1, content: { title: '新版方案', category: 'ACTIVITY' } };
  const revised = await request(app).post(proposalPath).set(header()).send(revision).expect(200);
  expect(
    (await request(app).post(proposalPath).set(header()).send(revision).expect(200)).body,
  ).toEqual(revised.body);
  expect(revised.body.version).toBe(2);
  const e = await request(app)
    .post('/activities/demo-weekend/expenses')
    .set(header())
    .send(bill)
    .expect(201);
  const path = '/activities/demo-weekend/expenses/' + e.body.id + '/revisions';
  const body = { expectedRevision: 1, input: { ...bill, description: '修订车票' } };
  const updated = await request(app).post(path).set(header()).send(body).expect(200);
  expect((await request(app).post(path).set(header()).send(body).expect(200)).body).toEqual(
    updated.body,
  );
  expect(updated.body.revision).toBe(2);
});
it('lets a WeChat user update only their own valid nickname, reflected in member reads and re-login', async () => {
  const provider = vi.fn<typeof fetch>(
    async (url) =>
      new Response(
        JSON.stringify({
          openid: 'fake-' + new URL(String(url)).searchParams.get('js_code'),
          session_key: 'test-session-key',
        }),
      ),
  );
  const wx = createApp(
    db,
    {
      mode: 'wechat',
      corsOrigin: 'http://localhost',
      wechatAppId: 'wx-test',
      wechatAppSecret: 'test-secret',
    },
    { wechatFetch: provider },
  );
  const login = () => request(wx).post('/auth/wechat-login').send({ code: 'same-user' });
  const user = (await login().expect(200)).body;
  const auth = { Authorization: 'Bearer ' + user.token };
  const activity = (
    await request(wx).post('/activities').set(auth).send({ name: '微信活动' }).expect(201)
  ).body;
  const changed = await request(wx)
    .post('/me/profile')
    .set(auth)
    .send({ name: '  小满  ' })
    .expect(200);
  expect(changed.body).toMatchObject({ id: user.user.id, name: '小满' });
  expect((await request(wx).get('/me').set(auth).expect(200)).body.name).toBe('小满');
  expect(
    (
      await request(wx)
        .get('/activities/' + activity.id)
        .set(auth)
        .expect(200)
    ).body.members[0].name,
  ).toBe('小满');
  expect((await login().expect(200)).body.user.name).toBe('小满');
  for (const body of [
    { name: '' },
    { name: ' '.repeat(3) },
    { name: 'a'.repeat(25) },
    { name: '坏\n名字' },
    { name: '篡改', id: 'A' },
  ])
    await request(wx).post('/me/profile').set(auth).send(body).expect(400);
  await request(wx).post('/me/profile').send({ name: '匿名' }).expect(401);
  await request(app).post('/me/profile').set(header()).send({ name: '改演示' }).expect(403);
  expect(db.prepare("SELECT name FROM users WHERE id='A'").get()).toEqual({ name: '林间' });
});
