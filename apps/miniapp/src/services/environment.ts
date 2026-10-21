import { computed, ref } from 'vue';
import type { Session } from '@gatherflow/shared';
import { isShowcase } from './showcase';

type Mode = Session['mode'];
export const primaryMode: Mode =
  (import.meta.env.VITE_APP_MODE ?? 'demo') === 'demo' ? 'demo' : 'wechat';
const normalize = (value: string) => value.trim().replace(/\/+$/, '');
export const primaryBaseUrl = normalize(
  import.meta.env.VITE_API_BASE_URL ??
    (primaryMode === 'demo' ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3003'),
);
const demoBaseUrl =
  primaryMode === 'demo' ? primaryBaseUrl : normalize(import.meta.env.VITE_DEMO_API_BASE_URL ?? '');
export const demoAvailable = !isShowcase && /^https?:\/\/[^\s]+$/.test(demoBaseUrl);
const workspace = ref<Mode>(primaryMode);
const workspaceKey = 'gatherflow.workspace.' + primaryMode + '.' + primaryBaseUrl;
let revision = 0;
export const isDemo = computed(() => workspace.value === 'demo');
export const canReturnToWechat = computed(
  () => primaryMode === 'wechat' && workspace.value === 'demo',
);

export interface RequestContext {
  mode: Mode;
  baseUrl: string;
  sessionKey: string;
  revision: number;
}
export function requestContext(): RequestContext {
  const mode = workspace.value;
  const baseUrl = mode === 'demo' ? demoBaseUrl : primaryBaseUrl;
  return { mode, baseUrl, sessionKey: `gatherflow.session.${mode}.${baseUrl}`, revision };
}
export function isCurrentContext(context: RequestContext): boolean {
  const current = requestContext();
  return current.sessionKey === context.sessionKey && current.revision === context.revision;
}
export function restoreEnvironment(): void {
  const saved: unknown = uni.getStorageSync(workspaceKey);
  workspace.value = saved === 'demo' && demoAvailable ? 'demo' : primaryMode;
  revision++;
}
export function changeEnvironment(mode: Mode): void {
  if (mode === 'demo' && !demoAvailable) throw new Error('当前版本没有配置演示服务');
  if (mode === 'wechat' && primaryMode !== 'wechat') throw new Error('当前为独立演示版本');
  uni.setStorageSync(workspaceKey, mode);
  workspace.value = mode;
  revision++;
}
export function demoApiBaseUrl(): string {
  return demoBaseUrl;
}
