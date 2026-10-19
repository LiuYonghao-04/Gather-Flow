import { ref } from 'vue';
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { useRemote } from './useRemote';
import { requireSession, storedSession, showError } from '@/services/api';

export function useActivityPage<T>(
  page: string,
  fetcher: (id: string, options: Record<string, string>) => Promise<T>,
  refreshOnShow = true,
) {
  const id = ref('');
  const options = ref<Record<string, string>>({});
  const userId = ref('');
  const busy = ref(false);
  const remote = useRemote(() => {
    const resourceKey: Record<string, string> = {
      task: 'taskId',
      proposal: 'proposalId',
      expense: 'expenseId',
    };
    const key = resourceKey[page];
    if (!id.value || (key && !options.value[key]))
      throw new Error('页面链接不完整，请从活动空间重新进入');
    return fetcher(id.value, options.value);
  });
  let loadedUser = '';
  onLoad((query) => {
    options.value = Object.fromEntries(
      Object.entries(query ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    id.value = options.value.id ?? '';
  });
  onShow(() => {
    const target =
      `/pages/${page}/index?` +
      Object.entries(options.value)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    if (!requireSession(target)) return;
    userId.value = storedSession()?.user.id ?? '';
    if (refreshOnShow || loadedUser !== userId.value || !remote.data.value) {
      loadedUser = userId.value;
      void remote.reload();
    }
  });
  onPullDownRefresh(async () => {
    await remote.reload();
    uni.stopPullDownRefresh();
  });
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    try {
      await action();
    } catch (cause) {
      showError(cause);
    } finally {
      busy.value = false;
    }
  }
  return { id, options, userId, busy, run, ...remote };
}
