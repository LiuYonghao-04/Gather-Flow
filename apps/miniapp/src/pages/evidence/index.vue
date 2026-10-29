<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Workspace, Evidence, ExpenseInput, Expense } from '@gatherflow/shared';
import { api, go, switchChecked } from '@/services/api';
import { choosePhoto, uploadPhoto, confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
import EvidenceList from '@/components/EvidenceList.vue';
import ExpenseForm from '@/components/ExpenseForm.vue';
const selectedProposal = ref(''),
  caption = ref(''),
  pendingPhoto = ref(''),
  recordExpense = ref(false),
  linkedIds = ref<string[]>([]),
  uploaded = ref<Evidence[]>([]),
  savedExpenseId = ref('');
const expenseForm = ref<InstanceType<typeof ExpenseForm> | null>(null);
const { id, options, userId, data, loading, error, reload, busy, run } = useActivityPage(
  'evidence',
  async (activityId) => {
    const [workspace, evidence] = await Promise.all([
      api<Workspace>(`/activities/${activityId}/workspace`),
      api<Evidence[]>(`/activities/${activityId}/evidence`),
    ]);
    return { workspace, evidence };
  },
  false,
);
let initializedFor = '';
watch(data, (d) => {
  if (d && initializedFor !== id.value + ':' + userId.value) {
    initializedFor = id.value + ':' + userId.value;
    selectedProposal.value = options.value.proposalId ?? '';
    uploaded.value = [];
    linkedIds.value = [];
    savedExpenseId.value = '';
  }
});
const task = computed(() => data.value?.workspace.tasks.find((x) => x.id === options.value.taskId));
const proposals = computed(
  () => data.value?.workspace.proposals.filter((x) => x.taskId === task.value?.id) ?? [],
);
const proposal = computed(() => proposals.value.find((x) => x.id === selectedProposal.value));
const evidence = computed(() => [
  ...new Map(
    [...uploaded.value, ...(data.value?.evidence ?? [])]
      .filter((x) => x.taskId === task.value?.id)
      .map((x) => [x.id, x]),
  ).values(),
]);
const editable = computed(
  () => data.value?.workspace.status === 'ACTIVE' && task.value?.assigneeIds.includes(userId.value),
);
async function upload() {
  await run(async () => {
    if (!task.value) return;
    if (!pendingPhoto.value) pendingPhoto.value = (await choosePhoto()) ?? '';
    if (!pendingPhoto.value) return;
    const form: Record<string, string> = { taskId: task.value.id, caption: caption.value };
    if (proposal.value) {
      form.proposalId = proposal.value.id;
      form.expectedVersion = String(proposal.value.version);
    }
    const e = await uploadPhoto(id.value, pendingPhoto.value, form);
    uploaded.value.unshift(e);
    linkedIds.value.push(e.id);
    pendingPhoto.value = '';
    caption.value = '';
    uni.showToast({ title: '凭证已保存', icon: 'success' });
  });
}
async function markBooked() {
  await run(async () => {
    if (
      !proposal.value ||
      !(await confirmAction(
        '登记已预订？',
        '凭证供活动成员查阅，不代表系统验证了支付。登记后将锁定本版方案。',
      ))
    )
      return;
    await api(`/activities/${id.value}/proposals/${proposal.value.id}/execution`, 'POST', {
      expectedVersion: proposal.value.version,
      execution: 'BOOKED',
    });
    if (data.value) {
      data.value.workspace = await api<Workspace>(`/activities/${id.value}/workspace`);
      data.value = { ...data.value };
    }
    uni.showToast({ title: '已登记预订', icon: 'success' });
  });
}
async function saveExpense(input: ExpenseInput, requestKey?: string) {
  await run(async () => {
    const expense = await api<Expense>(`/activities/${id.value}/expenses`, 'POST', input, {
      idempotencyKey: requestKey,
    });
    expenseForm.value?.clearDraft();
    savedExpenseId.value = expense.id;
    recordExpense.value = false;
    uni.showToast({ title: '账单已保存', icon: 'success' });
  });
}
function toggle(id: string) {
  linkedIds.value = linkedIds.value.includes(id)
    ? linkedIds.value.filter((x) => x !== id)
    : [...linkedIds.value, id];
}
async function refreshContext() {
  await run(async () => {
    const [workspace, evidence] = await Promise.all([
      api<Workspace>(`/activities/${id.value}/workspace`),
      api<Evidence[]>(`/activities/${id.value}/evidence`),
    ]);
    data.value = { workspace, evidence };
    uni.showToast({ title: '已更新任务和方案', icon: 'success' });
  });
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="
        '/pages/evidence/index?id=' +
        id +
        '&taskId=' +
        options.taskId +
        (options.proposalId ? '&proposalId=' + options.proposalId : '')
      "
    /><view class="header"
      ><text class="eyebrow">A RECORD WE CAN RETURN TO</text
      ><text class="title">把预订，好好留存</text
      ><text class="muted">上传一次，任务和账单都能查到这份凭证。</text></view
    ><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><button class="btn text-btn" :disabled="busy" @tap="refreshContext">刷新任务与方案</button
      ><GfState
        v-if="!task"
        title="找不到关联任务"
        description="请从任务详情进入凭证页面。"
      /><template v-else
        ><view class="notice"
          >关联任务：{{
            task.title
          }}。凭证仅活动成员可查看，不验证订单或支付真假。演示请使用虚构图片。</view
        ><template v-if="editable"
          ><view class="field space-top"
            ><text class="label">关联哪个方案</text
            ><view class="chips"
              ><button
                class="chip"
                :class="{ selected: !selectedProposal }"
                :disabled="busy"
                @tap="selectedProposal = ''"
              >
                仅关联任务</button
              ><button
                v-for="p in proposals"
                :key="p.id"
                class="chip"
                :class="{ selected: selectedProposal === p.id }"
                :disabled="busy"
                @tap="selectedProposal = p.id"
              >
                {{ p.content.title }} · v{{ p.version }}
              </button></view
            ><text class="helper">要登记“已预订”，凭证需关联当前版本的方案。</text></view
          ><view class="field"
            ><text class="label">凭证说明（选填）</text
            ><input
              v-model="caption"
              class="input"
              maxlength="300"
              :disabled="busy"
              placeholder="例如：去程四人的订单截图（演示）" /></view
          ><button class="btn" :disabled="busy" :loading="busy" @tap="upload">
            {{ pendingPhoto ? '重试上传这张图片' : '拍照 / 从相册选择并上传' }}</button
          ><button
            v-if="pendingPhoto"
            class="btn text-btn"
            :disabled="busy"
            @tap="pendingPhoto = ''"
          >
            换一张图片</button
          ><text class="helper"
            >单张不超过 5 MB，支持 JPG / PNG / WebP。上传后移除图片附带的位置信息。</text
          ><button
            v-if="
              proposal &&
              proposal.status === 'CONFIRMED' &&
              !['BOOKED', 'DONE'].includes(proposal.execution)
            "
            class="btn secondary space-top"
            :disabled="
              busy ||
              !evidence.some(
                (x) => x.proposalId === proposal?.id && x.proposalVersion === proposal?.version,
              )
            "
            @tap="markBooked"
          >
            已有凭证，登记已预订</button
          ><text
            v-if="proposal?.execution === 'BOOKED' || proposal?.execution === 'DONE'"
            class="notice block space-top"
            >{{ proposal.execution === 'BOOKED' ? '本版方案已登记预订' : '本版方案已执行' }}</text
          ></template
        ><view class="section-heading"
          ><text>任务凭证</text><text class="muted">{{ evidence.length }} 份</text></view
        ><EvidenceList :items="evidence" :activity-id="id" /><template
          v-if="editable && !data.workspace.financialFrozen && !savedExpenseId"
          ><view class="divider" /><label class="row gap"
            ><switch
              :checked="recordExpense"
              color="#294f40"
              :disabled="busy"
              @change="recordExpense = switchChecked($event)"
            /><text class="subtitle">顺手把这笔费用记上</text></label
          ><template v-if="recordExpense"
            ><view v-if="evidence.length" class="field space-top"
              ><text class="label">选择关联凭证</text
              ><view class="chips"
                ><button
                  v-for="e in evidence"
                  :key="e.id"
                  class="chip"
                  :class="{ selected: linkedIds.includes(e.id) }"
                  :disabled="busy"
                  @tap="toggle(e.id)"
                >
                  {{ linkedIds.includes(e.id) ? '✓ ' : ''
                  }}{{ e.caption || '凭证 · ' + e.uploader.name }}
                </button></view
              ></view
            ><ExpenseForm
              id="expense-form"
              ref="expenseForm"
              :draft-key="'expense-inline:' + id + ':' + task.id"
              class="space-top"
              :members="data.workspace.members"
              :user-id="userId"
              :task-id="task.id"
              :evidence-ids="linkedIds"
              :busy="busy"
              @restore-links="linkedIds = $event.evidenceIds"
              @save="saveExpense" /></template></template
        ><view v-if="savedExpenseId" class="notice space-top"
          >账单已保存，等待相关分摊成员确认。<button
            class="btn secondary compact space-top"
            @tap="go('/pages/expense/index?id=' + id + '&expenseId=' + savedExpenseId)"
          >
            查看这笔账
          </button></view
        ><button
          class="btn text-btn space-top"
          @tap="go('/pages/task/index?id=' + id + '&taskId=' + task.id)"
        >
          回到关联任务
        </button></template
      ></template
    ></view
  >
</template>
