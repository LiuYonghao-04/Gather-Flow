import assert from 'node:assert/strict';
import type {
  ActivityDetail,
  ApiErrorBody,
  Invite,
  JoinApplication,
  JoinResult,
  Session,
} from '@gatherflow/shared';

const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const sessions = new Map<string, Session>();
async function call<T>(path: string, userId?: string, body?: object): Promise<T> {
  const session = userId ? sessions.get(userId) : undefined;
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${(data as ApiErrorBody).error.message}`);
  return data as T;
}
async function run() {
  for (const id of ['A', 'B', 'C', 'D', 'E'])
    sessions.set(id, await call<Session>('/auth/demo-login', undefined, { userId: id }));
  const activity = await call<ActivityDetail>('/activities', 'A', {
    name: '周末三日游 · 五人演示',
    type: 'TRIP',
    description: 'M1 自动演示创建的活动：五个真实 API 会话，共享同一个 SQLite 数据库。',
  });
  const invite = (user: string, kind: Invite['kind']) =>
    call<Invite>(`/activities/${activity.id}/invites`, user, { kind });
  const join = (card: Invite, user: string) =>
    call<JoinResult>(`/invites/${card.token}/join`, user, {});
  const apply = (card: Invite, user: string) =>
    call(`/invites/${card.token}/applications`, user, { message: '一起去，算我一个！' });
  const first = await invite('A', 'DIRECT');
  assert.equal((await join(first, 'B')).outcome, 'JOINED');
  console.log('PASS  A 直邀 B：B 直接加入');
  assert.equal((await join(first, 'C')).outcome, 'APPROVAL_REQUIRED');
  await apply(first, 'C');
  console.log('PASS  同一张卡交给 C：C 必须申请');
  const memberCard = await invite('B', 'APPROVAL');
  assert.equal((await join(memberCard, 'D')).outcome, 'APPROVAL_REQUIRED');
  await apply(memberCard, 'D');
  console.log('PASS  B 邀请 D：D 必须申请');
  const pending = await call<JoinApplication[]>(`/activities/${activity.id}/applications`, 'A');
  assert.equal(pending.length, 2);
  for (const application of pending)
    await call(`/activities/${activity.id}/applications/${application.id}/review`, 'A', {
      decision: 'APPROVED',
    });
  console.log('PASS  A 审批 C、D：两人正式入组');
  assert.equal((await join(await invite('A', 'DIRECT'), 'E')).outcome, 'JOINED');
  console.log('PASS  A 新直邀 E：E 直接加入');
  const result = await call<ActivityDetail>(`/activities/${activity.id}`, 'E');
  assert.deepEqual(result.members.map((user) => user.id).sort(), ['A', 'B', 'C', 'D', 'E']);
  const logs = await call<unknown[]>(`/activities/${activity.id}/audit`, 'B');
  assert.equal(logs.length, 10);
  console.log(`PASS  五人均可查看同一活动；${logs.length} 条操作记录已持久化`);
  console.log(`活动 ID：${activity.id}`);
  console.log(`小程序页面：/pages/activity/index?id=${activity.id}`);
  if (baseUrl === 'http://127.0.0.1:3001') {
    console.log(`H5 预览：http://localhost:5173/#/pages/activity/index?id=${activity.id}`);
  } else {
    console.log('预览此活动时，请将前端 VITE_API_BASE_URL 配置为本脚本使用的 API 地址。');
  }
}
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
