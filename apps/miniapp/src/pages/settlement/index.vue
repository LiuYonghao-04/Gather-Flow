<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatMoney, type SettlementWorkspace, type SettlementTransfer } from '@gatherflow/shared';
import { api, go, formatTime } from '@/services/api';
import { confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import ActivityTrail from '@/components/ActivityTrail.vue';
import GfState from '@/components/GfState.vue';
import SettlementLedger from '@/components/SettlementLedger.vue';
const { id, userId, data, loading, error, reload, busy, run } = useActivityPage(
  'settlement',
  (activityId) => api<SettlementWorkspace>(`/activities/${activityId}/settlement`),
);
const openedHistory = ref('');
const outstanding = computed(
  () => data.value?.current?.transfers.filter((t) => !t.receivedAt).length ?? 0,
);
const oldSnapshots = computed(() => data.value?.history.filter((s) => s.reopenedAt) ?? []);
async function mutate(path: string, body: object, title: string, message: string, archive = false) {
  await run(async () => {
    if (!(await confirmAction(title, message))) return;
    try {
      await api(`/activities/${id.value}${path}`, 'POST', body);
      if (archive) go('/pages/archive/index?id=' + id.value);
    } finally {
      await reload();
    }
  });
}
function freeze() {
  if (!data.value) return;
  return mutate(
    '/settlement',
    { expectedFinanceVersion: data.value.financeVersion },
    '冻结最终清算？',
    '请确认所有费用已记齐。冻结后不能增改账单或提出新异议；尚无到账确认时，房主可以重新开放记账。',
  );
}
function reopen() {
  if (!data.value?.current) return;
  return mutate(
    `/settlements/${data.value.current.id}/reopen`,
    {},
    '重新开放记账？',
    '这份转账清单将失效，历史会保留。请通知同行朋友暂停按旧清单转账，核对账单后重新冻结。',
  );
}
function receive(t: SettlementTransfer) {
  if (!data.value?.current) return;
  const sender =
    data.value.current.snapshot.members.find((m) => m.id === t.fromUserId)?.name ?? t.fromUserId;
  return mutate(
    `/settlements/${data.value.current.id}/transfers/${t.id}/receipt`,
    {},
    '确认整笔到账？',
    `请先核对已实际收到${sender}的 ¥ ${formatMoney(t.amountCents)}。确认后不能撤销，也不能重新开放这份清算。`,
  );
}
function close() {
  if (!data.value) return;
  return mutate(
    '/close',
    {
      expectedFinanceVersion: data.value.financeVersion,
      expectedSettlementId: data.value.current?.id ?? null,
    },
    '结束这次相聚？',
    '结束后，行程、任务、凭证和账单都将只读，不能再修改。未完成的非财务任务会保留当前状态。',
    true,
  );
}
</script>
<template>
  <view class="page">
    <ActivityTrail :activity-id="id" :return-to="'/pages/settlement/index?id=' + id" />
    <view class="header"
      ><text class="eyebrow">SETTLE UP, STAY CLOSE</text
      ><text class="title">把账结清，把相聚留下</text
      ><text class="muted">先核对每一笔，再一起收个尾。</text></view
    >
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <template v-else-if="data">
      <view v-if="data.activity.status === 'ARCHIVED'" class="notice"
        >活动已结束，清算与到账记录只读。<button
          class="btn secondary space-top"
          @tap="go('/pages/archive/index?id=' + id)"
        >
          查看相聚档案
        </button></view
      >
      <template v-if="data.current">
        <view class="settlement-hero space-top"
          ><text class="hero-caption"
            >第 {{ data.current.sequence }} 份最终清算 ·
            {{ data.activity.status === 'ARCHIVED' ? '已归档' : '账单已冻结' }}</text
          ><text class="hero-amount"
            >¥ {{ formatMoney(data.current.snapshot.confirmedTotalCents) }}</text
          ><text class="hero-caption"
            >共同支出 · {{ outstanding ? outstanding + ' 笔待确认到账' : '全部结清' }}</text
          ><text class="hero-foot">冻结于 {{ formatTime(data.current.createdAt) }}</text></view
        >
        <SettlementLedger
          id="current-ledger"
          :settlement="data.current"
          :viewer-id="userId"
          :allow-receipt="data.activity.status === 'ACTIVE'"
          :busy="busy"
          @receive="receive"
        />
        <button
          id="reopen-settlement"
          v-if="data.canReopen"
          class="btn outline"
          :disabled="busy"
          @tap="reopen"
        >
          发现遗漏，重新开放记账
        </button>
        <view
          v-else-if="
            data.activity.status === 'ACTIVE' && data.current.transfers.some((t) => t.receivedAt)
          "
          class="notice warm"
          >已有到账确认，不能重开或覆盖这份清算。发现错误请人工核对，当前不支持收款后的更正流程。</view
        >
      </template>
      <template v-else>
        <view class="notice"
          >还没有最终清算。确认账单全部记齐且无异议后，由房主冻结。个人消费会保留，但不参与共同
          AA。</view
        >
        <view v-for="reason in data.freezeReasons" :key="reason" class="notice warm space-top">{{
          reason
        }}</view>
        <button
          id="freeze-settlement"
          v-if="data.canFreeze"
          class="btn space-top"
          :disabled="busy"
          :loading="busy"
          @tap="freeze"
        >
          核对完毕，冻结最终清算
        </button>
      </template>
      <button class="btn text-btn space-top" @tap="go('/pages/expenses/index?id=' + id)">
        查看全部账单与凭证 ›
      </button>
      <template v-if="data.activity.status === 'ACTIVE'">
        <view class="section-heading"><text>为这次相聚画个句号</text></view>
        <view v-for="reason in data.closeReasons" :key="reason" class="list-row muted">{{
          reason
        }}</view>
        <text v-if="data.canClose" class="section-copy"
          >{{
            data.current ? '所有应收款已确认。' : '没有待处理的共同费用，将保存零转账清算记录。'
          }}结束后，所有内容只读。</text
        >
        <button
          id="close-activity"
          v-if="data.activity.ownerId === userId"
          class="btn space-top"
          :disabled="busy || !data.canClose"
          :loading="busy"
          @tap="close"
        >
          结束活动并归档
        </button>
      </template>
      <view v-if="oldSnapshots.length" class="section-heading"
        ><text>历史清算</text><text class="muted">保留每一次重开</text></view
      >
      <view v-for="s in oldSnapshots" :key="s.id" class="space-top">
        <button class="btn outline" @tap="openedHistory = openedHistory === s.id ? '' : s.id">
          第 {{ s.sequence }} 份 · 已重开失效 · {{ formatTime(s.reopenedAt!) }}
        </button>
        <view v-if="openedHistory === s.id"
          ><text class="helper"
            >共同支出 ¥ {{ formatMoney(s.snapshot.confirmedTotalCents) }} ·
            此清单不可用于当前收款</text
          ><SettlementLedger :settlement="s" :viewer-id="userId"
        /></view>
      </view>
    </template>
  </view>
</template>
<style scoped>
.settlement-hero {
  background: #294f40;
  color: #f7f5e9;
  border-radius: 28rpx;
  padding: 38rpx;
}
.hero-caption {
  display: block;
  font-size: 25rpx;
  color: #dae3cf;
}
.hero-amount {
  display: block;
  font-size: 64rpx;
  letter-spacing: -2rpx;
  margin: 20rpx 0;
  font-variant-numeric: tabular-nums;
}
.hero-foot {
  display: block;
  font-size: 22rpx;
  margin-top: 24rpx;
  color: #c1d0bb;
}
</style>
