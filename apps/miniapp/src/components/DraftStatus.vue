<script setup lang="ts">
import type { DraftState } from '@/services/drafts';
import { confirmAction } from '@/services/files';
const props = defineProps<{ status: DraftState; busy?: boolean }>();
const emit = defineEmits<{ discard: [] }>();
async function discard() {
  if (await confirmAction('清除草稿？', '清空这份尚未提交的内容，重新开始填写。')) emit('discard');
}
</script>
<template>
  <view
    v-if="props.status"
    class="draft-notice"
    :class="{ warning: status === 'error' || status === 'outdated' }"
  >
    <text>{{
      status === 'restored'
        ? '已恢复上次未提交的草稿'
        : status === 'saved'
          ? '草稿已自动保存在本机'
          : status === 'outdated'
            ? '已有新版本，旧草稿未自动恢复；请对照最新内容重新填写'
            : '草稿暂时无法保存，请保留当前页面并稍后重试'
    }}</text>
    <button
      v-if="status !== 'error'"
      id="discard-draft"
      class="draft-clear"
      :disabled="busy"
      @tap="discard"
    >
      清除草稿
    </button>
  </view>
</template>
<style scoped>
.draft-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin: 20rpx 0;
  padding: 18rpx 22rpx;
  background: #e8ede1;
  border-radius: 14rpx;
  color: #64775b;
  font-size: 23rpx;
  line-height: 1.7;
}
.warning {
  color: #945d41;
  background: #f0e9da;
}
.draft-clear {
  flex-shrink: 0;
  margin: 0;
  padding: 8rpx;
  background: none;
  color: inherit;
  font-size: 23rpx;
  line-height: 1.7;
}
</style>
