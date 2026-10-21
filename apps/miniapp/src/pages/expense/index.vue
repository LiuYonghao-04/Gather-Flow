<script setup lang="ts">
defineOptions({ inheritAttrs: false });
import { computed, ref } from 'vue';
import { formatMoney, type Workspace, type Expense, type ExpenseStatus } from '@gatherflow/shared';
import { api, go, formatTime } from '@/services/api';
import { confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
import EvidenceList from '@/components/EvidenceList.vue';
const { id, options, userId, data, loading, error, reload, busy, run } = useActivityPage(
  'expense',
  async (activityId, q) => {
    const [workspace, expense] = await Promise.all([
      api<Workspace>(`/activities/${activityId}/workspace`),
      api<Expense>(`/activities/${activityId}/expenses/${q.expenseId}`),
    ]);
    return { workspace, expense };
  },
);
const reason = ref(''),
  disputeOpen = ref(false),
  history = ref(false);
const labels: Record<ExpenseStatus, string> = {
  PENDING_CONFIRMATION: '等待另一位分摊成员确认',
  CONFIRMED: '已确认 · 计入预计结算',
  DISPUTED: '有异议 · 暂停计入结算',
  PERSONAL_ONLY: '个人消费 · 不参与共同 AA',
};
const active = computed(
  () => data.value?.workspace.status === 'ACTIVE' && !data.value.workspace.financialFrozen,
);
const mayConfirm = computed(() => {
  const e = data.value?.expense;
  return (
    active.value &&
    e &&
    e.recorderId !== userId.value &&
    e.shares.some((x) => x.userId === userId.value) &&
    !e.confirmations.some((x) => x.revision === e.revision && x.userId === userId.value) &&
    e.status !== 'PERSONAL_ONLY'
  );
});
const mayDispute = computed(() => {
  const e = data.value?.expense;
  return (
    active.value &&
    e &&
    (e.payerId === userId.value || e.shares.some((x) => x.userId === userId.value)) &&
    !e.disputes.some((x) => x.userId === userId.value && !x.withdrawnAt)
  );
});
function name(value: string) {
  return data.value?.workspace.members.find((m) => m.id === value)?.name ?? value;
}
function action(path: string, body: object, after?: () => void) {
  return run(async () => {
    await api(`/activities/${id.value}/expenses/${options.value.expenseId}${path}`, 'POST', body);
    after?.();
    await reload();
  });
}
async function confirm() {
  if (
    data.value &&
    (await confirmAction(
      '确认这笔费用？',
      '请核对金额、实际付款人、自己的分摊金额与凭证。确认后，相关成员仍可以提出异议。',
    ))
  )
    await action('/confirmations', { expectedRevision: data.value.expense.revision });
}
async function withdraw(disputeId: string) {
  if (await confirmAction('撤销我的这条异议？', '请先与朋友核对清楚。其他人的异议会继续保留。'))
    await action(`/disputes/${disputeId}/withdraw`, {});
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="'/pages/expense/index?id=' + id + '&expenseId=' + options.expenseId"
    /><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view class="header"
        ><text class="eyebrow">EXPENSE · VERSION {{ data.expense.revision }}</text
        ><text class="title">{{ data.expense.description }}</text
        ><text
          class="tag"
          :class="{
            danger: data.expense.status === 'DISPUTED',
            pending: data.expense.status === 'PENDING_CONFIRMATION',
          }"
          >{{ labels[data.expense.status] }}</text
        ></view
      ><view
        v-if="data.workspace.financialFrozen || data.workspace.status === 'ARCHIVED'"
        class="notice space-top"
        >{{
          data.workspace.status === 'ARCHIVED'
            ? '活动已归档，账单只读。'
            : '最终清算已冻结，账单只读。需要更正时请先查看清算状态。'
        }}<button class="btn text-btn" @tap="go('/pages/settlement/index?id=' + id)">
          查看最终清算 ›
        </button></view
      ><view class="card space-top"
        ><text class="bill-total">¥ {{ formatMoney(data.expense.totalCents) }}</text
        ><view class="row between list-row"
          ><text class="muted">实际付款人</text><text>{{ name(data.expense.payerId) }}</text></view
        ><view class="row between list-row"
          ><text class="muted">记账人</text><text>{{ name(data.expense.recorderId) }}</text></view
        ><view class="row between list-row"
          ><text class="muted">消费日期</text><text>{{ data.expense.date }}</text></view
        ><text class="helper">记录于 {{ formatTime(data.expense.createdAt) }}</text></view
      ><view class="section-heading"
        ><text>这笔钱，我们这样分</text
        ><text class="tag neutral">{{
          data.expense.splitMode === 'EQUAL' ? '平均分摊' : '自定义金额'
        }}</text></view
      ><view class="card"
        ><view v-for="s in data.expense.shares" :key="s.userId" class="row between list-row gap"
          ><text
            >{{ name(s.userId) }}{{ s.userId === userId ? ' · 我' : ''
            }}<text v-if="s.userId === data.expense.payerId" class="helper"
              >自己的消费，无需向自己转账</text
            ></text
          ><text class="amount">¥ {{ formatMoney(s.amountCents) }}</text></view
        ></view
      ><view v-if="mayConfirm || mayDispute" class="actions"
        ><button
          id="confirm-expense"
          v-if="mayConfirm"
          class="btn"
          :disabled="busy"
          :loading="busy"
          @tap="confirm"
        >
          这笔账没问题</button
        ><button v-if="mayDispute" class="btn outline" :disabled="busy" @tap="disputeOpen = true">
          有异议
        </button></view
      ><text
        v-if="data.expense.recorderId === userId && data.expense.status === 'PENDING_CONFIRMATION'"
        class="helper"
        >你是记账人，须由另一位相关分摊成员确认。</text
      ><view class="section-heading"
        ><text>本版确认记录</text><text class="muted">一位其他分摊者即可</text></view
      ><view
        v-if="!data.expense.confirmations.some((x) => x.revision === data?.expense.revision)"
        class="notice"
        >{{
          data.expense.status === 'PERSONAL_ONLY'
            ? '仅付款者本人消费，无需共同确认。'
            : '还没有人确认这一版账单。'
        }}</view
      ><view
        v-for="c in data.expense.confirmations.filter((x) => x.revision === data?.expense.revision)"
        :key="c.userId"
        class="list-row"
        ><text>{{ name(c.userId) }} 已确认</text
        ><text class="helper">{{ formatTime(c.createdAt) }}</text></view
      ><view v-if="data.expense.disputes.length" class="section-heading"
        ><text>核对与异议</text><text class="muted">仅提出者可撤销</text></view
      ><view v-for="d in data.expense.disputes" :key="d.id" class="card space-top"
        ><view class="row between gap"
          ><text>{{ name(d.userId) }} · v{{ d.revision }}</text
          ><text class="tag" :class="{ danger: !d.withdrawnAt, neutral: !!d.withdrawnAt }">{{
            d.withdrawnAt ? '本人已撤销' : '待核对'
          }}</text></view
        ><text class="block preline space-top">{{ d.reason }}</text
        ><text class="helper"
          >{{ formatTime(d.createdAt)
          }}{{ d.withdrawnAt ? ' · 撤销于 ' + formatTime(d.withdrawnAt) : '' }}</text
        ><button
          v-if="active && !d.withdrawnAt && d.userId === userId"
          class="btn secondary compact space-top"
          :disabled="busy"
          @tap="withdraw(d.id)"
        >
          核对好了，撤销我的异议
        </button></view
      ><view class="section-heading"
        ><text>关联凭证</text><text class="muted">{{ data.expense.evidence.length }} 份</text></view
      ><EvidenceList :items="data.expense.evidence" :activity-id="id" /><button
        v-if="data.expense.taskId"
        class="btn text-btn space-top"
        @tap="go('/pages/task/index?id=' + id + '&taskId=' + data.expense.taskId)"
      >
        查看关联任务 ›</button
      ><button
        v-if="active && data.expense.recorderId === userId"
        class="btn outline space-top"
        @tap="go('/pages/expense-edit/index?id=' + id + '&expenseId=' + data.expense.id)"
      >
        修改账单，发布新版本</button
      ><button class="btn text-btn space-top" @tap="history = !history">
        {{ history ? '收起' : '查看' }}历史账单与确认</button
      ><view v-if="history"
        ><view v-for="v in data.expense.revisions" :key="v.revision" class="card space-top"
          ><text class="label"
            >v{{ v.revision }} · {{ name(v.actorId) }} · {{ formatTime(v.createdAt) }}</text
          ><text class="block"
            >{{ v.input.description }} · ¥ {{ formatMoney(v.input.totalCents) }}</text
          ><text class="helper">{{ v.input.date }} · {{ name(v.input.payerId) }} 付款</text
          ><text v-for="s in v.input.shares" :key="s.userId" class="helper"
            >{{ name(s.userId) }} 分摊 ¥ {{ formatMoney(s.amountCents) }}</text
          ><text
            v-for="c in data.expense.confirmations.filter((x) => x.revision === v.revision)"
            :key="c.userId"
            class="helper"
            >{{ name(c.userId) }} 于 {{ formatTime(c.createdAt) }} 确认{{
              v.revision !== data.expense.revision ? '（仅适用于旧版）' : ''
            }}</text
          ></view
        ></view
      ><button class="btn text-btn" @tap="go('/pages/expenses/index?id=' + id)">
        查看全部账单与预计结算
      </button></template
    ></view
  ><view v-if="disputeOpen && data" class="sheet-backdrop"
    ><view class="sheet"
      ><text class="subtitle">这笔账，哪里需要核对？</text
      ><text class="section-copy">提交后暂停计入预计结算，核对好后由你本人撤销。</text
      ><textarea
        v-model="reason"
        class="textarea"
        maxlength="1000"
        placeholder="例如：重复记账了，或我的分摊金额有误"
      /><button
        class="btn"
        :disabled="busy || !reason.trim()"
        :loading="busy"
        @tap="
          action('/disputes', { expectedRevision: data.expense.revision, reason }, () => {
            disputeOpen = false;
            reason = '';
          })
        "
      >
        提交异议</button
      ><button class="btn outline" :disabled="busy" @tap="disputeOpen = false">取消</button></view
    ></view
  >
</template>
<style scoped>
.bill-total {
  display: block;
  font-size: 64rpx;
  letter-spacing: -2rpx;
  font-variant-numeric: tabular-nums;
  margin-bottom: 20rpx;
}
</style>
