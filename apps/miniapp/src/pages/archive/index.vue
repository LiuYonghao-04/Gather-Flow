<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney, categoryLabels, type ActivityArchive } from '@gatherflow/shared';
import { api, go, formatTime } from '@/services/api';
import { useActivityPage } from '@/composables/useActivityPage';
import ActivityTrail from '@/components/ActivityTrail.vue';
import GfState from '@/components/GfState.vue';
import EvidenceList from '@/components/EvidenceList.vue';
import SettlementLedger from '@/components/SettlementLedger.vue';
const { id, userId, data, loading, error, reload } = useActivityPage('archive', (activityId) =>
  api<ActivityArchive>(`/activities/${activityId}/archive`),
);
const personalTotal = computed(
  () =>
    data.value?.finance.expenses
      .filter((e) => e.status === 'PERSONAL_ONLY')
      .reduce((sum, e) => sum + e.totalCents, 0) ?? 0,
);
const name = (uid: string) =>
  data.value?.settlement.activity.members.find((m) => m.id === uid)?.name ?? uid;
</script>
<template>
  <view class="page">
    <ActivityTrail :activity-id="id" :return-to="'/pages/archive/index?id=' + id" />
    <GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" />
    <template v-else-if="data">
      <view class="header"
        ><text class="eyebrow">A GATHERING TO REMEMBER</text
        ><text class="title">{{ data.settlement.activity.name }}</text
        ><text class="muted">这次相聚已结束，回忆和每一笔账都留在这里。</text
        ><text class="helper"
          >{{ data.settlement.archivedAt ? formatTime(data.settlement.archivedAt) : '' }} ·
          {{ name(data.settlement.archivedBy ?? '') }} 结束活动</text
        ></view
      >
      <view class="archive-summary"
        ><text class="tag">已归档 · 全部结清 · 只读</text
        ><text class="summary-amount"
          >¥ {{ formatMoney(data.finance.estimate.confirmedTotalCents) }}</text
        ><text class="muted">共同支出 · {{ data.settlement.activity.memberCount }} 人同行</text
        ><view class="divider" /><text class="helper"
          >{{ data.workspace.plan.items.length }} 项确定安排 ·
          {{ data.finance.expenses.length }} 笔账单 · {{ data.evidence.length }} 份凭证</text
        ><text v-if="data.finance.estimate.personalCount" class="helper"
          >另有 {{ data.finance.estimate.personalCount }} 笔个人消费 ¥
          {{ formatMoney(personalTotal) }}，未计入共同 AA。</text
        ></view
      >
      <view class="section-heading"
        ><text>一起走过的安排</text><text class="muted">保留最终版本</text></view
      >
      <view v-if="!data.workspace.plan.items.length" class="notice"
        >这次没有确定的行程安排，其他协商记录仍可查阅。</view
      >
      <view
        v-for="p in data.workspace.plan.items"
        :key="p.id"
        class="archive-entry"
        @tap="go('/pages/proposal/index?id=' + id + '&proposalId=' + p.id)"
        ><text class="helper"
          >{{ p.content.date || '日期未安排' }} · {{ p.content.startTime || '时间待定'
          }}{{ p.content.endTime ? ' – ' + p.content.endTime : '' }}</text
        ><text class="subtitle block">{{ p.content.title }}</text
        ><text class="helper"
          >{{ categoryLabels[p.content.category] }} · {{ p.content.location || '未填写地点' }} ·
          {{
            p.execution === 'DONE' ? '已执行' : p.execution === 'BOOKED' ? '已预订' : '方案已确定'
          }}
          ›</text
        ></view
      >
      <button
        class="btn text-btn space-top"
        @tap="go('/pages/collaboration/index?id=' + id + '&tab=plan')"
      >
        查看完整行程与协商记录 ›
      </button>
      <view class="section-heading"><text>一起做过的分工</text></view>
      <view v-if="!data.workspace.tasks.length" class="notice">没有分工任务。</view>
      <view
        v-for="t in data.workspace.tasks"
        :key="t.id"
        class="list-row"
        @tap="go('/pages/task/index?id=' + id + '&taskId=' + t.id)"
        ><view class="row between gap"
          ><text>{{ t.title }}</text
          ><text class="tag neutral">{{ t.completed ? '已完成' : '结束时未完成' }}</text></view
        ><text class="helper">{{ t.assigneeIds.map(name).join('、') || '未认领' }} ›</text></view
      >
      <SettlementLedger
        v-if="data.settlement.current"
        :settlement="data.settlement.current"
        :viewer-id="userId"
      />
      <button class="btn outline" @tap="go('/pages/settlement/index?id=' + id)">
        查看清算历史
      </button>
      <view class="section-heading"><text>消费与凭证</text></view>
      <button class="btn secondary" @tap="go('/pages/expenses/index?id=' + id)">
        查看全部账单、分摊与确认记录
      </button>
      <EvidenceList :items="data.evidence" :activity-id="id" />
      <button class="btn outline space-top" @tap="go('/pages/audit/index?id=' + id)">
        查看活动足迹
      </button>
      <text class="footer-note"
        >未完成的准备事项保留原状态。方案、任务、凭证、账单和到账确认均不可再修改。</text
      >
    </template>
  </view>
</template>
<style scoped>
.archive-summary {
  border-top: 2rpx solid #294f40;
  border-bottom: 1rpx solid #dce0d2;
  padding: 32rpx 0;
}
.summary-amount {
  display: block;
  font-size: 64rpx;
  letter-spacing: -2rpx;
  margin: 22rpx 0 12rpx;
  font-variant-numeric: tabular-nums;
}
.archive-entry {
  border-left: 3rpx solid #c5d4bb;
  padding: 8rpx 0 24rpx 26rpx;
  margin-left: 6rpx;
}
</style>
