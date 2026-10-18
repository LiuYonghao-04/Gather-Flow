<script setup lang="ts">
import type { User } from '@gatherflow/shared';
defineProps<{ user: Pick<User, 'name' | 'color'>; small?: boolean }>();
</script>
<template>
  <view class="avatar" :class="{ small }" :style="{ backgroundColor: user.color }">{{
    user.name.slice(-1)
  }}</view>
</template>
<style scoped>
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 86rpx;
  height: 86rpx;
  border-radius: 31rpx;
  font-size: 32rpx;
  color: #fffdf8;
  font-weight: 500;
}
.small {
  width: 60rpx;
  height: 60rpx;
  border-radius: 23rpx;
  font-size: 24rpx;
}
</style>
