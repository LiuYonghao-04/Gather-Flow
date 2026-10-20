import { z } from 'zod';

export const demoUserIds = ['A', 'B', 'C', 'D', 'E'] as const;
export const demoLoginSchema = z.object({ userId: z.enum(demoUserIds) }).strict();
export const createActivitySchema = z
  .object({
    name: z.string().trim().min(1, '给活动起个名字吧').max(40, '活动名称最多 40 个字'),
    type: z.enum(['TRIP', 'MEAL', 'HANGOUT', 'OTHER']).optional(),
    description: z.string().trim().max(300, '简介最多 300 个字').default(''),
  })
  .strict();
export const createInviteSchema = z.object({ kind: z.enum(['DIRECT', 'APPROVAL']) }).strict();
export const applySchema = z.object({ message: z.string().trim().max(200).default('') }).strict();
export const reviewSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) }).strict();
export const inviteTokenSchema = z.string().regex(/^[a-f0-9]{64}$/, '邀请链接无效');

export type CreateActivityInput = z.input<typeof createActivitySchema>;
export type ActivityType = NonNullable<CreateActivityInput['type']>;
export type Role = 'OWNER' | 'MEMBER';
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface User {
  id: string;
  name: string;
  color: string;
  tagline: string;
}
export interface Session {
  token: string;
  user: User;
  expiresAt: string;
  mode: 'demo' | 'wechat';
}
export interface Activity {
  id: string;
  name: string;
  type: ActivityType | null;
  description: string;
  ownerId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  role: Role;
  memberCount: number;
  pendingCount: number;
}
export interface Member extends User {
  role: Role;
  joinedAt: string;
}
export interface ActivityDetail extends Activity {
  financialFrozen: boolean;
  members: Member[];
}
export interface JoinApplication {
  id: string;
  user: User;
  message: string;
  status: ApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
}
export interface Invite {
  token: string;
  kind: 'DIRECT' | 'APPROVAL';
  activityId: string;
  path: string;
  createdAt: string;
}
// Public preview intentionally excludes members, description, itinerary and finances.
export interface InvitePreview {
  activity: { id: string; name: string; type: ActivityType | null; status: 'ACTIVE' | 'ARCHIVED' };
  mode: 'DIRECT' | 'APPROVAL';
  consumed: boolean;
  isMember: boolean;
  applicationStatus: ApplicationStatus | null;
}
export interface JoinResult {
  outcome: 'JOINED' | 'ALREADY_MEMBER' | 'APPROVAL_REQUIRED';
  activityId: string;
}
export interface AuditEvent {
  id: string;
  action: string;
  actor: User;
  targetId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export * from './collaboration';
export * from './finance';
export * from './settlement';
export type ProposalResponse = 'CONFIRM' | 'OBJECTION' | 'OPT_OUT';
export type TaskProgress = 'UNCLAIMED' | 'IN_PROGRESS' | 'HANDOVER_PENDING' | 'COMPLETED';
export type ExpenseStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'DISPUTED' | 'PERSONAL_ONLY';
export const activityTypeLabels: Record<ActivityType, string> = {
  TRIP: '短途旅行',
  MEAL: '一起吃饭',
  HANGOUT: '朋友小聚',
  OTHER: '随心安排',
};
