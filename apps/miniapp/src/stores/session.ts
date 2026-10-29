import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session, User } from '@gatherflow/shared';
import { api, persistSession, storedSession } from '@/services/api';
import { isCurrentContext, requestContext } from '@/services/environment';

export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(storedSession());
  const user = computed(() => session.value?.user ?? null);
  function refresh() {
    session.value = storedSession();
  }
  async function login(userId: string) {
    const context = requestContext();
    const next = await api<Session>('/auth/demo-login', 'POST', { userId });
    if (!isCurrentContext(context)) throw new Error('已切换空间，请在当前页面重新登录');
    persistSession(next);
    session.value = next;
  }
  async function loginWechat(code: string) {
    const context = requestContext();
    const next = await api<Session>('/auth/wechat-login', 'POST', { code });
    if (!isCurrentContext(context)) throw new Error('已切换空间，请在当前页面重新登录');
    persistSession(next);
    session.value = next;
  }
  function clear() {
    persistSession(null);
    session.value = null;
  }
  let profileGeneration = 0;
  let profileSaving = false;
  async function profile(name?: string): Promise<void> {
    if (profileSaving) {
      if (name === undefined) return;
      throw new Error('昵称正在保存，请稍后重试');
    }
    const generation = ++profileGeneration;
    const context = requestContext();
    const previous = storedSession();
    if (!previous) throw new Error('请先登录');
    if (name !== undefined) profileSaving = true;
    try {
      const nextUser =
        name === undefined
          ? await api<User>('/me')
          : await api<User>('/me/profile', 'POST', { name });
      if (!isCurrentContext(context) || storedSession()?.token !== previous.token)
        throw new Error('登录身份已变化，请在当前身份下重试');
      if (generation !== profileGeneration) return;
      const next = { ...previous, user: nextUser };
      persistSession(next);
      session.value = next;
    } finally {
      if (name !== undefined) profileSaving = false;
    }
  }
  return { session, user, login, loginWechat, clear, refresh, profile };
});
