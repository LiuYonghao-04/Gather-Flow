<script setup lang="ts">
import GfIcon from './GfIcon.vue';
defineProps<{ loading?: boolean; error?: string; title?: string; description?: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <view v-if="loading" class="skeleton" aria-label="加载中"
    ><view class="skeleton-line short" /><view class="skeleton-block" /><view
      class="skeleton-line" /><view class="skeleton-line short"
  /></view>
  <view v-else class="empty-state">
    <view class="empty-icon"><GfIcon :name="error ? 'route' : 'leaf'" /></view>
    <text class="empty-title">{{ error ? '暂时无法打开' : title }}</text>
    <text class="muted empty-description">{{ error || description }}</text>
    <button v-if="error" class="btn secondary compact" @tap="$emit('retry')">再试一次</button>
    <slot v-else />
  </view>
</template>
<style scoped>
.empty-state {
  padding: 64rpx 34rpx;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 20rpx;
  text-align: center;
}
.empty-icon {
  padding: 22rpx;
  background: #e8ede6;
  color: #496451;
  border-radius: 50%;
}
.empty-title {
  font-size: 32rpx;
  font-weight: 600;
}
.empty-description {
  line-height: 1.8;
  font-size: 26rpx;
  max-width: 500rpx;
}
.skeleton {
  padding: 20rpx 0;
}
.skeleton-line,
.skeleton-block {
  background: #e6e7df;
  border-radius: 16rpx;
  height: 30rpx;
  margin-bottom: 24rpx;
  animation: breathe 1.5s ease-in-out infinite alternate;
}
.short {
  width: 60%;
}
.skeleton-block {
  height: 260rpx;
}
@keyframes breathe {
  to {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-line,
  .skeleton-block {
    animation: none;
  }
}
</style>
