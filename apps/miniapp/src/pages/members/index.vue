<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import type { ActivityDetail, JoinApplication } from '@gatherflow/shared';
import { api, formatTime, go, requireSession, showError } from '@/services/api';
import { useRemote } from '@/composables/useRemote';
import GfAvatar from '@/components/GfAvatar.vue';
import GfIcon from '@/components/GfIcon.vue';
import GfState from '@/components/GfState.vue';

const id = ref('');
const busy = ref('');
const { data, loading, error, reload } = useRemote(async () => {
  const activity = await api<ActivityDetail>(`/activities/${id.value}`);
  const applications =
    activity.role === 'OWNER'
      ? await api<JoinApplication[]>(`/activities/${id.value}/applications`)
      : [];
  return { activity, applications };
});
onLoad((options) => {
  id.value = options?.id ?? '';
});
onShow(() => {
  if (requireSession(`/pages/members/index?id=${id.value}`)) void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
function review(application: JoinApplication, decision: 'APPROVED' | 'REJECTED') {
  if (busy.value) return;
  uni.showModal({
    title:
      decision === 'APPROVED'
        ? `欢迎${application.user.name}加入？`
        : `暂不让${application.user.name}加入？`,
    content:
      decision === 'APPROVED'
        ? '同意后，这位朋友可以查看活动内容并参与协作。'
        : '拒绝后，对方仍然可以重新提交申请。',
    confirmText: decision === 'APPROVED' ? '同意加入' : '确认拒绝',
    success: async (result) => {
      if (!result.confirm || busy.value) return;
      busy.value = application.id;
      try {
        await api(`/activities/${id.value}/applications/${application.id}/review`, 'POST', {
          decision,
        });
        uni.showToast({
          title: decision === 'APPROVED' ? '新朋友加入了' : '已处理申请',
          icon: 'success',
        });
        await reload();
      } catch (cause) {
        showError(cause);
      } finally {
        busy.value = '';
      }
    },
  });
}
</script>
<template>
  <view class="page">
    <DemoModeBanner id="environment-banner" />
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <template v-else-if="data">
      <view class="header"
        ><text class="eyebrow">THE PEOPLE MAKE THE PLAN</text><text class="title">同行的朋友</text
        ><text class="muted"
          >{{ data.activity.memberCount }} 个人，{{
            data.activity.memberCount
          }}
          份值得被听见的想法。</text
        ></view
      >
      <view
        v-if="data.activity.status === 'ARCHIVED' || data.activity.financialFrozen"
        class="notice"
        >{{
          data.activity.status === 'ARCHIVED'
            ? '活动已归档，成员与申请记录只读。'
            : '最终清算已冻结，暂停新增成员。'
        }}</view
      >
      <template v-if="data.activity.role === 'OWNER'"
        ><view class="section-heading"
          ><text>想加入的朋友</text
          ><text class="tag pending">{{ data.applications.length }} 人待审核</text></view
        >
        <view v-if="!data.applications.length" class="notice"
          >暂时没有待处理的申请。把邀请分享给朋友吧。</view
        >
        <view
          v-for="application in data.applications"
          :key="application.id"
          class="card application-card"
          ><view class="row gap"
            ><GfAvatar :user="application.user" /><view class="grow"
              ><text class="member-name">{{ application.user.name }}</text
              ><text class="muted timestamp">{{ formatTime(application.createdAt) }}</text></view
            ></view
          ><text class="application-message">{{
            application.message || '想和大家一起参加这次活动。'
          }}</text
          ><view
            v-if="data.activity.status === 'ACTIVE' && !data.activity.financialFrozen"
            class="row review-actions"
            ><button
              class="btn outline compact"
              :disabled="!!busy"
              @tap="review(application, 'REJECTED')"
            >
              暂不接受</button
            ><button
              class="btn compact"
              :disabled="!!busy"
              :loading="busy === application.id"
              @tap="review(application, 'APPROVED')"
            >
              同意加入
            </button></view
          ></view
        >
      </template>
      <view class="section-heading"
        ><text>已经在一起</text
        ><button
          v-if="data.activity.status === 'ACTIVE' && !data.activity.financialFrozen"
          class="btn text-btn"
          @tap="go('/pages/share/index?id=' + id)"
        >
          邀请朋友<GfIcon name="plus" /></button
      ></view>
      <view class="card roster"
        ><view v-for="member in data.activity.members" :key="member.id" class="list-row row gap"
          ><GfAvatar :user="member" /><view class="grow"
            ><view class="row gap"
              ><text class="member-name">{{ member.name }}</text
              ><text v-if="member.role === 'OWNER'" class="tag">房主</text></view
            ><text class="muted tagline">{{ member.tagline }}</text></view
          ></view
        ></view
      >
      <text class="footer-note">房主负责组织，重要的决定属于每一个参与者。</text>
      <button class="btn text-btn" @tap="go('/pages/audit/index?id=' + id)">
        查看邀请与审核记录<GfIcon name="arrow" />
      </button>
    </template>
  </view>
</template>
<style scoped>
.member-name {
  font-size: 30rpx;
  font-weight: 600;
}
.timestamp {
  display: block;
  font-size: 22rpx;
  margin-top: 8rpx;
}
.tagline {
  font-size: 23rpx;
  display: block;
  margin-top: 8rpx;
}
.application-card {
  margin-bottom: 24rpx;
}
.application-message {
  display: block;
  margin: 24rpx 0;
  font-size: 25rpx;
  color: #78866e;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.review-actions {
  gap: 18rpx;
}
.review-actions .btn {
  flex: 1;
}
.roster {
  padding: 0 28rpx;
}
.text-btn .gf-icon {
  transform: scale(0.7);
}
</style>
