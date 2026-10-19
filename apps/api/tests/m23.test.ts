import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import type { Proposal, Task, Expense, ExpenseInput } from '@gatherflow/shared';

let db: Db;
let app: ReturnType<typeof createApp>;
let root: string;
let tokens: Record<string, string>;
const auth = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });
const post = (path: string, user: string, body: object = {}, status = 200) =>
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
beforeEach(async () => {
  db = openDatabase(':memory:');
  seedDatabase(db);
  app = createApp(db, { mode: 'demo', corsOrigin: 'http://localhost:5173' });
  tokens = {};
  for (const id of ['A', 'B', 'C', 'D', 'E'])
    tokens[id] = (await request(app).post('/auth/demo-login').send({ userId: id })).body
      .token as string;
  const activity = await request(app)
    .post('/activities')
    .set(auth('A'))
    .send({ name: 'M2 M3 联调' })
    .expect(201);
  root = `/activities/${activity.body.id}`;
  for (const id of ['B', 'C', 'D', 'E']) {
    const invite = await post('/invites', 'A', { kind: 'DIRECT' }, 201);
    await request(app)
      .post(`/invites/${invite.body.token}/join`)
      .set(auth(id))
      .send({})
      .expect(200);
  }
});
afterEach(() => db.close());
async function task(): Promise<Task> {
  return (await post('/tasks', 'A', { title: '车票', needsConfirmation: true }, 201)).body as Task;
}
async function proposal(
  taskId: string | null = null,
  participantIds?: string[],
  extra: object = {},
): Promise<Proposal> {
  return (
    await post(
      '/proposals',
      'A',
      {
        content: {
          title: '周六去山里',
          category: 'ACTIVITY',
          date: '2026-10-24',
          startTime: '12:00',
          endTime: '13:00',
          ...extra,
        },
        taskId,
        participantIds,
      },
      201,
    )
  ).body as Proposal;
}
async function confirmAll(p: Proposal) {
  for (const person of p.participants)
    await post(`/proposals/${p.id}/responses`, person.id, {
      expectedVersion: p.version,
      response: 'CONFIRM',
    });
}
const expenseInput = (extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  description: '高铁票',
  category: 'TRANSPORT',
  date: '2026-10-24',
  totalCents: 80000,
  payerId: 'A',
  splitMode: 'EQUAL',
  shares: ['A', 'C', 'D', 'E'].map((userId) => ({ userId, amountCents: 0 })),
  taskId: null,
  evidenceIds: [],
  ...extra,
});
async function expense(input = expenseInput(), user = 'A'): Promise<Expense> {
  return (await post('/expenses', user, input, 201)).body as Expense;
}

