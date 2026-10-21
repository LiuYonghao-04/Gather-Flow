import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchWechat, WechatDriver, until, bounded } from './wechat-driver';
import preview from '../apps/miniapp/src/content/demo-preview.json';

async function main() {
  assert.ok(
    process.env.WECHAT_PROJECT_PATH?.replaceAll('\\', '/').endsWith('/dist/wechat/mp-weixin'),
    'Use the WeChat identity build',
  );
  const directory = resolve('output/wechat-onboarding');
  await mkdir(directory, { recursive: true });
  const mini = await launchWechat(),
    driver = new WechatDriver(mini);
  const checks: string[] = [];
  const pass = (text: string) => {
    checks.push(text);
    console.log('PASS ' + text);
  };
  let originalGuide: unknown;
  const pageIs = async (name: string) => {
    const path = `pages/${name}/index`;
    if ((await mini.currentPage())?.path !== path) return false;
    // The app-service route changes before the simulator's native navigation finishes.
    // A second tap during that transition can time out navigateTo/navigateBack.
    await new Promise((done) => setTimeout(done, 1800));
    return (await mini.currentPage())?.path === path;
  };
  const session = () =>
    bounded(
      mini.evaluate(`() => {
    const s=wx.getStorageSync('gatherflow.session');
    return s ? {mode:s.mode,userId:s.user.id,token:s.token} : null;
  }`),
      'current session',
    ) as Promise<{ mode: string; userId: string; token: string } | null>;
  try {
    await driver.navigate('/pages/me/index');
    if ((await driver.nodes('#exit-demo-workspace', '#environment-banner')).length) {
      await driver.tap({
        selector: '#exit-demo-workspace',
        marker: 'id="exit-demo-workspace"',
        wxml: 'components/DemoModeBanner',
        component: '#environment-banner',
      });
      await until(() => pageIs('index'), 'personal home');
    }
    let personal = await session();
    if (!personal || personal.mode !== 'wechat') {
      await driver.navigate('/pages/login/index');
      await driver.tap({
        selector: '#wechat-login',
        marker: 'id="wechat-login"',
        wxml: 'pages/login/index',
      });
      await until(() => pageIs('index'), 'personal login', 25000);
      personal = await session();
    }
    assert.ok(
      personal?.mode === 'wechat' && personal.userId !== 'A',
      'Personal WeChat session required',
    );
    originalGuide = await mini.evaluate(`()=>wx.getStorageSync('gatherflow.onboarding.v1')`);

    await driver.navigate('/pages/index/index');
    if (originalGuide !== true) {
      await driver.waitNode('#open-guide', '#welcome-panel');
      await mini.screenshot({ path: resolve(directory, 'welcome.png') });
      await driver.tap({
        selector: '#open-guide',
        marker: 'id="open-guide"',
        wxml: 'components/WelcomeGuide',
        component: '#welcome-panel',
      });
    } else await driver.navigate('/pages/guide/index');
    await until(() => driver.hasText('先留一个位置'), 'first guide step');
    await mini.screenshot({ path: resolve(directory, 'guide.png') });
    for (const title of ['不同的想法', '一起准备', '把钱说清楚']) {
      await driver.tap({
        selector: '#guide-next',
        marker: 'id="guide-next"',
        wxml: 'pages/guide/index',
      });
      await until(() => driver.hasText(title), 'guide step');
    }
    await driver.tap({
      selector: '#guide-previous',
      marker: 'id="guide-previous"',
      wxml: 'pages/guide/index',
    });
    await until(() => driver.hasText('一起准备'), 'guide back');
    await driver.tap({
      selector: '#guide-next',
      marker: 'id="guide-next"',
      wxml: 'pages/guide/index',
    });
    await driver.tap({
      selector: '#guide-next',
      marker: 'id="guide-next"',
      wxml: 'pages/guide/index',
    });
    await until(() => pageIs('index'), 'completed guide return');
    assert.equal(await mini.evaluate(`()=>wx.getStorageSync('gatherflow.onboarding.v1')`), true);
    pass('四步指南、上一步、完成并记录已读');

    await driver.navigate('/pages/me/index');
    await driver.tap({ selector: '#me-guide', marker: 'id="me-guide"', wxml: 'pages/me/index' });
    await until(() => pageIs('guide'), 'reopen guide');
    await driver.tap({
      selector: '#guide-skip',
      marker: 'id="guide-skip"',
      wxml: 'pages/guide/index',
    });
    await until(() => pageIs('me'), 'skip returns to profile');
    pass('从“我的”重新查看指南、跳过后返回原页');
    await driver.tap({
      selector: '.demo-entry',
      marker: 'id="open-demo"',
      wxml: 'components/DemoEntry',
      component: '#demo-entry-panel',
    });
    await until(() => pageIs('demo'), 'demo entry');
    await until(() => driver.hasText('868.00'), 'saved demo archive');
    await mini.screenshot({ path: resolve(directory, 'demo.png') });
    for (const tab of ['expenses', 'settlement']) {
      await driver.tap({
        selector: '#demo-tab-' + tab,
        marker: "'pill-tab'",
        wxml: 'pages/demo/index',
        rowValue: 'demo-tab-' + tab,
      });
    }
    await until(() => driver.hasText('应收'), 'settlement preview');
    assert.ok(
      (await session())?.token === personal.token,
      'Read-only preview preserves the exact personal session',
    );
    pass('原五人档案入口、¥868、账单与清算切换，不改变微信会话');

    await driver.tap({
      selector: '#enter-demo-workspace',
      marker: 'id="enter-demo-workspace"',
      wxml: 'components/DemoAccess',
      component: '#demo-operation',
    });
    await until(() => pageIs('login'), 'interactive demo login');
    await driver.waitNode('#demo-user-A');
    await driver.tap({
      selector: '#demo-user-A',
      marker: 'class="identity ',
      wxml: 'pages/login/index',
      rowValue: 'A',
    });
    await until(() => pageIs('index'), 'A home');
    assert.ok((await session())?.mode === 'demo' && (await session())?.userId === 'A');
    await driver.navigate('/pages/archive/index?id=' + preview.source.activityId);
    await until(() => driver.hasText('868.00'), 'live original demo archive');
    pass('同一微信构建进入演示操作，A 可访问原演示数据库中的 ¥868 档案');

    await driver.navigate('/pages/create/index');
    const title = '新手指南验证 · ' + Date.now().toString().slice(-6);
    await driver.fill('#create-name', 'id="create-name"', 'pages/create/index', title);
    await driver.tap({
      selector: '#create-submit',
      marker: 'id="create-submit"',
      wxml: 'pages/create/index',
    });
    await until(() => pageIs('activity'), 'demo activity created');
    await until(() => driver.hasText(title), 'demo mutation persisted');
    const created = (await mini.currentPage())!.query.id;
    assert.ok(
      typeof created === 'string' && /^[a-f0-9-]{36}$/.test(created),
      'New demo activity id',
    );
    await driver.login('B', '/pages/index/index');
    assert.ok((await session())?.userId === 'B');
    await driver.navigate('/pages/archive/index?id=' + preview.source.activityId);
    await until(() => driver.hasText('868.00'), 'B original archive');
    pass('A 通过实际输入和提交新建演示活动，切换 B 后仍可查看原五人档案');

    await driver.navigate('/pages/me/index');
    await driver.tap({
      selector: '#exit-demo-workspace',
      marker: 'id="exit-demo-workspace"',
      wxml: 'components/DemoModeBanner',
      component: '#environment-banner',
    });
    await until(() => pageIs('index'), 'return to personal');
    const restored = await session();
    assert.ok(
      restored?.mode === 'wechat' &&
        restored.userId === personal.userId &&
        restored.token === personal.token,
      'Original WeChat login restored',
    );
    const isolated = (await bounded(
      mini.evaluate(
        `(token, created, base) => new Promise((resolve,reject)=>{
      wx.request({url:base+'/activities',header:{Authorization:'Bearer '+token},timeout:12000,
        success:r=>resolve({status:r.statusCode,leaked:Array.isArray(r.data)&&r.data.some(a=>a.id===created)}),
        fail:()=>reject(new Error('Personal API unavailable'))});
    })`,
        personal.token,
        created,
        process.env.WECHAT_API_BASE_URL ?? 'http://127.0.0.1:3003',
      ),
      'personal isolation',
    )) as { status: number; leaked: boolean };
    assert.deepEqual(isolated, { status: 200, leaked: false });
    pass('退出演示恢复同一微信令牌，演示新活动未写入个人活动列表');
    await mini.screenshot({ path: resolve(directory, 'personal-home.png') });
    const info = (await mini.send('Tool.getInfo')) as { version: string; SDKVersion: string };
    await writeFile(
      resolve(directory, 'result.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          devtoolsVersion: info.version,
          baseLibraryVersion: info.SDKVersion,
          checks,
          demoActivityId: created,
          scope:
            'Real WXML/input events, native navigation and local HTTP/SQLite. Creates one fictional demo activity. No WeChat business data mutations. Not a phone touch test.',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await bounded(
      mini.screenshot({ path: resolve(directory, 'failure.png') }),
      'failure screenshot',
      5000,
    ).catch(() => {});
    throw error;
  } finally {
    if (originalGuide !== undefined) {
      // Restore only the presentation preference changed by this UI check.
      await bounded(
        mini.evaluate(
          `value=>{if(value===true)wx.setStorageSync('gatherflow.onboarding.v1',true);else wx.removeStorageSync('gatherflow.onboarding.v1');}`,
          originalGuide,
        ),
        'restore guide preference',
        5000,
      ).catch(() => {});
      if ((await session().catch(() => null))?.mode === 'wechat') {
        await bounded(mini.reLaunch('/pages/index/index'), 'refresh personal home', 10000).catch(
          () => {},
        );
      }
    }
    await mini.disconnect();
  }
}
const watchdog = setTimeout(() => {
  console.error('Onboarding regression exceeded 300s.');
  process.exit(1);
}, 300000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
