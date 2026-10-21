<script setup lang="ts">
import { go } from '@/services/api';
import { demoAvailable } from '@/services/environment';
import GfIcon from './GfIcon.vue';
</script>
<template>
  <button id="open-demo" class="demo-entry" @tap="go('/pages/demo/index')">
    <view class="demo-mark"><GfIcon name="route" /></view>
    <view class="grow"
      ><text class="demo-title">先看看，朋友们怎样一起出发</text
      ><text class="demo-copy">{{
        demoAvailable ? '五人档案 · 也可切换身份继续操作' : '原来的五人演示 · 行程、分工与 AA 档案'
      }}</text></view
    >
    <GfIcon name="arrow" />
  </button>
</template>
<style scoped>
.demo-entry {
  display: flex;
  align-items: center;
  gap: 20rpx;
  width: 100%;
  padding: 26rpx 0;
  margin: 12rpx 0 0;
  background: none;
  text-align: left;
  line-height: 1.6;
  border-bottom: 1rpx solid #dce1d2;
  color: #54704c;
}
.demo-mark {
  width: 66rpx;
  height: 70rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e7eddf;
  border-radius: 18rpx;
  flex-shrink: 0;
}
.demo-title {
  display: block;
  color: #35523d;
  font-size: 27rpx;
  font-weight: 600;
}
.demo-copy {
  display: block;
  color: #818b79;
  font-size: 22rpx;
  margin-top: 5rpx;
}
.demo-entry > .gf-icon {
  transform: scale(0.7);
}
</style>
