import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@gatherflow/shared';
const request = vi.fn(),
  uploadFile = vi.fn(),
  downloadFile = vi.fn(),
  previewImage = vi.fn(),
  emit = vi.fn();
const storage = new Map<string, unknown>();
const wxSession: Session = {
  mode: 'wechat',
  token: 'a'.repeat(64),
  expiresAt: '2099-01-01',
  user: { id: 'wx-person', name: '微信朋友', color: '#52745e', tagline: '' },
};
const demoSession: Session = {
  mode: 'demo',
  token: 'b'.repeat(64),
  expiresAt: '2099-01-01',
  user: { id: 'A', name: '林间', color: '#52745e', tagline: '' },
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.clear();
  vi.stubEnv('VITE_APP_MODE', 'wechat');
  vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:3003');
  vi.stubEnv('VITE_DEMO_API_BASE_URL', 'http://127.0.0.1:3001');
  storage.set('gatherflow.session', wxSession);
  vi.stubGlobal('uni', {
    request,
    uploadFile,
    downloadFile,
    previewImage,
    $emit: emit,
    getStorageSync: (key: string) => (storage.has(key) ? storage.get(key) : ''),
    setStorageSync: (key: string, value: unknown) => {
      storage.set(key, value);
    },
    removeStorageSync: (key: string) => {
      storage.delete(key);
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function modules() {
  return {
    api: await import('../src/services/api'),
    env: await import('../src/services/environment'),
    demo: await import('../src/services/demo-environment'),
  };
}
it('keeps WeChat and demo sessions, URLs and tokens separate through a round trip', async () => {
  const { api, env, demo } = await modules();
  expect(api.storedSession()?.token).toBe(wxSession.token);
  demo.enterDemoWorkspace();
  expect(env.isDemo.value).toBe(true);
  expect(api.storedSession()).toBeNull();
  api.persistSession(demoSession);
  const first = api.api('/activities');
  expect(request.mock.calls[0]![0]).toMatchObject({
    url: 'http://127.0.0.1:3001/activities',
    header: { Authorization: 'Bearer ' + demoSession.token },
  });
  request.mock.calls[0]![0].success({ statusCode: 200, data: [] });
  await first;
  demo.returnToWechatWorkspace();
  expect(env.isDemo.value).toBe(false);
  expect(api.storedSession()?.token).toBe(wxSession.token);
  const second = api.api('/activities');
  expect(request.mock.calls[1]![0]).toMatchObject({
    url: 'http://127.0.0.1:3003/activities',
    header: { Authorization: 'Bearer ' + wxSession.token },
  });
  request.mock.calls[1]![0].success({ statusCode: 200, data: [] });
  await second;
  demo.enterDemoWorkspace();
  expect(api.storedSession()?.token).toBe(demoSession.token);
});
it('restores the selected environment after restart and still retains the personal identity', async () => {
  const first = await modules();
  first.api.storedSession();
  first.demo.enterDemoWorkspace();
  first.api.persistSession(demoSession);
  vi.resetModules();
  const next = await modules();
  next.env.restoreEnvironment();
  expect(next.api.storedSession()?.user.id).toBe('A');
  next.demo.returnToWechatWorkspace();
  expect(next.api.storedSession()?.user.id).toBe('wx-person');
});
it('an old WeChat 401 cannot log out the active demo session', async () => {
  const { api, demo } = await modules();
  const pending = api.api('/activities');
  demo.enterDemoWorkspace();
  api.persistSession(demoSession);
  request.mock.calls[0]![0].success({
    statusCode: 401,
    data: { error: { code: 'SESSION_EXPIRED', message: 'expired' } },
  });
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(api.storedSession()?.token).toBe(demoSession.token);
  expect(emit).not.toHaveBeenCalled();
  demo.returnToWechatWorkspace();
  expect(api.storedSession()).toBeNull();
});
it('rejects a successful response from a space that is no longer active', async () => {
  const { api, demo } = await modules();
  const pending = api.api('/activities');
  demo.enterDemoWorkspace();
  api.persistSession(demoSession);
  request.mock.calls[0]![0].success({
    statusCode: 200,
    data: [{ name: 'private personal activity' }],
  });
  await expect(pending).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  expect(api.storedSession()?.user.id).toBe('A');
});
it('blocks late upload and image preview responses after changing spaces', async () => {
  const { api, demo } = await modules();
  const files = await import('../src/services/files');
  const upload = files.uploadPhoto('private-activity', 'photo.png', {});
  const image = files.previewEvidence('private-activity', 'evidence');
  expect(uploadFile.mock.calls[0]![0].url).toBe(
    'http://127.0.0.1:3003/activities/private-activity/evidence',
  );
  demo.enterDemoWorkspace();
  api.persistSession(demoSession);
  uploadFile.mock.calls[0]![0].success({ statusCode: 401, data: '{}' });
  downloadFile.mock.calls[0]![0].success({ statusCode: 200, tempFilePath: 'wxfile://private' });
  await expect(upload).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  await expect(image).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  expect(previewImage).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
  expect(api.storedSession()?.token).toBe(demoSession.token);
});
it('checks demo health without transmitting a personal or demo token', async () => {
  const { demo, api, env } = await modules();
  const pending = demo.checkDemoService();
  expect(request.mock.calls[0]![0].url).toBe('http://127.0.0.1:3001/health');
  expect(request.mock.calls[0]![0].header).toBeUndefined();
  request.mock.calls[0]![0].success({ statusCode: 200, data: { mode: 'demo', status: 'ok' } });
  await expect(pending).resolves.toBeUndefined();
  expect(env.isDemo.value).toBe(false);
  expect(api.storedSession()?.token).toBe(wxSession.token);
});
it.each(['wrong-mode', 'offline'])(
  'keeps the personal session when the demo source is %s',
  async (kind) => {
    const { demo, api, env } = await modules();
    const pending = demo.checkDemoService();
    if (kind === 'offline') request.mock.calls[0]![0].fail();
    else
      request.mock.calls[0]![0].success({
        statusCode: 200,
        data: { mode: 'wechat', status: 'ok' },
      });
    await expect(pending).rejects.toThrow();
    expect(env.isDemo.value).toBe(false);
    expect(api.storedSession()?.token).toBe(wxSession.token);
  },
);
it('cannot activate demo mode when no demo service is configured', async () => {
  vi.stubEnv('VITE_DEMO_API_BASE_URL', '');
  const { env, demo, api } = await modules();
  expect(env.demoAvailable).toBe(false);
  expect(() => demo.enterDemoWorkspace()).toThrow('没有配置');
  expect(api.storedSession()?.token).toBe(wxSession.token);
  expect(request).not.toHaveBeenCalled();
});
it('does not migrate a demo identity into the personal space or resurrect a cleared session', async () => {
  const { api } = await modules();
  storage.set('gatherflow.session', demoSession);
  expect(api.storedSession()).toBeNull();
  api.persistSession(wxSession);
  api.persistSession(null);
  storage.set('gatherflow.session', wxSession);
  expect(api.storedSession()).toBeNull();
  expect(() => api.persistSession(demoSession)).toThrow('身份与当前空间不一致');
});
