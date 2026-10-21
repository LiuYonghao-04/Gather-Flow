<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage, onShow } from '@dcloudio/uni-app';
import type { ActivityDetail, Invite } from '@gatherflow/shared';
import { api, errorMessage, go, requireSession, storedSession } from '@/services/api';
import { canReturnToWechat } from '@/services/environment';
import GfIcon from '@/components/GfIcon.vue';
import GfState from '@/components/GfState.vue';

const id = ref('');
const activity = ref<ActivityDetail | null>(null);
const card = ref<Invite | null>(null);
const busy = ref(false);
const error = ref('');
const owner = computed(() => activity.value?.role === 'OWNER');
let identity = '';
let generation = 0;
onLoad((options) => {
  id.value = options?.id ?? '';
});
onShow(() => {
  if (!requireSession(`/pages/share/index?id=${id.value}`)) return;
  const userId = storedSession()?.user.id ?? '';
  if (identity !== userId || !activity.value) {
    identity = userId;
    void prepare();
  }
});
async function prepare() {
  const current = ++generation;
  busy.value = true;
  error.value = '';
  card.value = null;
  try {
    const detail = await api<ActivityDetail>(`/activities/${id.value}`);
    if (current !== generation) return;
    activity.value = detail;
    const next = await api<Invite>(`/activities/${id.value}/invites`, 'POST', {
      kind: detail.role === 'OWNER' ? 'DIRECT' : 'APPROVAL',
    });
    if (current === generation) card.value = next;
  } catch (cause) {
    if (current === generation) error.value = errorMessage(cause);
  } finally {
    if (current === generation) busy.value = false;
  }
}
function copy() {
  const current = card.value;
  if (!current) return;
  uni.setClipboardData({
    data: current.path,
    success: () => uni.showToast({ title: '邀请路径已复制', icon: 'success' }),
  });
}
onShareAppMessage(() => {
  if (canReturnToWechat.value)
    return { title: '五个人，怎样一起完成一场相聚', path: '/pages/demo/index' };
  const current = card.value;
  if (!current) return { title: 'GatherFlow · 相聚有商量', path: '/pages/index/index' };
  const shared = { title: `一起参加「${activity.value?.name ?? '朋友相聚'}」`, path: current.path };
  // Share callbacks must return synchronously. Each send takes a prepared server token,
  // then immediately clears it and prepares the next one. Forwarded cards retain their original token.
  void prepare();
  return shared;
});
</script>
<template>
  <view class="page">
    <DemoModeBanner id="environment-banner" />
    <view class="header"
      ><text class="eyebrow">SAVE A PLACE FOR A FRIEND</text
      ><text class="title">给朋友，留个位置。</text
      ><text class="muted">计划还没定，先把想同行的人聚起来。</text></view
    >
    <GfState v-if="error" :error="error" @retry="prepare" />
    <template v-else>
      <view class="invitation-card"
        ><view class="card-top row between"><text>GATHERFLOW</text><GfIcon name="leaf" /></view
        ><text class="invitation-label">你收到一份相聚邀请</text
        ><text class="invitation-title">{{ activity?.name ?? '正在准备邀请…' }}</text
        ><view class="invitation-rule" /><view class="row gap invite-status"
          ><GfIcon :name="owner ? 'check' : 'people'" /><view
            ><text class="status-title">{{
              owner ? '一次直邀，一个位置' : '一起加入，等房主点头'
            }}</text
            ><text class="status-description">{{
              owner ? '第一位使用的朋友可直接加入' : '朋友提交申请后，由房主审核'
            }}</text></view
          ></view
        ><text class="card-signature">一个人发起，所有人决定。</text></view
      >
      <view class="notice share-notice">{{
        owner
          ? '每次微信分享会使用一张新邀请。同一张卡再次打开时，只能申请加入，不能重复免审核。'
          : '成员分享的邀请始终需要房主同意。朋友加入前，只能看到活动名称和类型。'
      }}</view>
      <!-- #ifdef MP-WEIXIN -->
      <button
        v-if="!canReturnToWechat"
        class="btn"
        open-type="share"
        :disabled="busy || !card"
        :loading="busy"
      >
        {{ busy ? '正在准备邀请…' : '分享给微信朋友' }}
      </button>
      <!-- #endif -->
      <view v-if="canReturnToWechat" class="notice space-top"
        >演示邀请请通过“复制这张邀请”与切换身份来体验。邀请真实朋友，请先返回微信活动；此处菜单分享仅展示只读演示档案。</view
      >
      <button class="btn secondary copy-btn" :disabled="busy || !card" @tap="copy">
        复制这张邀请
      </button>
      <view class="row share-actions"
        ><button class="btn text-btn" :disabled="busy || !card" @tap="card && go(card.path)">
          查看邀请</button
        ><button class="btn text-btn" :disabled="busy" @tap="prepare">生成一张新邀请</button></view
      >
      <text class="footer-note">复制保留同一张卡，方便演示转发后的审核规则。</text>
    </template>
  </view>
</template>
<style scoped>
.invitation-card {
  border-radius: 30rpx;
  background: #e4ebdc;
  padding: 40rpx;
  position: relative;
  overflow: hidden;
  border: 1rpx solid #d6dfcb;
}
.card-top {
  font-size: 22rpx;
  letter-spacing: 5rpx;
  color: #5c7753;
}
.invitation-label {
  display: block;
  margin-top: 65rpx;
  color: #7c9070;
  font-size: 24rpx;
}
.invitation-title {
  display: block;
  font-size: 48rpx;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 22rpx;
  overflow-wrap: anywhere;
}
.invitation-rule {
  height: 1rpx;
  border-top: 2rpx dashed #bfcdb2;
  margin: 48rpx 0 32rpx;
}
.status-title {
  font-size: 28rpx;
  font-weight: 500;
  display: block;
}
.status-description {
  display: block;
  color: #7a8d6f;
  font-size: 22rpx;
  margin-top: 7rpx;
}
.invite-status {
  color: #527048;
}
.card-signature {
  display: block;
  font-size: 21rpx;
  color: #8c9d7e;
  margin-top: 60rpx;
}
.share-notice {
  margin: 28rpx 0 36rpx;
  background: #eeeee4;
}
.copy-btn {
  margin-top: 20rpx;
}
.share-actions {
  justify-content: center;
  margin-top: 20rpx;
  gap: 24rpx;
}
</style>
