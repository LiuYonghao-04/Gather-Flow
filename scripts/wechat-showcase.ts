import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchWechat, WechatDriver, until } from './wechat-driver';

async function main() {
  const project = process.env.WECHAT_PROJECT_PATH;
  assert.ok(project, 'WECHAT_PROJECT_PATH is required');
  assert.ok(project.replaceAll('\\', '/').endsWith('/dist/showcase/mp-weixin'));
  const app = JSON.parse(await readFile(resolve(project, 'app.json'), 'utf8'));
  assert.deepEqual(app.pages, ['pages/demo/index', 'pages/guide/index']);
  const projectConfig = JSON.parse(await readFile(resolve(project, 'project.config.json'), 'utf8'));
  const release = JSON.parse(await readFile(resolve('apps/miniapp/showcase/release.json'), 'utf8'));
  assert.equal(projectConfig.appid, release.appid);
  const output = resolve('output/wechat-showcase');
  await mkdir(output, { recursive: true });
  const mini = await launchWechat(),
    driver = new WechatDriver(mini);
  const checks: string[] = [];
  const pass = (message: string) => {
    checks.push(message);
    console.log('PASS ' + message);
  };
  const pageIs = async (name: string) => {
    if ((await mini.currentPage())?.path !== `pages/${name}/index`) return false;
    await new Promise((done) => setTimeout(done, 1800));
    return (await mini.currentPage())?.path === `pages/${name}/index`;
  };
  try {
    await driver.navigate('/pages/demo/index');
    await until(() => driver.hasText('868.00'), 'offline archive');
    assert.equal((await driver.nodes('#demo-operation')).length, 0);
    assert.equal((await driver.nodes('#demo-home')).length, 0);
    assert.equal((await driver.nodes('#demo-back')).length, 0);
    await driver.waitNode('#showcase-guide');
    await mini.screenshot({ path: resolve(output, 'archive.png') });
    pass('首屏五人 ¥868 档案，只有两个页面，无登录、后台操作或个人活动入口');
    for (const tab of ['tasks', 'expenses', 'settlement', 'plan']) {
      await driver.tap({
        selector: '#demo-tab-' + tab,
        marker: "'pill-tab'",
        wxml: 'pages/demo/index',
        rowValue: 'demo-tab-' + tab,
      });
      if (tab !== 'plan') await mini.screenshot({ path: resolve(output, tab + '.png') });
    }
    await driver.tap({
      selector: '#demo-proposal-0',
      marker: 'id="{{proposal.',
      wxml: 'pages/demo/index',
      rowValue: 'demo-proposal-0',
    });
    assert.ok((await driver.nodes('.record-expanded')).length > 0);
    pass('行程、任务、账单与最终清算四页签，以及方案展开均可操作');
    await driver.tap({
      selector: '#showcase-guide',
      marker: 'id="showcase-guide"',
      wxml: 'pages/demo/index',
    });
    await until(() => pageIs('guide'), 'guide');
    await until(() => driver.hasText('先留一个位置'), 'guide content');
    await mini.screenshot({ path: resolve(output, 'guide.png') });
    for (let i = 0; i < 4; i++) {
      await driver.tap({
        selector: '#guide-next',
        marker: 'id="guide-next"',
        wxml: 'pages/guide/index',
      });
    }
    await until(() => pageIs('demo'), 'guide completion returns to archive');
    await driver.navigate('/pages/guide/index');
    await driver.tap({
      selector: '#guide-skip',
      marker: 'id="guide-skip"',
      wxml: 'pages/guide/index',
    });
    await until(() => pageIs('demo'), 'direct guide returns to archive');
    pass('四步指南完成和直接进入后的跳过均返回展示档案，不跳转登录');
    const info = (await mini.send('Tool.getInfo')) as { version: string; SDKVersion: string };
    await writeFile(
      resolve(output, 'result.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          appid: projectConfig.appid,
          devtoolsVersion: info.version,
          baseLibraryVersion: info.SDKVersion,
          checks,
          scope:
            'Two-page standalone showcase. Native rendered WXML events. No API initialization or business writes. Phone scanning still requires user validation.',
        },
        null,
        2,
      ),
    );
  } finally {
    await mini.disconnect();
  }
}
const timer = setTimeout(() => {
  console.error('Showcase regression timed out');
  process.exit(1);
}, 180000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(timer));
