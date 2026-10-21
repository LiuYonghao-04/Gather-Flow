<script setup lang="ts">
import { go } from '@/services/api';
import GfIcon from './GfIcon.vue';
defineProps<{ active: 'activities' | 'me' }>();
function home() {
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>
<template>
  <view class="bottom-nav">
    <button class="nav-item" :class="{ selected: active === 'activities' }" @tap="home">
      <GfIcon name="route" /><text>一起出发</text>
    </button>
    <button class="new-activity" aria-label="发起新活动" @tap="go('/pages/create/index')">
      <GfIcon name="plus" />
    </button>
    <button
      id="nav-me"
      class="nav-item"
      :class="{ selected: active === 'me' }"
      @tap="go('/pages/me/index')"
    >
      <GfIcon name="people" /><text>我的</text>
    </button>
  </view>
</template>
<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #fffef9;
  border-top: 1rpx solid #e7e8df;
  padding: 16rpx 34rpx calc(16rpx + env(safe-area-inset-bottom));
}
.nav-item {
  background: none;
  color: #92998d;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  font-size: 21rpx;
  padding: 6rpx 40rpx;
  margin: 0;
}
.selected {
  color: #294f40;
}
.new-activity {
  border-radius: 28rpx;
  background: #294f40;
  color: #fffdf5;
  width: 92rpx;
  height: 82rpx;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (min-width: 600px) {
  .bottom-nav {
    max-width: 600px;
    margin: auto;
  }
}
</style>
