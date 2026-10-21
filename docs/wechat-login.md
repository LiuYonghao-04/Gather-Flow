# 微信身份接入与真机准备

真实登录已接入，并于 2026-10-21 在微信开发者工具中验证两次登录、用户一致及真实会话鉴权。演示模式继续使用 3001 和演示数据库；微信身份模式使用 3003 和独立数据库。验证范围见 [本次记录](verification-wechat.md)。

## 启动微信身份版本

首次配置：将 `apps/api/.env.wechat.example` 复制为同目录 `.env.wechat.local`，在本地填写 AppSecret。已有文件时直接编辑，避免覆盖配置。AppID 必须与 `apps/miniapp/src/manifest.json`、`src/project.config.json` 一致。密钥只放服务端本地文件，不能放入 `VITE_` 变量、小程序配置、截图或 Git。

在仓库根目录分别运行：

```powershell
npm run dev:wechat-api
npm run build:wechat
```

构建完成后，在微信开发者工具导入 **`apps/miniapp/dist/wechat/mp-weixin`**。微信版本登录页只有“微信登录”；`dist/build/mp-weixin` 与 `dist/dev/mp-weixin` 仍是五人演示版本。构建时的模式与地址来自 `apps/miniapp/.env.wechat`，可用已被忽略的 `.env.wechat.local` 覆盖，修改后重新构建。

本机 API 为 `http://127.0.0.1:3003`，数据在 `apps/api/data/gatherflow-wechat.sqlite`。首次登录创建默认昵称“微信朋友 …”，重新登录复用同一 AppID 下的身份。当前没有微信昵称授权、昵称编辑或演示数据迁入功能。

编译 API 后也可运行 `npm run start:wechat -w @gatherflow/api`。修改服务端本地环境文件后应重新启动 API。

## 登录行为

页面每次点击调用 `uni.login` 取得新 code，再向 `/auth/wechat-login` 提交。服务端只接受 code，通过固定的微信 `jscode2session` 接口验证身份；不接受客户端提供的 openid 或用户 ID。请求超时为 8 秒，不自动重用 code。

数据库 v5 保存 `(AppID, openid)` 对应的内部用户，v6 将应用会话绑定 AppID。数据库会话只存随机令牌的哈希，有效期 24 小时。微信 session_key 用完即丢弃，不存库也不返回前端。演示身份、微信身份与不同 AppID 的会话不能互换。

登录接口返回 `Cache-Control: no-store`；失败信息不会包含上游 URL、AppSecret、session_key 或 openid。每个 API 进程对同一 IP 限制每分钟 20 次微信登录请求；这是开发版本的进程内限制，多实例部署仍需统一限流。

| 情况                        | 页面收到的结果               |
| --------------------------- | ---------------------------- |
| 未配置 AppID/密钥           | 501，提示服务端尚未配置      |
| code 过期或已使用           | 400，重新点击登录获取新 code |
| 微信限制登录频率            | 429，稍后重试                |
| 微信拒绝本次登录            | 403，提示本次登录未获允许    |
| 网络、HTTP、JSON 或上游异常 | 502/503，保留安全的重试提示  |
| 演示模式调用微信登录        | 404，引导使用演示身份        |

## 自动复测

开启开发者工具服务端口，等待项目编译完成。脚本默认通过 CLI 打开项目；已启用自动化时可复用连接：

```powershell
$env:WECHAT_PROJECT_PATH = Join-Path $PWD 'apps/miniapp/dist/wechat/mp-weixin'
$env:WECHAT_AUTO_PORT = '9423'
npm run wechat:login-test
```

若通过 CLI `auto --auto-port 9423` 启动了项目，可再设置 `$env:WECHAT_WS_ENDPOINT = 'ws://127.0.0.1:9423'`。脚本触发真实登录按钮两次，验证用户相同、会话模式、首页回跳以及使用会话读取活动列表返回 200。默认鉴权检查地址为本机 3003。截图和脱敏结果写入 `output/wechat-login/`；不输出 code、令牌或密钥。

## 真机准备与剩余验收

手机上的 `127.0.0.1` 指向手机。局域网调试时，在服务端本地配置将 HOST 设为电脑可访问的网卡地址或 `0.0.0.0`，在前端 `apps/miniapp/.env.wechat.local` 设置 `VITE_API_BASE_URL=http://电脑局域网地址:3003`，重启 API 并重新构建。手机与电脑应在同一可互通网络；先用手机浏览器打开 `/health` 验证连通性。按本机防火墙的实际规则处理入站访问。仓库默认仍只监听本机。

正式设备访问还需配置可访问的 HTTPS 后端、有效证书以及微信后台对应的 request/uploadFile/downloadFile 合法域名；本地工具的域名调试选项不能作为上线配置。尚未部署公网服务、上传体验版或发布。

以下验收需要实际手机与测试参与者，当前仍未完成：

- 真机登录及重新打开小程序后的会话恢复。
- 将分享卡发送给测试朋友；验证首位直入、同卡转发后申请、普通成员分享需审批，以及登录后返回邀请。
- 相册选图、取消、拒绝权限、上传、鉴权预览；相机与相册需分别检查。
- 上传中断网、弱网、恢复重试，检查没有重复或错误成功状态。
- iOS/Android 字体、安全区、长内容与原生分享面板表现。

这些项目的预期业务规则已有 API/客户端测试覆盖，设备与微信原生行为以实测记录为准。
