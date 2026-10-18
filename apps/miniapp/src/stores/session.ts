import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Session } from '@gatherflow/shared';
import { api, persistSession, storedSession } from '@/services/api';

export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(storedSession());
  const user = computed(() => session.value?.user ?? null);
  function refresh() {
    session.value = storedSession();
  }
  async function login(userId: string) {
    const next = await api<Session>('/auth/demo-login', 'POST', { userId });
    persistSession(next);
    session.value = next;
  }
  function clear() {
    persistSession(null);
    session.value = null;
  }
  return { session, user, login, clear, refresh };
});
