<script setup lang="ts">
defineOptions({ inheritAttrs: false });
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  categoryLabels,
  progressLabels,
  taskCreateSchema,
  type Workspace,
  type Task,
  type Proposal,
} from '@gatherflow/shared';
import { api, go, switchChecked } from '@/services/api';
import { useActivityPage } from '@/composables/useActivityPage';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
const tab = ref<'proposals' | 'tasks' | 'plan'>('proposals');
const taskFilter = ref('ALL');
const creating = ref(false);
const title = ref('');
const brief = ref('');
const needsConfirmation = ref(true);
const { id, data, loading, error, reload, busy, run } = useActivityPage(
  'collaboration',
  (activityId) => api<Workspace>(`/activities/${activityId}/workspace`),
);
onLoad((q) => {
  if (q?.tab === 'tasks' || q?.tab === 'plan') tab.value = q.tab;
});
const tasks = computed(
  () =>
    data.value?.tasks.filter((t) => taskFilter.value === 'ALL' || t.status === taskFilter.value) ??
    [],
);
const days = computed(() => {
  const result: { date: string; items: Proposal[] }[] = [];
  for (const p of data.value?.plan.items ?? []) {
    const date = p.content.date ?? '日期待安排';
    let day = result.find((x) => x.date === date);
    if (!day) {
      day = { date, items: [] };
      result.push(day);
    }
    day.items.push(p);
  }
  return result;
});
function names(ids: string[]) {
  return ids.map((x) => data.value?.members.find((m) => m.id === x)?.name ?? x).join('、');
}
function proposalState(p: Proposal) {
  return p.status === 'CONFIRMED'
    ? '方案已确定'
    : p.status === 'STALE'
      ? '任务有变更 · 待更新'
      : '一起协商中';
}
function execution(p: Proposal) {
  return p.execution === 'BOOKED'
    ? '实际已预订'
    : p.execution === 'DONE'
      ? '已执行'
      : p.content.needsBooking
        ? '尚未预订'
        : '待执行';
}
function confirmations(p: Proposal) {
  return p.responses.filter((r) => r.version === p.version && r.response === 'CONFIRM').length;
}
async function createTask() {
  await run(async () => {
    const input = taskCreateSchema.parse({
      title: title.value,
      brief: brief.value,
      needsConfirmation: needsConfirmation.value,
    });
    const t = await api<Task>(`/activities/${id.value}/tasks`, 'POST', input);
    creating.value = false;
    title.value = '';
    brief.value = '';
    go(`/pages/task/index?id=${id.value}&taskId=${t.id}`);
  });
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="'/pages/collaboration/index?id=' + id + '&tab=' + tab"
    /><view class="header"
      ><text class="eyebrow">A PLAN WE MAKE TOGETHER</text
      ><text class="title">{{
        tab === 'proposals'
          ? '让每个想法被听见'
          : tab === 'tasks'
            ? '每个人，负责一点点'
            : '我们的共同计划'
      }}</text
      ><text class="muted">{{
        tab === 'proposals'
          ? '有分歧就继续聊，确认参加的人一起出发。'
          : tab === 'tasks'
            ? '先认领，再一起把细节安排好。'
            : '已经确定的安排，自动汇成这次相聚。'
      }}</text></view
    ><view class="pill-tabs"
      ><button class="pill-tab" :class="{ active: tab === 'proposals' }" @tap="tab = 'proposals'">
        一起商量</button
      ><button class="pill-tab" :class="{ active: tab === 'tasks' }" @tap="tab = 'tasks'">
        任务分工</button
      ><button class="pill-tab" :class="{ active: tab === 'plan' }" @tap="tab = 'plan'">
        总行程
      </button></view
    ><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view v-if="data.status === 'ARCHIVED'" class="notice space-top"
        >活动已归档，以下内容仅供查看。</view
      ><template v-if="tab === 'proposals'"
        ><view class="section-heading"
          ><text>{{ data.proposals.length }} 个想法</text
          ><button
            v-if="data.status === 'ACTIVE'"
            class="btn secondary compact"
            @tap="go('/pages/proposal-edit/index?id=' + id)"
          >
            ＋ 提个方案
          </button></view
        ><GfState
          v-if="!data.proposals.length"
          title="第一个想法，从你开始"
          description="日期、目的地、交通或一顿饭，都可以提出来一起商量。"
        /><view class="flow-list"
          ><view
            v-for="p in data.proposals"
            :key="p.id"
            class="card proposal-card"
            @tap="go('/pages/proposal/index?id=' + id + '&proposalId=' + p.id)"
            ><view class="row between gap"
              ><text class="tag neutral"
                >{{ categoryLabels[p.content.category] }} · v{{ p.version }}</text
              ><text class="tag" :class="{ pending: p.status !== 'CONFIRMED' }">{{
                proposalState(p)
              }}</text></view
            ><text class="subtitle block space-top">{{ p.content.title }}</text
            ><text class="section-copy">{{
              [p.content.date, p.content.startTime, p.content.location]
                .filter(Boolean)
                .join(' · ') || '先有想法，细节慢慢定'
            }}</text
            ><view class="row between"
              ><text class="muted"
                >{{ confirmations(p) }} 人确认 / {{ p.participants.length }} 位相关成员</text
              ><text>查看 ›</text></view
            ></view
          ></view
        ></template
      ><template v-else-if="tab === 'tasks'"
        ><view class="section-heading"
          ><text>{{ data.tasks.length }} 项分工</text
          ><button
            v-if="data.status === 'ACTIVE'"
            class="btn secondary compact"
            @tap="creating = true"
          >
            ＋ 新建任务
          </button></view
        ><view class="chips space-top"
          ><button
            class="chip"
            :class="{ selected: taskFilter === 'ALL' }"
            @tap="taskFilter = 'ALL'"
          >
            全部</button
          ><button
            v-for="(label, key) in progressLabels"
            :key="key"
            class="chip"
            :class="{ selected: taskFilter === key }"
            @tap="taskFilter = key"
          >
            {{ label }}
          </button></view
        ><GfState
          v-if="!tasks.length"
          title="这里还没有任务"
          description="把交通、住宿、餐食拆成小任务，大家自由认领。"
        /><view class="flow-list space-top"
          ><view
            v-for="t in tasks"
            :key="t.id"
            class="card"
            @tap="go('/pages/task/index?id=' + id + '&taskId=' + t.id)"
            ><view class="row between gap"
              ><text class="subtitle">{{ t.title }}</text
              ><text class="tag" :class="{ pending: t.status !== 'COMPLETED' }">{{
                progressLabels[t.status]
              }}</text></view
            ><text class="section-copy preline">{{ t.brief || '等你添上一点细节' }}</text
            ><text class="helper">负责人：{{ names(t.assigneeIds) || '等待认领' }}</text
            ><text class="helper">{{
              t.needsConfirmation ? '方案需相关参与者确认' : '准备事项，无需方案确认'
            }}</text></view
          ></view
        ></template
      ><template v-else
        ><view class="notice"
          >这里只汇总已确定的方案，不需要再投一次票。方案确定与实际预订分别展示。</view
        ><view
          v-for="conflict in data.plan.conflicts"
          :key="conflict.firstId + conflict.secondId"
          class="notice warm space-top"
          >{{ conflict.message }}</view
        ><GfState
          v-if="!days.length"
          title="行程正慢慢成形"
          description="子方案得到所有实际参与者确认后，会自动出现在这里。"
        /><view v-for="(day, index) in days" :key="day.date" class="plan-day"
          ><view class="section-heading"
            ><text>{{ day.date === '日期待安排' ? '日期待安排' : 'DAY ' + (index + 1) }}</text
            ><text class="muted">{{ day.date }}</text></view
          ><view
            v-for="p in day.items"
            :key="p.id"
            class="plan-entry"
            @tap="go('/pages/proposal/index?id=' + id + '&proposalId=' + p.id)"
            ><text class="plan-time"
              >{{ p.content.startTime || '待定'
              }}{{ p.content.endTime ? ' – ' + p.content.endTime : '' }}</text
            ><view class="card grow"
              ><view class="row between"
                ><text class="tag neutral">{{ categoryLabels[p.content.category] }}</text
                ><text class="tag">{{ execution(p) }}</text></view
              ><text class="subtitle block space-top">{{ p.content.title }}</text
              ><text class="section-copy">{{ p.content.location }}</text
              ><text class="helper"
                >{{ names(p.assigneeIds) }} 负责 · 方案 v{{ p.version }} 已确定</text
              ></view
            ></view
          ></view
        ></template
      ></template
    ></view
  ><view v-if="creating" class="sheet-backdrop" @tap.self="creating = false"
    ><view class="sheet"
      ><text class="subtitle block">新建一项分工</text
      ><view class="field space-top"
        ><text class="label">任务名称</text
        ><input v-model="title" class="input" maxlength="80" placeholder="例如：去程车票" /></view
      ><view class="field"
        ><text class="label">希望完成什么</text
        ><textarea
          v-model="brief"
          class="textarea"
          maxlength="4000"
          placeholder="写下需要安排的事"
        /></view
      ><label class="row gap"
        ><switch
          :checked="needsConfirmation"
          color="#294f40"
          @change="needsConfirmation = switchChecked($event)"
        /><text>涉及日程或共同支出，需确认方案</text></label
      ><button class="btn" :disabled="busy || !title.trim()" :loading="busy" @tap="createTask">
        创建，去认领</button
      ><button class="btn outline" :disabled="busy" @tap="creating = false">暂不创建</button></view
    ></view
  >
</template>
<style scoped>
.proposal-card {
  cursor: pointer;
}
.proposal-card .row:last-child {
  font-size: 23rpx;
}
.plan-entry {
  display: flex;
  gap: 18rpx;
  margin-bottom: 24rpx;
}
.plan-time {
  width: 85rpx;
  flex-shrink: 0;
  font-size: 22rpx;
  color: #71806b;
  padding-top: 24rpx;
}
.plan-entry .card {
  padding: 26rpx;
}
.plan-entry .subtitle {
  font-size: 29rpx;
}
.plan-entry .tag {
  font-size: 19rpx;
}
</style>
