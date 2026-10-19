<script setup lang="ts">
defineOptions({ inheritAttrs: false });
import { computed, ref, watch } from 'vue';
import { progressLabels, type Workspace, type Task, type Evidence } from '@gatherflow/shared';
import { api, go, formatTime } from '@/services/api';
import { confirmAction } from '@/services/files';
import { useActivityPage } from '@/composables/useActivityPage';
import GfState from '@/components/GfState.vue';
import ActivityTrail from '@/components/ActivityTrail.vue';
import EvidenceList from '@/components/EvidenceList.vue';
const draft = ref(''),
  suggestion = ref(''),
  reviewNote = ref(''),
  candidate = ref(''),
  handoverNote = ref('');
const sheet = ref<'assign' | 'handover' | null>(null);
const history = ref(false);
const { id, options, userId, data, loading, error, reload, busy, run } = useActivityPage(
  'task',
  async (activityId, q) => {
    const [workspace, task, evidence] = await Promise.all([
      api<Workspace>(`/activities/${activityId}/workspace`),
      api<Task>(`/activities/${activityId}/tasks/${q.taskId}`),
      api<Evidence[]>(`/activities/${activityId}/evidence`),
    ]);
    return { workspace, task, evidence: evidence.filter((e) => e.taskId === task.id) };
  },
);
watch(data, (d) => {
  if (d) draft.value = d.task.content;
});
const editable = computed(
  () =>
    !!data.value?.task.assigneeIds.includes(userId.value) &&
    data.value.workspace.status === 'ACTIVE',
);
const locked = computed(() =>
  data.value?.workspace.proposals.some(
    (p) => p.taskId === data.value?.task.id && ['BOOKED', 'DONE'].includes(p.execution),
  ),
);
function name(value: string) {
  return data.value?.workspace.members.find((x) => x.id === value)?.name ?? value;
}
function action(path: string, body: object, after?: () => void) {
  return run(async () => {
    await api(`/activities/${id.value}/tasks/${options.value.taskId}${path}`, 'POST', body);
    after?.();
    await reload();
  });
}
async function complete() {
  if (!data.value) return;
  const t = data.value.task;
  if (
    await confirmAction(
      t.completed ? '重新开始这项工作？' : '标记工作已完成？',
      '工作进度独立于方案确认，不会替参与者确认任何方案。',
    )
  )
    await action('/progress', { expectedRevision: t.revision, completed: !t.completed });
}
async function save() {
  if (!data.value) return;
  if (
    data.value.task.proposalIds.length &&
    !(await confirmAction(
      '更新正式内容？',
      '关联方案将暂时移出总行程，需要负责人更新方案版本并重新收集确认。',
    ))
  )
    return;
  await action('/content', { expectedRevision: data.value.task.revision, content: draft.value });
}
async function resolve(handoverId: string, accept: boolean) {
  if (
    await confirmAction(
      accept ? '接受这次交接？' : '撤销交接申请？',
      accept
        ? '接受后原负责人退出这项职责，由你继续推进；任务内容保留。'
        : '原负责人继续承担这项职责。',
    )
  )
    await action(`/handovers/${handoverId}/resolve`, { accept });
}
</script>
<template>
  <view class="page"
    ><ActivityTrail
      :activity-id="id"
      :return-to="'/pages/task/index?id=' + id + '&taskId=' + options.taskId"
    /><GfState v-if="loading || error" :loading="loading" :error="error" @retry="reload" /><template
      v-else-if="data"
      ><view class="header"
        ><text class="eyebrow">ONE SMALL PART, TOGETHER</text
        ><text class="title">{{ data.task.title }}</text
        ><view class="chips"
          ><text class="tag">{{ progressLabels[data.task.status] }}</text
          ><text class="tag neutral">正式内容 v{{ data.task.revision }}</text></view
        ><text class="section-copy preline">{{ data.task.brief }}</text></view
      ><view class="card"
        ><text class="label">这件事，谁来负责</text
        ><text class="block">{{
          data.task.assigneeIds.map(name).join('、') || '还没有人认领'
        }}</text
        ><view v-if="data.workspace.status === 'ACTIVE'" class="actions"
          ><button
            v-if="!editable"
            class="btn compact"
            :disabled="busy"
            @tap="action('/assignees', { userId })"
          >
            {{ data.task.assigneeIds.length ? '我也来共同负责' : '我来认领' }}</button
          ><template v-else
            ><button
              class="btn secondary compact"
              :disabled="busy"
              @tap="
                sheet = 'assign';
                candidate = '';
              "
            >
              增加共同负责人</button
            ><button
              class="btn outline compact"
              :disabled="busy"
              @tap="
                sheet = 'handover';
                candidate = '';
              "
            >
              申请交接
            </button></template
          ></view
        ><text class="helper">{{
          data.task.needsConfirmation
            ? '工作完成后，涉及大家的方案仍需共同确认。'
            : '这是准备事项，工作完成无需另发方案确认。'
        }}</text></view
      ><view
        v-for="h in data.task.handovers.filter((x) => x.status === 'PENDING')"
        :key="h.id"
        class="notice warm space-top"
        ><text class="block">{{ name(h.fromUserId) }} 想交给 {{ name(h.toUserId) }}</text
        ><text class="block preline">{{ h.note }}</text
        ><text class="helper">接受前，{{ name(h.fromUserId) }} 继续负责。</text
        ><view v-if="data.workspace.status === 'ACTIVE'" class="actions"
          ><button
            v-if="h.toUserId === userId"
            class="btn compact"
            :disabled="busy"
            @tap="resolve(h.id, true)"
          >
            我来接手</button
          ><button
            v-if="h.fromUserId === userId"
            class="btn outline compact"
            :disabled="busy"
            @tap="resolve(h.id, false)"
          >
            撤销申请
          </button></view
        ></view
      ><view class="section-heading"
        ><text>正式内容</text><text class="muted">v{{ data.task.revision }}</text></view
      ><textarea
        v-if="editable && !locked"
        v-model="draft"
        class="textarea"
        maxlength="4000"
        :disabled="busy"
        placeholder="把路线、安排或准备结果写在这里"
      /><view v-else class="card preline">{{
        data.task.content || '负责人还没填写正式内容，可以先在下方留个建议。'
      }}</view
      ><text v-if="locked" class="helper">关联方案已有预订或执行留存，变更请新建补充任务。</text
      ><view v-if="editable" class="actions"
        ><button
          v-if="!locked"
          class="btn compact"
          :disabled="busy || draft === data.task.content"
          :loading="busy"
          @tap="save"
        >
          保存正式内容</button
        ><button class="btn secondary compact" :disabled="busy" @tap="complete">
          {{ data.task.completed ? '重新开始工作' : '工作已完成' }}
        </button></view
      ><view class="section-heading"
        ><text>相关方案</text
        ><button
          v-if="editable"
          class="btn text-btn"
          @tap="go('/pages/proposal-edit/index?id=' + id + '&taskId=' + data.task.id)"
        >
          ＋ 提交方案
        </button></view
      ><view v-if="!data.task.proposalIds.length" class="notice">{{
        data.task.needsConfirmation
          ? '负责人完成规划后，可以提交方案，让相关参与者确认。'
          : '这项准备工作可以独立完成；若涉及共同安排，也可提交方案。'
      }}</view
      ><view
        v-for="p in data.workspace.proposals.filter((x) => x.taskId === data?.task.id)"
        :key="p.id"
        class="list-row row between gap"
        @tap="go('/pages/proposal/index?id=' + id + '&proposalId=' + p.id)"
        ><text>{{ p.content.title }}</text
        ><text class="tag"
          >{{
            p.status === 'CONFIRMED' ? '已确定' : p.status === 'STALE' ? '需更新方案' : '协商中'
          }}
          ›</text
        ></view
      ><view class="section-heading"
        ><text>预订凭证</text
        ><button
          v-if="editable"
          class="btn text-btn"
          @tap="go('/pages/evidence/index?id=' + id + '&taskId=' + data.task.id)"
        >
          上传 / 记账 ›
        </button></view
      ><EvidenceList :items="data.evidence" :activity-id="id" /><view class="section-heading"
        ><text>大家的建议</text><text class="muted">保留每份想法</text></view
      ><view v-if="data.workspace.status === 'ACTIVE'" class="field">
        <textarea
          v-model="suggestion"
          class="textarea"
          maxlength="1000"
          placeholder="给负责人留个建议，不会覆盖正式内容"
        /><button
          class="btn secondary compact space-top"
          :disabled="busy || !suggestion.trim()"
          @tap="action('/suggestions', { body: suggestion }, () => (suggestion = ''))"
        >
          留下建议
        </button></view
      ><view v-for="s in data.task.suggestions" :key="s.id" class="card space-top"
        ><view class="row between"
          ><text>{{ name(s.authorId) }}</text
          ><text class="tag neutral">{{
            s.status === 'PENDING' ? '待回应' : s.status === 'ACCEPTED' ? '已接受' : '未采纳'
          }}</text></view
        ><text class="block preline space-top">{{ s.body }}</text
        ><text class="helper">{{ formatTime(s.createdAt) }}</text
        ><text v-if="s.reviewerId" class="helper"
          >{{ name(s.reviewerId) }}：{{
            s.reviewNote || (s.status === 'ACCEPTED' ? '已接受，将参考完善正式内容' : '暂不采纳')
          }}</text
        ><template v-if="editable && s.status === 'PENDING'"
          ><input
            v-model="reviewNote"
            class="input space-top"
            maxlength="500"
            placeholder="回应说明（选填）"
          /><view class="actions"
            ><button
              class="btn secondary compact"
              :disabled="busy"
              @tap="
                action(
                  '/suggestions/' + s.id + '/review',
                  { decision: 'ACCEPTED', note: reviewNote },
                  () => (reviewNote = ''),
                )
              "
            >
              接受建议</button
            ><button
              class="btn outline compact"
              :disabled="busy"
              @tap="
                action(
                  '/suggestions/' + s.id + '/review',
                  { decision: 'REJECTED', note: reviewNote },
                  () => (reviewNote = ''),
                )
              "
            >
              暂不采纳
            </button></view
          ><text class="helper">接受后，请由负责人按需更新上方正式内容。</text></template
        ></view
      ><button class="btn text-btn space-top" @tap="history = !history">
        {{ history ? '收起' : '查看' }}内容与交接历史</button
      ><view v-if="history"
        ><view v-for="r in data.task.revisions" :key="r.revision" class="list-row"
          ><text class="label"
            >v{{ r.revision }} · {{ name(r.actorId) }} · {{ formatTime(r.createdAt) }}</text
          ><text class="preline">{{ r.content || '任务建立' }}</text></view
        ><view v-for="h in data.task.handovers" :key="h.id" class="list-row"
          ><text class="block"
            >{{ name(h.fromUserId) }} → {{ name(h.toUserId) }} ·
            {{
              h.status === 'ACCEPTED' ? '已接受' : h.status === 'CANCELLED' ? '已撤销' : '待接受'
            }}</text
          ><text class="helper preline">{{ h.note }} · {{ formatTime(h.createdAt) }}</text></view
        ></view
      ><button class="btn text-btn" @tap="go('/pages/collaboration/index?id=' + id + '&tab=tasks')">
        回到任务分工
      </button></template
    ></view
  ><view v-if="sheet && data" class="sheet-backdrop"
    ><view class="sheet"
      ><text class="subtitle">{{ sheet === 'assign' ? '一起负责这件事' : '找一位朋友接手' }}</text
      ><text class="section-copy">{{
        sheet === 'assign'
          ? '共同负责人可以编辑正式内容和上传凭证。'
          : '对方明确接受前，你仍然负责这项任务。'
      }}</text
      ><view class="chips"
        ><button
          v-for="m in data.workspace.members.filter((x) =>
            sheet === 'assign' ? !data?.task.assigneeIds.includes(x.id) : x.id !== userId,
          )"
          :key="m.id"
          class="chip"
          :class="{ selected: candidate === m.id }"
          @tap="candidate = m.id"
        >
          {{ m.name }}
        </button></view
      ><textarea
        v-if="sheet === 'handover'"
        v-model="handoverNote"
        class="textarea space-top"
        maxlength="500"
        placeholder="交接说明：做到哪了，还有什么需要处理"
      /><button
        class="btn"
        :disabled="busy || !candidate || (sheet === 'handover' && !handoverNote.trim())"
        :loading="busy"
        @tap="
          sheet === 'assign'
            ? action('/assignees', { userId: candidate }, () => (sheet = null))
            : action(
                '/handovers',
                { toUserId: candidate, note: handoverNote },
                () => (sheet = null),
              )
        "
      >
        {{ sheet === 'assign' ? '添加共同负责人' : '发出交接申请' }}</button
      ><button class="btn outline" :disabled="busy" @tap="sheet = null">取消</button></view
    ></view
  >
</template>
