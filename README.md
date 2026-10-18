# GatherFlow · 相聚有商量

**一个人发起，所有人决定。** 面向朋友聚会与短途旅行的微信小程序。技术栈为 uni-app、Vue 3、TypeScript、Vite、Pinia，以及 Express + SQLite。

当前交付 **M0 + M1**：可运行工程、移动端基础体验、五人身份切换、活动创建、一次性直邀、申请审核、成员权限和审计。**协商、任务、凭证、AA 与最终清算还没有实现，当前不是完整 MVP。** 产品范围没有删减，详见 [规则对照](docs/implementation-matrix.md)。

## 快速启动

已在 Windows / Node **22.18.0** / npm **10.9.3** 验证。使用仓库锁文件安装；无需 Docker、云数据库或付费服务。

```powershell
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` 同时启动本地 API（`http://127.0.0.1:3001`）和微信开发编译，随后持续监听文件变更。首次启动 API 也会自动迁移并幂等填充演示用户，不会清空已有活动。

在微信开发者工具中导入 **`apps/miniapp/dist/dev/mp-weixin`**，不要导入仓库根目录。清单暂用 `touristappid`；本地测试可使用工具支持的测试号/游客模式，实际分享需填写自己的小程序 AppID。电脑上开发者工具访问本地 HTTP API，需要开启开发工具的“不校验合法域名”调试选项。

**实际完成的验证是微信编译，不包括开发者工具启动、真实分享或真机测试。** 真机无法用 `127.0.0.1` 访问电脑；局域网调试需另配电脑地址和网络，跨互联网需要可访问的 HTTPS 后端及微信合法域名。详见 [架构说明](docs/architecture.md)。

辅助 H5 预览另开一个终端：

```powershell
npm run dev:h5
```

打开 [本地 H5 预览](http://localhost:5173)。这复用同一套 uni-app 页面，只用于界面检查与单机多人模拟；微信小程序仍是目标平台。

## 演示账户与流程

| 账号 | 名称   | 演示视角                 |
| ---- | ------ | ------------------------ |
| A    | 林间   | 种子活动房主             |
| B    | 陈屿   | 首次直邀加入，再邀请 D   |
| C    | 许知夏 | 复用已消费直邀，申请加入 |
| D    | 周予安 | 普通成员邀请，等待审批   |
| E    | 沈念   | 新直邀直接加入           |

任何身份都可创建自己的活动。初始“把周末留给山野”只有 A 入组，便于完整演示邀请过程。右上角头像/“我的身份”可切换身份，所有状态都真实调用同一个 API 并保存到 SQLite。

API 启动后运行：

```powershell
npm run demo:m1
```

脚本会新建一个演示活动，使用五个独立会话跑完整 M1 路径，并输出活动 ID。重复运行会创建新活动，不会删除或重置原数据。手动流程见 [3–5 分钟演示指南](docs/demo-scenarios.md)。

## 常用命令

| 命令                               | 用途                              |
| ---------------------------------- | --------------------------------- |
| `npm run dev`                      | API + 微信开发编译                |
| `npm run dev:api`                  | 单独运行 API                      |
| `npm run dev:mp-weixin`            | 微信开发编译，持续监听            |
| `npm run dev:h5`                   | H5 辅助预览                       |
| `npm run db:migrate`               | 应用增量建表迁移                  |
| `npm run db:seed`                  | 幂等准备五个账号与起始活动        |
| `npm run typecheck`                | 全仓库 strict TypeScript 检查     |
| `npm test`                         | API 权限/业务测试及跨进程并发测试 |
| `npm run demo:m1`                  | 对运行中的 API 执行五人流程       |
| `npm run build`                    | API 打包 + 微信正式构建           |
| `npm run build:h5`                 | H5 辅助正式构建                   |
| `npm run check`                    | 类型检查 + 测试 + 主目标构建      |
| `npm run start -w @gatherflow/api` | 运行已构建的 API                  |

微信正式产物：`apps/miniapp/dist/build/mp-weixin`。API 产物：`apps/api/dist/server.js`。

## 配置与数据

默认配置即可本地演示。需要修改时，将 `apps/api/.env.example` 复制为同目录 `.env`，将 `apps/miniapp/.env.example` 复制为同目录 `.env.local`；修改后重启对应进程。

- SQLite：`apps/api/data/gatherflow.sqlite`，已加入 `.gitignore`。
- 演示身份只在服务端 `APP_MODE=demo` 开放。`NODE_ENV=production` 禁止 demo，wechat 模式拒绝旧 demo 会话。
- `POST /auth/wechat-login` 是明确返回 `501 WECHAT_NOT_CONFIGURED` 的接入边界；没有假装已完成真实微信身份验证。
- 会话有效期 24 小时，凭证与邀请码均为 32 字节随机值；数据库只存哈希。
- 私有凭证上传属于 M3；当前未建立公开文件目录，也没有真实个人信息样本。
- 所有服务默认只监听本机；本项目当前为开发演示，不是生产部署方案。

## 目录

```text
apps/
  api/
    src/
      db/                  # SQLite 连接、版本迁移、幂等种子
      services/            # 活动、邀请码、申请审核事务
      app.ts               # HTTP 路由、输入验证、错误处理
      auth.ts              # 哈希会话与服务端身份验证
      config.ts            # 环境边界与配置
      server.ts            # 服务启动与关闭
    tests/                 # HTTP 回归与独立进程并发验证
  miniapp/
    src/
      components/          # 图标、头像、导航、加载/失败/空状态
      composables/         # 远端加载状态与身份切换隔离
      pages/               # 首页/登录/创建/活动/分享/邀请/成员/足迹
      services/            # uni.request 封装与导航
      stores/              # Pinia 会话状态
      styles/              # 移动端设计基础
packages/shared/src/       # DTO、角色枚举、Zod 请求规则
scripts/demo-m1.ts         # 五人真实 HTTP 演示
docs/                      # 需求索引、假设、架构、验收与后续计划
GatherFlow_Codex.md         # 用户原始需求（保留原文）
```

## 开发记录

基于 DCloud 官方 `uni-preset-vue#vite-ts`，来源提交 `6fb81ac3c5736b8b0a83e667b3ed90223d458dd8`。保留官方匹配的 DCloud `3.0.0-5020420260813003` / Vite `5.2.8` 组合，锁定依赖，没有用 `--force` 或 `--legacy-peer-deps` 绕过冲突。[官方 CLI 文档](https://uniapp.dcloud.net.cn/quickstart-cli.html)。

已实现内容、测试结果和已知限制见 [M0/M1 验证记录](docs/verification.md)。下一阶段是 M2 的提案版本、全员确认、任务交接与行程聚合，规则详见 [工程假设](docs/assumptions.md) 和 [实现对照](docs/implementation-matrix.md)。
