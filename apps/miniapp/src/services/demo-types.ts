import type {
  Expense,
  Proposal,
  Task,
  User,
  Balance,
  SettlementTransfer,
} from '@gatherflow/shared';

export interface DemoPreview {
  schemaVersion: 1;
  source: { activityId: string; capturedAt: string; archivedAt: string };
  activity: { name: string; description: string; totalCents: number };
  members: User[];
  proposals: {
    content: Proposal['content'];
    status: Proposal['status'];
    execution: Proposal['execution'];
    participantIds: string[];
    responses: Pick<Proposal['responses'][number], 'userId' | 'response' | 'reason'>[];
    preferences: Pick<Proposal['preferences'][number], 'userId' | 'kind' | 'note'>[];
    comments: Pick<Proposal['comments'][number], 'authorId' | 'body'>[];
  }[];
  tasks: {
    title: string;
    content: string;
    completed: boolean;
    assigneeIds: string[];
    handovers: Pick<Task['handovers'][number], 'fromUserId' | 'toUserId' | 'note' | 'status'>[];
    suggestions: Pick<Task['suggestions'][number], 'authorId' | 'body' | 'status'>[];
  }[];
  expenses: {
    description: string;
    date: string;
    totalCents: number;
    payerId: string;
    recorderId: string;
    splitMode: Expense['splitMode'];
    shares: Expense['shares'];
    status: Expense['status'];
    confirmations: Pick<Expense['confirmations'][number], 'userId' | 'createdAt'>[];
    disputes: Pick<Expense['disputes'][number], 'userId' | 'reason' | 'withdrawnAt'>[];
    evidenceCaptions: string[];
  }[];
  balances: Balance[];
  transfers: Pick<SettlementTransfer, 'fromUserId' | 'toUserId' | 'amountCents' | 'receivedAt'>[];
  settlementHistory: { sequence: number; totalCents: number; reopened: boolean }[];
  evidence: { caption: string; uploaderId: string }[];
}
