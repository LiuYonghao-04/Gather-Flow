import { z } from 'zod';
import type { Member, ProposalResponse, TaskProgress, User } from './index';

export const categories = [
  'DATE',
  'DESTINATION',
  'TRANSPORT',
  'STAY',
  'ACTIVITY',
  'MEAL',
  'OTHER',
] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  DATE: '时间',
  DESTINATION: '目的地',
  TRANSPORT: '交通',
  STAY: '住宿',
  ACTIVITY: '游玩',
  MEAL: '餐食',
  OTHER: '其他',
};
export const responseLabels: Record<ProposalResponse, string> = {
  CONFIRM: '确认参加',
  OBJECTION: '有异议',
  OPT_OUT: '本次不参加',
};
export const progressLabels: Record<TaskProgress, string> = {
  UNCLAIMED: '待认领',
  IN_PROGRESS: '进行中',
  HANDOVER_PENDING: '待交接',
  COMPLETED: '工作已完成',
};
const id = z.string().min(1).max(128);
const text = z.string().trim().max(4000);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, '日期无效');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间无效');
export const proposalContentSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: text.default(''),
    category: z.enum(categories),
    location: z.string().trim().max(200).default(''),
    date: dateSchema.nullable().default(null),
    startTime: timeSchema.nullable().default(null),
    endTime: timeSchema.nullable().default(null),
    budgetCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
    needsBooking: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.startTime || value.endTime) && !value.date)
      ctx.addIssue({ code: 'custom', message: '填写时间前请选择日期' });
    if (value.endTime && (!value.startTime || value.endTime <= value.startTime))
      ctx.addIssue({ code: 'custom', message: '结束时间须晚于开始时间，跨日行程请拆成两段' });
  });
export const proposalCreateSchema = z
  .object({
    content: proposalContentSchema,
    participantIds: z.array(id).min(1).max(100).optional(),
    taskId: id.nullable().default(null),
  })
  .strict();
export const proposalReviseSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    content: proposalContentSchema,
    taskId: id.nullable().optional(),
  })
  .strict();
export const responseSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    userId: id.optional(),
    response: z.enum(['CONFIRM', 'OBJECTION', 'OPT_OUT']),
    reason: z.string().trim().max(500).default(''),
  })
  .strict();
export const preferenceSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    kind: z.enum(['PREFER', 'ONLY']),
    note: z.string().trim().min(1).max(500),
  })
  .strict();
export const commentSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    body: z.string().trim().min(1).max(1000),
  })
  .strict();
export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    brief: text.default(''),
    needsConfirmation: z.boolean().default(true),
  })
  .strict();
export const taskEditSchema = z
  .object({ expectedRevision: z.number().int().positive(), content: text })
  .strict();
export const taskCompleteSchema = z
  .object({ expectedRevision: z.number().int().positive(), completed: z.boolean() })
  .strict();
export const assigneeSchema = z.object({ userId: id }).strict();
export const suggestionSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();
export const suggestionReviewSchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'REJECTED']),
    note: z.string().trim().max(500).default(''),
  })
  .strict();
export const handoverSchema = z
  .object({ toUserId: id, note: z.string().trim().min(1).max(500) })
  .strict();

export type ProposalContent = z.infer<typeof proposalContentSchema>;
export type ProposalCreate = z.infer<typeof proposalCreateSchema>;
export interface ProposalVersion {
  version: number;
  content: ProposalContent;
  taskRevision: number | null;
  createdAt: string;
  actorId: string;
}
export interface ResponseRecord {
  userId: string;
  actorId: string;
  response: ProposalResponse;
  reason: string;
  version: number;
  createdAt: string;
}
export interface Preference {
  userId: string;
  kind: 'PREFER' | 'ONLY';
  note: string;
  version: number;
  updatedAt: string;
}
export interface ProposalComment {
  id: string;
  authorId: string;
  version: number;
  body: string;
  createdAt: string;
}
export interface Proposal {
  id: string;
  activityId: string;
  authorId: string;
  taskId: string | null;
  version: number;
  content: ProposalContent;
  participants: Member[];
  responses: ResponseRecord[];
  preferences: Preference[];
  comments: ProposalComment[];
  versions: ProposalVersion[];
  status: 'DISCUSSING' | 'CONFIRMED' | 'STALE';
  execution: 'PLANNED' | 'CONFIRMED' | 'BOOKED' | 'DONE';
  assigneeIds: string[];
  createdAt: string;
}
export interface TaskSuggestion {
  id: string;
  authorId: string;
  body: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  reviewerId: string | null;
  reviewNote: string;
  createdAt: string;
}
export interface TaskHandover {
  id: string;
  fromUserId: string;
  toUserId: string;
  note: string;
  status: 'PENDING' | 'ACCEPTED' | 'CANCELLED';
  createdAt: string;
  acceptedAt: string | null;
}
export interface TaskRevision {
  revision: number;
  content: string;
  actorId: string;
  createdAt: string;
}
export interface Task {
  id: string;
  activityId: string;
  title: string;
  brief: string;
  content: string;
  creatorId: string;
  revision: number;
  needsConfirmation: boolean;
  completed: boolean;
  status: TaskProgress;
  assigneeIds: string[];
  suggestions: TaskSuggestion[];
  handovers: TaskHandover[];
  revisions: TaskRevision[];
  proposalIds: string[];
  createdAt: string;
}
export interface PlanConflict {
  firstId: string;
  secondId: string;
  message: string;
}
export interface Plan {
  items: Proposal[];
  conflicts: PlanConflict[];
}
export interface Workspace {
  members: Member[];
  proposals: Proposal[];
  tasks: Task[];
  plan: Plan;
  currentUserId: string;
  ownerId: string;
  status: 'ACTIVE' | 'ARCHIVED';
}
export interface Evidence {
  id: string;
  activityId: string;
  taskId: string;
  proposalId: string | null;
  proposalVersion: number | null;
  uploader: User;
  caption: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}
