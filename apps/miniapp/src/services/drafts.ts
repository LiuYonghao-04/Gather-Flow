import { z, type ZodType } from 'zod';
import { canonicalJson } from '@gatherflow/shared';
import { storedSession } from './api';
import { requestContext, isCurrentContext } from './environment';

let sequence = 0;
export function newRequestKey(): string {
  // A uniqueness marker, never an authentication credential.
  return `r_${Date.now().toString(36)}_${++sequence}_${Math.random().toString(36).slice(2).padEnd(12, '0')}_${Math.random().toString(36).slice(2).padEnd(12, '0')}`;
}
export type DraftState = '' | 'saved' | 'restored' | 'outdated' | 'error';
interface Record<T> {
  format: 1;
  baseline: string;
  data: T;
  updatedAt: number;
  pending?: { key: string; payload: string };
}
export class DraftStore<T> {
  private context = requestContext();
  private userId = storedSession(this.context)?.user.id;
  private key: string;
  private record: Record<T> | null = null;
  constructor(
    resource: string,
    private baseline: string,
    private schema: ZodType<T>,
  ) {
    this.key = `gatherflow.draft.v1.${encodeURIComponent(this.context.sessionKey)}.${encodeURIComponent(this.userId ?? 'guest')}.${encodeURIComponent(resource)}`;
  }
  private current() {
    return (
      !!this.userId && isCurrentContext(this.context) && storedSession()?.user.id === this.userId
    );
  }
  load(): { state: DraftState; data?: T } {
    if (!this.current()) return { state: '' };
    const result = z
      .object({
        format: z.literal(1),
        baseline: z.string(),
        data: this.schema,
        updatedAt: z.number().finite(),
        pending: z
          .object({ key: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/), payload: z.string() })
          .optional(),
      })
      .strict()
      .safeParse(uni.getStorageSync(this.key));
    if (!result.success) return { state: '' };
    this.record = result.data as Record<T>;
    return this.record.baseline === this.baseline
      ? { state: 'restored', data: this.record.data }
      : { state: 'outdated' };
  }
  save(data: T): void {
    if (!this.current()) throw new Error('登录身份已变化，请重新打开编辑页');
    const pending = this.record?.baseline === this.baseline ? this.record.pending : undefined;
    const next: Record<T> = {
      format: 1,
      baseline: this.baseline,
      data: this.schema.parse(data),
      updatedAt: Date.now(),
      ...(pending ? { pending } : {}),
    };
    uni.setStorageSync(this.key, JSON.parse(canonicalJson(next)));
    this.record = next;
  }
  submissionKey(input: unknown, data: T): string {
    if (!this.current()) throw new Error('登录身份已变化，请重新打开编辑页');
    const payload = canonicalJson(input);
    const previous = this.record?.baseline === this.baseline ? this.record.pending : undefined;
    const key = previous?.payload === payload ? previous.key : newRequestKey();
    const next: Record<T> = {
      format: 1,
      baseline: this.baseline,
      data: this.schema.parse(data),
      updatedAt: Date.now(),
      pending: { key, payload },
    };
    // Persist before sending: a lost response followed by reopening can safely retry.
    try {
      uni.setStorageSync(this.key, JSON.parse(canonicalJson(next)));
    } catch {
      throw new Error('无法保存提交状态，本次尚未提交。请清理本机存储后重试');
    }
    this.record = next;
    return key;
  }
  clear(): boolean {
    if (!this.current()) return false;
    try {
      uni.removeStorageSync(this.key);
      this.record = null;
      return true;
    } catch {
      return false;
    }
  }
}
