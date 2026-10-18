import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { getSettings } from '../src/config';
import { hashToken } from '../src/security';
import type { ActivityDetail, Invite, JoinApplication, Session } from '@gatherflow/shared';

let db: Db;
let app: ReturnType<typeof createApp>;
let tokens: Record<string, string>;
let activityId: string;
const auth = (id: string) => ({ Authorization: `Bearer ${tokens[id]}` });

beforeEach(async () => {
  db = openDatabase(':memory:');
  seedDatabase(db);
  app = createApp(db, { mode: 'demo', corsOrigin: 'http://localhost:5173' });
  tokens = {};
  for (const id of ['A', 'B', 'C', 'D', 'E']) {
    const response = await request(app).post('/auth/demo-login').send({ userId: id }).expect(200);
    tokens[id] = (response.body as Session).token;
  }
  const activity = await request(app)
    .post('/activities')
    .set(auth('A'))
    .send({ name: '周末三日游' })
    .expect(201);
  activityId = (activity.body as ActivityDetail).id;
});
afterEach(() => db.close());

async function invite(user = 'A', kind: Invite['kind'] = 'DIRECT'): Promise<Invite> {
  const response = await request(app)
    .post(`/activities/${activityId}/invites`)
    .set(auth(user))
    .send({ kind })
    .expect(201);
  return response.body as Invite;
}
async function join(token: string, user: string) {
  return request(app).post(`/invites/${token}/join`).set(auth(user)).send({}).expect(200);
}
async function apply(token: string, user: string) {
  return request(app)
    .post(`/invites/${token}/applications`)
    .set(auth(user))
    .send({ message: '我也想一起去' })
    .expect(200);
}
async function pending(): Promise<JoinApplication[]> {
  return (
    await request(app).get(`/activities/${activityId}/applications`).set(auth('A')).expect(200)
  ).body as JoinApplication[];
}

describe('M0 / 身份和活动', () => {
  it('五个演示身份、幂等 seed、健康检查', async () => {
    seedDatabase(db);
    expect((await request(app).get('/auth/demo-users')).body).toHaveLength(5);
    expect(
      db.prepare('SELECT count(*) AS n FROM activities WHERE id = ?').get('demo-weekend'),
    ).toEqual({ n: 1 });
    await request(app).get('/health').expect(200);
  });
  it('只填名字创建；拒绝空名字、额外字段和非法类型', async () => {
    const response = await request(app).get(`/activities/${activityId}`).set(auth('A')).expect(200);
    expect(response.body).toMatchObject({
      name: '周末三日游',
      type: null,
      role: 'OWNER',
      memberCount: 1,
    });
    for (const body of [
      { name: '  ' },
      { name: 'x', ownerId: 'B' },
      { name: 'x', type: 'INVALID' },
    ]) {
      await request(app).post('/activities').set(auth('A')).send(body).expect(400);
    }
  });
  it('非成员不可查看详情、审核、审计，活动列表仅返回自己的', async () => {
    for (const suffix of ['', '/applications', '/audit']) {
      await request(app).get(`/activities/${activityId}${suffix}`).set(auth('C')).expect(403);
    }
    expect((await request(app).get('/activities').set(auth('C'))).body).toEqual([]);
    await request(app).get('/activities').set('x-user-id', 'A').expect(401);
    await request(app).get('/activities').set('Authorization', 'Bearer A').expect(401);
  });
  it('过期会话拒绝；会话原文不落库', async () => {
    expect(
      db.prepare('SELECT token_hash FROM sessions WHERE token_hash = ?').get(tokens.A),
    ).toBeUndefined();
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
      '2000-01-01T00:00:00.000Z',
      hashToken(tokens.A!),
    );
    await request(app).get('/activities').set(auth('A')).expect(401);
  });
  it('正式模式无 demo 登录，不认可旧 demo 会话；微信接口明确未配置', async () => {
    const production = createApp(db, { mode: 'wechat', corsOrigin: 'https://example.com' });
    await request(production).get('/auth/demo-users').expect(404);
    await request(production).post('/auth/demo-login').send({ userId: 'A' }).expect(404);
    await request(production).get('/activities').set(auth('A')).expect(401);
    await request(production).post('/auth/wechat-login').send({ code: 'example-code' }).expect(501);
    expect(() => getSettings({ NODE_ENV: 'production', APP_MODE: 'demo' })).toThrow('生产环境禁止');
  });
});

