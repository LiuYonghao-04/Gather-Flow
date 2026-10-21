<script setup lang="ts">
import { canReturnToWechat } from '@/services/environment';
import { returnToWechatWorkspace } from '@/services/demo-environment';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
function leave() {
  returnToWechatWorkspace();
  session.refresh();
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>
<template>
  <view v-if="canReturnToWechat" class="demo-mode-banner"
    ><view class="grow"
      ><text class="banner-title">正在操作演示空间</text
      ><text class="banner-copy">五个演示身份 · 修改仅保存在这里</text></view
    ><button id="exit-demo-workspace" class="banner-exit" @tap="leave">返回微信活动</button></view
  >
</template>
<style scoped>
.demo-mode-banner {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
  margin: 0 0 28rpx;
  border-radius: 16rpx;
  border: 1rpx solid #d4d9bd;
  background: #edeedc;
}
.banner-title {
  display: block;
  font-size: 25rpx;
  color: #5f7047;
  font-weight: 600;
}
.banner-copy {
  display: block;
  font-size: 20rpx;
  color: #8a9275;
  margin-top: 5rpx;
  line-height: 1.7;
}
.banner-exit {
  padding: 12rpx 16rpx;
  margin: 0;
  background: #fafaf0;
  color: #506742;
  font-size: 23rpx;
  border-radius: 12rpx;
  line-height: 1.6;
  flex-shrink: 0;
}
</style>
