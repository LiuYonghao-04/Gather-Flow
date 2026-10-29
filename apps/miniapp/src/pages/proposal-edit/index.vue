<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  categories,
  categoryLabels,
  proposalContentSchema,
  parseMoney,
  formatMoney,
  type Workspace,
  type Proposal,
  type ProposalContent,
} from '@gatherflow/shared';
import { api, switchChecked } from '@/services/api';
import { confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import MemberPicker from '@/components/MemberPicker.vue';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
import DraftStatus from '@/components/DraftStatus.vue';
import { useFormDraft } from '@/composables/useFormDraft';
import { proposalDraftSchema } from '@/services/form-drafts';
const title = ref(''),
  description = ref(''),
  location = ref(''),
  date = ref(''),
  start = ref(''),
  end = ref(''),
  budget = ref('');
const category = ref<ProposalContent['category']>('ACTIVITY');
const needsBooking = ref(false);
const selected = ref<string[]>([]);
const taskId = ref('');
const draft = useFormDraft(
  proposalDraftSchema,
  () => ({
    title: title.value,
    description: description.value,
    location: location.value,
    date: date.value,
    start: start.value,
    end: end.value,
    budget: budget.value,
    category: category.value,
    needsBooking: needsBooking.value,
    selected: selected.value,
    taskId: taskId.value,
  }),
  (value) => {
    title.value = value.title;
    description.value = value.description;
    location.value = value.location;
    date.value = value.date;
    start.value = value.start;
    end.value = value.end;
    budget.value = value.budget;
    category.value = value.category;
    needsBooking.value = value.needsBooking;
    selected.value = value.selected;
    taskId.value = value.taskId;
  },
);
const { id, options, data, loading, error, reload, busy, run } = useActivityPage(
  'proposal-edit',
  async (activityId, q) => {
    const workspace = await api<Workspace>(`/activities/${activityId}/workspace`);
    const proposal = q.proposalId
      ? await api<Proposal>(`/activities/${activityId}/proposals/${q.proposalId}`)
      : null;
    return { workspace, proposal };
  },
  false,
);
watch(data, (value) => {
  if (!value) return;
  const p = value.proposal;
  const c = p?.content;
  draft.open(
    `proposal:${id.value}:${p?.id ?? 'new:' + (options.value.taskId ?? '')}`,
    String(p?.version ?? 'new'),
    {
      title: c?.title ?? '',
      description: c?.description ?? '',
      location: c?.location ?? '',
      date: c?.date ?? '',
      start: c?.startTime ?? '',
      end: c?.endTime ?? '',
      budget: c?.budgetCents != null ? formatMoney(c.budgetCents) : '',
      category: c?.category ?? 'ACTIVITY',
      needsBooking: c?.needsBooking ?? false,
      selected: p?.participants.map((x) => x.id) ?? value.workspace.members.map((x) => x.id),
      taskId: p?.taskId ?? options.value.taskId ?? '',
    },
  );
});
async function save() {
  await run(async () => {
    if (!data.value) return;
    const content = proposalContentSchema.parse({
      title: title.value,
      description: description.value,
      category: category.value,
      location: location.value,
      date: date.value || null,
      startTime: start.value || null,
      endTime: end.value || null,
      budgetCents: budget.value ? parseMoney(budget.value) : null,
      needsBooking: needsBooking.value,
    });
    let p: Proposal;
    if (data.value.proposal) {
      if (
        !(await confirmAction(
          '发布新版本',
          '内容修改后，所有相关参与者都需要重新表态。旧版本和确认记录会保留。',
        ))
      )
        return;
      const input = {
        expectedVersion: data.value.proposal.version,
        content,
        taskId: taskId.value || null,
      };
      p = await api<Proposal>(
        `/activities/${id.value}/proposals/${data.value.proposal.id}/revisions`,
        'POST',
        input,
        { idempotencyKey: draft.submissionKey(input) },
      );
    } else {
      const input = {
        content,
        participantIds: selected.value,
        taskId: taskId.value || null,
      };
      p = await api<Proposal>(`/activities/${id.value}/proposals`, 'POST', input, {
        idempotencyKey: draft.submissionKey(input),
      });
    }
    draft.clear();
    uni.redirectTo({ url: `/pages/proposal/index?id=${id.value}&proposalId=${p.id}` });
  });
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="
        '/pages/proposal-edit/index?id=' +
        id +
        (options.proposalId ? '&proposalId=' + options.proposalId : '') +
        (options.taskId ? '&taskId=' + options.taskId : '')
      "
    /><view class="header"
      ><text class="eyebrow">LEAVE ROOM FOR EVERYONE</text
      ><text class="title">{{ options.proposalId ? '把方案再完善一点' : '提一个新想法' }}</text
      ><text class="muted">写清楚这次安排，留出继续商量的空间。</text></view
    ><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view v-if="data.workspace.status === 'ARCHIVED'" class="notice"
        >活动已归档，不能新增或修改方案。</view
      ><template v-else
        ><DraftStatus :status="draft.status.value" :busy="busy" @discard="draft.discard" /><view
          class="field"
          ><text class="label">方案名称</text
          ><input
            v-model="title"
            id="proposal-title"
            class="input"
            maxlength="80"
            placeholder="例如：周六去山里走走" /></view
        ><view class="field"
          ><text class="label">我们在商量什么</text
          ><view class="chips"
            ><button
              v-for="kind in categories"
              :key="kind"
              class="chip"
              :class="{ selected: category === kind }"
              @tap="category = kind"
            >
              {{ categoryLabels[kind] }}
            </button></view
          ></view
        ><view class="field"
          ><text class="label">想法与安排</text
          ><textarea
            v-model="description"
            class="textarea"
            maxlength="4000"
            placeholder="路线、集合方式，或还需要大家商量的地方"
          /></view
        ><view class="field"
          ><text class="label">地点（选填）</text
          ><input
            v-model="location"
            class="input"
            maxlength="200"
            placeholder="写下地点或集合位置" /></view
        ><view class="field"
          ><text class="label">日期（选填）</text
          ><picker mode="date" :value="date" @change="date = $event.detail.value"
            ><view class="input picker-value">{{ date || '选择日期' }}</view></picker
          ><button
            v-if="date"
            class="btn text-btn"
            @tap="
              date = '';
              start = '';
              end = '';
            "
          >
            暂不确定日期
          </button></view
        ><view v-if="date" class="field"
          ><text class="label">开始与结束时间（选填）</text
          ><view class="row gap"
            ><picker class="grow" mode="time" :value="start" @change="start = $event.detail.value"
              ><view class="input picker-value">{{ start || '开始时间' }}</view></picker
            ><picker class="grow" mode="time" :value="end" @change="end = $event.detail.value"
              ><view class="input picker-value">{{ end || '结束时间' }}</view></picker
            ></view
          ><button
            v-if="start || end"
            class="btn text-btn"
            @tap="
              start = '';
              end = '';
            "
          >
            清除时间</button
          ><text class="helper">交通结束时间填写预计抵达时间。跨日行程请拆成两段。</text></view
        ><view class="field"
          ><text class="label">预计总预算（元，选填）</text
          ><input v-model="budget" class="input" type="digit" placeholder="0.00" /><text
            class="helper"
            >预算供协商参考，实际发生后另记账单。</text
          ></view
        ><view class="field"
          ><label class="row gap"
            ><switch
              :checked="needsBooking"
              color="#294f40"
              @change="needsBooking = switchChecked($event)"
            /><text>需要购票或预订</text></label
          ></view
        ><view v-if="!data.proposal?.taskId" class="field"
          ><text class="label">关联任务（选填）</text
          ><view class="chips"
            ><button class="chip" :class="{ selected: !taskId }" @tap="taskId = ''">独立提案</button
            ><button
              v-for="t in data.workspace.tasks.filter((x) =>
                x.assigneeIds.includes(data?.workspace.currentUserId ?? ''),
              )"
              :key="t.id"
              class="chip"
              :class="{ selected: taskId === t.id }"
              @tap="taskId = t.id"
            >
              {{ t.title }}
            </button></view
          ><text v-if="needsBooking && !taskId" class="helper"
            >需要上传预订凭证时，请先创建并认领任务，再回到这里关联任务并发布新版本。</text
          ></view
        ><view class="field"
          ><text class="label">这次方案与谁有关</text
          ><MemberPicker
            v-model="selected"
            :members="data.workspace.members"
            :disabled="!!data.proposal"
          /><text class="helper"
            >发布后保留这组参与者。更换参与范围请另提新方案；退出由本人或房主明确记录。</text
          ></view
        ><button
          id="proposal-save"
          class="btn"
          :disabled="busy || !title.trim() || !selected.length"
          :loading="busy"
          @tap="save"
        >
          {{ data.proposal ? '发布新版本，重新商量' : '发布，邀请大家商量' }}
        </button></template
      ></template
    ></view
  >
</template>
