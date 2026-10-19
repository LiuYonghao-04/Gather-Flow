# 架构与平台边界

## 数据路径

`uni-app 页面 → Pinia 会话 / uni.request → Express 路由 → Zod 验证 → 服务层授权 → SQLite 事务 → DTO`

客户端只负责交互。活动详情、名单、申请、审核和审计每次都检查服务端会话与成员关系。分享路由只有令牌，不携带可授予权限的 `source=owner` 或用户 ID。TypeScript 全仓库 strict + noUncheckedIndexedAccess。

前端只用 uni-app 组件与平台 API，没有 Web-only 路由/状态库。使用 `onLoad/onShow/onPullDownRefresh/onShareAppMessage`、`uni.request`、`uni.navigateTo`、`uni.setClipboardData`、`uni.login` 等。尚未实现的真实微信 code 换 openid 接口明确返回 501。

## SQLite 与并发

`db/migrations.ts` 是增量版本迁移，`schema_migrations` 记录版本；启动和独立 migrate 命令共用相同机制。种子 `INSERT OR IGNORE`，不删除本地已有记录。使用 foreign_keys、WAL、5 秒 busy_timeout。

V1 实体：users、sessions、activities、activity_members、invite_tokens、join_applications、audit_logs。V2 增加任务/负责人/内容版本/建议/交接，以及方案/内容版本/参与者/表态/偏好/评论。V3 增加私有图片、费用/费用版本/确认/异议。旧库自动按版本顺序增量迁移，保留 M1 数据。

提案正文和账单输入使用不可变版本 JSON 保存；提案表态、偏好、费用确认均带版本复合键。交接中的责任归属、账单异议独立存表，不能靠覆盖版本绕过。成员、待审申请、待交接申请、单人未撤销异议分别使用主键或唯一索引约束。

直邀事务使用 `BEGIN IMMEDIATE`：读取状态与成员 → 条件更新未消费令牌 → 插入成员 → 解决其待审申请 → 写审计 → 提交。任何一步失败全部回滚。事务内没有网络或 await，跨进程由 SQLite 写锁协调。测试实际启动两个 Node 子进程、各自连接同一磁盘数据库竞争同一令牌，并重新打开数据库验证结果。

审核事务同时检查房主身份、活动状态、申请所属活动及待审状态，再写审核结果、成员和审计。重复审核返回 409，拒绝保留原申请。当前所有写路由均拒绝归档状态。

## 会话与隐私

随机 bearer 会话和邀请码只在数据库存哈希。每个会话包含服务端固定的身份模式和过期时间；wechat 模式不会接受 demo 会话。API 不记录原始请求头、邀请码、完整请求体。公开邀请预览白名单 DTO；私有数据只对已入组用户返回。CORS 仅方便 H5 调试，不作为权限边界。

本阶段为单机演示，没有生产限流、真实登录提供方、异常监控或会话撤销 UI。不要把当前 demo 认证部署到公网。

图片采用路由专用 Multer 内存接收，文件数/体积/字段受限，进入上传中间件前检查成员与活动状态。Sharp 解码及重新编码，剥离 EXIF，不信任扩展名和客户端 MIME。异步解码结束后，在写事务中再次核对成员、负责人和方案版本，然后保存 BLOB 与审计。查询只取图片元数据；实际二进制必须经 `GET /activities/:activityId/evidence/:id/image` 的会话与成员授权，响应 `private, no-store`。没有公开文件服务和携带 token 的 URL。

客户端 `uni.chooseImage → uni.uploadFile` 上传，`uni.downloadFile` 携带认证请求后再交给 `uni.previewImage`。数据库和本地测试图片都被 Git 忽略。SQLite 文件不加密，生产文件存储及密钥管理仍需后续部署设计。

M2/M3 所有写操作使用立即事务：权限、当前版本/修订号、业务状态与审计在同一锁内更新。客户端提交 expectedVersion / expectedRevision，过期草稿返回 409；不采用最后写入覆盖。业务服务不在数据库事务中 await。

`CollaborationService` 计算方案共识与计划，`EvidenceService` 管理鉴权图片，`ExpenseService` 计算账单状态和预估；共用 ActivityService 授权/审计。`packages/shared` 提供严格 DTO、Zod 和整数分算法。费用修改不移除未撤销异议，估算只能看到当前状态为 CONFIRMED 的账单。

## 微信端与 H5

- `mp-weixin` 为目标；输出目录可由微信开发者工具导入。开发和正式构建都实际执行。
- 清单 AppID 使用开发占位 `touristappid`。真实微信分享、登录、真机预览需要用户自己的 AppID 和微信工具环境；未声称完成这些验证。
- `urlCheck=false` 仅本机开发调试配置，不能代替生产合法域名、HTTPS 或证书配置。
- H5 用于布局检查，所有关键操作仍走同一 API。H5 的“复制邀请”得到小程序页面路径；可在首页“打开邀请”粘贴或用 `http://localhost:5173/#` 加该路径访问。
- 真机的 localhost 是手机本身。局域网需把 API HOST 改为可访问网卡地址/0.0.0.0、配置前端地址和防火墙，跨互联网另需 HTTPS 服务。当前没有提供公网部署。

## 设计基础

暖白 `#f5f4ee`、主文字 `#293e34`、主操作绿 `#294f40`；8–12px 节奏、14px 正文、24px 主标题（按 rpx 缩放），底部适配安全区域。视图以卡片、状态提示和轻量操作为主；加载骨架、空状态、失败重试、提交禁用、审核确认弹窗均有实现。图标由小程序可用的 view/CSS 绘制，无外部图片依赖；头像用五位演示朋友的名字与固定配色。

## 后续扩展

M4 待引入冻结快照、仅收款方确认和活动结束财务校验。M3 的 Estimate 只供预览，readyForSettlement 表示当前无待确认/异议，不表示已结清，也没有据此结束活动的接口。M5 待做真实微信开发者工具/真机验收、生产身份接入与性能打磨。
