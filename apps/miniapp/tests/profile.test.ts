import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const storage = new Map<string, unknown>();
const request = vi.fn();
const original = {
  mode: 'wechat',
  token: 'a'.repeat(64),
  user: { id: 'wx-a', name: '原昵称', color: '#52745e', tagline: '' },
  expiresAt: '2099-01-01',
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  storage.clear();
  storage.set('gatherflow.session', original);
  vi.stubEnv('VITE_APP_MODE', 'wechat');
  vi.stubEnv('VITE_API_BASE_URL', 'http://test:3003');
  vi.stubGlobal('uni', {
    request,
    getStorageSync: (key: string) => storage.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function store() {
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  return (await import('../src/stores/session')).useSessionStore();
}
it('updates the local profile without replacing the token and ignores an earlier refresh', async () => {
  const session = await store();
  const refresh = session.profile();
  const save = session.profile('新昵称');
  request.mock.calls[1]![0].success({
    statusCode: 200,
    data: { ...original.user, name: '新昵称' },
  });
  await save;
  request.mock.calls[0]![0].success({ statusCode: 200, data: original.user });
  await refresh;
  expect(session.user?.name).toBe('新昵称');
  expect(session.session?.token).toBe(original.token);
});
it('does not overwrite a newly logged-in identity with a late profile response', async () => {
  const session = await store();
  const save = session.profile('新昵称');
  const { persistSession, storedSession } = await import('../src/services/api');
  persistSession({
    ...original,
    mode: 'wechat',
    token: 'b'.repeat(64),
    user: { ...original.user, id: 'wx-b' },
  });
  request.mock.calls[0]![0].success({
    statusCode: 200,
    data: { ...original.user, name: '新昵称' },
  });
  await expect(save).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  expect(storedSession()?.user.id).toBe('wx-b');
});
it('does not start a refresh or a second save while a nickname mutation is pending', async () => {
  const session = await store();
  const save = session.profile('新昵称');
  await session.profile();
  await expect(session.profile('另一个名字')).rejects.toThrow('正在保存');
  expect(request).toHaveBeenCalledTimes(1);
  request.mock.calls[0]![0].success({
    statusCode: 200,
    data: { ...original.user, name: '新昵称' },
  });
  await save;
});
