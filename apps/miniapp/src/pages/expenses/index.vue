<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatMoney, type FinanceWorkspace, type ExpenseStatus } from '@gatherflow/shared';
import { api, go } from '@/services/api';
import { useActivityPage } from '@/composables/useActivityPage';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
const { id, data, loading, error, reload } = useActivityPage('expenses', (activityId) =>
  api<FinanceWorkspace>(`/activities/${activityId}/finance`),
);
const filter = ref('ALL'),
  tab = ref<'bills' | 'estimate'>('bills'),
  limit = ref(20);
const labels: Record<ExpenseStatus, string> = {
  PENDING_CONFIRMATION: '待确认',
  CONFIRMED: '已确认',
  DISPUTED: '有异议',
  PERSONAL_ONLY: '个人消费',
};
const filtered = computed(
  () =>
    data.value?.expenses.filter((e) => filter.value === 'ALL' || e.status === filter.value) ?? [],
);
function name(userId: string) {
  return data.value?.members.find((m) => m.id === userId)?.name ?? userId;
}
</script>
<template>
  <view class="page"
    ><ActivityTrail :activity-id="id" :return-to="'/pages/expenses/index?id=' + id" /><view
      class="header"
      ><text class="eyebrow">EVERY LITTLE EXPENSE</text><text class="title">每一笔，都清清楚楚</text
      ><text class="muted">谁付了钱、谁一起分摊，大家都能看见。</text></view
    ><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view class="finance-hero"
        ><text class="finance-caption">已确认且无异议的共同支出</text
        ><text class="finance-total">¥ {{ formatMoney(data.estimate.confirmedTotalCents) }}</text
        ><view class="row gap"
          ><text>{{ data.estimate.pendingCount }} 笔待确认</text><text>·</text
          ><text>{{ data.estimate.disputedCount }} 笔有异议</text></view
        ></view
      ><view v-if="data.frozen || data.status === 'ARCHIVED'" class="notice space-top">{{
        data.status === 'ARCHIVED'
          ? '活动已归档，账单与凭证只读。'
          : '最终清算已冻结，不能增改账单。'
      }}</view
      ><button class="btn secondary space-top" @tap="go('/pages/settlement/index?id=' + id)">
        查看最终清算与到账记录 ›</button
      ><view class="pill-tabs"
        ><button class="pill-tab" :class="{ active: tab === 'bills' }" @tap="tab = 'bills'">
          全部账单</button
        ><button class="pill-tab" :class="{ active: tab === 'estimate' }" @tap="tab = 'estimate'">
          预计结算
        </button></view
      ><template v-if="tab === 'bills'"
        ><view class="section-heading"
          ><text>一起花的钱</text
          ><button
            v-if="data.status === 'ACTIVE' && !data.frozen"
            class="btn secondary compact"
            @tap="go('/pages/expense-edit/index?id=' + id)"
          >
            ＋ 记一笔
          </button></view
        ><view class="chips"
          ><button
            class="chip"
            :class="{ selected: filter === 'ALL' }"
            @tap="
              filter = 'ALL';
              limit = 20;
            "
          >
            全部</button
          ><button
            v-for="(label, key) in labels"
            :key="key"
            class="chip"
            :class="{ selected: filter === key }"
            @tap="
              filter = key;
              limit = 20;
            "
          >
            {{ label }}
          </button></view
        ><GfState
          v-if="!filtered.length"
          title="这里还没有账单"
          description="交通、住宿或一杯饮料，发生了就记下来。"
        /><view class="flow-list space-top"
          ><view
            v-for="e in filtered.slice(0, limit)"
            :key="e.id"
            class="card"
            @tap="go('/pages/expense/index?id=' + id + '&expenseId=' + e.id)"
            ><view class="row between gap"
              ><text
                class="tag"
                :class="{
                  danger: e.status === 'DISPUTED',
                  pending: e.status === 'PENDING_CONFIRMATION',
                  neutral: e.status === 'PERSONAL_ONLY',
                }"
                >{{ labels[e.status] }}</text
              ><text class="muted bill-date">{{ e.date }} · v{{ e.revision }}</text></view
            ><view class="row between gap space-top"
              ><text class="subtitle grow">{{ e.description }}</text
              ><text class="amount bill-amount">¥ {{ formatMoney(e.totalCents) }}</text></view
            ><text class="helper"
              >{{ name(e.payerId) }} 付款 · {{ e.shares.length }} 人分摊 ·
              {{ name(e.recorderId) }} 记账</text
            ></view
          ></view
        ><button v-if="filtered.length > limit" class="btn outline space-top" @tap="limit += 20">
          查看更多账单
        </button></template
      ><template v-else
        ><view class="notice warm"
          >这是预计结算，仅纳入已确认、无异议的共同账单。最终转账与到账记录请查看最终清算。</view
        ><view
          v-if="data.estimate.pendingCount || data.estimate.disputedCount"
          class="notice space-top"
          >{{ data.estimate.pendingCount }} 笔待确认、{{
            data.estimate.disputedCount
          }}
          笔有异议，暂未计入以下净额。</view
        ><view class="section-heading"
          ><text>抵消后的个人净额</text><text class="muted">已扣除自己的消费</text></view
        ><view class="card"
          ><view
            v-for="b in data.estimate.balances"
            :key="b.userId"
            class="row between list-row gap"
            ><text>{{ name(b.userId) }}</text
            ><text class="amount"
              >{{ b.amountCents > 0 ? '预计应收' : b.amountCents < 0 ? '预计应付' : '无需转账'
              }}{{ b.amountCents ? ' ¥ ' + formatMoney(Math.abs(b.amountCents)) : '' }}</text
            ></view
          ></view
        ><view class="section-heading"
          ><text>预计转账明细</text><text class="tag neutral">非最终清算</text></view
        ><view v-if="!data.estimate.transfers.length" class="notice"
          >当前已确认账单的净额为零，无需转账。待确认或有异议的账单仍需处理。</view
        ><view
          v-for="(t, index) in data.estimate.transfers"
          :key="index"
          class="transfer card space-top"
          ><view class="row between gap"
            ><text>{{ name(t.fromUserId) }} → {{ name(t.toUserId) }}</text
            ><text class="amount">¥ {{ formatMoney(t.amountCents) }}</text></view
          ></view
        ><text class="footer-note"
          >{{ data.estimate.personalCount }} 笔个人消费单独保留，不参与共同 AA。{{
            '\n'
          }}最终清算与收款确认尚未开放。</text
        ></template
      ></template
    ></view
  >
</template>
<style scoped>
.finance-hero {
  background: #294f40;
  color: #f6f6e9;
  border-radius: 28rpx;
  padding: 38rpx;
}
.finance-caption {
  font-size: 23rpx;
  color: #c4d1ba;
}
.finance-total {
  display: block;
  font-size: 62rpx;
  letter-spacing: -2rpx;
  margin: 18rpx 0;
  font-variant-numeric: tabular-nums;
}
.finance-hero .row {
  font-size: 23rpx;
  color: #cbd7c2;
}
.bill-date {
  font-size: 21rpx;
}
.bill-amount {
  font-size: 31rpx;
  white-space: nowrap;
}
.card .subtitle {
  font-size: 29rpx;
}
</style>
