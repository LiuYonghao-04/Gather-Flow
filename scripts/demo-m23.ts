import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type {
  Session,
  ActivityDetail,
  Invite,
  Task,
  Proposal,
  Evidence,
  Expense,
  ExpenseInput,
  Workspace,
  FinanceWorkspace,
} from '@gatherflow/shared';

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const sessions = new Map<string, Session>();
async function call<T>(path: string, user?: string, body?: object): Promise<T> {
  const response = await fetch(baseUrl + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${sessions.get(user)!.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const result: unknown = await response.json();
  assert.ok(response.ok, `${response.status} ${JSON.stringify(result)}`);
  return result as T;
}
async function main() {
  for (const id of ['A', 'B', 'C', 'D', 'E'])
    sessions.set(id, await call<Session>('/auth/demo-login', undefined, { userId: id }));
  const activity = await call<ActivityDetail>('/activities', 'A', {
    name: '山野三日 · M2/M3 演示',
    type: 'TRIP',
    description: '五位朋友一起商量、分工、留存虚构凭证，再把每一笔钱记清楚。所有内容均为演示数据。',
  });
  const root = `/activities/${activity.id}`;
  for (const id of ['B', 'C', 'D', 'E']) {
    const card = await call<Invite>(root + '/invites', 'A', { kind: 'DIRECT' });
    await call(`/invites/${card.token}/join`, id, {});
  }
  const date = await call<Proposal>(root + '/proposals', 'A', {
    content: {
      title: '周六出发，在山里住两晚',
      category: 'DATE',
      date: '2026-10-24',
      description: '周六早上出发，周一午饭后返回。来不了这次也没关系，下次再约。',
    },
  });
  await call(`${root}/proposals/${date.id}/preferences`, 'E', {
    expectedVersion: 1,
    kind: 'ONLY',
    note: '我只有周日有空，周六需要值班。',
  });
  await call(`${root}/proposals/${date.id}/responses`, 'E', {
    expectedVersion: 1,
    response: 'OBJECTION',
    reason: '周六无法参加，想商量是否改到周日。',
  });
  await call(`${root}/proposals/${date.id}/comments`, 'B', {
    expectedVersion: 1,
    body: '这次先按周六安排，下次我们一起留个完整周末。',
  });
  for (const user of ['A', 'B', 'C', 'D'])
    await call(`${root}/proposals/${date.id}/responses`, user, {
      expectedVersion: 1,
      response: 'CONFIRM',
    });
  assert.equal((await call<Proposal>(`${root}/proposals/${date.id}`, 'A')).status, 'DISCUSSING');
  await call(`${root}/proposals/${date.id}/responses`, 'E', {
    expectedVersion: 1,
    response: 'OPT_OUT',
  });
  assert.equal((await call<Proposal>(`${root}/proposals/${date.id}`, 'A')).status, 'CONFIRMED');
  console.log('PASS 日期：四人确认不会覆盖异议；E 本人退出后方案确定。');
  async function createTask(title: string, owner: string, content: string) {
    let t = await call<Task>(root + '/tasks', owner, {
      title,
      brief: '演示任务：共同规划与明确责任',
      needsConfirmation: true,
    });
    await call(`${root}/tasks/${t.id}/assignees`, owner, { userId: owner });
    t = await call<Task>(`${root}/tasks/${t.id}/content`, owner, { expectedRevision: 1, content });
    return t;
  }
  const ticket = await createTask(
    '去程高铁票',
    'A',
    '四人同车：A / C / D / E，B 在当地等大家。预计 14:00 抵达。',
  );
  // Each proposal is independent: E opts out of the date proposal, but may confirm a different leg.
  const train = await call<Proposal>(root + '/proposals', 'A', {
    taskId: ticket.id,
    participantIds: ['A', 'C', 'D', 'E'],
    content: {
      title: '去程高铁 · 14:00 抵达',
      category: 'TRANSPORT',
      date: '2026-10-24',
      startTime: '10:00',
      endTime: '14:00',
      location: '山城站',
      description: '虚构车次与订单，费用由四位乘车人承担。',
      budgetCents: 80000,
      needsBooking: true,
    },
  });
  await call(`${root}/tasks/${ticket.id}/progress`, 'A', { expectedRevision: 2, completed: true });
  assert.equal((await call<Proposal>(`${root}/proposals/${train.id}`, 'A')).status, 'DISCUSSING');
  for (const user of ['A', 'C', 'D', 'E'])
    await call(`${root}/proposals/${train.id}/responses`, user, {
      expectedVersion: 1,
      response: 'CONFIRM',
    });
  const route = await createTask(
    '三日慢游路线',
    'C',
    '第一天溪谷散步，第二天山间茶屋，第三天老街午餐。',
  );
  await call(`${root}/tasks/${route.id}/assignees`, 'C', { userId: 'D' });
  const pending = await call<Task>(`${root}/tasks/${route.id}/handovers`, 'C', {
    toUserId: 'D',
    note: '路线已初拟，请你确认开放时间并接着安排。',
  });
  assert.ok(pending.assigneeIds.includes('C'));
  const handed = await call<Task>(
    `${root}/tasks/${route.id}/handovers/${pending.handovers[0]!.id}/resolve`,
    'D',
    { accept: true },
  );
  assert.deepEqual(handed.assigneeIds, ['D']);
  await call(`${root}/tasks/${route.id}/suggestions`, 'B', {
    body: '第一天先核对到站时间，不要来不及。',
  });
  const routeProposals: Proposal[] = [];
  for (const [day, title, category] of [
    ['2026-10-24', '溪谷散步 · 请核对抵达时间', 'ACTIVITY'],
    ['2026-10-25', '山间茶屋的小聚', 'MEAL'],
    ['2026-10-26', '老街午餐，再慢慢回家', 'MEAL'],
  ] as const) {
    const p = await call<Proposal>(root + '/proposals', 'D', {
      taskId: route.id,
      participantIds: ['A', 'B', 'C', 'D'],
      content: {
        title,
        category,
        date: day,
        startTime: '12:00',
        endTime: '13:00',
        location: day === '2026-10-24' ? '溪谷步道' : '山野小镇',
        description: '这是一份虚构的三日行程。',
      },
    });
    for (const user of ['A', 'B', 'C', 'D'])
      await call(`${root}/proposals/${p.id}/responses`, user, {
        expectedVersion: 1,
        response: 'CONFIRM',
      });
    routeProposals.push(p);
  }
  const workspace = await call<Workspace>(root + '/workspace', 'A');
  assert.ok(workspace.plan.conflicts.length > 0);
  assert.equal(workspace.plan.items.length, 5);
  console.log('PASS 任务：多人负责、明确交接、完成与确认独立；三日行程自动汇总并提醒时间冲突。');
  const image = await sharp({
    create: { width: 640, height: 320, channels: 3, background: '#d8e3ce' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set('taskId', ticket.id);
  form.set('proposalId', train.id);
  form.set('expectedVersion', '1');
  form.set('caption', '纯色演示凭证 · 无真实订单或个人信息');
  form.set('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'demo.png');
  const response = await fetch(baseUrl + root + '/evidence', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessions.get('A')!.token}` },
    body: form,
  });
  assert.equal(response.status, 201);
  const evidence = (await response.json()) as Evidence;
  const booked = await call<Proposal>(`${root}/proposals/${train.id}/execution`, 'A', {
    expectedVersion: 1,
    execution: 'BOOKED',
  });
  assert.equal(booked.execution, 'BOOKED');
  const input: ExpenseInput = {
    description: '四人去程高铁票',
    category: 'TRANSPORT',
    date: '2026-10-24',
    totalCents: 80000,
    payerId: 'A',
    splitMode: 'EQUAL',
    shares: ['A', 'C', 'D', 'E'].map((userId) => ({ userId, amountCents: 0 })),
    taskId: ticket.id,
    evidenceIds: [evidence.id],
  };
  const fare = await call<Expense>(root + '/expenses', 'A', input);
  assert.ok(!fare.shares.some((s) => s.userId === 'B'));
  await call(`${root}/expenses/${fare.id}/confirmations`, 'C', { expectedRevision: 1 });
  const drink = await call<Expense>(root + '/expenses', 'A', {
    ...input,
    description: '三人的路上饮料',
    category: 'MEAL',
    totalCents: 4800,
    splitMode: 'CUSTOM',
    shares: [
      { userId: 'A', amountCents: 2000 },
      { userId: 'B', amountCents: 1500 },
      { userId: 'C', amountCents: 1300 },
    ],
    taskId: null,
    evidenceIds: [],
  });
  await call(`${root}/expenses/${drink.id}/confirmations`, 'B', { expectedRevision: 1 });
  const disputed = await call<Expense>(`${root}/expenses/${drink.id}/disputes`, 'C', {
    expectedRevision: 1,
    reason: '先核对饮料单价，已在线下沟通。',
  });
  assert.equal(disputed.status, 'DISPUTED');
  await call(`${root}/expenses/${drink.id}/disputes/${disputed.disputes[0]!.id}/withdraw`, 'C', {});
  const waiting = await call<Expense>(root + '/expenses', 'D', {
    ...input,
    description: '待核对的停车费',
    totalCents: 2000,
    payerId: 'D',
    shares: ['A', 'D'].map((userId) => ({ userId, amountCents: 0 })),
    taskId: null,
    evidenceIds: [],
  });
  const finance = await call<FinanceWorkspace>(root + '/finance', 'E');
  assert.equal(finance.estimate.confirmedTotalCents, 84800);
  assert.equal(finance.estimate.pendingCount, 1);
  assert.equal(
    finance.estimate.balances.reduce((sum, b) => sum + b.amountCents, 0),
    0,
  );
  assert.equal(finance.estimate.balances.find((b) => b.userId === 'A')!.amountCents, 62800);
  console.log(
    'PASS 凭证：私有上传并复用到票款；800 元部分成员平摊，48 元自定义，异议本人撤销，预估排除待确认停车费。',
  );
  await mkdir('output', { recursive: true });
  await writeFile('output/demo-evidence.png', image);
  await writeFile(
    'output/m23-demo.json',
    JSON.stringify(
      {
        activityId: activity.id,
        ticketTaskId: ticket.id,
        routeTaskId: route.id,
        trainProposalId: train.id,
        dateProposalId: date.id,
        routeProposalIds: routeProposals.map((p) => p.id),
        fareExpenseId: fare.id,
        drinkExpenseId: drink.id,
        pendingExpenseId: waiting.id,
      },
      null,
      2,
    ),
  );
  console.log(`活动 ID：${activity.id}`);
  console.log(`H5 预览：http://localhost:5173/#/pages/activity/index?id=${activity.id}`);
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
