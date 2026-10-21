<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { errorMessage } from '@/services/api';
import { demoAvailable, isCurrentContext, requestContext } from '@/services/environment';
import { checkDemoService, enterDemoWorkspace } from '@/services/demo-environment';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
const busy = ref(false),
  error = ref('');
let alive = true;
onUnmounted(() => {
  alive = false;
});
async function enter() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  const context = requestContext();
  try {
    await checkDemoService();
    if (!alive || !isCurrentContext(context)) return;
    enterDemoWorkspace();
    session.refresh();
    uni.reLaunch({ url: '/pages/login/index' });
  } catch (cause) {
    if (alive) error.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view v-if="demoAvailable" class="demo-access">
    <text class="access-title">也想亲自试一试？</text>
    <text class="access-copy"
      >进入原来的演示空间，切换 A–E
      身份继续操作。已归档的活动保持只读，可以使用进行中的活动或新建一场相聚。</text
    >
    <text v-if="error" class="error-text">{{ error }}</text>
    <button
      id="enter-demo-workspace"
      class="btn secondary"
      :disabled="busy"
      :loading="busy"
      @tap="enter"
    >
      {{ busy ? '正在连接演示空间…' : error ? '重试进入演示操作' : '进入演示操作 · 选择身份' }}
    </button>
    <text class="access-note">微信登录会保留，演示中的修改只保存在演示空间。</text>
  </view>
</template>
<style scoped>
.demo-access {
  margin: 28rpx 0;
  padding: 26rpx;
  border-radius: 20rpx;
  border: 1rpx solid #ccd8c2;
  background: #edf0e5;
}
.access-title {
  display: block;
  font-size: 29rpx;
  font-weight: 600;
}
.access-copy {
  display: block;
  font-size: 24rpx;
  color: #738268;
  line-height: 1.9;
  margin: 14rpx 0 22rpx;
}
.access-note {
  display: block;
  font-size: 21rpx;
  color: #8a947f;
  line-height: 1.8;
  margin-top: 16rpx;
}
.error-text {
  display: block;
  color: #9d5946;
  font-size: 24rpx;
  margin-bottom: 18rpx;
}
</style>
