<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { ActivityDetail, AuditEvent } from '@gatherflow/shared';
import { api, formatTime, requireSession, showError } from '@/services/api';
import { useRemote } from '@/composables/useRemote';
import GfState from '@/components/GfState.vue';
import GfAvatar from '@/components/GfAvatar.vue';

const id = ref('');
const more = ref<AuditEvent[]>([]);
const hasMore = ref(false);
const busy = ref(false);
const { data, loading, error, reload } = useRemote(async () => {
  const [activity, events] = await Promise.all([
    api<ActivityDetail>(`/activities/${id.value}`),
    api<AuditEvent[]>(`/activities/${id.value}/audit`),
  ]);
  more.value = [];
  hasMore.value = events.length === 50;
  return { activity, events };
});
onLoad((options) => {
  id.value = options?.id ?? '';
});
onShow(() => {
  if (requireSession(`/pages/audit/index?id=${id.value}`)) void reload();
});
const labels: Record<string, string> = {
  ACTIVITY_CREATED: '发起了这次相聚',
  INVITE_CREATED: '准备了一份邀请',
  MEMBER_JOINED_DIRECT: '通过房主直邀加入',
  JOIN_REQUESTED: '申请加入活动',
  APPLICATION_APPROVED: '同意了一位朋友加入',
  APPLICATION_REJECTED: '暂未接受一份申请',
};
function describe(event: AuditEvent): string {
  if (event.action === 'INVITE_CREATED')
    return event.after?.kind === 'DIRECT' ? '房主直邀 · 一次免审核加入' : '成员邀请 · 需房主审核';
  if (event.action.startsWith('APPLICATION_')) {
    const target = data.value?.activity.members.find((member) => member.id === event.targetId);
    return `${target?.name ?? '申请人 ' + event.targetId} · 待审核 → ${event.action === 'APPLICATION_APPROVED' ? '已同意' : '未通过'}`;
  }
  if (event.action === 'MEMBER_JOINED_DIRECT') return '免审核权益已使用，该邀请后续需申请';
  return '记录已保存，所有活动成员可查';
}
async function loadMore() {
  if (!data.value || busy.value) return;
  busy.value = true;
  try {
    const next = await api<AuditEvent[]>(
      `/activities/${id.value}/audit?offset=${data.value.events.length + more.value.length}`,
    );
    more.value.push(...next);
    hasMore.value = next.length === 50;
  } catch (cause) {
    showError(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view class="page">
    <view class="header"
      ><text class="eyebrow">EVERY LITTLE STEP</text><text class="title">相聚的足迹</text
      ><text class="muted">谁在什么时候做了什么，大家都能看见。</text></view
    >
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <view v-else-if="data" class="timeline"
      ><view v-for="event in [...data.events, ...more]" :key="event.id" class="event row gap"
        ><view class="event-avatar"><GfAvatar :user="event.actor" small /></view
        ><view class="grow"
          ><text class="event-time">{{ formatTime(event.createdAt) }}</text
          ><text class="event-title"
            >{{ event.actor.name }} · {{ labels[event.action] ?? event.action }}</text
          ><text class="event-detail">{{ describe(event) }}</text></view
        ></view
      ></view
    >
    <button
      v-if="hasMore"
      class="btn secondary compact"
      :loading="busy"
      :disabled="busy"
      @tap="loadMore"
    >
      更早的足迹
    </button>
    <text v-else-if="data" class="footer-note">故事从这里开始。</text>
  </view>
</template>
<style scoped>
.timeline {
  padding-top: 12rpx;
}
.event {
  align-items: flex-start;
  padding-bottom: 46rpx;
  position: relative;
}
.event::before {
  content: '';
  position: absolute;
  top: 48rpx;
  bottom: 0;
  width: 1rpx;
  background: #dce3d2;
  left: 29rpx;
}
.event:last-child::before {
  display: none;
}
.event-avatar {
  position: relative;
  padding-top: 3rpx;
}
.event-time {
  display: block;
  font-size: 21rpx;
  color: #95a088;
  margin-bottom: 12rpx;
}
.event-title {
  display: block;
  font-size: 27rpx;
  font-weight: 500;
}
.event-detail {
  display: block;
  font-size: 23rpx;
  color: #839174;
  margin-top: 10rpx;
  line-height: 1.8;
}
</style>
