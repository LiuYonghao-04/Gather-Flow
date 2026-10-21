import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchWechat, WechatDriver, until, bounded } from './wechat-driver';

async function main() {
  assert.ok(
    process.env.WECHAT_PROJECT_PATH?.replaceAll('\\', '/').endsWith('/dist/wechat/mp-weixin'),
    'Use WECHAT_PROJECT_PATH pointing to the separate dist/wechat/mp-weixin build',
  );
  const output = resolve('output/wechat-login');
  await mkdir(output, { recursive: true });
  const mini = await launchWechat();
  const driver = new WechatDriver(mini);
  try {
    const ids: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await driver.navigate(
        '/pages/login/index?returnTo=' + encodeURIComponent('/pages/index/index'),
      );
      assert.equal(
        (await driver.nodes('.identity')).length,
        0,
        'Real mode must hide demo identities',
      );
      await driver.tap({
        selector: '#wechat-login',
        marker: 'id="wechat-login"',
        wxml: 'pages/login/index',
      });
      await until(
        async () => (await mini.currentPage())?.path === 'pages/index/index',
        'real WeChat login redirects to home',
        20000,
      );
      // The session token and upstream code never leave the simulator in this report.
      const session = (await bounded(
        mini.evaluate(`() => {
        const value = wx.getStorageSync('gatherflow.session');
        return {mode: value.mode, userId: value.user && value.user.id,
          expiresAt: value.expiresAt, hasToken: /^[a-f0-9]{64}$/.test(value.token)};
      }`),
        'session metadata',
      )) as { mode: string; userId: string; hasToken: boolean };
      assert.equal(session.mode, 'wechat');
      assert.match(session.userId, /^[a-f0-9-]{36}$/);
      assert.equal(session.hasToken, true);
      ids.push(session.userId);
    }
    assert.equal(ids[0], ids[1], 'Re-login retains the same app-scoped user');
    const status = (await bounded(
      mini.evaluate(`() => new Promise((resolve, reject) => {
      const session = wx.getStorageSync('gatherflow.session');
      wx.request({url: 'http://127.0.0.1:3003/activities',
        header: {Authorization: 'Bearer ' + session.token}, timeout: 12000,
        success: response => resolve({status: response.statusCode, isList: Array.isArray(response.data)}),
        fail: () => reject(new Error('Authenticated API request failed'))});
    })`),
      'authenticated API',
    )) as { status: number; isList: boolean };
    assert.deepEqual(status, { status: 200, isList: true });
    const info = (await bounded(mini.send('Tool.getInfo'), 'tool info')) as {
      version: string;
      SDKVersion: string;
    };
    await bounded(mini.screenshot({ path: resolve(output, 'home.png') }), 'home screenshot');
    await writeFile(
      resolve(output, 'result.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          devtoolsVersion: info.version,
          baseLibraryVersion: info.SDKVersion,
          checks: [
            '真实 uni.login → code2Session → 本地会话 → 首页',
            '两次登录保留同一用户',
            '微信模式无演示身份按钮',
            '真实会话读取活动列表返回 200',
          ],
          scope:
            'WeChat developer-tools login using the configured AppID and real upstream provider. Not phone validation.',
        },
        null,
        2,
      ),
    );
    console.log('PASS 真实微信登录两次成功、用户一致、无演示身份入口；截图与脱敏记录已保存。');
  } catch (error) {
    await bounded(
      mini.screenshot({ path: resolve(output, 'failure.png') }),
      'failure screenshot',
      5000,
    ).catch(() => {});
    throw error;
  } finally {
    await mini.disconnect();
  }
}
const watchdog = setTimeout(() => {
  console.error('WeChat login smoke test timed out.');
  process.exit(1);
}, 120000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
