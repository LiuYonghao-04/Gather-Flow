# 同一 Wi-Fi 下的完整微信版本

当前完整版本使用 AppID `wx38429eb9e4b61620`，含微信登录、活动创建、邀请、协商、任务、费用与清算页面。它连接电脑上的真实 API 和 SQLite，不是离线展示包。手机与电脑必须在可互通的同一局域网，且电脑持续运行接口。

## 本机配置

已在本机准备以下被 Git 忽略的配置：

- `apps/api/.env.wechat.local`：新 AppID、服务端密钥和独立微信数据库。
- `apps/api/.env.lan.local`：电脑当前 Wi-Fi IPv4 地址，作为 API 的 HOST。
- `apps/miniapp/.env.wechat.local`：微信 API 的局域网地址（3003）和演示 API 的局域网地址（3001）。

其他电脑可参考 `.env.wechat.example`、两个 `.env.lan.example` 创建上述本地文件。不能将密钥加入前端文件或 Git。更换 Wi-Fi 或电脑 IPv4 地址后，修改 HOST 和两个前端地址，重启接口并重新构建。

在仓库根目录运行：

```powershell
# 保持终端运行，同时启动微信与演示接口
npm run dev:lan
# 另一个终端构建完整微信版本
npm run build:wechat
```

在微信开发者工具打开 `apps/miniapp/dist/wechat/mp-weixin`，完整编译后点击「预览」，用手机扫码；不要使用 `dist/showcase/mp-weixin` 的离线展示包。扫码后应出现微信登录入口，登录成功进入自己的活动首页。演示入口可访问原五人档案，也可切换 A–E 进入独立演示数据库。

微信真实身份使用 `apps/api/data/gatherflow-wechat-wx38429eb9e4b61620.sqlite`，原微信账号数据库和原演示数据库保留。两种身份的会话和活动不会合并。

## 连通性检查

手机 Safari 打开 `http://电脑IPv4地址:3003/health`，应显示 `status:ok`、`mode:wechat`；3001 的 `/health` 应显示 `mode:demo`。这只验证网络和服务，不会登录或修改活动。未连通时先检查两台设备所在网络与系统实际入站规则，不要将故障直接归因于微信登录。

局域网 HTTP 预览属于开发调试，不作为外网完整体验版或正式发布方案。现有线上展示体验版没有被本次本地完整预览替换。朋友在其他网络上仍不能连接这些本地接口。

## 本次验证

2026-10-21，新 AppID 的本机完整构建和类型检查通过。真实微信登录模拟器复测验证两次登录保持同一用户、微信模式不显示 A–E 登录按钮、真实会话读取活动列表返回 200。该次成功报告位于 `output/wechat-login/result.json`，不包含密钥、openid、code 或会话令牌。

随后用户在 iPhone 上手动确认：Safari 能访问局域网健康接口；扫描完整局域网预览码后，点击微信登录成功进入活动首页。当前预览码保存在被忽略的 `output/wechat-login/full-lan-preview-qr.png`；预览码需要时重新生成。

此记录验证 iPhone 的网络与真实登录，不扩大为多人分享发送、相册、弱网、全部财务操作或所有手机型号均通过。本次没有购买云资源或部署公网后端。

模拟器按局域网地址复测时可指定鉴权检查地址：

```powershell
$env:WECHAT_PROJECT_PATH = Join-Path $PWD 'apps/miniapp/dist/wechat/mp-weixin'
$env:WECHAT_API_BASE_URL = 'http://电脑IPv4地址:3003'
npm run wechat:login-test
```
