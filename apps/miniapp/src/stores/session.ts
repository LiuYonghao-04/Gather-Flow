import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@gatherflow/shared';
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
  return { session, user, login, loginWechat, clear, refresh };
});
