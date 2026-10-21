<script setup lang="ts">
import { ref } from 'vue';
import { categoryLabels, formatMoney, responseLabels } from '@gatherflow/shared';
import { formatTime, go, goHome } from '@/services/api';
import snapshot from '@/content/demo-preview.json';
import type { DemoPreview } from '@/services/demo-types';
import GfAvatar from '@/components/GfAvatar.vue';
import GfIcon from '@/components/GfIcon.vue';
import DemoAccess from '@/components/DemoAccess.vue';
import DemoModeBanner from '@/components/DemoModeBanner.vue';
const demo = snapshot as DemoPreview;
const tab = ref('plan');
const expanded = ref<number | null>(null);
const tabs = [
  { id: 'plan', name: '行程协商' },
  { id: 'tasks', name: '任务分工' },
  { id: 'expenses', name: '全部账单' },
  { id: 'settlement', name: '最终清算' },
];
const name = (id: string) => demo.members.find((m) => m.id === id)?.name ?? id;
function switchTab(value: string) {
  tab.value = value;
  expanded.value = null;
}
function toggle(index: number) {
  expanded.value = expanded.value === index ? null : index;
}
function back() {
  if (getCurrentPages().length > 1) uni.navigateBack({ delta: 1 });
  else goHome();
}
const execution = { PLANNED: '待安排', CONFIRMED: '已确定', BOOKED: '已预订', DONE: '已执行' };
</script>
<template>
  <view class="page demo-page">
    <DemoModeBanner />
    <view class="row between"
      ><button id="demo-back" class="back" @tap="back">‹ 返回</button
      ><text class="tag neutral">演示档案 · 只读</text></view
    >
    <view class="header demo-header"
      ><text class="eyebrow">先看一场，已经走完的相聚</text
      ><text class="title">{{ '山野三日，\n五个人一起完成。' }}</text
      ><text class="muted demo-intro"
        >这是原来五人演示留下的档案。跟着他们看看，一份想法怎样变成计划，又怎样把账结清。</text
      ></view
    >
    <view class="demo-summary"
      ><view class="row between gap"
        ><text class="summary-caption">共同支出 · 已全部结清</text><GfIcon name="check" /></view
      ><text id="demo-total" class="demo-total">¥ {{ formatMoney(demo.activity.totalCents) }}</text
      ><view class="demo-counts"
        ><text>{{ demo.members.length }} 位朋友</text><text>{{ demo.proposals.length }} 项安排</text
        ><text>{{ demo.expenses.length }} 笔账单</text></view
      ></view
    >
    <view class="friends"
      ><view v-for="member in demo.members" :key="member.id" class="friend"
        ><GfAvatar :user="member" small /><text>{{ member.name }}</text></view
      ></view
    >
    <text class="snapshot-note"
      >保留于 {{ formatTime(demo.source.archivedAt) }} · 虚构演示，不会修改你的活动</text
    >
    <DemoAccess id="demo-operation" />
    <view class="pill-tabs demo-tabs"
      ><button
        v-for="item in tabs"
        :id="'demo-tab-' + item.id"
        :key="item.id"
        class="pill-tab"
        :class="{ active: tab === item.id }"
        @tap="switchTab(item.id)"
      >
        {{ item.name }}
      </button></view
    >
    <view v-if="tab === 'plan'" class="demo-section">
      <view class="section-heading"><text>每个人的意见，都留在这里</text></view
      ><text class="section-copy">点开一项安排，看谁确认、谁退出，以及商量的过程。</text>
      <view v-for="(proposal, index) in demo.proposals" :key="index" class="demo-record">
        <button :id="'demo-proposal-' + index" class="record-button" @tap="toggle(index)">
          <view class="row between gap"
            ><text class="record-kicker"
              >{{ proposal.content.date || '日期待定' }} ·
              {{ categoryLabels[proposal.content.category] }}</text
            ><text class="tag neutral">{{ execution[proposal.execution] }}</text></view
          ><text class="record-title">{{ proposal.content.title }}</text
          ><view class="row between gap"
            ><text class="record-detail"
              >{{ proposal.content.startTime || '时间待定'
              }}{{ proposal.content.endTime ? ' – ' + proposal.content.endTime : '' }} ·
              {{ proposal.content.location || '地点待商量' }}</text
            ><text class="expand-symbol">{{ expanded === index ? '−' : '+' }}</text></view
          >
        </button>
        <view v-if="expanded === index" class="record-expanded"
          ><text class="block preline">{{ proposal.content.description }}</text
          ><view v-for="response in proposal.responses" :key="response.userId" class="list-row"
            ><view class="row between gap"
              ><text>{{ name(response.userId) }}</text
              ><text
                class="tag"
                :class="{
                  neutral: response.response === 'OPT_OUT',
                  danger: response.response === 'OBJECTION',
                }"
                >{{ responseLabels[response.response] }}</text
              ></view
            ><text v-if="response.reason" class="helper">{{ response.reason }}</text></view
          ><view
            v-for="preference in proposal.preferences"
            :key="preference.userId"
            class="notice space-top"
            ><text
              >{{ name(preference.userId) }} ·
              {{ preference.kind === 'ONLY' ? '只能' : '倾向' }}</text
            ><text class="helper">{{ preference.note }}</text></view
          ><view v-for="(comment, c) in proposal.comments" :key="c" class="list-row"
            ><text>{{ name(comment.authorId) }}的留言</text
            ><text class="helper">{{ comment.body }}</text></view
          ></view
        >
      </view>
      <view class="notice space-top"
        >沈念对周六出发有顾虑。四个人确认没有覆盖他的意见，等他本人选择“本次不参加”，日期方案才确定。</view
      >
    </view>
    <view v-else-if="tab === 'tasks'" class="demo-section"
      ><view class="section-heading"><text>认领、准备，再明确交接</text></view
      ><view v-for="(task, index) in demo.tasks" :key="index" class="demo-record"
        ><text class="record-title">{{ task.title }}</text
        ><view class="row between gap"
          ><text class="record-detail">负责人 · {{ task.assigneeIds.map(name).join('、') }}</text
          ><text class="tag neutral">{{
            task.completed ? '工作已完成' : '结束时未完成'
          }}</text></view
        ><text class="block preline task-content">{{ task.content }}</text
        ><view v-for="(handover, h) in task.handovers" :key="h" class="notice space-top"
          ><text
            >{{ name(handover.fromUserId) }} → {{ name(handover.toUserId) }} ·
            {{
              handover.status === 'ACCEPTED'
                ? '已接受交接'
                : handover.status === 'PENDING'
                  ? '待接受'
                  : '已撤销'
            }}</text
          ><text class="helper">{{ handover.note }}</text></view
        ><view v-for="(suggestion, s) in task.suggestions" :key="s" class="list-row"
          ><text>{{ name(suggestion.authorId) }}的建议</text
          ><text class="helper">{{ suggestion.body }}</text></view
        ></view
      ><view class="section-heading"><text>留存的演示凭证</text></view
      ><view v-for="(item, index) in demo.evidence" :key="index" class="notice"
        ><text>{{ item.caption }}</text
        ><text class="helper">{{ name(item.uploaderId) }} 上传 · 此处仅展示凭证说明</text></view
      ></view
    >
    <view v-else-if="tab === 'expenses'" class="demo-section"
      ><view class="section-heading"><text>谁付款，谁分摊，都说清楚</text></view
      ><text class="section-copy">点开账单，查看分摊与确认记录。演示中提出过的异议也会保留。</text
      ><view v-for="(expense, index) in demo.expenses" :key="index" class="demo-record"
        ><button :id="'demo-expense-' + index" class="record-button" @tap="toggle(index)">
          <view class="row between gap"
            ><text class="record-title">{{ expense.description }}</text
            ><text class="bill-amount">¥ {{ formatMoney(expense.totalCents) }}</text></view
          ><view class="row between gap"
            ><text class="record-detail"
              >{{ name(expense.payerId) }}付款 · {{ name(expense.recorderId) }}记账</text
            ><text class="expand-symbol">{{ expanded === index ? '−' : '+' }}</text></view
          ></button
        ><view v-if="expanded === index" class="record-expanded"
          ><text class="tag"
            >已确认 · {{ expense.splitMode === 'EQUAL' ? '平均分摊' : '自定义金额' }}</text
          ><view
            v-for="share in expense.shares"
            :key="share.userId"
            class="list-row row between gap"
            ><text>{{ name(share.userId) }}</text
            ><text class="amount">¥ {{ formatMoney(share.amountCents) }}</text></view
          ><text v-for="(confirmation, c) in expense.confirmations" :key="c" class="helper"
            >{{ name(confirmation.userId) }}已确认 · {{ formatTime(confirmation.createdAt) }}</text
          ><view v-for="(dispute, d) in expense.disputes" :key="d" class="notice space-top"
            ><text
              >{{ name(dispute.userId) }}曾提出异议{{
                dispute.withdrawnAt ? ' · 已由本人撤销' : ''
              }}</text
            ><text class="helper">{{ dispute.reason }}</text></view
          ><text v-for="caption in expense.evidenceCaptions" :key="caption" class="helper space-top"
            >关联凭证 · {{ caption }}</text
          ></view
        ></view
      ><view class="notice space-top"
        >高铁票只由四位乘车人分摊。饮料按实际金额分配，停车费经另一位分摊者确认后计入共同费用。</view
      ></view
    >
    <view v-else class="demo-section"
      ><view class="section-heading"><text>先抵消，再按最终清单转账</text></view
      ><text class="section-copy">以下是每个人付出与消费抵消后的净额。</text
      ><view class="card"
        ><view
          v-for="balance in demo.balances"
          :key="balance.userId"
          class="list-row row between gap"
          ><text>{{ name(balance.userId) }}</text
          ><text class="amount"
            >{{ balance.amountCents > 0 ? '应收' : balance.amountCents < 0 ? '应付' : '无需转账'
            }}{{
              balance.amountCents ? ' ¥ ' + formatMoney(Math.abs(balance.amountCents)) : ''
            }}</text
          ></view
        ></view
      ><view class="section-heading"
        ><text>{{ demo.transfers.length }} 笔转账，均由收款人确认</text></view
      ><view v-for="(transfer, index) in demo.transfers" :key="index" class="demo-record"
        ><view class="row between gap"
          ><text>{{ name(transfer.fromUserId) }} → {{ name(transfer.toUserId) }}</text
          ><text class="bill-amount">¥ {{ formatMoney(transfer.amountCents) }}</text></view
        ><text class="helper"
          >{{ name(transfer.toUserId) }}已确认收到 ·
          {{ transfer.receivedAt ? formatTime(transfer.receivedAt) : '' }}</text
        ></view
      ><view class="section-heading"><text>核对过程也保留</text></view
      ><view
        v-for="history in demo.settlementHistory"
        :key="history.sequence"
        class="list-row row between gap"
        ><text>第 {{ history.sequence }} 份清算 · ¥ {{ formatMoney(history.totalCents) }}</text
        ><text class="tag neutral">{{ history.reopened ? '已重开失效' : '最终归档' }}</text></view
      ><text class="helper"
        >未到账时曾重新开放记账，旧清单仍可追溯。全部结清后，由房主明确结束活动。</text
      ></view
    >
    <view class="demo-footer"
      ><button id="demo-guide" class="btn secondary" @tap="go('/pages/guide/index')">
        了解这几个步骤怎么用</button
      ><button id="demo-home" class="btn text-btn" @tap="goHome">回到我的活动 ›</button
      ><text class="footer-note"
        >上方档案是无需联网的只读副本。进入演示操作后，才会连接原来的演示数据服务。</text
      ></view
    >
  </view>
