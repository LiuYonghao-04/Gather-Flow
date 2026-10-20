import type { ApiErrorBody, Session } from '@gatherflow/shared';

export const isDemo = (import.meta.env.VITE_APP_MODE ?? 'demo') === 'demo';
export const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001').replace(
  /\/$/,
  '',
);
const sessionKey = 'gatherflow.session';

export function storedSession(): Session | null {
  const value: unknown = uni.getStorageSync(sessionKey);
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
    session.mode !== (isDemo ? 'demo' : 'wechat')
  )
    return null;
  return session;
}
export function persistSession(value: Session | null): void {
  if (value) uni.setStorageSync(sessionKey, value);
  else uni.removeStorageSync(sessionKey);
}
export function expireSession(requestToken: string | undefined): void {
  // A delayed response from an old identity must not erase a new login.
  const cached: unknown = uni.getStorageSync(sessionKey);
  const cachedToken =
    cached && typeof cached === 'object' && 'token' in cached ? cached.token : undefined;
  if (requestToken ? cachedToken !== requestToken : storedSession() !== null) return;
  persistSession(null);
  uni.$emit('session-expired');
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
  const session = storedSession();
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseUrl}${path}`,
      method,
      data,
      timeout: 12000,
      header: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }
        if (response.statusCode === 401) {
          expireSession(session?.token);
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
