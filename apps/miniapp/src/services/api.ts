import type { ApiErrorBody, Session } from '@gatherflow/shared';
import {
  isCurrentContext,
  primaryMode,
  primaryBaseUrl,
  requestContext,
  type RequestContext,
} from './environment';
export { isDemo } from './environment';

const legacyKey = 'gatherflow.session';
function cachedSession(context: RequestContext): unknown {
  let value: unknown = uni.getStorageSync(context.sessionKey);
  // Migrate the former single session only to the build's original environment.
  // null is an intentional cleared slot, and must never resurrect the legacy copy.
  if (
    (value === '' || value === undefined) &&
    context.mode === primaryMode &&
    context.baseUrl === primaryBaseUrl
  ) {
    const legacy: unknown = uni.getStorageSync(legacyKey);
    if (legacy && typeof legacy === 'object' && 'mode' in legacy && legacy.mode === context.mode) {
      value = legacy;
      uni.setStorageSync(context.sessionKey, legacy);
    }
  }
  return value;
}

export function storedSession(context = requestContext()): Session | null {
  const value = cachedSession(context);
  if (
    !value ||
    typeof value !== 'object' ||
    !('token' in value) ||
    !('user' in value) ||
    !('expiresAt' in value)
  )
    return null;
  const session = value as Session;
  if (
    !session.user?.id ||
    typeof session.token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(session.token) ||
    !Number.isFinite(Date.parse(session.expiresAt)) ||
    Date.parse(session.expiresAt) <= Date.now() ||
    session.mode !== context.mode
  )
    return null;
  return session;
}
export function persistSession(value: Session | null, context = requestContext()): void {
  if (value && value.mode !== context.mode) throw new Error('登录身份与当前空间不一致，请重新登录');
  uni.setStorageSync(context.sessionKey, value);
  // Keep a compatibility mirror for existing installations and diagnostics.
  // Authorization always reads the environment-specific slot above.
  if (isCurrentContext(context)) {
    if (value) uni.setStorageSync(legacyKey, value);
    else uni.removeStorageSync(legacyKey);
  }
}
export function expireSession(requestToken: string | undefined, context = requestContext()): void {
  // A delayed response from an old identity must not erase a new login.
  const cached = cachedSession(context);
  const cachedToken =
    cached && typeof cached === 'object' && 'token' in cached ? cached.token : undefined;
  if (requestToken ? cachedToken !== requestToken : storedSession(context) !== null) return;
  persistSession(null, context);
  if (isCurrentContext(context)) uni.$emit('session-expired');
}
export function returnToLogin(): void {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as
    | { route?: string; options?: Record<string, unknown> }
    | undefined;
  if (page?.route === 'pages/login/index') return;
  const route = page?.route?.startsWith('pages/') ? '/' + page.route : '/pages/index/index';
  const query = Object.entries(page?.options ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  uni.reLaunch({ url: loginPath(route + (query ? '?' + query : '')) });
}
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function api<T>(path: string, method: 'GET' | 'POST' = 'GET', data?: object): Promise<T> {
  const context = requestContext();
  const session = storedSession(context);
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${context.baseUrl}${path}`,
      method,
      data,
      timeout: 12000,
      header: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          if (!isCurrentContext(context)) {
            reject(new ApiError('CONTEXT_CHANGED', '空间已切换，请在当前页面继续'));
            return;
          }
          resolve(response.data as T);
          return;
        }
        if (response.statusCode === 401) {
          expireSession(session?.token, context);
        }
        const body = response.data as Partial<ApiErrorBody>;
        reject(
          new ApiError(
            body?.error?.code ?? 'SERVER_ERROR',
            body?.error?.message ?? '暂时无法完成，请稍后重试',
          ),
        );
      },
      fail: () => reject(new ApiError('NETWORK_ERROR', '暂时连接不上，请检查网络后重试')),
    });
  });
}
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    const issue = error.issues[0] as { message?: string } | undefined;
    return issue?.message ?? '请检查填写的内容';
  }
  return error instanceof Error ? error.message : '操作未完成，请重试';
}
export function showError(error: unknown): void {
  uni.showToast({ title: errorMessage(error), icon: 'none', duration: 2500 });
}
export function go(path: string): void {
  uni.navigateTo({ url: path });
}
export function goHome(): void {
  uni.reLaunch({ url: '/pages/index/index' });
}
export function loginPath(returnTo = '/pages/index/index'): string {
  return `/pages/login/index?returnTo=${encodeURIComponent(returnTo)}`;
}
export function requireSession(returnTo: string): boolean {
  if (storedSession()) return true;
  uni.redirectTo({ url: loginPath(returnTo) });
  return false;
}
export function formatTime(value: string): string {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
// uni-app switch emits a detail payload on both WeChat and H5; Vue's DOM typing calls it Event.
export function switchChecked(event: unknown): boolean {
  return (event as { detail: { value: boolean } }).detail.value;
}
