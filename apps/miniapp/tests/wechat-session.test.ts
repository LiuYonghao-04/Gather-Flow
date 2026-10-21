import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ api: vi.fn(), persistSession: vi.fn() }));
vi.mock('../src/services/api', () => ({ ...mocks, storedSession: () => null }));
import { useSessionStore } from '../src/stores/session';
beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});
it('persists the server-issued WeChat session before navigating', async () => {
  const session = {
    mode: 'wechat',
    token: 'a'.repeat(64),
    expiresAt: '2099-01-01',
    user: { id: 'wx-user', name: '微信朋友' },
  };
  mocks.api.mockResolvedValue(session);
  const store = useSessionStore();
  await store.loginWechat('single-use-code');
  expect(mocks.api).toHaveBeenCalledWith('/auth/wechat-login', 'POST', { code: 'single-use-code' });
  expect(store.user?.id).toBe('wx-user');
  expect(mocks.persistSession).toHaveBeenCalledWith(session);
});
it('does not save a session when code exchange fails', async () => {
  mocks.api.mockRejectedValue(new Error('expired code'));
  const store = useSessionStore();
  await expect(store.loginWechat('bad-code')).rejects.toThrow('expired code');
  expect(mocks.persistSession).not.toHaveBeenCalled();
  expect(store.user).toBeNull();
});
