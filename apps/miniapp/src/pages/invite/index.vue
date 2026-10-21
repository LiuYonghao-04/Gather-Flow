<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { ref } from 'vue';
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { activityTypeLabels, type InvitePreview, type JoinResult } from '@gatherflow/shared';
import { api, go, goHome, isDemo, loginPath, showError } from '@/services/api';
import { useRemote } from '@/composables/useRemote';
import { useSessionStore } from '@/stores/session';
import GfIcon from '@/components/GfIcon.vue';
import GfState from '@/components/GfState.vue';
import GfAvatar from '@/components/GfAvatar.vue';

const token = ref('');
const busy = ref(false);
const message = ref('');
const session = useSessionStore();
const {
  data: preview,
  loading,
  error,
  reload,
} = useRemote(() => api<InvitePreview>(`/invites/${token.value}`));
onLoad((options) => {
  token.value = options?.token ?? '';
});
onShow(() => {
  session.refresh();
  void reload();
});
onPullDownRefresh(async () => {
  await reload();
  uni.stopPullDownRefresh();
});
function login() {
  go(loginPath(`/pages/invite/index?token=${token.value}`));
}
function enter() {
  if (preview.value)
    uni.redirectTo({ url: `/pages/activity/index?id=${preview.value.activity.id}` });
}
async function accept() {
  if (busy.value || !preview.value) return;
  if (!session.user) {
    login();
    return;
  }
  busy.value = true;
  try {
    if (preview.value.mode === 'DIRECT') {
      const result = await api<JoinResult>(`/invites/${token.value}/join`, 'POST', {});
      if (result.outcome === 'JOINED' || result.outcome === 'ALREADY_MEMBER') {
        enter();
        return;
      }
      uni.showToast({ title: '刚刚有人使用了直邀，现在可申请加入', icon: 'none', duration: 2800 });
    } else {
      await api(`/invites/${token.value}/applications`, 'POST', { message: message.value });
      uni.showToast({ title: '申请已送达', icon: 'success' });
    }
    await reload();
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view class="page">
    <DemoModeBanner id="environment-banner" />
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <template v-else-if="preview">
      <view class="invite-leaf"><GfIcon name="leaf" /></view
      ><text class="eyebrow">A GOOD TIME IS WAITING</text
      ><view class="header"
        ><text class="title">{{ '想和你，\n一起留点回忆。' }}</text></view
      >
      <view class="card"
        ><text class="tag">{{
          preview.activity.type ? activityTypeLabels[preview.activity.type] : '朋友相聚'
        }}</text
        ><text class="event-name">{{ preview.activity.name }}</text
        ><text class="muted invitation-copy">加入后，就能和大家一起安排这次相聚。</text></view
      >
      <template v-if="preview.activity.status === 'ARCHIVED'"
        ><view class="notice state-note">这次活动已经结束，暂不接受新的朋友加入。</view></template
      >
      <template v-else-if="preview.isMember"
        ><view class="notice state-note">你已经在这次活动中了，大家在里面等你。</view
        ><button class="btn" @tap="enter">进入活动</button></template
      >
      <template v-else-if="preview.applicationStatus === 'PENDING' && preview.mode !== 'DIRECT'"
        ><view class="notice state-note"
          ><text class="pending-title">申请已送达，等房主点头。</text
          ><text>审核通过后，就可以加入大家的计划。</text></view
        ><button class="btn secondary" @tap="reload">刷新审核结果</button></template
      >
      <template v-else>
        <view class="notice state-note" :class="{ warm: preview.consumed }"
          ><text class="pending-title">{{
            preview.mode === 'DIRECT'
              ? '这张直邀，还有一个位置。'
              : preview.consumed
                ? '直邀已被使用，仍然欢迎你来。'
                : '这份邀请，需要房主确认。'
          }}</text
          ><text>{{
            preview.mode === 'DIRECT'
              ? '第一位使用这张邀请的朋友可以直接加入。'
              : '提交申请，由房主同意后加入活动。'
          }}</text
          ><text v-if="preview.applicationStatus === 'REJECTED'" class="rejected"
            >上次申请未通过，你可以补充说明后重新申请。</text
          ></view
        >
        <view v-if="preview.mode === 'APPROVAL' && session.user" class="field"
          ><text class="label">和房主打个招呼 <text class="muted">（选填）</text></text
          ><textarea
            v-model="message"
            class="textarea"
            :maxlength="200"
            placeholder="我也想一起去，给我留个位置吧。"
          />
        </view>
        <button class="btn" :disabled="busy" :loading="busy" @tap="accept">
          {{
            !session.user
              ? '先登录，再加入'
              : preview.mode === 'DIRECT'
                ? '接受邀请，加入大家'
                : preview.applicationStatus === 'REJECTED'
                  ? '重新申请加入'
                  : '申请加入活动'
          }}
        </button>
      </template>
      <view v-if="session.user" class="current-identity row gap"
        ><GfAvatar :user="session.user" small /><view class="grow"
          ><text class="identity-label">当前身份</text
          ><text class="identity-name">{{ session.user.name }}</text></view
        ><button v-if="isDemo" class="btn text-btn" @tap="login">切换身份</button></view
      >
      <text class="footer-note">加入前，仅展示有限的活动信息。</text>
      <button class="btn text-btn" @tap="goHome">回到我的活动</button>
    </template>
  </view>
</template>
<style scoped>
.invite-leaf {
  width: 90rpx;
  height: 90rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e6ecdd;
  border-radius: 50%;
  margin: 24rpx 0 30rpx;
  color: #617d51;
}
.event-name {
  display: block;
  font-size: 38rpx;
  font-weight: 600;
  margin: 23rpx 0 16rpx;
  overflow-wrap: anywhere;
}
.invitation-copy {
  font-size: 25rpx;
}
.state-note {
  margin: 28rpx 0;
}
.pending-title {
  display: block;
  font-weight: 600;
  margin-bottom: 10rpx;
}
.rejected {
  display: block;
  margin-top: 14rpx;
}
.current-identity {
  margin-top: 35rpx;
  padding: 24rpx 0;
  border-top: 1rpx solid #dfe5d5;
}
.identity-label {
  display: block;
  font-size: 21rpx;
  color: #8b9980;
}
.identity-name {
  display: block;
  font-size: 27rpx;
}
</style>
