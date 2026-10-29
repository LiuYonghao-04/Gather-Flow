import { ref, watch } from 'vue';
import type { ZodType } from 'zod';
import { canonicalJson } from '@gatherflow/shared';
import { DraftStore, type DraftState } from '@/services/drafts';

export function useFormDraft<T>(schema: ZodType<T>, read: () => T, apply: (data: T) => void) {
  const status = ref<DraftState>('');
  let store: DraftStore<T> | undefined;
  let defaults: T;
  let restoring = false;
  let lastValue = '';
  const copy = (data: T): T => JSON.parse(JSON.stringify(data)) as T;
  function open(resource: string, baseline: string, initial: T) {
    defaults = copy(initial);
    store = new DraftStore(resource, baseline, schema);
    restoring = true;
    try {
      apply(copy(defaults));
      const saved = store.load();
      if (saved.data !== undefined) apply(copy(saved.data));
      status.value = saved.state;
    } catch {
      status.value = 'error';
    } finally {
      lastValue = canonicalJson(read());
      restoring = false;
    }
  }
  watch(
    read,
    () => {
      if (restoring || !store) return;
      const value = canonicalJson(read());
      if (value === lastValue) return;
      try {
        store.save(read());
        lastValue = value;
        status.value = 'saved';
      } catch {
        status.value = 'error';
      }
    },
    { deep: true, flush: 'sync' },
  );
  function submissionKey(input: unknown) {
    if (!store) throw new Error('编辑页尚未准备好，请稍后重试');
    return store.submissionKey(input, read());
  }
  function clear() {
    const removed = store?.clear() ?? true;
    store = undefined;
    status.value = removed ? '' : 'error';
  }
  function discard() {
    if (!store?.clear()) {
      status.value = 'error';
      return;
    }
    restoring = true;
    try {
      apply(copy(defaults));
      status.value = '';
    } finally {
      lastValue = canonicalJson(read());
      restoring = false;
    }
  }
  return { status, open, submissionKey, clear, discard };
}
