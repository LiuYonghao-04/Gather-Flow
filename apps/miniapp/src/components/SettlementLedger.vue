<script setup lang="ts">
import { formatMoney, type Settlement, type SettlementTransfer } from '@gatherflow/shared';
import { formatTime } from '@/services/api';
const props = defineProps<{
  settlement: Settlement;
  viewerId: string;
  allowReceipt?: boolean;
  busy?: boolean;
}>();
defineEmits<{ receive: [transfer: SettlementTransfer] }>();
const name = (id: string) => props.settlement.snapshot.members.find((m) => m.id === id)?.name ?? id;
</script>
<template>
  <view>
    <view class="section-heading"
      ><text>每个人的最终净额</text><text class="muted">已扣除自己的消费</text></view
    >
    <view class="card">
      <view
        v-for="b in settlement.snapshot.balances"
        :key="b.userId"
        class="list-row row between gap"
      >
        <text>{{ name(b.userId) }}{{ b.userId === viewerId ? ' · 我' : '' }}</text>
        <text class="amount"
          >{{ b.amountCents > 0 ? '应收' : b.amountCents < 0 ? '应付' : '无需转账'
          }}{{ b.amountCents ? ' ¥ ' + formatMoney(Math.abs(b.amountCents)) : '' }}</text
        >
      </view>
    </view>
    <view class="section-heading"
      ><text>逐笔转账与到账</text
      ><text class="muted">{{ settlement.transfers.length }} 笔</text></view
    >
    <view v-if="!settlement.transfers.length" class="notice"
      >净额已抵消，无需转账。活动仍由房主明确结束。</view
    >
    <view v-for="t in settlement.transfers" :key="t.id" class="card space-top">
      <view class="row between gap"
        ><text class="transfer-names">{{ name(t.fromUserId) }} → {{ name(t.toUserId) }}</text
        ><text class="amount transfer-amount">¥ {{ formatMoney(t.amountCents) }}</text></view
      >
      <text class="helper">{{
        t.receivedAt
          ? name(t.receivedBy!) + ' 已确认收到 · ' + formatTime(t.receivedAt)
          : settlement.reopenedAt
            ? '旧清算已作废，请勿按此转账'
            : '等待 ' + name(t.toUserId) + ' 确认整笔到账'
      }}</text>
      <button
        v-if="allowReceipt && !settlement.reopenedAt && !t.receivedAt && t.toUserId === viewerId"
        class="btn secondary space-top"
        :disabled="busy"
        :loading="busy"
        @tap="$emit('receive', t)"
      >
        确认收到 ¥ {{ formatMoney(t.amountCents) }}
      </button>
    </view>
    <text class="footer-note"
      >线下自行转账。此处只记录收款人的确认，不发起支付；付款人和房主均不能代替收款人确认。</text
    >
  </view>
</template>
<style scoped>
.transfer-names {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.transfer-amount {
  font-size: 32rpx;
  white-space: nowrap;
}
</style>
