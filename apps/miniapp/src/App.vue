<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useSessionStore } from '@/stores/session';
import { returnToLogin } from '@/services/api';
onLaunch(() => {
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
