<script setup lang="ts">
import type { User } from '@gatherflow/shared';
defineProps<{ members: User[]; modelValue: string[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
function change(event: { detail: { value: string[] } }) {
  emit('update:modelValue', event.detail.value);
}
</script>
<template>
  <checkbox-group class="member-choices" @change="change"
    ><label v-for="member in members" :key="member.id" class="member-choice"
      ><checkbox
        :value="member.id"
        :checked="modelValue.includes(member.id)"
        :disabled="disabled"
        color="#294f40"
      /><text>{{ member.name }}</text></label
    ></checkbox-group
  >
</template>
<style scoped>
.member-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.member-choice {
  display: flex;
  align-items: center;
  gap: 8rpx;
  background: #eeefe7;
  border-radius: 14rpx;
  padding: 14rpx 18rpx;
  font-size: 26rpx;
}
checkbox {
  transform: scale(0.78);
  transform-origin: center;
}
</style>
