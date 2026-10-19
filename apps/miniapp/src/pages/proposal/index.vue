<script setup lang="ts">
defineOptions({ inheritAttrs: false });
import { computed, ref } from 'vue';
import {
  categoryLabels,
  responseLabels,
  formatMoney,
  type Proposal,
  type Workspace,
  type ProposalResponse,
} from '@gatherflow/shared';
import { api, go, formatTime } from '@/services/api';
import { confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
const { id, options, userId, data, loading, error, reload, busy, run } = useActivityPage(
  'proposal',
  async (activityId, q) => {
    const [workspace, proposal] = await Promise.all([
      api<Workspace>(`/activities/${activityId}/workspace`),
      api<Proposal>(`/activities/${activityId}/proposals/${q.proposalId}`),
    ]);
    return { workspace, proposal };
  },
);
const responseTarget = ref(''),
  responseSheet = ref(false),
  reason = ref(''),
  comment = ref(''),
  preferenceNote = ref(''),
  history = ref(false);
const preferenceKind = ref<'PREFER' | 'ONLY'>('PREFER');
const active = computed(() => data.value?.workspace.status === 'ACTIVE');
const unlocked = computed(
  () =>
    active.value &&
    data.value?.proposal.status !== 'STALE' &&
    !['BOOKED', 'DONE'].includes(data.value?.proposal.execution ?? ''),
);
const canRespond = computed(
  () => unlocked.value && data.value?.proposal.participants.some((m) => m.id === userId.value),
);
function name(value: string) {
  return data.value?.workspace.members.find((x) => x.id === value)?.name ?? value;
}
function response(user: string, version?: number) {
  return data.value?.proposal.responses.find(
    (x) => x.userId === user && x.version === (version ?? data.value?.proposal.version),
  );
}
function action(path: string, body: object, after?: () => void) {
  return run(async () => {
    await api(`/activities/${id.value}/proposals/${options.value.proposalId}${path}`, 'POST', body);
    after?.();
    await reload();
  });
}
async function respond(value: ProposalResponse, target = userId.value) {
  if (!data.value) return;
  if (
    value === 'OPT_OUT' &&
    !(await confirmAction(
      '这次不参加？',
      '只退出本次方案，不会退出活动，也不会改变已经发生的消费分摊。',
    ))
  )
    return;
  if (
    target !== userId.value &&
    !(await confirmAction(
      '由房主代为操作？',
      `将记录你代 ${name(target)} ${responseLabels[value]}，本人可以在方案锁定前更正。`,
    ))
  )
    return;
  await action(
    '/responses',
    {
      expectedVersion: data.value.proposal.version,
      userId: target,
      response: value,
      reason: reason.value,
    },
    () => {
      responseSheet.value = false;
      reason.value = '';
    },
  );
}
function openNotConfirm(target = userId.value) {
  responseTarget.value = target;
  reason.value = '';
  responseSheet.value = true;
}
async function execute(execution: 'BOOKED' | 'DONE') {
  if (!data.value) return;
  if (
    await confirmAction(
      execution === 'BOOKED' ? '登记为已预订？' : '登记为已执行？',
      '执行记录将锁定本方案内容。系统仅留存凭证与负责人声明，不判断支付或订单真实性。',
    )
  )
    await action('/execution', { expectedVersion: data.value.proposal.version, execution });
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="'/pages/proposal/index?id=' + id + '&proposalId=' + options.proposalId"
    /><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view class="header"
        ><view class="row between"
          ><text class="eyebrow"
            >{{ categoryLabels[data.proposal.content.category] }} · VERSION
            {{ data.proposal.version }}</text
          ><text class="tag" :class="{ pending: data.proposal.status !== 'CONFIRMED' }">{{
            data.proposal.status === 'CONFIRMED'
              ? '方案已确定'
              : data.proposal.status === 'STALE'
                ? '任务变更，待更新'
                : '继续协商中'
          }}</text></view
        ><text class="title">{{ data.proposal.content.title }}</text
        ><text class="muted"
          >{{ name(data.proposal.authorId) }} 提出 · {{ formatTime(data.proposal.createdAt) }}</text
        ></view
      ><view class="card"
        ><text class="preline block">{{
          data.proposal.content.description || '先有一个想法，细节可以继续补充。'
        }}</text
        ><view class="divider" /><view class="facts"
          ><text>日期</text><text>{{ data.proposal.content.date || '一起商量' }}</text
          ><text>时间</text
          ><text>{{
            [data.proposal.content.startTime, data.proposal.content.endTime]
              .filter(Boolean)
              .join(' – ') || '待定'
          }}</text
          ><text>地点</text><text>{{ data.proposal.content.location || '待定' }}</text
          ><text>预算</text
          ><text>{{
            data.proposal.content.budgetCents !== null
              ? '¥ ' + formatMoney(data.proposal.content.budgetCents)
              : '尚未填写'
          }}</text
          ><text>执行</text
          ><text>{{
            data.proposal.execution === 'BOOKED'
              ? '实际已预订'
              : data.proposal.execution === 'DONE'
                ? '已执行'
                : data.proposal.content.needsBooking
                  ? '尚未预订'
                  : '待执行'
          }}</text></view
        ><button
          v-if="data.proposal.taskId"
          class="btn text-btn space-top"
          @tap="go('/pages/task/index?id=' + id + '&taskId=' + data.proposal.taskId)"
        >
          关联任务 · {{ data.proposal.assigneeIds.map(name).join('、') }} 负责 ›
        </button></view
      ><view v-if="data.proposal.status === 'STALE'" class="notice warm space-top"
        >关联任务的正式内容已更新。请负责人发布新的方案版本，再邀请大家确认。</view
      ><view v-if="active && data.proposal.assigneeIds.includes(userId)" class="actions"
        ><button
          v-if="!['BOOKED', 'DONE'].includes(data.proposal.execution)"
          class="btn outline compact"
          @tap="go('/pages/proposal-edit/index?id=' + id + '&proposalId=' + data.proposal.id)"
        >
          完善方案 / 发新版</button
        ><button
          v-if="data.proposal.taskId"
          class="btn secondary compact"
          @tap="
            go(
              '/pages/evidence/index?id=' +
                id +
                '&taskId=' +
                data.proposal.taskId +
                '&proposalId=' +
                data.proposal.id,
            )
          "
        >
          凭证与记账
        </button></view
      ><view
        v-if="
          active &&
          data.proposal.assigneeIds.includes(userId) &&
          data.proposal.status === 'CONFIRMED' &&
          data.proposal.execution !== 'DONE'
        "
        class="actions"
        ><button
          v-if="
            data.proposal.execution !== 'BOOKED' &&
            data.proposal.taskId &&
            data.proposal.content.needsBooking
          "
          class="btn secondary compact"
          :disabled="busy"
          @tap="execute('BOOKED')"
        >
          登记已预订</button
        ><button class="btn outline compact" :disabled="busy" @tap="execute('DONE')">
          登记已执行
        </button></view
      ><view class="section-heading"
        ><text>相关参与者的决定</text
        ><text class="muted">共 {{ data.proposal.participants.length }} 人</text></view
      ><view class="notice"
        >所有未退出的参与者都确认，且没有未解决异议，方案才确定。没有多数通过或超时默认同意。</view
      ><view v-for="m in data.proposal.participants" :key="m.id" class="list-row"
        ><view class="row between gap"
          ><text>{{ m.name }}{{ m.id === userId ? ' · 我' : '' }}</text
          ><text
            class="tag"
            :class="{ danger: response(m.id)?.response === 'OBJECTION', neutral: !response(m.id) }"
            >{{ response(m.id) ? responseLabels[response(m.id)!.response] : '等待表态' }}</text
          ></view
        ><text v-if="response(m.id)?.reason" class="helper preline">{{
          response(m.id)?.reason
        }}</text
        ><text v-if="response(m.id) && response(m.id)?.actorId !== m.id" class="helper"
          >由房主 {{ name(response(m.id)!.actorId) }} 代 {{ m.name }} 操作</text
        ><view
          v-if="
            unlocked &&
            data.workspace.ownerId === userId &&
            m.id !== userId &&
            response(m.id)?.response !== 'OBJECTION'
          "
          class="actions"
          ><button class="btn text-btn" :disabled="busy" @tap="respond('CONFIRM', m.id)">
            代确认</button
          ><button class="btn text-btn" :disabled="busy" @tap="respond('OPT_OUT', m.id)">
            代本次不参加
          </button></view
        ></view
      ><view v-if="canRespond" class="actions"
        ><button class="btn" :disabled="busy" :loading="busy" @tap="respond('CONFIRM')">
          确认参加</button
        ><button class="btn outline" :disabled="busy" @tap="openNotConfirm()">不确认</button></view
      ><text v-else-if="!unlocked" class="helper">{{
        data.workspace.status === 'ARCHIVED'
          ? '活动已归档，仅供查看'
          : data.proposal.status === 'STALE'
            ? '等待新版方案后再表态'
            : '已有预订或执行留存，原确认已锁定；变更请另提补充方案'
      }}</text
      ><view class="section-heading"
        ><text>倾向与限制</text><text class="muted">帮助理解彼此</text></view
      ><view
        v-for="p in data.proposal.preferences.filter((x) => x.version === data?.proposal.version)"
        :key="p.userId"
        class="list-row"
        ><text class="tag neutral"
          >{{ name(p.userId) }} · {{ p.kind === 'ONLY' ? '只能这样' : '更倾向这样' }}</text
        ><text class="block preline space-top">{{ p.note }}</text></view
      ><template v-if="active"
        ><view class="pill-tabs"
          ><button
            class="pill-tab"
            :class="{ active: preferenceKind === 'PREFER' }"
            @tap="preferenceKind = 'PREFER'"
          >
            更倾向</button
          ><button
            class="pill-tab"
            :class="{ active: preferenceKind === 'ONLY' }"
            @tap="preferenceKind = 'ONLY'"
          >
            只能 / 有限制
          </button></view
        ><textarea
          v-model="preferenceNote"
          class="textarea"
          maxlength="500"
          placeholder="例如：只有周日有空，或更想乘高铁"
        /><button
          class="btn secondary compact space-top"
          :disabled="busy || !preferenceNote.trim()"
          @tap="
            action(
              '/preferences',
              {
                expectedVersion: data.proposal.version,
                kind: preferenceKind,
                note: preferenceNote,
              },
              () => (preferenceNote = ''),
            )
          "
        >
          保存我的倾向
        </button></template
      ><view class="section-heading"
        ><text>继续聊一聊</text
        ><text class="muted">{{ data.proposal.comments.length }} 条</text></view
      ><view v-for="c in data.proposal.comments" :key="c.id" class="list-row"
        ><text
          >{{ name(c.authorId) }} <text class="muted">· v{{ c.version }}</text></text
        ><text class="block preline space-top">{{ c.body }}</text
        ><text class="helper">{{ formatTime(c.createdAt) }}</text></view
      ><view v-if="active" class="field space-top">
        <textarea
          v-model="comment"
          class="textarea"
          maxlength="1000"
          placeholder="留个建议，或者说说你的顾虑"
        /><button
          class="btn secondary compact space-top"
          :disabled="busy || !comment.trim()"
          @tap="
            action(
              '/comments',
              { expectedVersion: data.proposal.version, body: comment },
              () => (comment = ''),
            )
          "
        >
          发出这条想法
        </button></view
      ><button class="btn text-btn" @tap="history = !history">
        {{ history ? '收起' : '查看' }}全部版本与表态</button
      ><view v-if="history"
        ><view v-for="v in data.proposal.versions" :key="v.version" class="card space-top"
          ><text class="label"
            >v{{ v.version }} · {{ name(v.actorId) }} · {{ formatTime(v.createdAt) }}</text
          ><text class="block"
            >{{ v.content.title }} · {{ v.content.date || '未定日期' }} {{ v.content.startTime }}
            {{ v.content.endTime }}</text
          ><text class="helper"
            >地点：{{ v.content.location || '待定' }} · 预算
            {{
              v.content.budgetCents === null ? '未填' : '¥ ' + formatMoney(v.content.budgetCents)
            }}</text
          ><text class="preline block space-top">{{ v.content.description }}</text
          ><text
            v-for="r in data.proposal.responses.filter((x) => x.version === v.version)"
            :key="r.userId"
            class="helper"
            >{{ name(r.userId) }}：{{ responseLabels[r.response]
            }}{{ r.actorId !== r.userId ? '（' + name(r.actorId) + ' 代操作）' : '' }}
            {{ r.reason }}</text
          ><text
            v-for="p in data.proposal.preferences.filter((x) => x.version === v.version)"
            :key="'pref-' + p.userId"
            class="helper"
            >{{ name(p.userId) }} · {{ p.kind === 'ONLY' ? '只能' : '倾向' }}：{{ p.note }}</text
          ></view
        ></view
      ><button class="btn text-btn space-top" @tap="go('/pages/collaboration/index?id=' + id)">
        回到一起商量
      </button></template
    ></view
  ><view v-if="responseSheet" class="sheet-backdrop"
    ><view class="sheet"
      ><text class="subtitle">还不能确认，是因为…</text
      ><text class="section-copy">你可以继续参与协商，也可以明确退出这次方案。</text
      ><textarea
        v-model="reason"
        class="textarea"
        maxlength="500"
        placeholder="说说需要继续商量的地方（提异议时必填）"
      /><button
        class="btn"
        :disabled="busy || !reason.trim()"
        @tap="respond('OBJECTION', responseTarget)"
      >
        有异议，继续协商</button
      ><button class="btn outline" :disabled="busy" @tap="respond('OPT_OUT', responseTarget)">
        我这次不参加</button
      ><button class="btn text-btn" :disabled="busy" @tap="responseSheet = false">
        再想一想
      </button></view
    ></view
  >
</template>
<style scoped>
.facts {
  display: grid;
  grid-template-columns: 90rpx 1fr;
  gap: 18rpx;
  font-size: 26rpx;
}
.facts > text:nth-child(odd) {
  color: #8a9280;
}
</style>
