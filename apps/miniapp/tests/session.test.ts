import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  expireSession,
  persistSession,
  returnToLogin,
  storedSession,
} from '../src/services/api';
import { useRemote } from '../src/composables/useRemote';

let value: unknown;
const request = vi.fn();
const emit = vi.fn();
const reLaunch = vi.fn();
const session = (token = 'a'.repeat(64)) => ({
  token,
  mode: 'demo',
  user: { id: 'A' },
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});
beforeEach(() => {
  value = session();
  vi.clearAllMocks();
  vi.stubGlobal('uni', {
    getStorageSync: () => value,
    setStorageSync: (_key: string, data: unknown) => {
      value = data;
    },
    removeStorageSync: () => {
      value = null;
    },
    request,
    $emit: emit,
    reLaunch,
  });
  vi.stubGlobal('getCurrentPages', () => [
    { route: 'pages/activity/index', options: { id: 'test & id' } },
  ]);
});
afterEach(() => vi.unstubAllGlobals());
describe('client session boundaries', () => {
  it.each([
    { expiresAt: 'invalid' },
    { expiresAt: '2000-01-01' },
    { token: 'bad' },
    { mode: 'wechat' },
  ])('rejects invalid cached session %j', (patch) => {
    value = { ...session(), ...patch };
    expect(storedSession()).toBeNull();
  });
  it('expires the current identity and preserves the deep link', () => {
    expireSession('a'.repeat(64));
    expect(value).toBeNull();
    expect(emit).toHaveBeenCalledWith('session-expired');
    returnToLogin();
    expect(reLaunch).toHaveBeenCalledWith({
      url:
        '/pages/login/index?returnTo=' +
        encodeURIComponent('/pages/activity/index?id=test%20%26%20id'),
    });
  });
  it('does not loop on the login page', () => {
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/login/index' }]);
    returnToLogin();
    expect(reLaunch).not.toHaveBeenCalled();
  });
  it('recovers if local expiry passes while a request is pending', () => {
    value = { ...session(), expiresAt: '2000-01-01' };
    expireSession('a'.repeat(64));
    expect(value).toBeNull();
    expect(emit).toHaveBeenCalledWith('session-expired');
  });
  it('redirects an unauthenticated 401 but protects a newly authenticated session', () => {
    value = null;
    expireSession(undefined);
    expect(emit).toHaveBeenCalledTimes(1);
    value = session();
    expireSession(undefined);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(storedSession()).not.toBeNull();
  });
  it('does not erase a newer login when an old request returns 401', async () => {
    const pending = api('/activities');
    value = session('b'.repeat(64));
    request.mock.calls[0]![0].success({
      statusCode: 401,
      data: { error: { code: 'UNAUTHORIZED', message: 'expired' } },
    });
    await expect(pending).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(storedSession()?.token).toBe('b'.repeat(64));
    expect(emit).not.toHaveBeenCalled();
  });
  it('reports a network failure without logging out', async () => {
    const pending = api('/activities');
    request.mock.calls[0]![0].fail();
    await expect(pending).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(storedSession()).not.toBeNull();
    persistSession(null);
    expect(storedSession()).toBeNull();
  });
});
describe('remote view state', () => {
  it('ignores an old identity response arriving after the new one', async () => {
    let resolveOld!: (value: string) => void;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce('new identity');
    const remote = useRemote<string>(fetcher);
    const old = remote.reload();
    const current = remote.reload();
    expect(remote.data.value).toBeNull();
    await current;
    resolveOld('old identity');
    await old;
    expect(remote.data.value).toBe('new identity');
    expect(remote.loading.value).toBe(false);
  });
  it('clears failed state on a successful retry', async () => {
    const remote = useRemote(
      vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('recovered'),
    );
    await remote.reload();
    expect(remote.error.value).toBe('offline');
    expect(remote.loading.value).toBe(false);
    await remote.reload();
    expect(remote.error.value).toBe('');
    expect(remote.data.value).toBe('recovered');
  });
});
