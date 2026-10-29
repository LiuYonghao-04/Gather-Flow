import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { activityDraftSchema } from '../src/services/form-drafts';

const storage = new Map<string, unknown>();
const setStorage = vi.fn((key: string, value: unknown) => {
  storage.set(key, value);
});
const user = (id = 'wx-a', mode = 'wechat', token = 'a'.repeat(64)) => ({
  mode,
  token,
  user: { id, name: '测试成员', color: '#52745e', tagline: '' },
  expiresAt: '2099-01-01',
});
const initial = { name: '', description: '', type: null };
const filled = { ...initial, name: '没有填完的活动', description: '还在商量' };
beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.clearAllMocks();
  vi.stubEnv('VITE_APP_MODE', 'wechat');
  vi.stubEnv('VITE_API_BASE_URL', 'http://test:3003');
  vi.stubEnv('VITE_DEMO_API_BASE_URL', 'http://test:3001');
  storage.set('gatherflow.session', user());
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key) ?? '',
    setStorageSync: setStorage,
    removeStorageSync: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const modules = async () => ({
  drafts: await import('../src/services/drafts'),
  api: await import('../src/services/api'),
  env: await import('../src/services/environment'),
});
it('restores unfinished raw input and the same request key after reopening, without storing credentials', async () => {
  const {
    drafts: { DraftStore },
  } = await modules();
  const first = new DraftStore('activity:create', 'new', activityDraftSchema);
  first.save(filled);
  const key = first.submissionKey({ name: filled.name, description: filled.description }, filled);
  const reopened = new DraftStore('activity:create', 'new', activityDraftSchema);
  expect(reopened.load()).toEqual({ state: 'restored', data: filled });
  expect(
    reopened.submissionKey({ description: filled.description, name: filled.name }, filled),
  ).toBe(key);
  const values = [...storage.entries()]
    .filter(([key]) => key.startsWith('gatherflow.draft.'))
    .map(([, v]) => v);
  expect(JSON.stringify(values)).not.toContain('"token"');
  expect(JSON.stringify(values)).not.toContain('"openid"');
  expect(
    reopened.submissionKey({ name: '另一份内容' }, { ...filled, name: '另一份内容' }),
  ).not.toBe(key);
});
it('separates activities, users and spaces, and blocks stale saves and clears', async () => {
  const {
    drafts: { DraftStore },
    api,
    env,
  } = await modules();
  const a = new DraftStore('proposal:activity-a:new', 'new', activityDraftSchema);
  a.save(filled);
  expect(new DraftStore('proposal:activity-b:new', 'new', activityDraftSchema).load().state).toBe(
    '',
  );
  api.persistSession(user('wx-b') as never);
  expect(new DraftStore('proposal:activity-a:new', 'new', activityDraftSchema).load().state).toBe(
    '',
  );
  expect(() => a.save(initial)).toThrow('身份已变化');
  expect(a.clear()).toBe(false);
  env.changeEnvironment('demo');
  api.persistSession(user('A', 'demo') as never);
  expect(new DraftStore('proposal:activity-a:new', 'new', activityDraftSchema).load().state).toBe(
    '',
  );
  env.changeEnvironment('wechat');
  api.persistSession(user() as never);
  expect(new DraftStore('proposal:activity-a:new', 'new', activityDraftSchema).load().data).toEqual(
    filled,
  );
});
it('does not restore an edit from an old server revision onto a new revision', async () => {
  const {
    drafts: { DraftStore },
  } = await modules();
  const old = new DraftStore('expense:one', '1', activityDraftSchema);
  old.save(filled);
  const current = new DraftStore('expense:one', '2', activityDraftSchema);
  expect(current.load()).toEqual({ state: 'outdated' });
  current.save({ ...initial, name: '根据新版编辑' });
  expect(new DraftStore('expense:one', '2', activityDraftSchema).load().data?.name).toBe(
    '根据新版编辑',
  );
});
it('does not send a mutation if its recovery key cannot be persisted', async () => {
  const {
    drafts: { DraftStore },
  } = await modules();
  const draft = new DraftStore('activity:create', 'new', activityDraftSchema);
  setStorage.mockImplementationOnce(() => {
    throw new Error('quota');
  });
  expect(() => draft.submissionKey({ name: '新活动' }, filled)).toThrow('本次尚未提交');
});
it('ignores malformed local records rather than injecting them into a form', async () => {
  const {
    drafts: { DraftStore },
  } = await modules();
  const draft = new DraftStore('activity:create', 'new', activityDraftSchema);
  draft.save(filled);
  const key = [...storage.keys()].find((k) => k.startsWith('gatherflow.draft.'))!;
  storage.set(key, { format: 1, baseline: 'new', data: { name: 42 }, updatedAt: 0 });
  expect(new DraftStore('activity:create', 'new', activityDraftSchema).load()).toEqual({
    state: '',
  });
});
it('does not erase restored inputs during initialization or recreate a draft after successful submission', async () => {
  const {
    drafts: { DraftStore },
  } = await modules();
  const draft = new DraftStore('activity:create', 'new', activityDraftSchema);
  draft.save(filled);
  const { effectScope, reactive } = await import('vue');
  const { useFormDraft } = await import('../src/composables/useFormDraft');
  const scope = effectScope();
  try {
    const state = reactive({ ...initial });
    const binding = scope.run(() =>
      useFormDraft(
        activityDraftSchema,
        () => ({ ...state }),
        (value) => Object.assign(state, value),
      ),
    )!;
    binding.open('activity:create', 'new', initial);
    expect(state.name).toBe(filled.name);
    state.description = '继续填写';
    expect(
      new DraftStore('activity:create', 'new', activityDraftSchema).load().data?.description,
    ).toBe('继续填写');
    binding.discard();
    expect(state).toEqual(initial);
    state.name = '重新填写';
    binding.clear();
    state.name = '跳转时的更新';
    expect(new DraftStore('activity:create', 'new', activityDraftSchema).load().state).toBe('');
  } finally {
    scope.stop();
  }
});
