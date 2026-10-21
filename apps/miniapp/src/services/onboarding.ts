const version = 'gatherflow.onboarding.v1';

export function hasSeenGuide(): boolean {
  return uni.getStorageSync(version) === true;
}
export function dismissGuide(): void {
  uni.setStorageSync(version, true);
}

export const guideSteps = [
  {
    label: '聚齐朋友',
    icon: 'people',
    title: '先留一个位置，\n再一起定计划。',
    description: '发起活动只需要一个名字。把邀请发给朋友，具体时间和地点可以之后一起商量。',
    points: [
      '房主的直邀卡，第一位朋友可直接加入。',
      '同一张卡转发后，后来的人需要申请。',
      '普通成员也能邀请朋友，由房主审核加入。',
    ],
    note: '加入前只展示活动名称与类型，同行的记录留给成员。',
  },
  {
    label: '共同商量',
    icon: 'chat',
    title: '不同的想法，\n都值得被听见。',
    description:
      '打开活动里的“一起安排”，提出日期、目的地或具体安排。每个相关成员都可以表达自己的选择。',
    points: [
      '可以选择“确认参加”“有异议”或“本次不参加”。',
      '重要方案需要相关参与者达成一致，多数确认不会覆盖异议。',
      '方案改动后重新确认，原来的意见和版本会保留。',
    ],
    note: '异议只能由本人提出或撤回。退出一项安排，不会抹去已有消费责任。',
  },
  {
    label: '分工准备',
    icon: 'route',
    title: '一起准备，\n不用一个人包办。',
    description: '把订票、路线或餐厅安排写成任务。朋友可以共同认领，确定谁负责、做到哪一步。',
    points: [
      '负责人维护正式内容，其他成员可以留下建议。',
      '交接要等接手人明确接受，原负责人才能移交责任。',
      '需要预订的安排先上传凭证，再标记为“已预订”。',
    ],
    note: '任务做完与方案确定是两件事。凭证用于共同核对，不判断订单或支付真伪。',
  },
  {
    label: '对账留存',
    icon: 'wallet',
    title: '把钱说清楚，\n把相聚好好留下。',
    description: '在“费用与 AA”记账，注明谁付款、哪些人分摊。可以平摊，也可以填写每个人的金额。',
    points: [
      '另一位相关分摊者确认后，账单才计入共同费用；有异议先核对。',
      '房主核对后冻结最终清算，按清单在线下转账。',
      '每笔只有收款人能确认到账；全部结清后，由房主结束并归档。',
    ],
    note: '这里不发起支付。尚无到账可重开核对，已有到账不能自动回滚；归档后记录只读。',
  },
] as const;
