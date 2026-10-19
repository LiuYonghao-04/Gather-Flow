<script setup lang="ts">
import { ref } from 'vue';
import type { Evidence } from '@gatherflow/shared';
import { previewEvidence } from '@/services/files';
import { formatTime, showError } from '@/services/api';
defineProps<{ items: Evidence[]; activityId: string }>();
const busy = ref('');
async function preview(activityId: string, id: string) {
  if (busy.value) return;
  busy.value = id;
  try {
    await previewEvidence(activityId, id);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = '';
  }
}
</script>
<template>
  <view v-if="!items.length" class="notice">还没有上传凭证。</view
  ><view v-for="item in items" :key="item.id" class="list-row"
    ><view class="row between gap"
      ><view class="grow"
        ><text class="block">{{ item.caption || '预订凭证' }}</text
        ><text class="helper"
          >{{ item.uploader.name }} · {{ formatTime(item.createdAt)
          }}{{ item.proposalVersion ? ' · 方案 v' + item.proposalVersion : '' }}</text
        ></view
      ><button
        class="btn secondary compact"
        :disabled="!!busy"
        :loading="busy === item.id"
        @tap="preview(activityId, item.id)"
      >
        查看
      </button></view
    ></view
  >
</template>
