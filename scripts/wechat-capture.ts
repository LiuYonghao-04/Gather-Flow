import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { launchWechat } from './wechat-driver';

async function main() {
  const output = resolve('output/wechat');
  await mkdir(output, { recursive: true });
  const mini = await launchWechat();
  try {
    const page = await mini.currentPage();
    assert.ok(page && /^pages\/[a-z-]+\/index$/.test(page.path), 'Open a GatherFlow page first');
    const filename = page.path.replaceAll('/', '-');
    const target = resolve(output, filename + '.png');
    const info = (await mini.send('Tool.getInfo')) as { version: string; SDKVersion: string };
    await mini.screenshot({ path: target });
    await writeFile(
      resolve(output, filename + '.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          page: page.path,
          devtoolsVersion: info.version,
          baseLibraryVersion: info.SDKVersion,
          screenshot: target,
          scope: 'Actual simulator screenshot; not an automated business-flow assertion',
        },
        null,
        2,
      ),
    );
    console.log(`Captured ${page.path}: ${target}`);
  } finally {
    await mini.disconnect();
  }
}
const watchdog = setTimeout(() => {
  console.error(
    'WeChat capture timed out after 120s; check simulator compilation and service port.',
  );
  process.exit(1);
}, 120000);
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  })
  .finally(() => clearTimeout(watchdog));