describe('M1 / 邀请与审核', () => {
  it('完整五人路径：B 直入、C 复用申请、B 邀 D 审核、E 新卡直入', async () => {
    const first = await invite();
    expect((await join(first.token, 'B')).body.outcome).toBe('JOINED');
    expect((await join(first.token, 'C')).body.outcome).toBe('APPROVAL_REQUIRED');
    await apply(first.token, 'C');
    const memberInvite = await invite('B', 'APPROVAL');
    expect((await join(memberInvite.token, 'D')).body.outcome).toBe('APPROVAL_REQUIRED');
    await apply(memberInvite.token, 'D');
    for (const item of await pending()) {
      await request(app)
        .post(`/activities/${activityId}/applications/${item.id}/review`)
        .set(auth('A'))
        .send({ decision: 'APPROVED' })
        .expect(200);
    }
    const second = await invite();
    expect((await join(second.token, 'E')).body.outcome).toBe('JOINED');
    const detail = (await request(app).get(`/activities/${activityId}`).set(auth('E')))
      .body as ActivityDetail;
    expect(detail.members.map((user) => user.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(detail.pendingCount).toBe(0);
    const audit = await request(app)
      .get(`/activities/${activityId}/audit`)
      .set(auth('D'))
      .expect(200);
    expect(audit.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'APPLICATION_APPROVED',
          actor: expect.objectContaining({ id: 'A' }),
        }),
      ]),
    );
    expect(JSON.stringify(audit.body)).not.toContain(first.token);
  });
  it('成员不能签发直邀；伪造 source=owner 无效；未入组者不能发邀请', async () => {
    await join((await invite()).token, 'B');
    await request(app)
      .post(`/activities/${activityId}/invites`)
      .set(auth('B'))
      .send({ kind: 'DIRECT' })
      .expect(403);
    await request(app)
      .post(`/activities/${activityId}/invites`)
      .set(auth('C'))
      .send({ kind: 'APPROVAL' })
      .expect(403);
    const memberInvite = await invite('B', 'APPROVAL');
    const result = await request(app)
      .post(`/invites/${memberInvite.token}/join?source=owner`)
      .set(auth('D'))
      .send({})
      .expect(200);
    expect(result.body.outcome).toBe('APPROVAL_REQUIRED');
    await request(app).get(`/activities/${activityId}`).set(auth('D')).expect(403);
  });
  it('成员重复入组幂等且不消费新卡；仅首次入组消费', async () => {
    const card = await invite();
    expect((await join(card.token, 'A')).body.outcome).toBe('ALREADY_MEMBER');
    expect((await join(card.token, 'B')).body.outcome).toBe('JOINED');
    expect((await join(card.token, 'B')).body.outcome).toBe('ALREADY_MEMBER');
    expect((await join(card.token, 'C')).body.outcome).toBe('APPROVAL_REQUIRED');
    expect(
      db
        .prepare('SELECT count(*) AS n FROM activity_members WHERE activity_id = ?')
        .get(activityId),
    ).toEqual({ n: 2 });
  });
  it('公开预览不泄漏成员、简介、申请人；失效码返回明确错误', async () => {
    const card = await invite();
    await join(card.token, 'B');
    const preview = await request(app).get(`/invites/${card.token}`).expect(200);
    expect(Object.keys(preview.body.activity).sort()).toEqual(['id', 'name', 'status', 'type']);
    expect(preview.body).toMatchObject({
      mode: 'APPROVAL',
      consumed: true,
      applicationStatus: null,
    });
    expect(JSON.stringify(preview.body)).not.toContain('林间');
    await request(app).get('/invites/invalid').expect(400);
    await request(app)
      .get(`/invites/${'a'.repeat(64)}`)
      .expect(404);
  });
  it('申请重复点击不重复创建；拒绝后可重新申请，保留历史', async () => {
    const card = await invite('A', 'APPROVAL');
    await apply(card.token, 'C');
    await apply(card.token, 'C');
    const applications = await pending();
    expect(applications).toHaveLength(1);
    await request(app)
      .post(`/activities/${activityId}/applications/${applications[0]!.id}/review`)
      .set(auth('A'))
      .send({ decision: 'REJECTED' })
      .expect(200);
    expect(
      (await request(app).get(`/invites/${card.token}`).set(auth('C'))).body.applicationStatus,
    ).toBe('REJECTED');
    await apply(card.token, 'C');
    expect(await pending()).toHaveLength(1);
    expect(
      db
        .prepare('SELECT count(*) AS n FROM join_applications WHERE activity_id = ?')
        .get(activityId),
    ).toEqual({ n: 2 });
  });
  it('仅房主可审核；重复审核与跨活动审核失败', async () => {
    await join((await invite()).token, 'B');
    await apply((await invite('B', 'APPROVAL')).token, 'C');
    const application = (await pending())[0]!;
    const route = `/activities/${activityId}/applications/${application.id}/review`;
    await request(app).post(route).set(auth('B')).send({ decision: 'APPROVED' }).expect(403);
    await request(app)
      .post(`/activities/demo-weekend/applications/${application.id}/review`)
      .set(auth('A'))
      .send({ decision: 'APPROVED' })
      .expect(404);
    await request(app).post(route).set(auth('A')).send({ decision: 'APPROVED' }).expect(200);
    await request(app).post(route).set(auth('A')).send({ decision: 'REJECTED' }).expect(409);
  });
  it('待审核成员用新直邀加入后，待审申请被解决', async () => {
    await apply((await invite('A', 'APPROVAL')).token, 'C');
    await join((await invite()).token, 'C');
    expect(await pending()).toHaveLength(0);
  });
  it('数据库失败会回滚消费，不会损失直邀权益', async () => {
    const card = await invite();
    db.exec(
      "CREATE TRIGGER fail_join BEFORE INSERT ON activity_members WHEN NEW.user_id = 'B' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END",
    );
    await request(app).post(`/invites/${card.token}/join`).set(auth('B')).send({}).expect(500);
    db.exec('DROP TRIGGER fail_join');
    expect((await join(card.token, 'C')).body.outcome).toBe('JOINED');
  });
  it('归档后拒绝发邀、加入、申请和审批', async () => {
    const card = await invite();
    await apply(card.token, 'C');
    const application = (await pending())[0]!;
    db.prepare("UPDATE activities SET status = 'ARCHIVED' WHERE id = ?").run(activityId);
    await request(app)
      .post(`/activities/${activityId}/invites`)
      .set(auth('A'))
      .send({ kind: 'DIRECT' })
      .expect(409);
    await request(app).post(`/invites/${card.token}/join`).set(auth('B')).send({}).expect(409);
    await request(app)
      .post(`/invites/${card.token}/applications`)
      .set(auth('D'))
      .send({})
      .expect(409);
    await request(app)
      .post(`/activities/${activityId}/applications/${application.id}/review`)
      .set(auth('A'))
      .send({ decision: 'APPROVED' })
      .expect(409);
  });
});
