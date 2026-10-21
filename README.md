# GatherFlow · 相聚有商量

**一个人发起，所有人决定。** 面向朋友聚会与短途旅行的微信小程序。技术栈为 uni-app、Vue 3、TypeScript、Vite、Pinia，以及 Express + SQLite。

当前已完成 **M5 及真实微信身份接入**：21 个小程序页面贯通真实 API 和 SQLite，微信开发者工具已通过真实微信登录、重新登录和会话鉴权；模拟器事件回归覆盖账单确认、冻结/重开、四笔收款与 ¥868.00 只读归档。真机分享发送、相册和弱网仍待设备验收。详见 [微信接入验证](docs/verification-wechat.md) 与 [接入指南](docs/wechat-login.md)。

## 快速启动

已在 Windows / Node **22.18.0** / npm **10.9.3** 验证。使用仓库锁文件安装；无需 Docker、云数据库或付费服务。

```powershell
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` 同时启动本地 API（`http://127.0.0.1:3001`）和微信开发编译，随后持续监听文件变更。首次启动 API 也会自动迁移并幂等填充演示用户，不会清空已有活动。

在微信开发者工具中导入 **`apps/miniapp/dist/dev/mp-weixin`**，不要导入仓库根目录。已配置项目提供的 AppID `wxf6db22d44eb01228`，并显式固定小程序根目录与已验证基础库 3.17.4。更换 AppID 时同步修改 `src/manifest.json` 与 `src/project.config.json`。电脑上开发者工具访问本地 HTTP API，需要开启“不校验合法域名”调试选项。

稳定演示可先运行 `npm run build:mp-weixin`，导入 **`apps/miniapp/dist/build/mp-weixin`**。模拟器事件回归已通过真实按钮绑定与原生确认弹窗，运行 `npm run wechat:test` 可复测。真机无法用 `127.0.0.1` 访问电脑；局域网调试需另配电脑地址和网络，跨互联网需要可访问的 HTTPS 后端及微信合法域名。故障处理及截图命令见 [微信演示说明](docs/wechat-demo.md)。

辅助 H5 预览另开一个终端：

```powershell
npm run dev:h5
```