</template>
<style scoped>
.demo-page {
  padding-top: 24rpx;
}
.back {
  background: none;
  color: #697e60;
  margin: 0;
  padding: 12rpx 18rpx 12rpx 0;
  font-size: 26rpx;
  line-height: 1.6;
}
.demo-header {
  margin: 38rpx 0 30rpx;
}
.demo-header .title {
  margin: 24rpx 0 20rpx;
  font-size: 46rpx;
  line-height: 1.4;
  white-space: pre-line;
}
.demo-intro {
  display: block;
  font-size: 26rpx;
  line-height: 1.9;
}
.demo-summary {
  padding: 30rpx;
  background: #294f40;
  border-radius: 24rpx;
  color: #f7f7e9;
}
.summary-caption {
  color: #d0ddc4;
  font-size: 24rpx;
}
.demo-total {
  display: block;
  font-size: 64rpx;
  margin: 20rpx 0 24rpx;
  font-variant-numeric: tabular-nums;
  letter-spacing: -2rpx;
}
.demo-counts {
  display: flex;
  justify-content: space-between;
  color: #d3dec8;
  font-size: 23rpx;
  border-top: 1rpx solid #54705c;
  padding-top: 22rpx;
}
.friends {
  display: flex;
  justify-content: space-between;
  margin: 32rpx 0 20rpx;
  gap: 8rpx;
}
.friend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  font-size: 22rpx;
  color: #6e7f63;
}
.snapshot-note {
  display: block;
  color: #89937f;
  font-size: 21rpx;
  line-height: 1.8;
}
.demo-tabs {
  margin: 32rpx 0 0;
}
.demo-tabs .pill-tab {
  padding-left: 8rpx;
  padding-right: 8rpx;
  font-size: 24rpx;
}
.demo-section .section-heading {
  margin-top: 34rpx;
}
.demo-section .section-heading text:first-child {
  font-size: 29rpx;
}
.demo-record {
  border-bottom: 1rpx solid #dbe2d1;
  padding: 26rpx 0;
}
.record-button {
  padding: 0;
  margin: 0;
  background: none;
  text-align: left;
  color: inherit;
  line-height: 1.7;
}
.record-kicker {
  font-size: 22rpx;
  color: #7f8c72;
}
.record-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  margin: 12rpx 0;
  overflow-wrap: anywhere;
}
.record-detail {
  font-size: 24rpx;
  color: #7f8b76;
}
.expand-symbol {
  color: #4c6b44;
  font-size: 32rpx;
  flex-shrink: 0;
}
.record-expanded {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 18rpx;
  background: #eeefe6;
  font-size: 26rpx;
}
.bill-amount {
  font-size: 29rpx;
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.task-content {
  color: #64775b;
  font-size: 26rpx;
  line-height: 1.8;
  margin-top: 18rpx;
}
.demo-footer {
  padding-top: 42rpx;
}
.demo-footer .text-btn {
  margin: 16rpx auto 0;
}
</style>
