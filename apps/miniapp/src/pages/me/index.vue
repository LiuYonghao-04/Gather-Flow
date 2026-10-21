<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { onShow } from '@dcloudio/uni-app';
import { go, isDemo, loginPath } from '@/services/api';
import { useSessionStore } from '@/stores/session';
import GfAvatar from '@/components/GfAvatar.vue';
import GfIcon from '@/components/GfIcon.vue';
import GfNav from '@/components/GfNav.vue';
import DemoEntry from '@/components/DemoEntry.vue';
const session = useSessionStore();
onShow(() => session.refresh());
</script>
<template>
  <view class="page with-nav">
    <DemoModeBanner id="environment-banner" />
    <view class="header"
      ><text class="eyebrow">一场相聚，慢慢学会一起安排</text
      ><text class="title me-title">我的</text></view
    >
    <view v-if="session.user" class="profile-card"
      ><GfAvatar :user="session.user" /><view class="grow"
        ><text class="profile-name">{{ session.user.name }}</text
        ><text class="helper">{{ isDemo ? '本地演示身份' : '微信身份' }}</text></view
      ></view
    >
    <view v-else class="notice">登录后，查看你发起和参与的相聚。</view>
    <button id="me-identity" class="identity-action" @tap="go(loginPath())">
      {{ session.user ? (isDemo ? '切换演示身份' : '重新微信登录') : '前往登录'
      }}<GfIcon name="arrow" />
    </button>
    <view class="section-heading"><text>从这里，再熟悉一点</text></view>
    <button id="me-guide" class="help-row" @tap="go('/pages/guide/index')">
      <view class="help-mark"><GfIcon name="leaf" /></view
      ><view class="grow"
        ><text class="help-title">新手指南</text
        ><text class="helper">邀请、协商、分工与对账，四步了解</text></view
      ><GfIcon name="arrow" />
    </button>
    <DemoEntry id="demo-entry-panel" />
    <text class="footer-note">一个人发起，所有人决定。需要的时候，随时回来看看。</text>
    <GfNav active="me" />
  </view>
</template>
<style scoped>
.me-title {
  margin-top: 24rpx;
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 30rpx;
  border-radius: 24rpx;
  background: #e8ede1;
}
.profile-name {
  display: block;
  font-size: 33rpx;
  font-weight: 600;
}
.identity-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  margin: 0;
  color: #6e8163;
  background: none;
  font-size: 25rpx;
}
.identity-action .gf-icon {
  transform: scale(0.65);
}
.help-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
  margin: 0;
  width: 100%;
  color: #59754f;
  background: none;
  border-bottom: 1rpx solid #dce1d2;
  text-align: left;
  line-height: 1.6;
}
.help-mark {
  width: 66rpx;
  height: 70rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 18rpx;
  background: #e7eddf;
  flex-shrink: 0;
}
.help-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #35523d;
}
.help-row .helper {
  margin: 4rpx 0 0;
  font-size: 22rpx;
}
.help-row > .gf-icon {
  transform: scale(0.7);
}
</style>
