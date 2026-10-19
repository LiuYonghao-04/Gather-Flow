import { describe, expect, it } from 'vitest';
import {
  parseMoney,
  formatMoney,
  splitEqually,
  netBalances,
  matchTransfers,
} from '@gatherflow/shared';

describe('整数分与净额预估', () => {
  it('小数解析精确，尾差顺序稳定，拒绝超限和小数分', () => {
    expect(parseMoney('48.01')).toBe(4801);
    expect(formatMoney(-201)).toBe('-2.01');
    expect(splitEqually(100, ['C', 'A', 'B'])).toEqual([
      { userId: 'A', amountCents: 34 },
      { userId: 'B', amountCents: 33 },
      { userId: 'C', amountCents: 33 },
    ]);
    for (const value of ['0.001', '1e2', '-1', '1000000.01', 'NaN', '1,000'])
      expect(() => parseMoney(value)).toThrow();
    expect(() => splitEqually(1.5, ['A'])).toThrow();
    expect(() => splitEqually(100, ['A', 'A'])).toThrow();
  });
  it('债务环路抵消为 A→B20、C→B10；无自转账', () => {
    const balances = netBalances(
      ['A', 'B', 'C'],
      [
        {
          status: 'CONFIRMED',
          payerId: 'B',
          totalCents: 5000,
          shares: [{ userId: 'A', amountCents: 5000 }],
        },
        {
          status: 'CONFIRMED',
          payerId: 'C',
          totalCents: 2000,
          shares: [{ userId: 'B', amountCents: 2000 }],
        },
        {
          status: 'CONFIRMED',
          payerId: 'A',
          totalCents: 3000,
          shares: [{ userId: 'C', amountCents: 3000 }],
        },
      ],
    );
    expect(balances).toEqual([
      { userId: 'A', amountCents: -2000 },
      { userId: 'B', amountCents: 3000 },
      { userId: 'C', amountCents: -1000 },
    ]);
    expect(matchTransfers(balances)).toEqual([
      { fromUserId: 'A', toUserId: 'B', amountCents: 2000 },
      { fromUserId: 'C', toUserId: 'B', amountCents: 1000 },
    ]);
  });
  it('大量尾差与不同付款人组合均守恒，预估不纳入争议、待确认或个人账单', () => {
    const ids = ['A', 'B', 'C', 'D', 'E'];
    for (let total = 1; total <= 1000; total += 7) {
      const shares = splitEqually(total, ids);
      expect(shares.reduce((s, x) => s + x.amountCents, 0)).toBe(total);
      const balances = netBalances(ids, [
        { status: 'CONFIRMED', payerId: ids[total % ids.length]!, totalCents: total, shares },
      ]);
      const left = new Map(balances.map((x) => [x.userId, x.amountCents]));
      for (const t of matchTransfers(balances)) {
        expect(t.fromUserId).not.toBe(t.toUserId);
        expect(t.amountCents).toBeGreaterThan(0);
        left.set(t.fromUserId, left.get(t.fromUserId)! + t.amountCents);
        left.set(t.toUserId, left.get(t.toUserId)! - t.amountCents);
      }
      expect([...left.values()].every((x) => x === 0)).toBe(true);
    }
    expect(
      netBalances(
        ids,
        ['DISPUTED', 'PENDING_CONFIRMATION', 'PERSONAL_ONLY'].map((status) => ({
          status: status as 'DISPUTED',
          payerId: 'A',
          totalCents: 10,
          shares: [{ userId: 'B', amountCents: 10 }],
        })),
      ).every((x) => x.amountCents === 0),
    ).toBe(true);
  });
});
