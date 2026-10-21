<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { go } from '@/services/api';
import { dismissGuide, hasSeenGuide } from '@/services/onboarding';
const visible = ref(!hasSeenGuide());
onShow(() => {
  visible.value = !hasSeenGuide();
});
function dismiss() {
  dismissGuide();
  visible.value = false;
}
</script>
<template>
  <view v-if="visible" id="welcome-guide" class="welcome-guide">
    <view class="row between gap"
      ><text class="eyebrow">初次见面</text
      ><button id="dismiss-guide" class="welcome-dismiss" @tap="dismiss">我知道了</button></view
    >
    <text class="welcome-title">第一场相聚，从这里开始。</text>
    <text class="welcome-copy">聚齐朋友，一起商量，再把分工和每笔费用记清楚。</text>
    <button id="open-guide" class="welcome-link" @tap="go('/pages/guide/index')">
      花一分钟，看看怎么用 <text>›</text>
    </button>
  </view>
</template>
<style scoped>
.welcome-guide {
  margin: 0 0 30rpx;
  padding: 24rpx 0 28rpx;
  border-top: 1rpx solid #cfd8c5;
  border-bottom: 1rpx solid #dce1d2;
}
.welcome-title {
  display: block;
  font-size: 31rpx;
  font-weight: 600;
  margin: 14rpx 0 8rpx;
}
.welcome-copy {
  display: block;
  color: #77816f;
  font-size: 25rpx;
  line-height: 1.8;
}
.welcome-dismiss {
  background: none;
  color: #7a8675;
  padding: 8rpx 0 8rpx 16rpx;
  margin: 0;
  font-size: 23rpx;
  line-height: 1.5;
}
.welcome-link {
  background: none;
  color: #35573f;
  font-size: 25rpx;
  font-weight: 600;
  padding: 18rpx 0 0;
  margin: 0;
  display: flex;
  justify-content: space-between;
  line-height: 1.6;
  text-align: left;
}
</style>