打开 [本地 H5 预览](http://localhost:5173)。这复用同一套 uni-app 页面，只用于界面检查与单机多人模拟；微信小程序仍是目标平台。

## 演示入口与新人指南

微信身份版本的首页、登录页和“我的”均可打开原五人演示档案。档案页点击“进入演示操作”，即可切换 A–E 身份使用原来的演示数据库；顶部“返回微信活动”恢复之前的微信登录。首次首页提供四步新人指南，之后可随时从“我的”重新查看。操作演示时保持 3001 演示 API 与 3003 微信 API 同时运行，详见 [入口、运行和身份隔离说明](docs/demo-onboarding.md)。

给朋友扫码观看的独立展示版使用新 AppID `wx38429eb9e4b61620`。运行 `npm run build:showcase`，导入 `apps/miniapp/dist/showcase/mp-weixin`，包含五人档案和指南两个页面，无需登录与后端。上传后在新账号后台设为体验版，步骤见 [展示体验版说明](docs/showcase-release.md)。

## 演示账户与流程

| 账号 | 名称   | 演示视角                 |
| ---- | ------ | ------------------------ |
| A    | 林间   | 种子活动房主             |
| B    | 陈屿   | 首次直邀加入，再邀请 D   |
| C    | 许知夏 | 复用已消费直邀，申请加入 |
| D    | 周予安 | 普通成员邀请，等待审批   |
| E    | 沈念   | 新直邀直接加入           |

任何身份都可创建自己的活动。初始“把周末留给山野”只有 A 入组，便于完整演示邀请过程。在演示空间中，通过“我的 → 切换演示身份”切换 A–E，所有状态都真实调用演示 API 并保存到 SQLite。

API 启动后运行：

```powershell
npm run demo:m1
npm run demo:m23
npm run demo:m4
npm run demo:m5
```

脚本各自新建演示活动，使用五个独立会话调用真实 HTTP API。`demo:m23` 已包括首位直邀、复用申请、成员邀请审批，再演示协商、交接、行程、虚构凭证和 AA；`demo:m4` 继续冻结、重开、收款确认与结束归档。`demo:m5` 是完整流程的统一入口。重复运行只新增活动，不重置已有数据。演示 ID 和纯色测试图片保存在被 Git 忽略的 `output/`。手动流程见 [演示指南](docs/demo-scenarios.md)，面试讲解见 [3–5 分钟演示](docs/interview-demo.md)。

## 常用命令

| 命令                               | 用途                                     |
| ---------------------------------- | ---------------------------------------- |
| `npm run dev`                      | API + 微信开发编译                       |
| `npm run dev:api`                  | 单独运行 API                             |
| `npm run dev:mp-weixin`            | 微信开发编译，持续监听                   |
| `npm run dev:h5`                   | H5 辅助预览                              |
| `npm run db:migrate`               | 应用增量建表迁移                         |
| `npm run db:seed`                  | 幂等准备五个账号与起始活动               |
| `npm run typecheck`                | 全仓库 strict TypeScript 检查            |
| `npm test`                         | API 权限/业务测试及跨进程并发测试        |
| `npm run demo:m1`                  | 对运行中的 API 执行五人流程              |
| `npm run demo:m23`                 | 五人协商、任务、凭证与 AA 演示           |
| `npm run demo:m4`                  | 五人全过程，直至最终清算与只读归档       |
| `npm run demo:m5`                  | 完整邀请审批至归档的统一演示入口         |
| `npm run benchmark`                | 隔离费用汇总基准，不修改演示数据库       |
| `npm run wechat:capture`           | 保存实际微信模拟器截图，不代表业务断言   |
| `npm run wechat:test`              | 新建五人数据并运行微信模拟器事件回归     |
| `npm run dev:wechat-api`           | 独立微信身份 API，端口 3003              |
| `npm run build:wechat`             | 微信身份构建，输出 dist/wechat/mp-weixin |
| `npm run wechat:login-test`        | 两次真实微信登录及会话鉴权复测           |
| `npm run wechat:guide-test`        | 新人指南、演示切换与微信会话恢复回归     |
| `npm run demo:export`              | 从已归档五人活动导出离线演示档案         |
| `npm run build`                    | API 打包 + 微信正式构建                  |
| `npm run build:h5`                 | H5 辅助正式构建                          |
| `npm run check`                    | 类型检查 + 测试 + 主目标构建             |
| `npm run start -w @gatherflow/api` | 运行已构建的 API                         |

微信正式产物：`apps/miniapp/dist/build/mp-weixin`。API 产物：`apps/api/dist/server.js`。

## 配置与数据

默认配置即可本地演示。需要修改时，将 `apps/api/.env.example` 复制为同目录 `.env`，将 `apps/miniapp/.env.example` 复制为同目录 `.env.local`；修改后重启对应进程。

- SQLite：`apps/api/data/gatherflow.sqlite`，已加入 `.gitignore`。
- 演示身份只在服务端 `APP_MODE=demo` 开放。`NODE_ENV=production` 禁止 demo，wechat 模式拒绝旧 demo 会话。
- `POST /auth/wechat-login` 已实现真实 code 换身份；未配置密钥时返回 `501 WECHAT_NOT_CONFIGURED`。使用 `npm run dev:wechat-api` 和 `npm run build:wechat` 启动独立微信身份版本，导入 `apps/miniapp/dist/wechat/mp-weixin`，详见 [接入指南](docs/wechat-login.md)。
- 会话有效期 24 小时，会话令牌与邀请码均为 32 字节随机值；数据库只存哈希。
- 私有图片由任务负责人上传，服务端解码并移除 EXIF 后存入 SQLite BLOB；读取必须经过成员鉴权。没有公开文件目录或真实订单样本。单张最大 5 MB，仅支持单帧 JPG/PNG/WebP。
- 方案表态绑定版本、账单确认绑定修订号。房主明确冻结最终清算后锁定财务输入；仅最终收款人确认整笔到账，全部结清后房主明确结束。无人确认到账可重开；已有到账不可自动回滚。
- 所有服务默认只监听本机；本项目当前为开发演示，不是生产部署方案。

## 目录

```text
apps/
  api/
    src/
      db/                  # SQLite 连接、版本迁移、幂等种子
      services/            # 活动/邀请、协商任务、凭证、账单与预估事务
      app.ts               # HTTP 路由、输入验证、错误处理
      auth.ts              # 哈希会话与服务端身份验证
      config.ts            # 环境边界与配置
      server.ts            # 服务启动与关闭
    tests/                 # HTTP 回归与独立进程并发验证
  miniapp/
    src/
      components/          # 图标、头像、导航、加载/失败/空状态
      composables/         # 远端加载状态与身份切换隔离
      pages/               # 18 页：基础活动 + 协商/任务/行程/凭证/账单/清算/归档
      services/            # uni.request、鉴权上传/下载/预览与导航
      stores/              # Pinia 会话状态
      styles/              # 移动端设计基础
packages/shared/src/       # DTO、Zod、整数分/尾差/净额配对算法
scripts/                   # 全过程 HTTP 演示、性能基准、微信截图
docs/                      # 需求索引、假设、架构、验收与后续计划
GatherFlow_Codex.md         # 用户原始需求（保留原文）
```

## 开发记录

基于 DCloud 官方 `uni-preset-vue#vite-ts`，来源提交 `6fb81ac3c5736b8b0a83e667b3ed90223d458dd8`。保留官方匹配的 DCloud `3.0.0-5020420260813003` / Vite `5.2.8` 组合，锁定依赖，没有用 `--force` 或 `--legacy-peer-deps` 绕过冲突。[官方 CLI 文档](https://uniapp.dcloud.net.cn/quickstart-cli.html)。

初始 M0/M1 在 `main`（`ce0bf0f`），M2/M3 在 `codex/m2-m3`（`965e6c3`），M4 在 `codex/m4`（`5ea1ca2`），M5 基于 M4 在 `codex/m5` 开发。当前结果见 [M5 验证记录](docs/verification-m5.md) 和 [性能记录](docs/performance.md)。历史保留在 [M4](docs/verification-m4.md)、[M2/M3](docs/verification-m23.md) 与 [M0/M1](docs/verification.md)。M5 后续接入在 `codex/wechat-integration`，真实登录与模拟器回归见 [微信接入验证](docs/verification-wechat.md)。剩余为真机分享、相册与弱网验收，规则见 [工程假设](docs/assumptions.md)。
