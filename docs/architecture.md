# 架构与平台边界

## 数据路径

`uni-app 页面 → Pinia 会话 / uni.request → Express 路由 → Zod 验证 → 服务层授权 → SQLite 事务 → DTO`

客户端只负责交互。活动详情、名单、申请、审核和审计每次都检查服务端会话与成员关系。分享路由只有令牌，不携带可授予权限的 `source=owner` 或用户 ID。TypeScript 全仓库 strict + noUncheckedIndexedAccess。

前端只用 uni-app 组件与平台 API，没有 Web-only 路由/状态库。使用 `onLoad/onShow/onPullDownRefresh/onShareAppMessage`、`uni.request`、`uni.navigateTo`、`uni.setClipboardData`、`uni.login` 等。真实微信登录通过服务端 code2Session 换身份，缺少配置时返回 501；具体配置与验证见 [微信登录](wechat-login.md)。

## SQLite 与并发

`db/migrations.ts` 是增量版本迁移，`schema_migrations` 记录版本；启动和独立 migrate 命令共用相同机制。种子 `INSERT OR IGNORE`，不删除本地已有记录。使用 foreign_keys、WAL、5 秒 busy_timeout。

V1 实体：users、sessions、activities、activity_members、invite_tokens、join_applications、audit_logs。V2 增加任务/负责人/内容版本/建议/交接，以及方案/内容版本/参与者/表态/偏好/评论。V3 增加私有图片、费用/费用版本/确认/异议。V4 增加最终清算与到账，V5/V6 增加按 AppID 隔离的微信身份和会话关联。旧库自动按版本顺序增量迁移，保留 M1 数据。

提案正文和账单输入使用不可变版本 JSON 保存；提案表态、偏好、费用确认均带版本复合键。交接中的责任归属、账单异议独立存表，不能靠覆盖版本绕过。成员、待审申请、待交接申请、单人未撤销异议分别使用主键或唯一索引约束。

直邀事务使用 `BEGIN IMMEDIATE`：读取状态与成员 → 条件更新未消费令牌 → 插入成员 → 解决其待审申请 → 写审计 → 提交。任何一步失败全部回滚。事务内没有网络或 await，跨进程由 SQLite 写锁协调。测试实际启动两个 Node 子进程、各自连接同一磁盘数据库竞争同一令牌，并重新打开数据库验证结果。

审核事务同时检查房主身份、活动状态、申请所属活动及待审状态，再写审核结果、成员和审计。重复审核返回 409，拒绝保留原申请。当前所有写路由均拒绝归档状态。

## 会话与隐私

随机 bearer 会话和邀请码只在数据库存哈希。每个会话包含服务端固定的身份模式和过期时间；wechat 模式不会接受 demo 会话。API 不记录原始请求头、邀请码、完整请求体。公开邀请预览白名单 DTO；私有数据只对已入组用户返回。CORS 仅方便 H5 调试，不作为权限边界。

微信登录提供方已接入，登录接口有进程内 IP 频率限制；多实例统一限流、异常监控和会话撤销 UI 尚未实现。demo 认证仅供本地演示。

图片采用路由专用 Multer 内存接收，文件数/体积/字段受限，进入上传中间件前检查成员与活动状态。Sharp 解码及重新编码，剥离 EXIF，不信任扩展名和客户端 MIME。异步解码结束后，在写事务中再次核对成员、负责人和方案版本，然后保存 BLOB 与审计。查询只取图片元数据；实际二进制必须经 `GET /activities/:activityId/evidence/:id/image` 的会话与成员授权，响应 `private, no-store`。没有公开文件服务和携带 token 的 URL。

客户端 `uni.chooseImage → uni.uploadFile` 上传，`uni.downloadFile` 携带认证请求后再交给 `uni.previewImage`。数据库和本地测试图片都被 Git 忽略。SQLite 文件不加密，生产文件存储及密钥管理仍需后续部署设计。

M2/M3 所有写操作使用立即事务：权限、当前版本/修订号、业务状态与审计在同一锁内更新。客户端提交 expectedVersion / expectedRevision，过期草稿返回 409；不采用最后写入覆盖。业务服务不在数据库事务中 await。

`CollaborationService` 计算方案共识与计划，`EvidenceService` 管理鉴权图片，`ExpenseService` 计算账单状态和预估；共用 ActivityService 授权/审计。`packages/shared` 提供严格 DTO、Zod 和整数分算法。费用修改不移除未撤销异议，估算只能看到当前状态为 CONFIRMED 的账单。

## 微信端与 H5

- `mp-weixin` 为目标；输出目录可由微信开发者工具导入。开发和正式构建都实际执行。
- 清单和项目配置使用项目所有者提供的 AppID `wxf6db22d44eb01228`。真实微信登录与会话鉴权、模拟器事件驱动财务回归已通过；原生分享发送和真机仍需单独验收。
- `urlCheck=false` 仅本机开发调试配置，不能代替生产合法域名、HTTPS 或证书配置。
- H5 用于布局检查，所有关键操作仍走同一 API。H5 的“复制邀请”得到小程序页面路径；可在首页“打开邀请”粘贴或用 `http://localhost:5173/#` 加该路径访问。
- 真机的 localhost 是手机本身。局域网需把 API HOST 改为可访问网卡地址/0.0.0.0、配置前端地址和防火墙，跨互联网另需 HTTPS 服务。当前没有提供公网部署。

## 设计基础

暖白 `#f5f4ee`、主文字 `#293e34`、主操作绿 `#294f40`；8–12px 节奏、14px 正文、24px 主标题（按 rpx 缩放），底部适配安全区域。视图以卡片、状态提示和轻量操作为主；加载骨架、空状态、失败重试、提交禁用、审核确认弹窗均有实现。图标由小程序可用的 view/CSS 绘制，无外部图片依赖；头像用五位演示朋友的名字与固定配色。

## 后续扩展

M5 已补充会话异常恢复、批量费用读取、性能基准和微信工具截图。真实身份接入与模拟器回归已完成，真机仍待验收。M3 的 Estimate 仍只供预览，readyForSettlement 不表示已结清。

## M4 清算与归档

迁移 v4 增加 settlements、settlement_transfers 和活动归档时间/操作者。SettlementService 在 BEGIN IMMEDIATE 中校验房主权限、账单状态与财务版本，保存账单修订、成员和净额快照以及转账清单。数据库触发器禁止改写快照核心字段、转账参与者/金额和已有到账记录。

财务版本由有序成员 ID、账单 ID/修订号/状态的 SHA-256 摘要组成。冻结与关闭要求客户端提交已查看的版本；关闭还校验当前快照 ID。账单所有写入口在同一事务中检查冻结，新增成员与审批加入也受保护，非财务准备工作可继续。只读清算/归档聚合使用读事务保持一致视图。

收款确认绑定当前快照与转账 ID，只允许 toUserId 本人；重复请求幂等。重开只允许房主且不能有任何到账记录，只标记旧快照失效，不删除历史。独立进程的收款/重开竞争验证事务互斥。归档事务重新检查全部财务条件，写入归档状态与审计；无共享费用时可在房主明确关闭时原子生成零转账快照。归档后已有统一 requireActive 保护所有业务写入，成员仍能查阅行程、任务、凭证、账单、快照与审计。

接口：GET/POST /activities/:id/settlement；POST /activities/:id/settlements/:snapshotId/reopen；POST /activities/:id/settlements/:snapshotId/transfers/:transferId/receipt；POST /activities/:id/close；GET /activities/:id/archive。严格请求 schema 拒绝客户端伪造金额或到账人。
