<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import {
  activityTypeLabels,
  formatMoney,
  type ActivityDetail,
  type Workspace,
  type FinanceWorkspace,
} from '@gatherflow/shared';
import { api, go, goHome, isDemo, loginPath, requireSession } from '@/services/api';
import { useRemote } from '@/composables/useRemote';
import { useSessionStore } from '@/stores/session';
import GfIcon from '@/components/GfIcon.vue';
import GfAvatar from '@/components/GfAvatar.vue';
import GfState from '@/components/GfState.vue';

const id = ref('');
const session = useSessionStore();
const {
  data: activity,
  loading,
  error,
  reload,
} = useRemote(async () => {
  const [activity, workspace, finance] = await Promise.all([
    api<ActivityDetail>(`/activities/${id.value}`),
    api<Workspace>(`/activities/${id.value}/workspace`),
    api<FinanceWorkspace>(`/activities/${id.value}/finance`),
  ]);
  return { ...activity, workspace, finance };
});
onLoad((options) => {
  id.value = options?.id ?? '';
});
onShow(() => {
  session.refresh();
  if (requireSession(`/pages/activity/index?id=${id.value}`)) void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
</script>
<template>
  <view class="page">
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <button v-if="error" class="btn secondary" @tap="goHome">回到我的活动</button>
    <template v-else-if="activity">
      <view class="row between"
        ><text class="tag">{{
          activity.type ? activityTypeLabels[activity.type] : '朋友相聚'
        }}</text
        ><text class="muted role">{{
          activity.status === 'ARCHIVED'
            ? '已归档 · 只读'
            : activity.role === 'OWNER'
              ? '我是房主'
              : '我在其中'
        }}</text></view
      >
      <view class="header activity-header"
        ><text class="title">{{ activity.name }}</text
        ><text class="muted">{{ activity.description || '这次相聚，由我们一起安排。' }}</text></view
      >
      <view class="card plan-summary"
        ><view class="row gap"
          ><view class="calendar-icon"><GfIcon name="calendar" /></view
          ><view class="grow"
            ><text class="summary-title">{{
              activity.workspace.plan.items.length
                ? activity.workspace.plan.items.length + ' 项安排，已经一起确定'
                : '时间与地点，等大家商量'
            }}</text
            ><text class="summary-description">{{
              activity.workspace.plan.conflicts.length
                ? activity.workspace.plan.conflicts.length + ' 处时间安排需要核对'
                : '不必急着定下来，每个人的想法都算数。'
            }}</text></view
          ></view
        ><view class="divider" /><view class="row between"
          ><view class="row avatar-stack"
            ><GfAvatar
              v-for="member in activity.members.slice(0, 5)"
              :key="member.id"
              :user="member"
              small
            /><text class="member-count">{{ activity.memberCount }} 人同行</text></view
          ><button
            v-if="activity.status === 'ACTIVE' && !activity.finance.frozen"
            class="btn text-btn"
            @tap="go('/pages/share/index?id=' + id)"
          >
            邀请朋友<GfIcon name="plus" /></button></view
      ></view>
      <button
        v-if="activity.pendingCount"
        class="review-banner"
        @tap="go('/pages/members/index?id=' + id)"
      >
        <view class="row gap"
          ><view class="status-dot" /><text
            >{{ activity.pendingCount }} 位朋友想加入这次相聚</text
          ></view
        ><GfIcon name="arrow" />
      </button>
      <view class="section-heading"
        ><text>一起把计划填满</text><text class="muted small-text">每个人都可以参与</text></view
      >
      <view class="module-grid">
        <button class="module available" @tap="go('/pages/collaboration/index?id=' + id)">
          <GfIcon name="chat" /><text class="module-title">一起商量</text
          ><text class="module-copy">把想法变成共同决定</text
          ><text class="module-status"
            >{{
              activity.workspace.proposals.filter((p) => p.status !== 'CONFIRMED').length
            }}
            个方案协商中 ›</text
          >
        </button>
        <button
          class="module available"
          @tap="go('/pages/collaboration/index?id=' + id + '&tab=tasks')"
        >
          <GfIcon name="route" /><text class="module-title">分工与行程</text
          ><text class="module-copy">每个人负责一点点</text
          ><text class="module-status"
            >{{ activity.workspace.tasks.filter((t) => t.completed).length }} /
            {{ activity.workspace.tasks.length }} 项工作已完成 ›</text
          >
        </button>
        <button class="module available" @tap="go('/pages/expenses/index?id=' + id)">
          <GfIcon name="wallet" /><text class="module-title">费用与 AA</text
          ><text class="module-copy">每一笔都明明白白</text
          ><text class="module-status"
            >已确认 ¥ {{ formatMoney(activity.finance.estimate.confirmedTotalCents) }} ›</text
          >
        </button>
        <button class="module available" @tap="go('/pages/members/index?id=' + id)">
          <GfIcon name="people" /><text class="module-title">同行的朋友</text
          ><text class="module-copy"
            >{{ activity.memberCount }} 位朋友，{{
              activity.pendingCount ? activity.pendingCount + ' 人待审核' : '等待新的故事'
            }}</text
          ><view class="row module-status"><text>查看成员</text><GfIcon name="arrow" /></view>
        </button>
      </view>
      <button
        class="btn secondary space-top"
        @tap="go('/pages/collaboration/index?id=' + id + '&tab=plan')"
      >
        查看共同确认的总行程 ›
      </button>
      <button
        v-if="activity.finance.estimate.pendingCount || activity.finance.estimate.disputedCount"
        class="btn outline compact space-top"
        @tap="go('/pages/expenses/index?id=' + id)"
      >
        费用待处理：{{ activity.finance.estimate.pendingCount }} 笔待确认 ·
        {{ activity.finance.estimate.disputedCount }} 笔有异议
      </button>
      <button
        class="btn space-top"
        @tap="
          go(
            '/pages/' +
              (activity.status === 'ARCHIVED' ? 'archive' : 'settlement') +
              '/index?id=' +
              id,
          )
        "
      >
        {{
          activity.status === 'ARCHIVED'
            ? '查看相聚档案'
            : activity.finance.frozen
              ? '查看最终清算与到账'
              : '最终清算与结束活动'
        }}
      </button>
      <view class="agreement"
        ><GfIcon name="leaf" /><view
          ><text class="agreement-title">我们的小约定</text
          ><text class="agreement-copy"
            >一个人发起，所有人决定。房主帮忙组织，重要的方案由实际参与的人共同确认。</text
          ></view
        ></view
      >
      <button class="history-link row between" @tap="go('/pages/audit/index?id=' + id)">
        <text>活动足迹</text
        ><view class="row"><text class="muted">每一步，都有记录</text><GfIcon name="arrow" /></view>
      </button>
      <button
        v-if="isDemo"
        class="btn outline compact switch-button"
        @tap="go(loginPath('/pages/activity/index?id=' + id))"
      >
        当前：{{ session.user?.name }} · 切换演示身份
      </button>
      <button class="btn text-btn" @tap="goHome">回到所有活动</button>
    </template>
  </view>
</template>
<style scoped>
.role {
  font-size: 23rpx;
}
.activity-header {
  margin: 24rpx 0 36rpx;
}
.activity-header .title {
  overflow-wrap: anywhere;
}
.plan-summary {
  padding: 28rpx;
}
.calendar-icon {
  padding: 18rpx;
  background: #eef1e7;
  color: #6b815f;
  border-radius: 18rpx;
}
.summary-title {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
}
.summary-description {
  display: block;
  font-size: 22rpx;
  color: #8b9580;
  margin-top: 8rpx;
}
.avatar-stack .avatar {
  margin-right: -14rpx;
  border: 3rpx solid #fffef9;
}
.member-count {
  font-size: 22rpx;
  margin-left: 27rpx;
  color: #7b8770;
}
.text-btn .gf-icon {
  transform: scale(0.7);
}
.review-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  line-height: 1.5;
  border-radius: 18rpx;
  padding: 20rpx 24rpx;
  background: #e7ecdc;
  color: #526746;
  margin-top: 24rpx;
}
.small-text {
  font-size: 21rpx;
}
.module-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22rpx;
}
.module {
  text-align: left;
  background: #eeefe7;
  border: 1rpx solid #e0e5d8;
  border-radius: 25rpx;
  padding: 30rpx 25rpx;
  width: 100%;
  color: #7d8a72;
  line-height: 1.5;
}
.module.available {
  background: #e6ecdf;
  color: #476540;
  border-color: #d6e0cb;
}
.module-title {
  display: block;
  margin-top: 26rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #3e533b;
}
.module-copy {
  display: block;
  font-size: 21rpx;
  margin-top: 10rpx;
}
.module-status {
  display: block;
  font-size: 20rpx;
  color: #8d9780;
  margin-top: 20rpx;
}
.available .module-status {
  display: flex;
  color: #48693c;
  justify-content: space-between;
}
.module-status .gf-icon {
  transform: scale(0.65);
  height: 27rpx;
}
.agreement {
  display: flex;
  gap: 24rpx;
  padding: 38rpx 10rpx;
  color: #849375;
}
.agreement-title {
  display: block;
  font-size: 25rpx;
  font-weight: 600;
  color: #657958;
  margin-bottom: 10rpx;
}
.agreement-copy {
  font-size: 23rpx;
  line-height: 1.9;
}
.history-link {
  width: 100%;
  padding: 28rpx 0;
  background: transparent;
  border-top: 1rpx solid #dfe4d6;
  border-bottom: 1rpx solid #dfe4d6;
  font-size: 26rpx;
  color: #4e6245;
}
.history-link .muted {
  font-size: 23rpx;
}
.history-link .gf-icon {
  transform: scale(0.7);
}
.switch-button {
  margin-top: 35rpx;
}
</style>
