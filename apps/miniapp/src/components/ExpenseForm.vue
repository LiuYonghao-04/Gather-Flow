<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  parseMoney,
  formatMoney,
  splitEqually,
  expenseInputSchema,
  type User,
  type ExpenseInput,
} from '@gatherflow/shared';
import { showError } from '@/services/api';
import MemberPicker from './MemberPicker.vue';
const props = defineProps<{
  members: User[];
  userId: string;
  initial?: ExpenseInput;
  taskId?: string | null;
  evidenceIds?: string[];
  busy?: boolean;
  submitLabel?: string;
}>();
const emit = defineEmits<{ save: [input: ExpenseInput] }>();
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
      taskId: props.initial?.taskId ?? props.taskId ?? null,
      evidenceIds: props.evidenceIds ?? props.initial?.evidenceIds ?? [],
    });
    emit('save', input);
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
    ><view class="field"
      ><text class="label">这笔钱用在了哪里</text
      ><input
        v-model="description"
        class="input"
        maxlength="120"
        placeholder="例如：去山里的高铁票"
        :disabled="busy" /></view
    ><view class="field"
      ><text class="label">总金额（元）</text
      ><input
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
    ><button class="btn" :loading="busy" :disabled="busy" @tap="save">
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
