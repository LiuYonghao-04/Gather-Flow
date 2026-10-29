import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { launchWechat, WechatDriver, until, bounded } from './wechat-driver';

async function main() {
  assert.ok(
    process.env.WECHAT_PROJECT_PATH?.replaceAll('\\', '/').endsWith('/dist/wechat/mp-weixin'),
  );
  const mini = await launchWechat(),
    driver = new WechatDriver(mini);
  const directory = resolve('output/wechat-m6');
  await mkdir(directory, { recursive: true });
  const checks: string[] = [],
    screenshots: string[] = [];
  const pass = (message: string) => {
    checks.push(message);
    console.log('PASS ' + message);
  };
  const pageIs = async (name: string) => {
    if ((await mini.currentPage())?.path !== `pages/${name}/index`) return false;
    await new Promise((done) => setTimeout(done, 1500));
    return (await mini.currentPage())?.path === `pages/${name}/index`;
  };
  const capture = async (name: string) => {
    try {
      await bounded(mini.screenshot({ path: resolve(directory, name + '.png') }), 'capture', 6000);
      screenshots.push(name + '.png');
    } catch {
      console.log('INFO 截图未采集：' + name);
    }
  };
  const click = async (id: string, page: string, component = '') =>
    driver.tap({ selector: '#' + id, marker: 'id="' + id + '"', wxml: page, component });
  const currentName = () =>
    bounded(
      mini.evaluate("()=>wx.getStorageSync('gatherflow.session')?.user?.name"),
      'profile name',
    ) as Promise<string | undefined>;
  async function personal() {
    await driver.navigate('/pages/me/index');
    if ((await driver.nodes('#exit-demo-workspace', '#environment-banner')).length) {
      await click('exit-demo-workspace', 'components/DemoModeBanner', '#environment-banner');
      await until(() => pageIs('index'), 'personal home');
      await driver.navigate('/pages/me/index');
    }
    if (!(await driver.nodes('#profile-edit')).length) {
      await driver.navigate('/pages/login/index');
      await click('wechat-login', 'pages/login/index');
      await until(() => pageIs('index'), 'WeChat login', 25000);
      await driver.navigate('/pages/me/index');
    }
    await driver.waitNode('#profile-edit');
  }
  async function rename(name: string) {
    await click('profile-edit', 'pages/me/index');
    await driver.fill('#profile-name', 'id="profile-name"', 'pages/me/index', name);
    await click('profile-save', 'pages/me/index');
    await until(async () => (await currentName()) === name, 'nickname persisted');
  }
  let originalName: string | undefined,
    changed = false;
  let activityId = '',
    proposalId = '',
    expenseId = '';
  try {
    await personal();
    originalName = await currentName();
    assert.ok(originalName);
    await rename('M6 同行昵称');
    changed = true;
    await until(() => driver.hasText('M6 同行昵称'), 'nickname rendered');
    await capture('profile');
    pass('通过实际输入与保存更新微信昵称，并同步到当前会话和页面');
    await driver.navigate('/pages/demo/index');
    await click('enter-demo-workspace', 'components/DemoAccess', '#demo-operation');
    await until(() => pageIs('login'), 'demo identities');
    await driver.tap({
      selector: '#demo-user-B',
      marker: 'class="identity ',
      wxml: 'pages/login/index',
      rowValue: 'B',
    });
    await until(() => pageIs('index'), 'demo B home');
    const title = 'M6 草稿验证 · ' + Date.now().toString().slice(-6);
    await driver.navigate('/pages/create/index');
    await driver.fill('#create-name', 'id="create-name"', 'pages/create/index', title);
    await driver.navigate('/pages/index/index');
    await driver.navigate('/pages/create/index');
    await until(() => driver.hasText(title), 'activity draft restored');
    await capture('activity-draft');
    await click('create-submit', 'pages/create/index');
    await until(() => pageIs('activity'), 'activity created');
    activityId = (await mini.currentPage())!.query.id as string;
    assert.match(activityId, /^[a-f0-9-]{36}$/);
    pass('活动输入退出后恢复，再经真实按钮提交成功');
    const proposalTitle = 'M6 草稿里的行程';
    const proposalPath = '/pages/proposal-edit/index?id=' + activityId;
    await driver.navigate(proposalPath);
    await driver.fill(
      '#proposal-title',
      'id="proposal-title"',
      'pages/proposal-edit/index',
      proposalTitle,
    );
    await driver.navigate('/pages/index/index');
    await driver.navigate(proposalPath);
    await until(() => driver.hasText(proposalTitle), 'proposal draft restored');
    await click('proposal-save', 'pages/proposal-edit/index');
    await until(() => pageIs('proposal'), 'proposal created');
    proposalId = (await mini.currentPage())!.query.proposalId as string;
    pass('方案输入退出后恢复，提交后生成一份方案');
    const expensePath = '/pages/expense-edit/index?id=' + activityId;
    await driver.navigate(expensePath);
    await driver.fill(
      '#expense-description',
      'id="expense-description"',
      'components/ExpenseForm',
      'M6 草稿车票',
      '#expense-form',
    );
    await driver.fill(
      '#expense-total',
      'id="expense-total"',
      'components/ExpenseForm',
      '12.34',
      '#expense-form',
    );
    await driver.navigate('/pages/index/index');
    await driver.navigate(expensePath);
    await until(() => driver.hasText('M6 草稿车票', '#expense-form'), 'expense draft restored');
    await until(() => driver.hasText('12.34', '#expense-form'), 'amount restored');
    await capture('expense-draft');
    await click('expense-save', 'components/ExpenseForm', '#expense-form');
    await until(() => pageIs('expense'), 'expense created');
    expenseId = (await mini.currentPage())!.query.expenseId as string;
    pass('账单说明和原始金额退出后恢复，实际保存成功');
    const db = new Database(
      resolve(process.env.DEMO_DATABASE_PATH ?? 'apps/api/data/gatherflow.sqlite'),
      { readonly: true },
    );
    try {
      for (const id of [activityId, proposalId, expenseId]) expectReceipt(id);
      function expectReceipt(id: string) {
        assert.match(id, /^[a-f0-9-]{36}$/);
        assert.deepEqual(
          db
            .prepare(
              "SELECT count(*) AS n FROM idempotent_requests WHERE user_id='B' AND json_extract(response_json,'$.id')=?",
            )
            .get(id),
          { n: 1 },
        );
      }
    } finally {
      db.close();
    }
    const remaining = await mini.evaluate(
      "()=>wx.getStorageInfoSync().keys.filter(k=>k.startsWith('gatherflow.draft.')).map(k=>wx.getStorageSync(k)).filter(v=>v?.data?.name?.startsWith('M6 草稿验证')||v?.data?.title==='M6 草稿里的行程'||v?.data?.description==='M6 草稿车票').length",
    );
    assert.equal(remaining, 0);
    pass('三种表单均发送请求编号并持久化唯一回执，成功提交后清除测试草稿');
  } finally {
    try {
      if (changed && originalName) {
        await personal();
        await rename(originalName);
        assert.equal(await currentName(), originalName);
        pass('测试结束恢复原微信昵称');
      }
    } finally {
      await mini.disconnect();
    }
  }
  await writeFile(
    resolve(directory, 'result.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        screenshots,
        activityId,
        proposalId,
        expenseId,
        scope:
          'Real simulator WXML/input handlers and local HTTP/SQLite. Nickname restored; creates one fictional demo activity. Not a phone touch test.',
      },
      null,
      2,
    ),
  );
}
const timer = setTimeout(() => {
  console.error('M6 simulator regression exceeded 300s');
  process.exit(1);
}, 300000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(timer));
