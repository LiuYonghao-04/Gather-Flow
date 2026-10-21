import { changeEnvironment, demoApiBaseUrl, demoAvailable, primaryMode } from './environment';
import { storedSession, persistSession } from './api';

export function checkDemoService(): Promise<void> {
  if (!demoAvailable) return Promise.reject(new Error('当前版本没有配置可操作的演示空间'));
  return new Promise((resolve, reject) => {
    // Probe without either identity's token. Never switch until the server declares demo mode.
    uni.request({
      url: demoApiBaseUrl() + '/health',
      timeout: 8000,
      success(response) {
        const body = response.data as { mode?: unknown; status?: unknown } | null;
        if (response.statusCode === 200 && body?.status === 'ok' && body.mode === 'demo') resolve();
        else reject(new Error('演示服务配置不匹配，请检查后重试'));
      },
      fail: () => reject(new Error('演示服务暂未连接，请保持本地演示服务运行后重试')),
    });
  });
}
export function enterDemoWorkspace(): void {
  // Reading first migrates an existing WeChat login to its own scoped slot.
  const current = storedSession();
  persistSession(current);
  changeEnvironment('demo');
  persistSession(storedSession());
}
export function returnToWechatWorkspace(): void {
  if (primaryMode !== 'wechat') throw new Error('当前为独立演示版本');
  persistSession(storedSession());
  changeEnvironment('wechat');
  persistSession(storedSession());
}
