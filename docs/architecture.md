# 架构与平台边界

## 数据路径

`uni-app 页面 → Pinia 会话 / uni.request → Express 路由 → Zod 验证 → 服务层授权 → SQLite 事务 → DTO`

客户端只负责交互。活动详情、名单、申请、审核和审计每次都检查服务端会话与成员关系。分享路由只有令牌，不携带可授予权限的 `source=owner` 或用户 ID。TypeScript 全仓库 strict + noUncheckedIndexedAccess。

前端只用 uni-app 组件与平台 API，没有 Web-only 路由/状态库。使用 `onLoad/onShow/onPullDownRefresh/onShareAppMessage`、`uni.request`、`uni.navigateTo`、`uni.setClipboardData`、`uni.login` 等。尚未实现的真实微信 code 换 openid 接口明确返回 501。

## SQLite 与并发

`db/migrations.ts` 是增量版本迁移，`schema_migrations` 记录版本；启动和独立 migrate 命令共用相同机制。种子 `INSERT OR IGNORE`，不删除本地已有记录。使用 foreign_keys、WAL、5 秒 busy_timeout。

当前实体：users、sessions、activities、activity_members、invite_tokens、join_applications、audit_logs。复合成员主键防止重复成员；活动单房主部分唯一索引；待审申请部分唯一索引；令牌哈希唯一索引。

直邀事务使用 `BEGIN IMMEDIATE`：读取状态与成员 → 条件更新未消费令牌 → 插入成员 → 解决其待审申请 → 写审计 → 提交。任何一步失败全部回滚。事务内没有网络或 await，跨进程由 SQLite 写锁协调。测试实际启动两个 Node 子进程、各自连接同一磁盘数据库竞争同一令牌，并重新打开数据库验证结果。

审核事务同时检查房主身份、活动状态、申请所属活动及待审状态，再写审核结果、成员和审计。重复审核返回 409，拒绝保留原申请。当前所有写路由均拒绝归档状态。

## 会话与隐私

随机 bearer 会话和邀请码只在数据库存哈希。每个会话包含服务端固定的身份模式和过期时间；wechat 模式不会接受 demo 会话。API 不记录原始请求头、邀请码、完整请求体。公开邀请预览白名单 DTO；私有数据只对已入组用户返回。CORS 仅方便 H5 调试，不作为权限边界。

本阶段为单机演示，没有生产限流、真实登录提供方、异常监控、会话撤销 UI 或文件上传。不要把当前 demo 认证部署到公网。M3 凭证需要私有存储和鉴权读取，不能使用公开静态目录。

## 微信端与 H5

- `mp-weixin` 为目标；输出目录可由微信开发者工具导入。开发和正式构建都实际执行。
- 清单 AppID 使用开发占位 `touristappid`。真实微信分享、登录、真机预览需要用户自己的 AppID 和微信工具环境；未声称完成这些验证。
- `urlCheck=false` 仅本机开发调试配置，不能代替生产合法域名、HTTPS 或证书配置。
- H5 用于布局检查，所有关键操作仍走同一 API。H5 的“复制邀请”得到小程序页面路径；可在首页“打开邀请”粘贴或用 `http://localhost:5173/#` 加该路径访问。
- 真机的 localhost 是手机本身。局域网需把 API HOST 改为可访问网卡地址/0.0.0.0、配置前端地址和防火墙，跨互联网另需 HTTPS 服务。当前没有提供公网部署。

## 设计基础

暖白 `#f5f4ee`、主文字 `#293e34`、主操作绿 `#294f40`；8–12px 节奏、14px 正文、24px 主标题（按 rpx 缩放），底部适配安全区域。视图以卡片、状态提示和轻量操作为主；加载骨架、空状态、失败重试、提交禁用、审核确认弹窗均有实现。图标由小程序可用的 view/CSS 绘制，无外部图片依赖；头像用五位演示朋友的名字与固定配色。

## 后续扩展

M2 将引入带版本号的提案、响应/偏好、任务负责人/建议/交接及按日期计划聚合。M3 引入私有凭证、费用版本、分摊、确认、争议及整数分算法。M4 引入冻结快照与收款确认。实体通过 activity_id 关联，不能复用当前成员关系充当方案参与或费用分摊集合。