describe('M2 / 协商与责任', () => {
  it('独立提案可由提案人关联自己负责的任务；不能劫持、更换关联；新版本重新确认', async () => {
    const p = await proposal(null, ['A', 'B'], { needsBooking: true });
    await confirmAll(p);
    const unrelated = await proposal(null, ['A', 'B']);
    await confirmAll(unrelated);
    const t = await task();
    await post(
      `/proposals/${p.id}/revisions`,
      'A',
      { expectedVersion: 1, content: p.content, taskId: t.id },
      403,
    );
    await post(`/tasks/${t.id}/assignees`, 'A', { userId: 'A' });
    await post(
      `/proposals/${p.id}/revisions`,
      'B',
      { expectedVersion: 1, content: p.content, taskId: t.id },
      403,
    );
    const linked = await post(`/proposals/${p.id}/revisions`, 'A', {
      expectedVersion: 1,
      content: p.content,
      taskId: t.id,
    });
    expect(linked.body).toMatchObject({ version: 2, taskId: t.id, status: 'DISCUSSING' });
    await post(
      `/proposals/${p.id}/revisions`,
      'A',
      { expectedVersion: 2, content: p.content, taskId: null },
      409,
    );
    expect((await get(`/proposals/${unrelated.id}`)).body.status).toBe('CONFIRMED');
  });
  it('四票不能覆盖一条异议；本人退出后确定；没有超时或多数规则', async () => {
    const p = await proposal();
    for (const person of ['A', 'B', 'C', 'D'])
      await post(`/proposals/${p.id}/responses`, person, {
        expectedVersion: 1,
        response: 'CONFIRM',
      });
    expect((await get(`/proposals/${p.id}`)).body.status).toBe('DISCUSSING');
    await post(`/proposals/${p.id}/preferences`, 'E', {
      expectedVersion: 1,
      kind: 'ONLY',
      note: '只有周日有空',
    });
    await post(`/proposals/${p.id}/comments`, 'B', { expectedVersion: 1, body: '下次再一起去' });
    await post(`/proposals/${p.id}/responses`, 'E', {
      expectedVersion: 1,
      response: 'OBJECTION',
      reason: '周六有事',
    });
    await post(
      `/proposals/${p.id}/responses`,
      'A',
      { expectedVersion: 1, userId: 'E', response: 'OPT_OUT' },
      409,
    );
    const result = await post(`/proposals/${p.id}/responses`, 'E', {
      expectedVersion: 1,
      response: 'OPT_OUT',
    });
    expect(result.body).toMatchObject({ status: 'CONFIRMED', execution: 'CONFIRMED' });
    expect((await get('/workspace')).body.plan.items).toHaveLength(1);
    expect((await get('')).body.members).toHaveLength(5);
  });
  it('代理权限、可自行更正、全员退出不能确定、版本不继承旧确认', async () => {
    const p = await proposal(null, ['A', 'B']);
    await post(
      `/proposals/${p.id}/responses`,
      'A',
      { expectedVersion: 1, userId: 'B', response: 'OBJECTION', reason: '代理' },
      403,
    );
    await post(
      `/proposals/${p.id}/responses`,
      'C',
      { expectedVersion: 1, userId: 'B', response: 'CONFIRM' },
      403,
    );
    await post(`/proposals/${p.id}/responses`, 'A', {
      expectedVersion: 1,
      userId: 'B',
      response: 'CONFIRM',
    });
    await post(`/proposals/${p.id}/responses`, 'B', { expectedVersion: 1, response: 'OPT_OUT' });
    expect(
      (await post(`/proposals/${p.id}/responses`, 'A', { expectedVersion: 1, response: 'OPT_OUT' }))
        .body.status,
    ).toBe('DISCUSSING');
    await confirmAll(p);
    const v2 = await post(`/proposals/${p.id}/revisions`, 'A', {
      expectedVersion: 1,
      content: { ...p.content, date: '2026-10-25' },
    });
    expect(v2.body).toMatchObject({ version: 2, status: 'DISCUSSING' });
    expect(v2.body.versions).toHaveLength(2);
    await post(
      `/proposals/${p.id}/responses`,
      'B',
      { expectedVersion: 1, response: 'CONFIRM' },
      409,
    );
    expect((await get('/workspace')).body.plan.items).toHaveLength(0);
    const audit = (await get('/audit')).body as {
      action: string;
      after: { proxy?: boolean; userId?: string };
    }[];
    expect(
      audit.some(
        (x) => x.action === 'PROPOSAL_RESPONDED' && x.after.proxy && x.after.userId === 'B',
      ),
    ).toBe(true);
  });
  it('正式编辑权限、共同负责人、建议历史、任务完成不等于确认', async () => {
    const t = await task();
    await post(`/tasks/${t.id}/content`, 'A', { expectedRevision: 1, content: '未认领' }, 403);
    await post(`/tasks/${t.id}/assignees`, 'B', { userId: 'B' });
    await post(`/tasks/${t.id}/assignees`, 'A', { userId: 'C' }, 403);
    await post(`/tasks/${t.id}/assignees`, 'B', { userId: 'A' });
    const edited = await post(`/tasks/${t.id}/content`, 'B', {
      expectedRevision: 1,
      content: '上午出发',
    });
    expect(edited.body.revision).toBe(2);
    await post(`/tasks/${t.id}/content`, 'A', { expectedRevision: 1, content: '过时草稿' }, 409);
    await post(`/tasks/${t.id}/content`, 'C', { expectedRevision: 2, content: '覆盖' }, 403);
    const suggested = await post(`/tasks/${t.id}/suggestions`, 'C', { body: '可以下午出发吗' });
    const suggestionId = suggested.body.suggestions[0].id as string;
    await post(
      `/tasks/${t.id}/suggestions/${suggestionId}/review`,
      'C',
      { decision: 'ACCEPTED' },
      403,
    );
    await post(`/tasks/${t.id}/suggestions/${suggestionId}/review`, 'A', {
      decision: 'ACCEPTED',
      note: '下版参考',
    });
    const p = await proposal(t.id);
    expect(
      (await post(`/tasks/${t.id}/progress`, 'B', { expectedRevision: 2, completed: true })).body
        .status,
    ).toBe('COMPLETED');
    expect((await get(`/proposals/${p.id}`)).body.status).toBe('DISCUSSING');
    await confirmAll(p);
    await post(`/tasks/${t.id}/content`, 'A', { expectedRevision: 2, content: '改为下午出发' });
    expect((await get(`/proposals/${p.id}`)).body.status).toBe('STALE');
    await post(
      `/proposals/${p.id}/responses`,
      'B',
      { expectedVersion: 1, response: 'CONFIRM' },
      409,
    );
    expect((await get(`/tasks/${t.id}`)).body).toMatchObject({ completed: false, revision: 3 });
    await post(`/proposals/${p.id}/revisions`, 'A', { expectedVersion: 1, content: p.content });
    expect((await get(`/proposals/${p.id}`)).body.status).toBe('DISCUSSING');
  });
  it('交接接受前保留原负责人；只有候选人接受；可转给已有共同负责人', async () => {
    const t = await task();
    await post(`/tasks/${t.id}/assignees`, 'A', { userId: 'A' });
    await post(`/tasks/${t.id}/assignees`, 'A', { userId: 'B' });
    const result = await post(`/tasks/${t.id}/handovers`, 'A', {
      toUserId: 'B',
      note: '由你接着订票',
    });
    const h = result.body.handovers[0].id as string;
    expect(result.body).toMatchObject({ status: 'HANDOVER_PENDING', assigneeIds: ['A', 'B'] });
    await post(`/tasks/${t.id}/handovers/${h}/resolve`, 'C', { accept: true }, 403);
    expect(
      (await post(`/tasks/${t.id}/handovers/${h}/resolve`, 'B', { accept: true })).body.assigneeIds,
    ).toEqual(['B']);
    await post(`/tasks/${t.id}/content`, 'A', { expectedRevision: 1, content: '已交接' }, 403);
    const pending = await post(`/tasks/${t.id}/handovers`, 'B', { toUserId: 'C', note: '请接手' });
    await post(`/tasks/${t.id}/handovers`, 'B', { toUserId: 'D', note: '重复' }, 409);
    expect(
      (
        await post(`/tasks/${t.id}/handovers/${pending.body.handovers[0].id}/resolve`, 'B', {
          accept: false,
        })
      ).body.assigneeIds,
    ).toEqual(['B']);
  });
  it('自动合并已确定子方案，冲突只提醒、不更改时间', async () => {
    const a = await proposal(null, ['A', 'C'], {
      title: '高铁抵达',
      category: 'TRANSPORT',
      startTime: '10:00',
      endTime: '14:00',
    });
    const b = await proposal(null, ['A', 'C'], {
      title: '景点预约',
      startTime: '12:00',
      endTime: '13:00',
    });
    await confirmAll(a);
    await confirmAll(b);
    const result = await get('/workspace');
    expect(result.body.plan.items).toHaveLength(2);
    expect(result.body.plan.conflicts).toHaveLength(1);
    expect(result.body.plan.items[1].content.startTime).toBe('12:00');
  });
});

