<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  parseMoney,
  formatMoney,
  splitEqually,
  expenseInputSchema,
  canonicalJson,
  type User,
  type ExpenseInput,
} from '@gatherflow/shared';
import { showError } from '@/services/api';
import MemberPicker from './MemberPicker.vue';
import DraftStatus from './DraftStatus.vue';
import { useFormDraft } from '@/composables/useFormDraft';
import { expenseDraftSchema } from '@/services/form-drafts';
const props = defineProps<{
  members: User[];
  userId: string;
  initial?: ExpenseInput;
  taskId?: string | null;
  evidenceIds?: string[];
  busy?: boolean;
  submitLabel?: string;
  draftKey?: string;
  expectedRevision?: number;
}>();
const emit = defineEmits<{
  save: [input: ExpenseInput, requestKey?: string];
  restoreLinks: [links: { taskId: string | null; evidenceIds: string[] }];
}>();
const description = ref(props.initial?.description ?? '');
const total = ref(props.initial ? formatMoney(props.initial.totalCents) : '');
const payer = ref(props.initial?.payerId ?? props.userId);
const selected = ref(props.initial?.shares.map((x) => x.userId) ?? props.members.map((x) => x.id));
const mode = ref<'EQUAL' | 'CUSTOM'>(props.initial?.splitMode ?? 'EQUAL');
const custom = ref<Record<string, string>>(
  Object.fromEntries(
    props.initial?.shares.map((x) => [x.userId, formatMoney(x.amountCents)]) ?? [],
  ),
);
const date = ref(props.initial?.date ?? localDate());
const category = ref<ExpenseInput['category']>(props.initial?.category ?? 'OTHER');
const linkedTask = ref(props.taskId !== undefined ? props.taskId : (props.initial?.taskId ?? null));
const linkedEvidence = ref([...(props.evidenceIds ?? props.initial?.evidenceIds ?? [])]);
const currentTask = () => linkedTask.value;
const currentEvidence = () => linkedEvidence.value;
watch(
  () => [props.taskId, props.evidenceIds],
  () => {
    const task = props.taskId !== undefined ? props.taskId : (props.initial?.taskId ?? null);
    const evidence = props.evidenceIds ?? props.initial?.evidenceIds ?? [];
    if (linkedTask.value !== task) linkedTask.value = task;
    if (canonicalJson(linkedEvidence.value) !== canonicalJson(evidence))
      linkedEvidence.value = [...evidence];
  },
  { deep: true, flush: 'post' },
);
const draft = useFormDraft(
  expenseDraftSchema,
  () => ({
    description: description.value,
    total: total.value,
    payer: payer.value,
    selected: selected.value,
    mode: mode.value,
    custom: custom.value,
    date: date.value,
    category: category.value,
    taskId: currentTask(),
    evidenceIds: currentEvidence(),
  }),
  (value) => {
    description.value = value.description;
    total.value = value.total;
    payer.value = value.payer;
    selected.value = value.selected;
    mode.value = value.mode;
    custom.value = value.custom;
    date.value = value.date;
    category.value = value.category;
    linkedTask.value = value.taskId;
    linkedEvidence.value = [...value.evidenceIds];
    if (
      value.taskId !== props.taskId ||
      canonicalJson(value.evidenceIds) !== canonicalJson(props.evidenceIds ?? [])
    )
      emit('restoreLinks', { taskId: value.taskId, evidenceIds: value.evidenceIds });
  },
);
watch(
  () => props.draftKey,
  (key) => {
    if (key)
      draft.open(key, String(props.expectedRevision ?? 'new'), {
        description: props.initial?.description ?? '',
        total: props.initial ? formatMoney(props.initial.totalCents) : '',
        payer: props.initial?.payerId ?? props.userId,
        selected: props.initial?.shares.map((x) => x.userId) ?? props.members.map((x) => x.id),
        mode: props.initial?.splitMode ?? 'EQUAL',
        custom: Object.fromEntries(
          props.initial?.shares.map((x) => [x.userId, formatMoney(x.amountCents)]) ?? [],
        ),
        date: props.initial?.date ?? localDate(),
        category: props.initial?.category ?? 'OTHER',
        taskId: currentTask(),
        evidenceIds: currentEvidence(),
      });
  },
  { immediate: true },
);
defineExpose({ clearDraft: draft.clear });
const kinds: { key: ExpenseInput['category']; label: string }[] = [
  { key: 'TRANSPORT', label: '交通' },
  { key: 'STAY', label: '住宿' },
  { key: 'MEAL', label: '餐饮' },
  { key: 'TICKET', label: '门票' },
  { key: 'OTHER', label: '其他' },
];
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const totalCents = computed(() => {
  try {
    return parseMoney(total.value);
  } catch {
    return 0;
  }
});
const equal = computed(() => {
  try {
    return splitEqually(totalCents.value, selected.value);
  } catch {
    return [];
  }
});
const remainder = computed(() => {
  try {
    return (
      totalCents.value -
      selected.value.reduce((sum, id) => sum + parseMoney(custom.value[id] || '0'), 0)
    );
  } catch {
    return null;
  }
});
function setMode(next: 'EQUAL' | 'CUSTOM') {
  if (next === 'CUSTOM' && mode.value === 'EQUAL')
    custom.value = Object.fromEntries(
      equal.value.map((s) => [s.userId, formatMoney(s.amountCents)]),
    );
  mode.value = next;
}
function save() {
  try {
    const input = expenseInputSchema.parse({
      description: description.value,
      category: category.value,
      date: date.value,
      totalCents: parseMoney(total.value),
      payerId: payer.value,
      splitMode: mode.value,
      shares:
        mode.value === 'EQUAL'
          ? equal.value
          : selected.value.map((userId) => ({
              userId,
              amountCents: parseMoney(custom.value[userId] || '0'),
            })),
      taskId: currentTask(),
      evidenceIds: currentEvidence(),
    });
    const payload = props.expectedRevision
      ? { expectedRevision: props.expectedRevision, input }
      : input;
    emit('save', input, props.draftKey ? draft.submissionKey(payload) : undefined);
  } catch (error) {
    showError(
      error instanceof Error && 'issues' in error
        ? new Error('请检查必填项、日期与分摊合计')
        : error,
    );
  }
}
</script>
<template>
  <view class="form-stack"
    ><DraftStatus :status="draft.status.value" :busy="busy" @discard="draft.discard" /><view
      class="field"
      ><text class="label">这笔钱用在了哪里</text
      ><input
        id="expense-description"
        v-model="description"
        class="input"
        maxlength="120"
        placeholder="例如：去山里的高铁票"
        :disabled="busy" /></view
    ><view class="field"
      ><text class="label">总金额（元）</text
      ><input
        id="expense-total"
        v-model="total"
        class="input money-input"
        type="digit"
        placeholder="0.00"
        :disabled="busy"
      /><text class="helper">最多两位小数，金额以分保存。</text></view
    ><view class="field"
      ><text class="label">分类</text
      ><view class="chips"
        ><button
          v-for="kind in kinds"
          :key="kind.key"
          class="chip"
          :class="{ selected: category === kind.key }"
          :disabled="busy"
          @tap="category = kind.key"
        >
          {{ kind.label }}
        </button></view
      ></view
    ><view class="field"
      ><text class="label">消费日期</text
      ><picker mode="date" :value="date" :disabled="busy" @change="date = $event.detail.value"
        ><view class="input picker-value">{{ date }}</view></picker
      ></view
    ><view class="field"
      ><text class="label">谁实际付了钱</text
      ><view class="chips"
        ><button
          v-for="m in members"
          :key="m.id"
          class="chip"
          :class="{ selected: payer === m.id }"
          :disabled="busy"
          @tap="payer = m.id"
        >
          {{ m.name }}
        </button></view
      ><text class="helper">记账人是你，付款人可以是另一位朋友。</text></view
    ><view class="field"
      ><text class="label">哪些人参与分摊</text
      ><MemberPicker v-model="selected" :members="members" :disabled="busy" /><view
        class="pill-tabs"
        ><button
          class="pill-tab"
          :class="{ active: mode === 'EQUAL' }"
          :disabled="busy"
          @tap="setMode('EQUAL')"
        >
          平均分摊</button
        ><button
          class="pill-tab"
          :class="{ active: mode === 'CUSTOM' }"
          :disabled="busy"
          @tap="setMode('CUSTOM')"
        >
          自定义金额
        </button></view
      ><view
        v-for="m in members.filter((x) => selected.includes(x.id))"
        :key="m.id"
        class="row between list-row gap"
        ><text>{{ m.name }}</text
        ><text v-if="mode === 'EQUAL'" class="amount"
          >¥ {{ formatMoney(equal.find((x) => x.userId === m.id)?.amountCents ?? 0) }}</text
        ><input
          v-else
          v-model="custom[m.id]"
          class="input share-input"
          type="digit"
          placeholder="0.00"
          :disabled="busy" /></view
      ><text v-if="mode === 'EQUAL'" class="helper"
        >不能整除的分，按成员 ID 排序依次分配；每人的实际金额如上。</text
      ><text v-else class="helper" :class="{ error: remainder !== 0 }">{{
        remainder === null
          ? '请检查输入金额'
          : remainder === 0
            ? '合计正确，每一分都对上了'
            : '与总金额相差 ¥ ' + formatMoney(remainder)
      }}</text></view
    ><view class="notice"
      >账单需要由你以外的一位相关分摊成员确认。有异议的账单会暂停计入预计结算。</view
    ><button id="expense-save" class="btn" :loading="busy" :disabled="busy" @tap="save">
      {{ submitLabel || '保存账单' }}
    </button></view
  >
</template>
<style scoped>
.money-input {
  font-size: 42rpx;
  height: 110rpx;
}
.share-input {
  width: 230rpx;
  text-align: right;
}
.form-stack > .btn {
  margin-top: 30rpx;
}
</style>
