import { z } from 'zod';
import type {
  ActivityDetail,
  User,
  Workspace,
  Evidence,
  FinanceWorkspace,
  Balance,
  Transfer,
  ExpenseInput,
} from './index';

export const freezeSettlementSchema = z
  .object({ expectedFinanceVersion: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const closeActivitySchema = freezeSettlementSchema
  .extend({ expectedSettlementId: z.string().uuid().nullable() })
  .strict();
export interface SettlementTransfer extends Transfer {
  id: string;
  receivedBy: string | null;
  receivedAt: string | null;
}
export interface SettlementSnapshot {
  members: User[];
  expenses: {
    id: string;
    revision: number;
    status: 'CONFIRMED' | 'PERSONAL_ONLY';
    recorderId: string;
    input: ExpenseInput;
  }[];
  balances: Balance[];
  confirmedTotalCents: number;
}
export interface Settlement {
  id: string;
  sequence: number;
  financeVersion: string;
  snapshot: SettlementSnapshot;
  createdBy: string;
  createdAt: string;
  reopenedBy: string | null;
  reopenedAt: string | null;
  transfers: SettlementTransfer[];
}
export interface SettlementWorkspace {
  activity: ActivityDetail;
  financeVersion: string;
  current: Settlement | null;
  history: Settlement[];
  freezeReasons: string[];
  closeReasons: string[];
  canFreeze: boolean;
  canReopen: boolean;
  canClose: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
}
export interface ActivityArchive {
  settlement: SettlementWorkspace;
  workspace: Workspace;
  finance: FinanceWorkspace;
  evidence: Evidence[];
}
