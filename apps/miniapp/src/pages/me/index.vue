<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { onShow } from '@dcloudio/uni-app';
import { ref } from 'vue';
import { profileSchema } from '@gatherflow/shared';
import { go, isDemo, loginPath, errorMessage } from '@/services/api';
import { useSessionStore } from '@/stores/session';
import GfAvatar from '@/components/GfAvatar.vue';
import GfIcon from '@/components/GfIcon.vue';
import GfNav from '@/components/GfNav.vue';
import DemoEntry from '@/components/DemoEntry.vue';
const session = useSessionStore();
const editing = ref(false),
  nickname = ref(''),
  busy = ref(false),
  error = ref('');
onShow(() => {
  session.refresh();
  if (session.user && !isDemo.value) void session.profile().catch(() => {});
});
function editName() {
  nickname.value = session.user?.name ?? '';
  editing.value = true;
  error.value = '';
}
async function saveName() {
  if (busy.value) return;
  const parsed = profileSchema.safeParse({ name: nickname.value });
  if (!parsed.success) {
    error.value = parsed.error.issues[0]?.message ?? '请检查昵称';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await session.profile(parsed.data.name);
    editing.value = false;
    uni.showToast({ title: '昵称已更新', icon: 'success' });
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <view class="page with-nav">
    <DemoModeBanner id="environment-banner" />
    <view class="header"
      ><text class="eyebrow">一场相聚，慢慢学会一起安排</text
      ><text class="title me-title">我的</text></view
    >
    <view v-if="session.user" class="profile-card"
      ><GfAvatar :user="session.user" /><view class="grow"
        ><text class="profile-name">{{ session.user.name }}</text
        ><text class="helper">{{ isDemo ? '本地演示身份' : '微信身份' }}</text></view
      ></view
    >
    <view v-else class="notice">登录后，查看你发起和参与的相聚。</view>
    <template v-if="session.user && !isDemo">
      <view v-if="editing" class="nickname-editor">
        <text class="label">朋友在活动中看到的昵称</text>
        <input
          id="profile-name"
          v-model="nickname"
          class="input"
          :maxlength="24"
          :disabled="busy"
          placeholder="填写大家熟悉的名字"
        />
        <text class="helper">最多 24 个字，成员名单和账单会显示这个名字。</text>
        <text v-if="error" class="error">{{ error }}</text>
        <view class="row gap space-top"
          ><button
            id="profile-save"
            class="btn grow"
            :disabled="busy"
            :loading="busy"
            @tap="saveName"
          >
            保存昵称</button
          ><button class="btn secondary" :disabled="busy" @tap="editing = false">取消</button></view
        >
      </view>
      <button v-else id="profile-edit" class="identity-action" @tap="editName">
        修改昵称<GfIcon name="arrow" />
      </button>
    </template>
    <button id="me-identity" class="identity-action" @tap="go(loginPath())">
      {{ session.user ? (isDemo ? '切换演示身份' : '重新微信登录') : '前往登录'
      }}<GfIcon name="arrow" />
    </button>
    <view class="section-heading"><text>从这里，再熟悉一点</text></view>
    <button id="me-guide" class="help-row" @tap="go('/pages/guide/index')">
      <view class="help-mark"><GfIcon name="leaf" /></view
      ><view class="grow"
        ><text class="help-title">新手指南</text
        ><text class="helper">邀请、协商、分工与对账，四步了解</text></view
      ><GfIcon name="arrow" />
    </button>
    <DemoEntry id="demo-entry-panel" />
    <text class="footer-note">一个人发起，所有人决定。需要的时候，随时回来看看。</text>
    <GfNav active="me" />
  </view>
</template>
<style scoped>
.me-title {
  margin-top: 24rpx;
}
.profile-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 30rpx;
  border-radius: 24rpx;
  background: #e8ede1;
}
.profile-name {
  display: block;
  font-size: 33rpx;
  font-weight: 600;
}
.identity-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  margin: 0;
  color: #6e8163;
  background: none;
  font-size: 25rpx;
}
.identity-action .gf-icon {
  transform: scale(0.65);
}
.help-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
  margin: 0;
  width: 100%;
  color: #59754f;
  background: none;
  border-bottom: 1rpx solid #dce1d2;
  text-align: left;
  line-height: 1.6;
}
.help-mark {
  width: 66rpx;
  height: 70rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 18rpx;
  background: #e7eddf;
  flex-shrink: 0;
}
.help-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #35523d;
}
.help-row .helper {
  margin: 4rpx 0 0;
  font-size: 22rpx;
}
.help-row > .gf-icon {
  transform: scale(0.7);
}
</style>
