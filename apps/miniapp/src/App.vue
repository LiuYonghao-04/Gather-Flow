<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { useSessionStore } from '@/stores/session';
onLaunch(() => {
  const session = useSessionStore();
  uni.$on('session-expired', session.clear);
});
</script>
<style lang="scss">
@use './styles/global.scss';
</style>
