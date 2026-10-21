<script setup lang="ts">
import DemoModeBanner from '@/components/DemoModeBanner.vue';
import { computed, ref } from 'vue';
import { onShareAppMessage } from '@dcloudio/uni-app';
import { isShowcase } from '@/services/showcase';
import { go, goHome, storedSession } from '@/services/api';
import { dismissGuide, guideSteps } from '@/services/onboarding';
import GfIcon from '@/components/GfIcon.vue';
const index = ref(0);
const step = computed(() => guideSteps[index.value]!);
function leave() {
  dismissGuide();
  if (getCurrentPages().length > 1) uni.navigateBack({ delta: 1 });
  else if (isShowcase) uni.reLaunch({ url: '/pages/demo/index' });
  else if (storedSession()) goHome();
  else uni.reLaunch({ url: '/pages/login/index' });
}
function next() {
  if (index.value === guideSteps.length - 1) leave();
  else {
    index.value++;
    uni.pageScrollTo({ scrollTop: 0, duration: 0 });
  }
}
function preview() {
  dismissGuide();
  if (isShowcase) {
    const pages = getCurrentPages();
    if (pages.length > 1 && pages[pages.length - 2]?.route === 'pages/demo/index')
      uni.navigateBack({ delta: 1 });
    else uni.redirectTo({ url: '/pages/demo/index' });
    return;
  }
  go('/pages/demo/index');
}
onShareAppMessage(() => ({ title: 'GatherFlow · 相聚有商量', path: '/pages/demo/index' }));
</script>
<template>
  <view class="page guide-page">
    <DemoModeBanner v-if="!isShowcase" id="environment-banner" />
    <view class="row between"
      ><text class="eyebrow">GATHERFLOW · 新手指南</text
      ><button id="guide-skip" class="skip" @tap="leave">稍后再看</button></view
    >
    <view class="guide-progress" aria-label="使用步骤">
      <button
        v-for="(item, position) in guideSteps"
        :key="item.label"
        class="progress-step"
        :class="{ active: index === position, passed: index > position }"
        @tap="index = position"
      >
        <text class="step-number">{{ position + 1 }}</text
        ><text>{{ item.label }}</text>
      </button>
    </view>
    <view class="guide-visual" aria-hidden="true">
      <view class="visual-line" /><view class="visual-orbit"
        ><view class="visual-dot first" /><view class="visual-dot last" /><view
          class="visual-center"
          ><GfIcon :name="step.icon" /></view
      ></view>
      <text class="visual-label">{{ step.label }}</text>
    </view>
    <view :key="index" class="guide-content">
      <text class="guide-count">第 {{ index + 1 }} 步 / 共 {{ guideSteps.length }} 步</text>
      <text class="title guide-title">{{ step.title }}</text>
      <text class="guide-description">{{ step.description }}</text>
      <view class="guide-points"
        ><view v-for="(point, position) in step.points" :key="point" class="guide-point"
          ><text class="point-number">0{{ position + 1 }}</text
          ><text class="grow">{{ point }}</text></view
        ></view
      >
      <view class="guide-note"
        ><GfIcon name="leaf" /><text>{{ step.note }}</text></view
      >
    </view>
    <view class="guide-footer"
      ><view class="row gap"
        ><button v-if="index > 0" id="guide-previous" class="btn outline previous" @tap="index--">
          上一步</button
        ><button id="guide-next" class="btn grow" @tap="next">
          {{
            index === guideSteps.length - 1
              ? isShowcase
                ? '返回五人档案'
                : '我知道了，开始使用'
              : '下一步'
          }}
        </button></view
      ><button id="guide-demo" class="btn text-btn" @tap="preview">
        先看看原来的五人演示 ›
      </button></view
    >
  </view>
</template>
<style scoped>
.guide-page {
  padding-top: 26rpx;
}
.skip {
  margin: 0;
  padding: 14rpx 0 14rpx 16rpx;
  background: none;
  color: #7b8875;
  font-size: 24rpx;
  line-height: 1.5;
}
.guide-progress {
  display: flex;
  justify-content: space-between;
  gap: 8rpx;
  margin: 32rpx 0 14rpx;
}
.progress-step {
  flex: 1;
  padding: 8rpx 0;
  margin: 0;
  background: none;
  font-size: 20rpx;
  color: #88937f;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}
.step-number {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 1rpx solid #cdd6c3;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.active {
  color: #294f40;
  font-weight: 600;
}
.active .step-number {
  color: #fffef7;
  background: #294f40;
  border-color: #294f40;
}
.passed .step-number {
  background: #e4ebdc;
}
.guide-visual {
  height: 220rpx;
  position: relative;
  overflow: hidden;
  margin: 32rpx 0 36rpx;
  border-radius: 24rpx;
  background: #e6ecdf;
  display: flex;
  align-items: center;
  padding-left: 40rpx;
}
.visual-orbit {
  width: 170rpx;
  height: 170rpx;
  border: 2rpx dashed #a8ba9c;
  border-radius: 50%;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  transform: rotate(-15deg);
}
.visual-center {
  width: 90rpx;
  height: 90rpx;
  border-radius: 30rpx;
  background: #294f40;
  color: #f9f7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(15deg);
}
.visual-dot {
  position: absolute;
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;
  background: #8da57f;
  border: 5rpx solid #f5f4ee;
}
.first {
  top: 4rpx;
  left: 20rpx;
}
.last {
  bottom: 8rpx;
  right: 14rpx;
  background: #c7c49b;
}
.visual-line {
  position: absolute;
  right: -80rpx;
  bottom: -110rpx;
  width: 350rpx;
  height: 300rpx;
  border-radius: 50%;
  background: #d2ddc5;
}
.visual-label {
  margin-left: 40rpx;
  color: #58714c;
  font-size: 28rpx;
  letter-spacing: 5rpx;
  position: relative;
}
.guide-count {
  display: block;
  color: #859077;
  font-size: 23rpx;
  margin-bottom: 18rpx;
}
.guide-title {
  font-size: 48rpx;
  white-space: pre-line;
  line-height: 1.4;
}
.guide-description {
  display: block;
  margin: 24rpx 0 26rpx;
  color: #74816d;
  font-size: 27rpx;
  line-height: 1.9;
}
.guide-point {
  display: flex;
  gap: 20rpx;
  padding: 22rpx 0;
  border-top: 1rpx solid #dfe4d6;
  font-size: 26rpx;
  line-height: 1.8;
}
.point-number {
  color: #8a9c7b;
  font-size: 22rpx;
  padding-top: 3rpx;
  font-variant-numeric: tabular-nums;
}
.guide-note {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 22rpx 0 0;
  color: #87917d;
  font-size: 23rpx;
  line-height: 1.9;
}
.guide-note .gf-icon {
  transform: scale(0.65);
  width: 28rpx;
  margin-top: 2rpx;
}
.guide-footer {
  padding-top: 40rpx;
}
.previous {
  padding-left: 25rpx;
  padding-right: 25rpx;
}
.guide-footer .text-btn {
  margin: 18rpx auto 0;
}
</style>
