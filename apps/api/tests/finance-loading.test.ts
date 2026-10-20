import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { ExpenseService } from '../src/services/expenses';
import type { ExpenseInput } from '@gatherflow/shared';
let db: Db;
let service: ExpenseService;
let activityId: string;
const input: ExpenseInput = {
  description: '回归样本',
  category: 'OTHER',
  date: '2026-10-20',
  totalCents: 101,
  payerId: 'A',
  splitMode: 'EQUAL',
  shares: [
    { userId: 'A', amountCents: 0 },
    { userId: 'B', amountCents: 0 },
  ],
  taskId: null,
  evidenceIds: [],
};
beforeEach(() => {
  db = openDatabase(':memory:');
  seedDatabase(db);
  service = new ExpenseService(db);
  activityId = service.create('A', { name: '汇总回归' }).id;
  db.prepare("INSERT INTO activity_members VALUES (?,?,'MEMBER',?)").run(
    activityId,
    'B',
    new Date().toISOString(),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
});
it('preserves revision, confirmation and dispute history and excludes other activities', () => {
  const expense = service.createExpense(activityId, 'A', input);
  service.confirmExpense(activityId, expense.id, 'B', 1);
  service.disputeExpense(activityId, expense.id, 'B', 1, '核对金额');
  service.reviseExpense(activityId, expense.id, 'A', 1, { ...input, totalCents: 103 });
  const other = service.create('A', { name: '另一活动' }).id;
  service.createExpense(other, 'A', { ...input, shares: [{ userId: 'A', amountCents: 0 }] });
  const finance = service.finance(activityId, 'B');
  expect(finance.expenses).toEqual([service.expense(activityId, expense.id, 'B')]);
  expect(finance.expenses[0]).toMatchObject({ revision: 2, status: 'DISPUTED' });
  expect(finance.expenses[0]!.revisions).toHaveLength(2);
  expect(finance.expenses[0]!.confirmations).toHaveLength(1);
  expect(finance.estimate.confirmedTotalCents).toBe(0);
  expect(() => service.finance(activityId, 'C')).toThrow();
  expect(() => service.expense(other, expense.id, 'A')).toThrow();
});
it('keeps the SQL query count constant as the bill count grows', () => {
  service.createExpense(activityId, 'A', input);
  const spy = vi.spyOn(db, 'prepare');
  service.finance(activityId, 'A');
  const single = spy.mock.calls.length;
  for (let i = 0; i < 20; i++) service.createExpense(activityId, 'A', input);
  spy.mockClear();
  const result = service.finance(activityId, 'A');
  expect(result.expenses).toHaveLength(21);
  expect(spy.mock.calls.length).toBe(single);
  expect(single).toBeLessThan(15);
});
