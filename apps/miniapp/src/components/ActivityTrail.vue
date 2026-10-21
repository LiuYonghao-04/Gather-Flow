<script setup lang="ts">
import { go, isDemo, loginPath, storedSession } from '@/services/api';
import DemoModeBanner from './DemoModeBanner.vue';
defineProps<{ activityId: string; returnTo: string }>();
</script>
<template>
  <DemoModeBanner />
  <view class="trail row between gap"
    ><button class="btn text-btn" @tap="go('/pages/activity/index?id=' + activityId)">
      ‹ 活动空间</button
    ><button v-if="isDemo" class="btn text-btn" @tap="go(loginPath(returnTo))">
      {{ storedSession()?.user.name }} · 切换
    </button></view
  >
</template>
<style scoped>
.trail {
  margin: -15rpx -14rpx 26rpx;
}
.trail .btn {
  font-size: 23rpx;
  max-width: 65%;
  white-space: nowrap;
}
</style>
