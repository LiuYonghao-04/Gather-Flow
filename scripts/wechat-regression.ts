import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchWechat, WechatDriver, until, bounded } from './wechat-driver';

async function main() {
  const fixture = JSON.parse(await readFile('output/m23-demo.json', 'utf8')) as {
    activityId: string;
    pendingExpenseId: string;
  };
  assert.match(fixture.activityId, /^[a-f0-9-]{36}$/);
  assert.match(fixture.pendingExpenseId, /^[a-f0-9-]{36}$/);
  const output = resolve('output/wechat-regression');
  await mkdir(output, { recursive: true });
  const mini = await launchWechat();
  const driver = new WechatDriver(mini);
  const checks: string[] = [];
  const pass = (label: string) => {
    checks.push(label);
    console.log('PASS ' + label);
  };
  const settlement = '/pages/settlement/index?id=' + fixture.activityId;
  try {
    const info = (await bounded(mini.send('Tool.getInfo'), 'tool info')) as {
      version: string;
      SDKVersion: string;
    };
    await driver.login('A', '/pages/share/index?id=' + fixture.activityId);
    await driver.waitNode('.copy-btn');
    const readShare = () =>
      bounded(
        mini.evaluate(`() => {
      const page = getCurrentPages().slice(-1)[0];
      const payload = page.onShareAppMessage({from: 'button', target: {dataset: {}}});
      return {title: payload.title, path: payload.path};
    }`),
        'share callback',
      ) as Promise<{ title: string; path: string }>;
    const firstCard = await readShare();
    await driver.waitNode('.copy-btn');
    const secondCard = await readShare();
    assert.ok(
      /^\/pages\/invite\/index\?token=[a-f0-9]{64}$/.test(firstCard.path),
      'Prepared server invitation path',
    );
    assert.ok(
      /^\/pages\/invite\/index\?token=[a-f0-9]{64}$/.test(secondCard.path),
      'Next server invitation path',
    );
    assert.ok(
      firstCard.path !== secondCard.path,
      'Each share callback prepares a fresh invitation',
    );
    assert.ok(firstCard.title.includes('山野三日'));
    pass('原生分享回调返回服务端邀请路径，下一次分享使用新卡；未发送给联系人');
    // The fixture script creates only fictional demo data. All operations below
    // invoke rendered UI handlers and the real HTTP API, including confirmations.
    await driver.login(
      'A',
      `/pages/expense/index?id=${fixture.activityId}&expenseId=${fixture.pendingExpenseId}`,
    );
    await driver.tap({
      selector: '#confirm-expense',
      marker: 'id="confirm-expense"',
      wxml: 'pages/expense/index',
    });
    await driver.confirm();
    await until(() => driver.hasText('已确认 · 计入预计结算'), 'expense confirmation');
    assert.equal((await driver.nodes('#confirm-expense')).length, 0);
    pass('A 登录回跳、原生弹窗确认停车费，页面更新为已确认');

    await driver.login('B', settlement);
    await until(
      () =>
        driver
          .hasText('还没有最终清算')
          .then(async (found) => found || (await driver.nodes('.notice')).length > 0),
      'B settlement loaded',
    );
    // Wait for actual content (not initial skeleton), then assert owner-only actions.
    await driver.waitNode('.section-heading');
    assert.equal((await driver.nodes('#freeze-settlement')).length, 0);
    assert.equal((await driver.nodes('#close-activity')).length, 0);
    pass('B 无冻结和结束权限入口');

    await driver.login('A', settlement);
    await driver.tap({
      selector: '#freeze-settlement',
      marker: 'id="freeze-settlement"',
      wxml: 'pages/settlement/index',
    });
    await driver.confirm();
    await until(() => driver.hasText('868.00'), 'frozen total');
    await driver.waitNode('#reopen-settlement');
    await driver.tap({
      selector: '#reopen-settlement',
      marker: 'id="reopen-settlement"',
      wxml: 'pages/settlement/index',
    });
    await driver.confirm();
    await driver.waitNode('#freeze-settlement');
    await driver.tap({
      selector: '#freeze-settlement',
      marker: 'id="freeze-settlement"',
      wxml: 'pages/settlement/index',
    });
    await driver.confirm();
    await driver.waitNode('#reopen-settlement');
    pass('A 冻结 ¥868.00，未到账时重开并再次冻结');

    await driver.login('B', settlement);
    await until(() => driver.hasText('868.00'), 'B frozen settlement');
    assert.equal((await driver.nodes('.receipt-action', '#current-ledger')).length, 0);
    pass('B 作为付款人无确认收款入口');
    await driver.login('A', settlement);
    await until(() => driver.hasText('868.00'), 'A frozen settlement');
    const receipts = await driver.nodes('.receipt-action', '#current-ledger');
    assert.equal(receipts.length, 4);
    for (let remaining = 4; remaining > 0; remaining--) {
      const rows = await driver.nodes('.receipt-action', '#current-ledger');
      const transferId = rows[0]?.dataset.transferId;
      assert.ok(transferId);
      await driver.tap({
        selector: '.receipt-action',
        marker: 'receipt-action',
        wxml: 'components/SettlementLedger',
        component: '#current-ledger',
        rowValue: transferId,
      });
      await driver.confirm();
      await until(
        async () =>
          (await driver.nodes('.receipt-action', '#current-ledger')).length === remaining - 1,
        'receipt persisted',
      );
      assert.equal((await driver.nodes('#reopen-settlement')).length, 0);
    }
    pass('A 逐笔确认四笔虚构收款，首次到账后重开入口消失');
    await driver.waitNode('#close-activity');
    await driver.tap({
      selector: '#close-activity',
      marker: 'id="close-activity"',
      wxml: 'pages/settlement/index',
    });
    await driver.confirm();
    await until(
      async () => (await mini.currentPage())?.path === 'pages/archive/index',
      'archive navigation',
    );
    await until(() => driver.hasText('868.00'), 'archive total');
    await driver.waitNode('.archive-summary');
    await new Promise((done) => setTimeout(done, 600));
    await bounded(mini.screenshot({ path: resolve(output, 'archive.png') }), 'archive screenshot');
    await driver.navigate(settlement);
    await until(() => driver.hasText('868.00'), 'archived settlement');
    for (const selector of ['#freeze-settlement', '#reopen-settlement', '#close-activity'])
      assert.equal((await driver.nodes(selector)).length, 0);
    assert.equal((await driver.nodes('.receipt-action', '#current-ledger')).length, 0);
    pass('结束后跳转 ¥868.00 档案，清算页所有财务变更入口消失');
    await driver.navigate('/pages/archive/index?id=' + fixture.activityId);
    await writeFile(
      resolve(output, 'result.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          activityId: fixture.activityId,
          devtoolsVersion: info.version,
          baseLibraryVersion: info.SDKVersion,
          checks,
          scope:
            'Simulator event-driven regression using real WXML bindings, native confirmation dialogs and local HTTP/SQLite. Not physical touch, phone or real WeChat authentication.',
        },
        null,
        2,
      ),
    );
    console.log('Simulator regression passed; evidence: output/wechat-regression/');
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
  console.error(
    'Simulator regression exceeded 180s; inspect compilation and automation connection.',
  );
  process.exit(1);
}, 180000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(watchdog));
