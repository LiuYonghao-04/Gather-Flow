import { ref, shallowRef } from 'vue';
import { errorMessage } from '@/services/api';

export function useRemote<T>(fetcher: () => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const loading = ref(false);
  const error = ref('');
  let generation = 0;
  async function reload() {
    const current = ++generation;
    loading.value = true;
    error.value = '';
    // Never display a previous identity's activity data while switching accounts.
    data.value = null;
    try {
      const result = await fetcher();
      if (generation === current) data.value = result;
    } catch (cause) {
      if (generation === current) error.value = errorMessage(cause);
    } finally {
      if (generation === current) loading.value = false;
    }
  }
  return { data, loading, error, reload };
}
