<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { User } from '@gatherflow/shared';
import { api, go, isDemo, showError } from '@/services/api';
import DemoEntry from '@/components/DemoEntry.vue';
import { isCurrentContext, requestContext } from '@/services/environment';
import { useSessionStore } from '@/stores/session';
import { useRemote } from '@/composables/useRemote';
import GfAvatar from '@/components/GfAvatar.vue';
import GfIcon from '@/components/GfIcon.vue';
import GfState from '@/components/GfState.vue';

const session = useSessionStore();
const { data: users, loading, error, reload } = useRemote(() => api<User[]>('/auth/demo-users'));
const busy = ref('');
let returnTo = '/pages/index/index';
onLoad((options) => {
  const raw = options?.returnTo;
  if (raw) {
    try {
      const path = decodeURIComponent(raw);
      if (
        /^\/pages\/(index|activity|invite|members|share|create|audit|collaboration|task|proposal|proposal-edit|evidence|expenses|expense|expense-edit|settlement|archive)\/index(?:\?|$)/.test(
          path,
        )
      )
        returnTo = path;
    } catch {
      /* Keep the safe local default. */
    }
  }
  if (isDemo.value) void reload();
});
async function select(user: User) {
  if (busy.value) return;
  busy.value = user.id;
  try {
    await session.login(user.id);
    uni.reLaunch({ url: returnTo });
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = '';
  }
}
function wechatLogin() {
  if (busy.value) return;
  const context = requestContext();
  // #ifdef MP-WEIXIN
  busy.value = 'wechat';
  uni.login({
    provider: 'weixin',
    timeout: 8000,
    success: async ({ code }) => {
      try {
        if (!isCurrentContext(context)) return;
        if (!code) throw new Error('没有取得微信登录凭证，请重新尝试');
        await session.loginWechat(code);
        uni.reLaunch({ url: returnTo });
      } catch (cause) {
        showError(cause);
      } finally {
        busy.value = '';
      }
    },
    fail: () => {
      busy.value = '';
      showError(new Error('微信登录未完成，请检查网络后重试'));
    },
  });
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '请在微信小程序中登录', icon: 'none' });
  // #endif
}
</script>

<template>
  <view class="page login-page">
    <DemoModeBanner id="environment-banner" />
    <view class="brand-mark"><GfIcon name="leaf" /></view>
    <text class="eyebrow">GATHERFLOW · 相聚有商量</text>
    <view class="header"
      ><text class="title">{{ '一个人发起，\n所有人决定。' }}</text
      ><text class="muted">{{
        '把想见的人聚在一起。\n从一个周末的念头，到大家共同的计划。'
      }}</text></view
    >
    <template v-if="isDemo">
      <view class="section-heading"
        ><text>今天，以谁的身份出发？</text><text class="tag neutral">本地演示</text></view
      >
      <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
      <view v-else class="identity-list">
        <button
          v-for="user in users"
          :key="user.id"
          :id="'demo-user-' + user.id"
          class="identity"
          :disabled="!!busy"
          @tap="select(user)"
        >
          <GfAvatar :user="user" />
          <view class="grow stack identity-copy"
            ><view class="row gap"
              ><text class="identity-name">{{ user.name }}</text
              ><text class="identity-id">{{ user.id }}</text
              ><text v-if="session.user?.id === user.id" class="tag">当前</text></view
            ><text class="muted tagline">{{ user.tagline }}</text></view
          >
          <text v-if="busy === user.id" class="tagline muted">进入中</text
          ><GfIcon v-else name="arrow" />
        </button>
      </view>
      <text class="footer-note">{{
        '五个身份，共享同一份活动记录\n随时切换，体验每个人的视角'
      }}</text>
    </template>
    <template v-else
      ><button
        id="wechat-login"
        class="btn"
        :disabled="!!busy"
        :loading="!!busy"
        @tap="wechatLogin"
      >
        {{ busy ? '正在登录…' : '微信登录' }}</button
      ><text class="helper">登录后查看你参与的活动，一起商量下一次相聚。</text></template
    >
    <button id="login-guide" class="btn text-btn" @tap="go('/pages/guide/index')">
      第一次来？看看新手指南 ›
    </button>
    <DemoEntry id="demo-entry-panel" />
  </view>
</template>

<style scoped>
.login-page {
  padding-top: 64rpx;
}
.brand-mark {
  width: 84rpx;
  height: 84rpx;
  background: #294f40;
  color: #f7f6e9;
  border-radius: 27rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 35rpx;
}
.header {
  margin-top: 30rpx;
  margin-bottom: 54rpx;
}
.header .title {
  font-size: 55rpx;
  line-height: 1.4;
  margin-bottom: 24rpx;
}
.identity-list {
  background: #fffef9;
  border: 1rpx solid #e5e7dd;
  border-radius: 26rpx;
  padding: 0 28rpx;
}
.identity {
  background: transparent;
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 27rpx 0;
  margin: 0;
  text-align: left;
  color: #456043;
  border-bottom: 1rpx solid #eaecdf;
  line-height: 1.5;
}
.identity:last-child {
  border-bottom: 0;
}
.identity-copy {
  gap: 8rpx;
}
.identity-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #293e34;
}
.identity-id {
  font-size: 20rpx;
  color: #9aa18e;
}
.tagline {
  font-size: 23rpx;
}
</style>
