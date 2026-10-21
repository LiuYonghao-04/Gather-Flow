import request from 'supertest';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { hashToken } from '../src/security';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Session } from '@gatherflow/shared';
let db: Db;
const upstream = vi.fn<typeof fetch>();
const settings = {
  mode: 'wechat' as const,
  corsOrigin: 'http://localhost:5173',
  wechatAppId: 'wx-test-app',
  wechatAppSecret: 'server-only-secret',
};
const app = () => createApp(db, settings, { wechatFetch: upstream });
const login = (target = app(), body: object = { code: 'fresh-code' }) =>
  request(target).post('/auth/wechat-login').send(body);
const respond = (body: object, status = 200) =>
  upstream.mockImplementation(async () => new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  db = openDatabase(':memory:');
  seedDatabase(db);
  upstream.mockReset();
  respond({ openid: 'private-openid', session_key: 'private-session-key' });
});
afterEach(() => db.close());

it('upgrades a v5 database without removing existing users or activities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gatherflow-wechat-migrate-'));
  const filename = join(directory, 'upgrade.sqlite');
  let disk = openDatabase(filename);
  try {
    seedDatabase(disk);
    const before = disk.prepare('SELECT id,name FROM activities ORDER BY id').all();
    disk.exec('DROP TABLE wechat_session_apps; DELETE FROM schema_migrations WHERE version = 6');
    disk.close();
    disk = openDatabase(filename);
    expect(disk.prepare('SELECT id,name FROM activities ORDER BY id').all()).toEqual(before);
    expect(disk.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 5 });
    expect(disk.prepare('SELECT count(*) AS n FROM wechat_session_apps').get()).toEqual({ n: 0 });
    expect(disk.prepare('SELECT version FROM schema_migrations WHERE version = 6').get()).toEqual({
      version: 6,
    });
  } finally {
    disk.close();
    if (dirname(resolve(directory)) !== resolve(tmpdir()))
      throw new Error('Unexpected test directory');
    rmSync(directory, { recursive: true, force: true });
  }
});

it('exchanges code server-side, saves an app-scoped identity, and issues only a hashed application session', async () => {
  const response = await login().expect(200);
  const session = response.body as Session;
  const [url, options] = upstream.mock.calls[0]!;
  expect(new URL(String(url)).origin).toBe('https://api.weixin.qq.com');
  expect(new URL(String(url)).searchParams.get('js_code')).toBe('fresh-code');
  expect(options?.redirect).toBe('error');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(session.mode).toBe('wechat');
  expect(session.token).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(session)).not.toMatch(
    /private-openid|private-session-key|server-only-secret/,
  );
  expect(
    db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get(hashToken(session.token)),
  ).toEqual({ user_id: session.user.id });
  expect(
    db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(session.token),
  ).toBeUndefined();
  const authorized = app();
  await request(authorized)
    .post('/activities')
    .set('Authorization', `Bearer ${session.token}`)
    .send({ name: '微信真实身份活动' })
    .expect(201);
  expect(
    (await request(authorized).get('/activities').set('Authorization', `Bearer ${session.token}`))
      .body,
  ).toHaveLength(1);
  const again = (await login(authorized).expect(200)).body as Session;
  expect(again.user.id).toBe(session.user.id);
  expect(again.token).not.toBe(session.token);
  expect(db.prepare('SELECT count(*) AS n FROM wechat_identities').get()).toEqual({ n: 1 });
  const otherApp = createApp(
    db,
    { ...settings, wechatAppId: 'another-app' },
    { wechatFetch: upstream },
  );
  await request(otherApp)
    .get('/activities')
    .set('Authorization', `Bearer ${session.token}`)
    .expect(401);
  expect((await login(otherApp).expect(200)).body.user.id).not.toBe(session.user.id);
});
it('does not accept demo sessions or client-supplied identity; demo mode cannot call WeChat', async () => {
  const demo = createApp(db, { mode: 'demo', corsOrigin: '' });
  const demoToken = (await request(demo).post('/auth/demo-login').send({ userId: 'A' })).body.token;
  await request(app()).get('/activities').set('Authorization', `Bearer ${demoToken}`).expect(401);
  await login(demo).expect(404);
  await login(app(), { code: 'fresh-code', openid: 'forged', userId: 'A' }).expect(400);
  await login(app(), { code: '   ' }).expect(400);
  expect(upstream).not.toHaveBeenCalled();
  const wechatToken = (await login().expect(200)).body.token;
  await request(demo).get('/activities').set('Authorization', `Bearer ${wechatToken}`).expect(401);
});
it('returns a configuration error without contacting WeChat when credentials are missing', async () => {
  await login(createApp(db, { mode: 'wechat', corsOrigin: '' }, { wechatFetch: upstream })).expect(
    501,
  );
  expect(upstream).not.toHaveBeenCalled();
});
it.each([
  [40029, 400, 'WECHAT_CODE_INVALID'],
  [40163, 400, 'WECHAT_CODE_INVALID'],
  [45011, 429, 'WECHAT_RATE_LIMITED'],
  [40226, 403, 'WECHAT_LOGIN_REJECTED'],
  [40013, 503, 'WECHAT_UNAVAILABLE'],
  [-1, 503, 'WECHAT_UNAVAILABLE'],
] as const)('maps upstream error %i without leaking diagnostics', async (errcode, status, code) => {
  respond({ errcode, errmsg: 'server-only-secret private-openid' });
  const result = await login().expect(status);
  expect(result.body.error.code).toBe(code);
  expect(JSON.stringify(result.body)).not.toMatch(/server-only-secret|private-openid/);
  expect(db.prepare("SELECT count(*) AS n FROM users WHERE auth_kind='wechat'").get()).toEqual({
    n: 0,
  });
});
it.each([
  {},
  { openid: 'only-openid' },
  { openid: 123, session_key: 'key' },
  { openid: 'ok', session_key: '' },
])('rejects malformed upstream success %j', async (body) => {
  respond(body);
  await login().expect(502);
});
it('sanitizes failed HTTP, malformed JSON, timeout and network error responses', async () => {
  respond({}, 500);
  await login().expect(503);
  upstream.mockResolvedValue(new Response('not-json'));
  await login().expect(503);
  upstream.mockRejectedValue(new Error('https://api.weixin.qq.com/?secret=server-only-secret'));
  const result = await login().expect(503);
  expect(JSON.stringify(result.body)).not.toContain('server-only-secret');
  upstream.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
  await login().expect(503);
});
it('limits login attempts before exhausting upstream requests', async () => {
  const target = app();
  respond({ errcode: 40029 });
  for (let i = 0; i < 20; i++) await login(target).expect(400);
  expect((await login(target).expect(429)).body.error.code).toBe('LOGIN_RATE_LIMITED');
  expect(upstream).toHaveBeenCalledTimes(20);
});
it('rolls back the identity if session creation fails', async () => {
  db.exec(
    "CREATE TRIGGER fail_wechat_session BEFORE INSERT ON sessions WHEN NEW.mode='wechat' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  await login().expect(500);
  expect(db.prepare('SELECT count(*) AS n FROM wechat_identities').get()).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) AS n FROM users WHERE auth_kind='wechat'").get()).toEqual({
    n: 0,
  });
});
