import { expect, it } from 'vitest';
import { netBalances, matchTransfers, type ActivityArchive } from '@gatherflow/shared';
import preview from '../src/content/demo-preview.json';
import type { DemoPreview } from '../src/services/demo-types';
import { projectDemo } from '../../../scripts/export-demo-preview';
const data = preview as DemoPreview;

it('preserves the original demo totals, partial allocations and paid settlement', () => {
  const balances = netBalances(
    data.members.map((m) => m.id),
    data.expenses,
  );
  expect(balances).toEqual(data.balances);
  const transfers = data.transfers.map(({ fromUserId, toUserId, amountCents }) => ({
    fromUserId,
    toUserId,
    amountCents,
  }));
  expect(transfers).toEqual(matchTransfers(balances));
  expect(data.expenses.reduce((sum, e) => sum + e.totalCents, 0)).toBe(data.activity.totalCents);
  expect(data.activity.totalCents).toBe(86800);
  expect(data.transfers).toHaveLength(4);
  expect(data.transfers.every((t) => t.receivedAt)).toBe(true);
  for (const expense of data.expenses) {
    expect(expense.shares.reduce((sum, s) => sum + s.amountCents, 0)).toBe(expense.totalCents);
    expect(
      expense.confirmations.some(
        (c) => c.userId !== expense.recorderId && expense.shares.some((s) => s.userId === c.userId),
      ),
    ).toBe(true);
    expect(expense.disputes.every((d) => d.withdrawnAt)).toBe(true);
  }
  const fare = data.expenses.find((e) => e.totalCents === 80000)!;
  expect(fare.shares.map((s) => s.userId).sort()).toEqual(['A', 'C', 'D', 'E']);
});
it('retains the consensus and handover that explain the demo', () => {
  const date = data.proposals.find((p) => p.content.category === 'DATE')!;
  expect(date.responses.find((r) => r.userId === 'E')?.response).toBe('OPT_OUT');
  expect(date.preferences.find((p) => p.userId === 'E')?.kind).toBe('ONLY');
  const handover = data.tasks.flatMap((t) => t.handovers);
  expect(handover).toContainEqual(
    expect.objectContaining({ fromUserId: 'C', toUserId: 'D', status: 'ACCEPTED' }),
  );
  expect(data.settlementHistory.some((s) => s.reopened)).toBe(true);
});
it('contains only the five fictional members and no credential or private image location', () => {
  expect(data.members.map((m) => m.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
  const forbidden =
    /^(token|session_key|openid|unionid|secret|authorization|wechatAppSecret|imageUrl|path|url)$/i;
  function inspect(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(forbidden);
      inspect(child);
    }
  }
  inspect(data);
  expect(JSON.stringify(data)).not.toMatch(/Bearer |https?:\/\/|wxfile:\/\/|WECHAT_APP_SECRET/);
});
it.each([
  { status: 'ACTIVE', name: '山野三日 · M2/M3 演示' },
  { status: 'ARCHIVED', name: '真实朋友的活动' },
])('refuses to project unrelated or unfinished activities: $status $name', (activity) => {
  expect(() => projectDemo({ settlement: { activity } } as unknown as ActivityArchive)).toThrow();
});
