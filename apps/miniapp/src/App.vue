<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useSessionStore } from '@/stores/session';
import { returnToLogin } from '@/services/api';
import { persistSession, storedSession } from '@/services/api';
import { restoreEnvironment } from '@/services/environment';
onLaunch(() => {
  restoreEnvironment();
  persistSession(storedSession());
  const session = useSessionStore();
  uni.$on('session-expired', () => {
    session.clear();
    returnToLogin();
  });
});
</script>
<style lang="scss">
@use './styles/global.scss';
</style>
