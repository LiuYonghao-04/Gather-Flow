<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Workspace, Expense, ExpenseInput, Evidence } from '@gatherflow/shared';
import { api } from '@/services/api';
import { confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import ExpenseForm from '@/components/ExpenseForm.vue';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
const taskId = ref(''),
  evidenceIds = ref<string[]>([]);
const { id, options, userId, data, loading, error, reload, busy, run } = useActivityPage(
  'expense-edit',
  async (activityId, q) => {
    const [workspace, evidence, expense] = await Promise.all([
      api<Workspace>(`/activities/${activityId}/workspace`),
      api<Evidence[]>(`/activities/${activityId}/evidence`),
      q.expenseId
        ? api<Expense>(`/activities/${activityId}/expenses/${q.expenseId}`)
        : Promise.resolve(null),
    ]);
    return { workspace, evidence, expense };
  },
  false,
);
watch(data, (d) => {
  if (d) {
    taskId.value = d.expense?.taskId ?? options.value.taskId ?? '';
    evidenceIds.value = d.expense?.evidenceIds ?? [];
  }
});
function chooseTask(value: string) {
  taskId.value = value;
  evidenceIds.value = [];
}
function toggleEvidence(value: string) {
  evidenceIds.value = evidenceIds.value.includes(value)
    ? evidenceIds.value.filter((x) => x !== value)
    : [...evidenceIds.value, value];
}
async function save(input: ExpenseInput) {
  await run(async () => {
    if (!data.value) return;
    let expense: Expense;
    if (data.value.expense) {
      if (
        !(await confirmAction(
          '保存新的账单版本？',
          '此前确认将失效，需要另一位相关分摊成员重新确认；未撤销异议会继续保留。',
        ))
      )
        return;
      expense = await api<Expense>(
        `/activities/${id.value}/expenses/${data.value.expense.id}/revisions`,
        'POST',
        {
          expectedRevision: data.value.expense.revision,
          input: { ...input, taskId: taskId.value || null },
        },
      );
    } else {
      expense = await api<Expense>(`/activities/${id.value}/expenses`, 'POST', {
        ...input,
        taskId: taskId.value || null,
      });
    }
    uni.redirectTo({ url: `/pages/expense/index?id=${id.value}&expenseId=${expense.id}` });
  });
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="
        '/pages/expense-edit/index?id=' +
        id +
        (options.expenseId ? '&expenseId=' + options.expenseId : '')
      " /><view class="header"
      ><text class="eyebrow">KEEP IT CLEAR</text
      ><text class="title">{{ options.expenseId ? '把这笔账核对好' : '记下一笔共同支出' }}</text
      ><text class="muted">选择实际分摊的人，让每一分都有来处。</text></view
    ><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view
        v-if="
          data.workspace.status !== 'ACTIVE' ||
          data.workspace.financialFrozen ||
          (data.expense && data.expense.recorderId !== userId)
        "
        class="notice"
        >{{
          data.workspace.status !== 'ACTIVE'
            ? '活动已归档，账单只读。'
            : data.workspace.financialFrozen
              ? '最终清算已冻结，不能新增或修改账单。请返回活动查看最终清算。'
              : '这笔账只能由原记账人修改；如有疑问，请在详情中提出异议。'
        }}</view
      ><template v-else
        ><view class="field"
          ><text class="label">关联任务（选填）</text
          ><view class="chips"
            ><button
              class="chip"
              :class="{ selected: !taskId }"
              :disabled="busy"
              @tap="chooseTask('')"
            >
              不关联</button
            ><button
              v-for="t in data.workspace.tasks"
              :key="t.id"
              class="chip"
              :class="{ selected: taskId === t.id }"
              :disabled="busy"
              @tap="chooseTask(t.id)"
            >
              {{ t.title }}
            </button></view
          ></view
        ><view v-if="data.evidence.some((x) => !taskId || x.taskId === taskId)" class="field"
          ><text class="label">关联已有凭证（无需重复上传）</text
          ><view class="chips"
            ><button
              v-for="e in data.evidence.filter((x) => !taskId || x.taskId === taskId)"
              :key="e.id"
              class="chip"
              :class="{ selected: evidenceIds.includes(e.id) }"
              :disabled="busy"
              @tap="toggleEvidence(e.id)"
            >
              {{ evidenceIds.includes(e.id) ? '✓ ' : ''
              }}{{ e.caption || '凭证 · ' + e.uploader.name }}
            </button></view
          ></view
        ><ExpenseForm
          :members="data.workspace.members"
          :user-id="userId"
          :initial="data.expense ?? undefined"
          :task-id="taskId || null"
          :evidence-ids="evidenceIds"
          :busy="busy"
          :submit-label="data.expense ? '保存新版账单' : '保存账单，等待确认'"
          @save="save" /></template></template
  ></view>
</template>
