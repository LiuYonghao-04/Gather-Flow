<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { activityTypeLabels, type Activity } from '@gatherflow/shared';
import { api, go, isDemo, requireSession } from '@/services/api';
import { useRemote } from '@/composables/useRemote';
import { useSessionStore } from '@/stores/session';
import GfAvatar from '@/components/GfAvatar.vue';
import GfIcon from '@/components/GfIcon.vue';
import GfNav from '@/components/GfNav.vue';
import GfState from '@/components/GfState.vue';
import WelcomeGuide from '@/components/WelcomeGuide.vue';
import DemoEntry from '@/components/DemoEntry.vue';

const session = useSessionStore();
const {
  data: activities,
  loading,
  error,
  reload,
} = useRemote(() => api<Activity[]>('/activities'));
const filter = ref('all');
const tabs = [
  { id: 'all', name: '进行中' },
  { id: 'owner', name: '我发起' },
  { id: 'member', name: '我加入' },
  { id: 'archive', name: '已归档' },
];
const filtered = computed(() =>
  (activities.value ?? []).filter((activity) => {
    if (filter.value === 'archive') return activity.status === 'ARCHIVED';
    return (
      activity.status === 'ACTIVE' &&
      (filter.value === 'all' || activity.role === (filter.value === 'owner' ? 'OWNER' : 'MEMBER'))
    );
  }),
);
const activeCount = computed(
  () => activities.value?.filter((item) => item.status === 'ACTIVE').length ?? 0,
);
onShow(() => {
  session.refresh();
  if (requireSession('/pages/index/index')) void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
function openInvitation() {
  uni.showModal({
    title: '打开朋友的邀请',
    editable: true,
    placeholderText: '粘贴邀请码或邀请页面路径',
    confirmText: '打开邀请',
    success(result) {
      if (!result.confirm) return;
      const token = result.content?.trim().match(/(?:^|token=)([a-f0-9]{64})(?:$|&)/)?.[1];
      if (token) go(`/pages/invite/index?token=${token}`);
      else uni.showToast({ title: '没有找到有效邀请码', icon: 'none' });
    },
  });
}
</script>

<template>
  <view class="page with-nav">
    <DemoModeBanner id="environment-banner" />
    <view class="row between topbar"
      ><view class="row gap wordmark"
        ><view class="brand-icon"><GfIcon name="leaf" /></view><text>GatherFlow</text></view
      ><button
        v-if="session.user"
        class="profile-button"
        aria-label="打开我的"
        @tap="go('/pages/me/index')"
      >
        <GfAvatar :user="session.user" small /></button
    ></view>
    <view class="greeting"
      ><view class="row gap"
        ><text class="eyebrow">GOOD TIMES, TOGETHER</text
        ><text v-if="isDemo" class="demo-label">DEMO</text></view
      ><text class="title">{{ session.user?.name + '，\n下次相聚，一起安排。' }}</text
      ><text class="muted greeting-note">不必一个人做好所有计划。</text></view
    >
    <WelcomeGuide id="welcome-panel" />
    <view class="hero" @tap="go('/pages/create/index')">
      <view class="hero-copy"
        ><text class="hero-overline">留点时间 · 给朋友</text
        ><text class="hero-title">{{ '把「有空再约」\n变成一起出发。' }}</text
        ><view class="hero-action"><text>发起一场相聚</text><GfIcon name="arrow" /></view
      ></view>
      <view class="landscape" aria-hidden="true"
        ><view class="sun" /><view class="hill hill-back" /><view class="hill hill-front" /><view
          class="trail" /><view class="trail-dot first" /><view class="trail-dot last" /><view
          class="little-tree tree-one" /><view class="little-tree tree-two"
      /></view>
    </view>
    <DemoEntry id="demo-entry-panel" />
    <view class="section-heading"
      ><view class="row gap"
        ><text class="subtitle">我们的活动</text
        ><text class="activity-count">{{ activeCount }}</text></view
      ><button class="invite-link" @tap="openInvitation">打开邀请<GfIcon name="arrow" /></button
    ></view>
    <view class="pill-tabs"
      ><button
        v-for="tab in tabs"
        :key="tab.id"
        class="pill-tab"
        :class="{ active: filter === tab.id }"
        @tap="filter = tab.id"
      >
        {{ tab.name }}
      </button></view
    >
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <GfState
      v-else-if="!filtered.length"
      :title="filter === 'archive' ? '回忆还在路上' : '第一场相聚，从你开始'"
      :description="
        filter === 'archive'
          ? '结束的活动会在这里留下完整记录。'
          : '发起一个活动，或打开朋友的邀请，一起慢慢把计划填满。'
      "
      ><button
        v-if="filter !== 'archive'"
        class="btn secondary compact"
        @tap="go('/pages/create/index')"
      >
        发起活动
      </button></GfState
    >
    <view v-else class="activity-list">
      <view
        v-for="activity in filtered"
        :key="activity.id"
        class="card activity-card"
        @tap="go('/pages/activity/index?id=' + activity.id)"
      >
        <view class="row between"
          ><text class="tag">{{
            activity.type ? activityTypeLabels[activity.type] : '朋友相聚'
          }}</text
          ><text class="role-label">{{
            activity.role === 'OWNER' ? '我发起的' : '我参与的'
          }}</text></view
        >
        <text class="activity-title">{{ activity.name }}</text
        ><text class="activity-description">{{
          activity.description || '计划还没写满，等大家一起商量。'
        }}</text>
        <view class="activity-meta row gap"
          ><GfIcon name="calendar" /><text>时间与地点，等大家商量</text></view
        >
        <view class="card-footer row between"
          ><view class="row gap"
            ><view class="member-symbol"><GfIcon name="people" /></view
            ><text
              >{{ activity.memberCount }} 位朋友{{
                activity.memberCount === 1 ? '，等你来聚齐' : '，一起安排'
              }}</text
            ></view
          ><text v-if="activity.pendingCount" class="tag pending"
            >{{ activity.pendingCount }} 人待审核</text
          ><GfIcon v-else name="arrow"
        /></view>
      </view>
    </view>
    <view class="home-footnote"
      ><view class="footnote-line" /><text>好的计划，装得下每个人的想法。</text
      ><view class="footnote-line"
    /></view>
    <GfNav active="activities" />
  </view>
</template>

<style scoped>
.topbar {
  padding: 0 0 30rpx;
}
.wordmark {
  font-size: 33rpx;
  font-weight: 650;
  letter-spacing: -0.8rpx;
}
.brand-icon {
  color: #38573f;
  transform: scale(0.85);
}
.profile-button {
  padding: 0;
  background: none;
  margin: 0;
  border-radius: 50%;
}
.greeting {
  padding: 26rpx 0 40rpx;
}
.greeting .title {
  margin: 22rpx 0 16rpx;
  line-height: 1.4;
  font-size: 49rpx;
}
.greeting-note {
  font-size: 25rpx;
}
.demo-label {
  font-size: 17rpx;
  letter-spacing: 2rpx;
  color: #819075;
  border: 1rpx solid #cfd8c5;
  padding: 2rpx 8rpx;
  border-radius: 5rpx;
}
.hero {
  position: relative;
  height: 330rpx;
  overflow: hidden;
  border-radius: 28rpx;
  background: #e6ecdf;
}
.hero-copy {
  position: relative;
  padding: 32rpx;
  z-index: 1;
}
.hero-overline {
  font-size: 21rpx;
  color: #687d59;
  letter-spacing: 2rpx;
}
.hero-title {
  display: block;
  font-size: 35rpx;
  line-height: 1.5;
  font-weight: 600;
  margin-top: 18rpx;
}
.hero-action {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 23rpx;
  font-weight: 600;
  margin-top: 25rpx;
  color: #4b6545;
}
.hero-action .gf-icon {
  transform: scale(0.7);
}
.landscape {
  position: absolute;
  right: -10rpx;
  width: 300rpx;
  height: 330rpx;
  top: 0;
  overflow: hidden;
}
.sun {
  width: 78rpx;
  height: 78rpx;
  background: #d7d5b0;
  border-radius: 50%;
  top: 43rpx;
  right: 57rpx;
  position: absolute;
}
.hill {
  position: absolute;
  border-radius: 65% 65% 0 0;
  transform: rotate(-26deg);
}
.hill-back {
  background: #c5d2b9;
  width: 330rpx;
  height: 280rpx;
  right: -95rpx;
  bottom: -57rpx;
}
.hill-front {
  background: #8fa883;
  width: 300rpx;
  height: 220rpx;
  right: -20rpx;
  bottom: -137rpx;
  transform: rotate(25deg);
}
.trail {
  position: absolute;
  width: 150rpx;
  height: 220rpx;
  border: 3rpx dashed #f5f4df;
  border-left: none;
  border-bottom: none;
  border-radius: 0 80% 0 0;
  right: 37rpx;
  bottom: -88rpx;
  transform: rotate(-14deg);
}
.trail-dot {
  width: 12rpx;
  height: 12rpx;
  border: 3rpx solid #5b7553;
  background: #f4f5e4;
  border-radius: 50%;
  position: absolute;
}
.first {
  right: 186rpx;
  bottom: 122rpx;
}
.last {
  right: 62rpx;
  bottom: 3rpx;
}
.little-tree {
  position: absolute;
  width: 22rpx;
  height: 48rpx;
  border-radius: 55% 55% 40% 40%;
  background: #6b8565;
}
.little-tree::after {
  content: '';
  position: absolute;
  height: 25rpx;
  width: 3rpx;
  background: #526f4e;
  left: 10rpx;
  bottom: -16rpx;
}
.tree-one {
  right: 82rpx;
  bottom: 130rpx;
}
.tree-two {
  right: 117rpx;
  bottom: 115rpx;
  transform: scale(0.8);
}
.activity-count {
  background: #e7ebdf;
  font-size: 22rpx;
  padding: 1rpx 13rpx;
  border-radius: 14rpx;
  color: #607558;
}
.invite-link {
  display: flex;
  align-items: center;
  background: none;
  color: #7f8977;
  margin: 0 -14rpx 0 0;
  font-size: 23rpx;
  line-height: 1.5;
  padding: 8rpx;
}
.invite-link .gf-icon {
  transform: scale(0.65);
}
.pill-tabs {
  margin-top: 0;
}
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.activity-card {
  padding: 29rpx;
}
.role-label {
  font-size: 22rpx;
  color: #929988;
}
.activity-title {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  margin: 24rpx 0 14rpx;
  overflow-wrap: anywhere;
}
.activity-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 24rpx;
  color: #87907e;
  line-height: 1.8;
}
.activity-meta {
  font-size: 23rpx;
  color: #7b8673;
  padding: 28rpx 0;
}
.activity-meta .gf-icon {
  transform: scale(0.7);
  width: 30rpx;
}
.card-footer {
  border-top: 1rpx solid #e8ebdf;
  padding-top: 23rpx;
  color: #697c5f;
  font-size: 23rpx;
}
.member-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 45rpx;
  height: 45rpx;
  border-radius: 50%;
  background: #edf0e5;
}
.member-symbol .gf-icon {
  transform: scale(0.6);
}
.home-footnote {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  margin: 44rpx 0 12rpx;
  color: #98a08e;
  font-size: 20rpx;
}
.footnote-line {
  width: 26rpx;
  height: 1rpx;
  background: #d4dac9;
}
</style>
