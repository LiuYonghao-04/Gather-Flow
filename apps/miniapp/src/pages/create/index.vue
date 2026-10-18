<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  activityTypeLabels,
  createActivitySchema,
  type ActivityDetail,
  type ActivityType,
} from '@gatherflow/shared';
import { api, errorMessage, requireSession } from '@/services/api';
import GfIcon from '@/components/GfIcon.vue';

const name = ref('');
const description = ref('');
const type = ref<ActivityType>();
const busy = ref(false);
const error = ref('');
const types = Object.entries(activityTypeLabels) as [ActivityType, string][];
onShow(() => requireSession('/pages/create/index'));
async function submit() {
  if (busy.value) return;
  error.value = '';
  const parsed = createActivitySchema.safeParse({
    name: name.value,
    type: type.value,
    description: description.value,
  });
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? '请检查填写内容';
    return;
  }
  busy.value = true;
  try {
    const activity = await api<ActivityDetail>('/activities', 'POST', parsed.data);
    uni.redirectTo({ url: `/pages/activity/index?id=${activity.id}` });
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view class="page">
    <view class="header"
      ><text class="eyebrow">A LITTLE PLAN, TOGETHER</text
      ><text class="title">相聚，先有个念头。</text
      ><text class="muted">先起个名字。时间和地点，留给大家商量。</text></view
    >
    <view class="field"
      ><text class="label">活动叫什么？</text
      ><input
        v-model="name"
        class="input"
        placeholder="比如：把周末留给山野"
        :maxlength="40"
      /><text class="helper">{{ name.length }}/40 · 必填</text></view
    >
    <view class="field"
      ><text class="label">想一起做什么 <text class="muted optional">选填</text></text
      ><view class="type-options"
        ><button
          v-for="item in types"
          :key="item[0]"
          class="type-option"
          :class="{ selected: type === item[0] }"
          @tap="type = type === item[0] ? undefined : item[0]"
        >
          {{ item[1] }}
        </button></view
      ></view
    >
    <view class="field"
      ><text class="label">给朋友的话 <text class="muted optional">选填</text></text
      ><textarea
        v-model="description"
        class="textarea"
        :maxlength="300"
        placeholder="一个想去的地方，或一个好久不见的理由……"
      /><text class="helper">{{ description.length }}/300</text></view
    >
    <view class="notice row gap"
      ><GfIcon name="chat" /><text
        >发起活动只是第一步。重要的计划，由每一位参与的朋友共同确认。</text
      ></view
    >
    <text v-if="error" class="error">{{ error }}</text>
    <button class="btn create-btn" :disabled="busy" :loading="busy" @tap="submit">
      {{ busy ? '正在创建…' : '发起这次相聚' }}<GfIcon v-if="!busy" name="arrow" />
    </button>
  </view>
</template>
<style scoped>
.header {
  margin-bottom: 48rpx;
}
.optional {
  font-size: 23rpx;
  font-weight: 400;
  margin-left: 12rpx;
}
.type-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
}
.type-option {
  font-size: 26rpx;
  color: #7c8577;
  background: #eeefe7;
  border-radius: 16rpx;
  border: 1rpx solid transparent;
  width: 100%;
  padding: 20rpx 12rpx;
  line-height: 1.5;
}
.type-option.selected {
  border-color: #6c8262;
  color: #35553e;
  background: #e5ecdf;
}
.create-btn {
  margin-top: 42rpx;
}
</style>
