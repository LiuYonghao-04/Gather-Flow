<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import {
  formatMoney,
  responseLabels,
  type ActivityDetail,
  type AuditEvent,
  type ProposalResponse,
} from '@gatherflow/shared';
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
  SETTLEMENT_FROZEN: '冻结了最终清算',
  SETTLEMENT_REOPENED: '重新开放了记账',
  SETTLEMENT_RECEIVED: '确认了整笔到账',
  ACTIVITY_ARCHIVED: '结束活动并归档',
  INVITE_CREATED: '准备了一份邀请',
  MEMBER_JOINED_DIRECT: '通过房主直邀加入',
  JOIN_REQUESTED: '申请加入活动',
  APPLICATION_APPROVED: '同意了一位朋友加入',
  APPLICATION_REJECTED: '暂未接受一份申请',
  TASK_CREATED: '新建了任务',
  TASK_ASSIGNED: '认领或增加了共同负责人',
  TASK_REVISED: '更新了任务正式内容',
  TASK_PROGRESS: '更新了工作进度',
  TASK_SUGGESTED: '留下了任务建议',
  SUGGESTION_REVIEWED: '回应了任务建议',
  HANDOVER_REQUESTED: '申请交接任务',
  HANDOVER_ACCEPTED: '接受了任务交接',
  HANDOVER_CANCELLED: '撤销了交接申请',
  PROPOSAL_CREATED: '提出了新方案',
  PROPOSAL_REVISED: '发布了新方案版本',
  PROPOSAL_RESPONDED: '记录了方案表态',
  PREFERENCE_UPDATED: '更新了倾向或限制',
  PROPOSAL_COMMENTED: '参与了方案讨论',
  EXECUTION_UPDATED: '登记了执行进展',
  EVIDENCE_UPLOADED: '上传了私有凭证',
  EXPENSE_CREATED: '记下了一笔费用',
  EXPENSE_REVISED: '修改了账单版本',
  EXPENSE_CONFIRMED: '确认了账单',
  EXPENSE_DISPUTED: '提出了账单异议',
  EXPENSE_DISPUTE_WITHDRAWN: '撤销了本人的账单异议',
};
function describe(event: AuditEvent): string {
  if (event.action === 'INVITE_CREATED')
    return event.after?.kind === 'DIRECT' ? '房主直邀 · 一次免审核加入' : '成员邀请 · 需房主审核';
  if (event.action.startsWith('APPLICATION_')) {
    const target = data.value?.activity.members.find((member) => member.id === event.targetId);
    return `${target?.name ?? '申请人 ' + event.targetId} · 待审核 → ${event.action === 'APPLICATION_APPROVED' ? '已同意' : '未通过'}`;
  }
  if (event.action === 'MEMBER_JOINED_DIRECT') return '免审核权益已使用，该邀请后续需申请';
  const after = event.after ?? {};
  const before = event.before ?? {};
  const name = (value: unknown) =>
    data.value?.activity.members.find((m) => m.id === value)?.name ?? String(value ?? '');
  if (event.action === 'SETTLEMENT_FROZEN')
    return `第 ${after.sequence} 份清算 · 共同支出 ¥ ${formatMoney(Number(after.confirmedTotalCents))} · ${after.transferCount} 笔转账，账单冻结。`;
  if (event.action === 'SETTLEMENT_REOPENED')
    return `第 ${before.sequence} 份清算已失效，保留历史，重新开放记账。`;
  if (event.action === 'SETTLEMENT_RECEIVED')
    return `${name(after.toUserId)} 确认收到 ${name(after.fromUserId)} 的 ¥ ${formatMoney(Number(after.amountCents))}；仅由收款人本人确认。`;
  if (event.action === 'ACTIVITY_ARCHIVED')
    return '全部账款结清，由房主明确结束。行程、任务、凭证与账单只读保留。';
  if (event.action === 'PROPOSAL_RESPONDED')
    return `${after.proxy ? '由房主 ' + event.actor.name + ' 代 ' + name(after.userId) + ' 操作：' : name(after.userId) + '：'}${responseLabels[after.response as ProposalResponse] ?? ''} · v${after.version}${after.reason ? ' · ' + after.reason : ''}`;
  if (event.action.endsWith('_REVISED'))
    return `版本 ${before.version ?? before.revision} → ${after.version ?? after.revision}，旧版确认不沿用；内容与历史可在详情中查看。`;
  if (event.action === 'TASK_PROGRESS')
    return after.completed ? '规划工作已完成；不代表方案已共同确认。' : '重新开始推进这项工作。';
  if (event.action === 'TASK_ASSIGNED') return `${name(after.userId)} 加入负责人，共同推进任务。`;
  if (event.action.startsWith('HANDOVER_'))
    return `${name(after.fromUserId ?? before.fromUserId)} → ${name(after.toUserId)}${after.note ? ' · ' + after.note : ''}`;
  if (event.action === 'EXECUTION_UPDATED')
    return `方案 v${after.version} · ${after.execution === 'BOOKED' ? '已预订' : '已执行'}；保留负责人声明。`;
  if (event.action === 'EXPENSE_CREATED')
    return `${after.description} · ¥ ${formatMoney(Number(after.totalCents))} · ${name(after.payerId)} 实际付款`;
  if (event.action === 'EXPENSE_CONFIRMED')
    return `确认账单 v${after.revision}，相关成员仍可提出异议。`;
  if (event.action === 'EXPENSE_DISPUTED')
    return `账单 v${after.revision} · ${after.reason}，暂停计入预计结算。`;
  if (event.action === 'EXPENSE_DISPUTE_WITHDRAWN')
    return `仅撤销本人异议；当前账单 v${after.revision}，其他异议继续保留。`;
  if (event.action === 'EVIDENCE_UPLOADED')
    return `${after.caption || '预订凭证'} · ${after.version ? '方案 v' + after.version : '关联任务'} · 仅活动成员可查看。`;
  if (after.body) return String(after.body);
  if (after.note) return String(after.note);
  if (after.title) return String(after.title);
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