describe('M3 / 凭证与账单', () => {
  it('金额、付款人、分摊成员或自定义金额变更都要求新确认；过期修订不能覆盖', async () => {
    const changes: Partial<ExpenseInput>[] = [
      { totalCents: 90000 },
      { payerId: 'D' },
      { shares: ['A', 'C'].map((userId) => ({ userId, amountCents: 0 })) },
      {
        splitMode: 'CUSTOM',
        shares: [
          { userId: 'A', amountCents: 50000 },
          { userId: 'C', amountCents: 30000 },
        ],
      },
    ];
    for (const change of changes) {
      const e = await expense();
      await post(`/expenses/${e.id}/confirmations`, 'C', { expectedRevision: 1 });
      await post(
        `/expenses/${e.id}/revisions`,
        'D',
        { expectedRevision: 1, input: expenseInput(change) },
        403,
      );
      expect(
        (
          await post(`/expenses/${e.id}/revisions`, 'A', {
            expectedRevision: 1,
            input: expenseInput(change),
          })
        ).body.status,
      ).toBe('PENDING_CONFIRMATION');
      await post(
        `/expenses/${e.id}/revisions`,
        'A',
        { expectedRevision: 1, input: expenseInput() },
        409,
      );
      expect((await get(`/expenses/${e.id}`)).body.revision).toBe(2);
    }
  });
  it('伪造图片、过大文件、过期方案版本拒绝写入；图片不公开', async () => {
    const t = await task();
    await post(`/tasks/${t.id}/assignees`, 'A', { userId: 'A' });
    const p = await proposal(t.id, ['A']);
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#334433' },
    })
      .png()
      .toBuffer();
    await request(app)
      .post(root + '/evidence')
      .set(auth('A'))
      .field('taskId', t.id)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'big.jpg')
      .expect(413);
    await post(`/proposals/${p.id}/revisions`, 'A', { expectedVersion: 1, content: p.content });
    await request(app)
      .post(root + '/evidence')
      .set(auth('A'))
      .field('taskId', t.id)
      .field('proposalId', p.id)
      .field('expectedVersion', '1')
      .attach('image', image, 'demo.png')
      .expect(409);
    expect((await get('/evidence')).body).toHaveLength(0);
    const e = await request(app)
      .post(root + '/evidence')
      .set(auth('A'))
      .field('taskId', t.id)
      .attach('image', image, 'demo.png')
      .expect(201);
    db.prepare('DELETE FROM activity_members WHERE activity_id = ? AND user_id = ?').run(
      root.split('/')[2],
      'E',
    );
    await get(`/evidence/${e.body.id}/image`, 'E', 403);
  });
  it('私有图片、负责人上传、真实图片解码；凭证是预订门槛且绑定版本', async () => {
    const t = await task();
    await post(`/tasks/${t.id}/assignees`, 'A', { userId: 'A' });
    const p = await proposal(t.id, ['A', 'B'], { needsBooking: true });
    await confirmAll(p);
    await post(
      `/proposals/${p.id}/execution`,
      'A',
      { expectedVersion: 1, execution: 'BOOKED' },
      409,
    );
    const image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#405f50' },
    })
      .png()
      .toBuffer();
    await request(app)
      .post(root + '/evidence')
      .set(auth('B'))
      .field('taskId', t.id)
      .attach('image', image, 'fake.png')
      .expect(403);
    await request(app)
      .post(root + '/evidence')
      .set(auth('A'))
      .field('taskId', t.id)
      .attach('image', Buffer.from('<svg></svg>'), 'fake.png')
      .expect(400);
    const uploaded = await request(app)
      .post(root + '/evidence')
      .set(auth('A'))
      .field('taskId', t.id)
      .field('proposalId', p.id)
      .field('expectedVersion', '1')
      .field('caption', '纯色假凭证')
      .attach('image', image, 'fake.png')
      .expect(201);
    const path = `/evidence/${uploaded.body.id}/image`;
    await request(app)
      .get(root + path)
      .expect(401);
    const result = await get(path, 'B');
    expect(result.headers['content-type']).toBe('image/jpeg');
    expect(result.headers['cache-control']).toContain('no-store');
    const other = await request(app)
      .post('/activities')
      .set(auth('C'))
      .send({ name: '另一个活动' });
    await request(app).get(`/activities/${other.body.id}${path}`).set(auth('C')).expect(404);
    expect(
      (await post(`/proposals/${p.id}/execution`, 'A', { expectedVersion: 1, execution: 'BOOKED' }))
        .body.execution,
    ).toBe('BOOKED');
    await post(
      `/proposals/${p.id}/revisions`,
      'A',
      { expectedVersion: 1, content: p.content },
      409,
    );
    await post(`/tasks/${t.id}/content`, 'A', { expectedRevision: 1, content: '静默修改' }, 409);
    const e = await expense(
      expenseInput({ taskId: t.id, evidenceIds: [uploaded.body.id as string] }),
    );
    expect(e.evidence).toHaveLength(1);
  });
  it('800 元只分摊 A/C/D/E；一位其他分摊者确认；无关成员与记账人不能确认', async () => {
    const e = await expense();
    expect(e.status).toBe('PENDING_CONFIRMATION');
    expect(e.shares.map((s) => s.amountCents)).toEqual([20000, 20000, 20000, 20000]);
    for (const user of ['A', 'B'])
      await post(`/expenses/${e.id}/confirmations`, user, { expectedRevision: 1 }, 403);
    await post(`/expenses/${e.id}/confirmations`, 'C', { expectedRevision: 1 });
    const finance = (await get('/finance')).body;
    expect(finance.estimate.balances).toEqual([
      { userId: 'A', amountCents: 60000 },
      { userId: 'B', amountCents: 0 },
      { userId: 'C', amountCents: -20000 },
      { userId: 'D', amountCents: -20000 },
      { userId: 'E', amountCents: -20000 },
    ]);
    expect(finance.estimate.transfers).toHaveLength(3);
  });
  it('记账人与付款人分离、48 元自定义分摊、个人消费不能伪装共享账单', async () => {
    const e = await expense(
      expenseInput({
        totalCents: 4800,
        splitMode: 'CUSTOM',
        shares: [
          { userId: 'A', amountCents: 2000 },
          { userId: 'B', amountCents: 1500 },
          { userId: 'C', amountCents: 1300 },
        ],
      }),
      'D',
    );
    expect(e.recorderId).toBe('D');
    await post(`/expenses/${e.id}/confirmations`, 'A', { expectedRevision: 1 });
    expect((await get('/finance')).body.estimate.balances.slice(0, 3)).toEqual([
      { userId: 'A', amountCents: 2800 },
      { userId: 'B', amountCents: -1500 },
      { userId: 'C', amountCents: -1300 },
    ]);
    expect(
      (await expense(expenseInput({ shares: [{ userId: 'A', amountCents: 0 }] }))).status,
    ).toBe('PERSONAL_ONLY');
    expect(
      (await expense(expenseInput({ shares: [{ userId: 'B', amountCents: 0 }] }), 'B')).status,
    ).toBe('PENDING_CONFIRMATION');
    await post(
      '/expenses',
      'A',
      expenseInput({ splitMode: 'CUSTOM', shares: [{ userId: 'A', amountCents: 1 }] }),
      400,
    );
  });
  it('多条异议各自撤销；修改保留未解决异议、清空新版确认并保留历史', async () => {
    const e = await expense();
    await post(`/expenses/${e.id}/confirmations`, 'C', { expectedRevision: 1 });
    await post(`/expenses/${e.id}/disputes`, 'B', { expectedRevision: 1, reason: '不相关' }, 403);
    const d = await post(`/expenses/${e.id}/disputes`, 'D', {
      expectedRevision: 1,
      reason: '票价有误',
    });
    const dId = d.body.disputes[0].id as string;
    const c = await post(`/expenses/${e.id}/disputes`, 'C', {
      expectedRevision: 1,
      reason: '重复记账',
    });
    const cId = c.body.disputes[0].id as string;
    expect((await get('/finance')).body.estimate.confirmedTotalCents).toBe(0);
    await post(`/expenses/${e.id}/disputes/${dId}/withdraw`, 'A', {}, 403);
    const revised = await post(`/expenses/${e.id}/revisions`, 'A', {
      expectedRevision: 1,
      input: expenseInput({
        totalCents: 60000,
        shares: ['A', 'C'].map((userId) => ({ userId, amountCents: 0 })),
      }),
    });
    expect(revised.body).toMatchObject({ revision: 2, status: 'DISPUTED' });
    expect(revised.body.revisions).toHaveLength(2);
    await post(`/expenses/${e.id}/confirmations`, 'C', { expectedRevision: 1 }, 409);
    await post(`/expenses/${e.id}/disputes/${dId}/withdraw`, 'D');
    expect((await post(`/expenses/${e.id}/disputes/${cId}/withdraw`, 'C')).body.status).toBe(
      'PENDING_CONFIRMATION',
    );
    expect(
      (await post(`/expenses/${e.id}/confirmations`, 'C', { expectedRevision: 2 })).body.status,
    ).toBe('CONFIRMED');
  });
  it('跨活动资源不可引用，非成员不可读取或写入，归档后全部只读', async () => {
    const t = await task();
    const e = await expense();
    const p = await proposal();
    const activity = await request(app)
      .post('/activities')
      .set(auth('A'))
      .send({ name: '私有活动' })
      .expect(201);
    const other = `/activities/${activity.body.id}`;
    for (const suffix of ['/workspace', '/finance', '/evidence'])
      await request(app)
        .get(other + suffix)
        .set(auth('B'))
        .expect(403);
    await request(app)
      .post(other + '/expenses')
      .set(auth('A'))
      .send(expenseInput({ taskId: t.id, shares: [{ userId: 'A', amountCents: 0 }] }))
      .expect(404);
    await request(app)
      .post(other + `/proposals/${p.id}/responses`)
      .set(auth('A'))
      .send({ expectedVersion: 1, response: 'CONFIRM' })
      .expect(404);
    db.prepare("UPDATE activities SET status = 'ARCHIVED' WHERE id = ?").run(root.split('/')[2]);
    await post('/tasks', 'A', { title: '归档任务' }, 409);
    await post(`/expenses/${e.id}/confirmations`, 'C', { expectedRevision: 1 }, 409);
    await post(`/proposals/${p.id}/comments`, 'B', { expectedVersion: 1, body: '归档后' }, 409);
    await get('/finance');
  });
});
