<script setup lang="ts">
defineProps<{
  name:
    | 'plus'
    | 'arrow'
    | 'people'
    | 'calendar'
    | 'check'
    | 'route'
    | 'wallet'
    | 'chat'
    | 'leaf'
    | 'close';
}>();
</script>

<template>
  <view class="gf-icon" :class="'icon-' + name" aria-hidden="true">
    <view class="stroke a" /><view class="stroke b" /><view class="stroke c" />
  </view>
</template>

<style scoped>
.gf-icon {
  width: 40rpx;
  height: 40rpx;
  position: relative;
  flex-shrink: 0;
  color: inherit;
}
.stroke {
  position: absolute;
  box-sizing: border-box;
}
.icon-plus .a,
.icon-close .a {
  width: 28rpx;
  height: 3rpx;
  background: currentColor;
  top: 19rpx;
  left: 6rpx;
}
.icon-plus .b,
.icon-close .b {
  height: 28rpx;
  width: 3rpx;
  background: currentColor;
  left: 19rpx;
  top: 6rpx;
}
.icon-close {
  transform: rotate(45deg);
}
.icon-arrow .a {
  width: 17rpx;
  height: 17rpx;
  border-top: 3rpx solid;
  border-right: 3rpx solid;
  transform: rotate(45deg);
  top: 11rpx;
  left: 7rpx;
}
.icon-calendar .a,
.icon-wallet .a,
.icon-chat .a {
  width: 32rpx;
  height: 28rpx;
  border: 3rpx solid;
  border-radius: 6rpx;
  left: 4rpx;
  top: 7rpx;
}
.icon-calendar .b {
  width: 32rpx;
  border-top: 3rpx solid;
  left: 4rpx;
  top: 16rpx;
}
.icon-calendar .c {
  height: 10rpx;
  width: 15rpx;
  border-left: 3rpx solid;
  border-right: 3rpx solid;
  top: 2rpx;
  left: 12rpx;
}
.icon-wallet .b {
  width: 13rpx;
  height: 11rpx;
  border: 3rpx solid;
  right: 2rpx;
  top: 17rpx;
  border-radius: 3rpx;
}
.icon-chat .b {
  width: 10rpx;
  height: 10rpx;
  border-left: 3rpx solid;
  transform: skewY(-40deg);
  left: 11rpx;
  bottom: 1rpx;
}
.icon-people .a {
  width: 14rpx;
  height: 14rpx;
  border: 3rpx solid;
  border-radius: 50%;
  top: 3rpx;
  left: 8rpx;
}
.icon-people .b {
  width: 29rpx;
  height: 17rpx;
  border: 3rpx solid;
  border-radius: 18rpx 18rpx 5rpx 5rpx;
  top: 21rpx;
  left: 0;
}
.icon-people .c {
  width: 10rpx;
  height: 29rpx;
  border-right: 3rpx solid;
  border-radius: 50%;
  right: 0;
  top: 7rpx;
}
.icon-check .a {
  width: 23rpx;
  height: 13rpx;
  border-bottom: 3rpx solid;
  border-left: 3rpx solid;
  transform: rotate(-45deg);
  left: 7rpx;
  top: 10rpx;
}
.icon-route .a {
  width: 25rpx;
  height: 26rpx;
  border: 3rpx dashed;
  border-left: 0;
  border-radius: 0 16rpx 16rpx 0;
  top: 6rpx;
  left: 5rpx;
}
.icon-route .b,
.icon-route .c {
  width: 8rpx;
  height: 8rpx;
  border: 3rpx solid;
  border-radius: 50%;
  left: 2rpx;
  top: 3rpx;
}
.icon-route .c {
  top: 28rpx;
}
.icon-leaf .a {
  width: 27rpx;
  height: 34rpx;
  border: 3rpx solid;
  border-radius: 25rpx 0 25rpx 0;
  transform: rotate(20deg);
  left: 5rpx;
  top: 2rpx;
}
.icon-leaf .b {
  width: 3rpx;
  height: 30rpx;
  background: currentColor;
  transform: rotate(35deg);
  left: 18rpx;
  top: 9rpx;
}
</style>
