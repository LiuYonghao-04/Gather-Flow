import { z } from 'zod';
import { dateSchema } from './collaboration';
import type { Evidence } from './collaboration';
import type { ExpenseStatus, User } from './index';

export const MAX_CENTS = 100_000_000;
export const centsSchema = z.number().int().min(0).max(MAX_CENTS);
export function parseMoney(value: string): number {
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('请输入最多两位小数的金额');
  const [whole = '0', decimal = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) throw new Error('金额超过支持范围');
  return cents;
}
export function formatMoney(cents: number): string {
  return `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}
export interface Share {
  userId: string;
  amountCents: number;
}
export function splitEqually(totalCents: number, ids: string[]): Share[] {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0 ||
    totalCents > MAX_CENTS ||
    !ids.length ||
    new Set(ids).size !== ids.length
  )
    throw new Error('金额和分摊成员不合法');
  const sorted = [...ids].sort();
  return sorted.map((userId, index) => ({
    userId,
    amountCents:
      Math.floor(totalCents / sorted.length) + (index < totalCents % sorted.length ? 1 : 0),
  }));
}
const id = z.string().min(1).max(128);
export const expenseInputSchema = z
  .object({
    description: z.string().trim().min(1).max(120),
    category: z.enum(['TRANSPORT', 'STAY', 'MEAL', 'TICKET', 'OTHER']).default('OTHER'),
    date: dateSchema,
    totalCents: centsSchema.refine((value) => value > 0, '总金额须大于 0'),
    payerId: id,
    splitMode: z.enum(['EQUAL', 'CUSTOM']),
    shares: z
      .array(z.object({ userId: id, amountCents: centsSchema }).strict())
      .min(1)
      .max(100),
    taskId: id.nullable().default(null),
    evidenceIds: z.array(id).max(10).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.shares.map((share) => share.userId)).size !== value.shares.length)
      ctx.addIssue({ code: 'custom', message: '分摊成员不能重复' });
    if (new Set(value.evidenceIds).size !== value.evidenceIds.length)
      ctx.addIssue({ code: 'custom', message: '凭证不能重复关联' });
    if (
      value.splitMode === 'CUSTOM' &&
      value.shares.reduce((sum, share) => sum + share.amountCents, 0) !== value.totalCents
    )
      ctx.addIssue({ code: 'custom', message: '自定义分摊合计必须精确等于总金额' });
  });
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export const expenseReviseSchema = z
  .object({ expectedRevision: z.number().int().positive(), input: expenseInputSchema })
  .strict();
export const expenseConfirmSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const expenseDisputeSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export interface ExpenseDispute {
  id: string;
  userId: string;
  reason: string;
  revision: number;
  createdAt: string;
  withdrawnAt: string | null;
}
export interface ExpenseRevision {
  revision: number;
  input: ExpenseInput;
  actorId: string;
  createdAt: string;
}
export interface Expense extends ExpenseInput {
  id: string;
  activityId: string;
  recorderId: string;
  revision: number;
  status: ExpenseStatus;
  confirmations: { userId: string; revision: number; createdAt: string }[];
  disputes: ExpenseDispute[];
  revisions: ExpenseRevision[];
  evidence: Evidence[];
  createdAt: string;
}
export interface Balance {
  userId: string;
  amountCents: number;
}
export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}
export interface Estimate {
  balances: Balance[];
  transfers: Transfer[];
  confirmedTotalCents: number;
  pendingCount: number;
  disputedCount: number;
  personalCount: number;
  readyForSettlement: boolean;
}
export function netBalances(
  ids: string[],
  expenses: Pick<Expense, 'status' | 'payerId' | 'totalCents' | 'shares'>[],
): Balance[] {
  const map = new Map(ids.map((userId) => [userId, 0]));
  for (const expense of expenses) {
    if (expense.status !== 'CONFIRMED') continue;
    if (
      !Number.isSafeInteger(expense.totalCents) ||
      expense.totalCents <= 0 ||
      expense.shares.reduce((sum, share) => sum + share.amountCents, 0) !== expense.totalCents
    )
      throw new Error('账单金额不守恒');
    if (!map.has(expense.payerId)) throw new Error('付款人不在活动中');
    map.set(expense.payerId, map.get(expense.payerId)! + expense.totalCents);
    for (const share of expense.shares) {
      if (
        !map.has(share.userId) ||
        !Number.isSafeInteger(share.amountCents) ||
        share.amountCents < 0
      )
        throw new Error('分摊数据不合法');
      map.set(share.userId, map.get(share.userId)! - share.amountCents);
    }
  }
  const balances = [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([userId, amountCents]) => ({ userId, amountCents }));
  if (
    balances.some((item) => !Number.isSafeInteger(item.amountCents)) ||
    balances.reduce((sum, item) => sum + item.amountCents, 0) !== 0
  )
    throw new Error('净额不守恒');
  return balances;
}
export function matchTransfers(balances: Balance[]): Transfer[] {
  if (
    new Set(balances.map((item) => item.userId)).size !== balances.length ||
    balances.some((item) => !Number.isSafeInteger(item.amountCents)) ||
    balances.reduce((sum, item) => sum + item.amountCents, 0) !== 0
  )
    throw new Error('净额必须守恒');
  const order = (a: Balance, b: Balance) =>
    Math.abs(b.amountCents) - Math.abs(a.amountCents) || a.userId.localeCompare(b.userId);
  const debtors = balances
    .filter((item) => item.amountCents < 0)
    .map((item) => ({ ...item }))
    .sort(order);
  const creditors = balances
    .filter((item) => item.amountCents > 0)
    .map((item) => ({ ...item }))
    .sort(order);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amountCents = Math.min(-debtor.amountCents, creditor.amountCents);
    transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents });
    debtor.amountCents += amountCents;
    creditor.amountCents -= amountCents;
    if (!debtor.amountCents) i++;
    if (!creditor.amountCents) j++;
  }
  return transfers;
}
export interface FinanceWorkspace {
  expenses: Expense[];
  estimate: Estimate;
  members: User[];
}
