# 展示体验版

展示小程序使用 AppID `wx38429eb9e4b61620`，版本 `0.2.0-showcase`。发布配置在 `apps/miniapp/showcase/release.json`。这是无需登录和数据服务的只读展示，包含原五人 ¥868 档案及新人指南。

## 构建与检查

```powershell
npm run build:showcase
npm run typecheck
$env:WECHAT_PROJECT_PATH = Join-Path $PWD 'apps/miniapp/dist/showcase/mp-weixin'
$env:WECHAT_AUTO_PORT = '9424'
npm run wechat:showcase-test
```

在微信开发者工具导入 `apps/miniapp/dist/showcase/mp-weixin`。修改产物后做一次完整编译（Ctrl+B）；遇到开发者工具索引异常时清理编译缓存后重新编译。已有自动化连接可使用 `WECHAT_WS_ENDPOINT=ws://127.0.0.1:9424`。

构建脚本在被忽略的 `output/showcase-source` 准备源码副本，使用展示专用 App 入口，将新 AppID 同时写入副本的 manifest 和 project 配置，只注册档案、指南两个页面。源代码中的普通演示和微信身份构建配置仍用于原开发环境。展示版不初始化身份、不迁移会话，不显示演示操作、微信登录、创建或个人活动入口；不需要 AppSecret 或公网 API。

## 在新账号后台设置体验版

1. 登录 AppID 为 `wx38429eb9e4b61620` 的小程序后台。
2. 在「版本管理 → 开发版本」中找到 `0.2.0-showcase`，点击「选为体验版」。
3. 如需填写页面，输入 `pages/demo/index`，查询参数留空。
4. 在「成员管理 → 体验成员」中绑定试用者的微信号。
5. 返回体验版本，保存体验二维码并交给试用者。扫码后应直接看到 ¥868.00 档案，顶部可进入指南。

后台设置由用户自行操作。上传代码与设为体验版是两步；旧 AppID 后台的版本不会自动出现在新账号中。

2026-10-21 已向新 AppID 上传 `0.2.0-showcase`，微信 CLI 明确返回上传成功，包体 231175 字节（225.8 KB）。新 AppID 下的展示模拟器三项检查与全仓库类型检查通过；此前完整测试为 96 项通过。脱敏结果在 `output/wechat-showcase/result.json`，新账号上传回执在 `output/wechat-showcase/upload-new-appid.json`。后台是否设为体验版与手机扫码结果仍由用户核实。

## iPhone 预览与真机调试

2026-10-21 用户在 iPhone 上扫码普通预览，确认正常显示五人档案。此项为用户手动实测；不代表指南所有步骤、原生分享发送或所有手机型号均已验收。普通预览码保存于被忽略的 `output/wechat-showcase/preview-qr.png`，它是开发预览码，不是后台体验版二维码。

同次「真机调试」显示局域网 WebSocket 连接失败并切换广域网，手机白屏；开发者工具调试窗口显示「未连接」，没有可用启动日志。同一构建的普通预览正常，因此本次故障限定在远程真机调试模式，尚未确认具体网络或工具原因，没有据此修改业务代码、域名校验或系统安全设置。

展示给朋友时使用公众平台中设好的体验版二维码，并绑定体验成员。无需启动「真机调试」，也无需保持与开发电脑的调试连接。需要复测普通预览时可在开发者工具选择「预览」生成新码。

展示版支持查看行程表态、任务交接、账单分摊和到账记录。修改数据、A–E 操作和真实朋友协作需要使用接通后端的完整版本。当前展示无需保持开发电脑或 API 运行。

## 品牌资料

- 简称：相聚有商量。
- 介绍：朋友相聚，一起商量。通过五人演示档案了解行程协商、任务分工、费用分摊与清算，让每一次出发都有共识。
- 头像：`docs/brand/gatherflow-avatar.png`。
