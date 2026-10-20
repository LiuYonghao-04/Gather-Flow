import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import automator from 'miniprogram-automator';
import { spawn } from 'node:child_process';

async function launch() {
  if (process.env.WECHAT_WS_ENDPOINT)
    return automator.connect({ wsEndpoint: process.env.WECHAT_WS_ENDPOINT });
  const cliPath =
    process.env.WECHAT_CLI_PATH ?? 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
  const projectPath = resolve(
    process.env.WECHAT_PROJECT_PATH ?? 'apps/miniapp/dist/build/mp-weixin',
  );
  if (process.platform !== 'win32')
    return automator.launch({ cliPath, projectPath, trustProject: true, timeout: 90000 });
  // Node 22 cannot spawn .bat directly. PowerShell receives an encoded command with quoted paths.
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const port = Number(process.env.WECHAT_AUTO_PORT ?? 9420);
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid automation port');
  const command = `& ${quote(cliPath)} auto --project ${quote(projectPath)} --auto-port ${port} --trust-project`;
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
    { windowsHide: true, stdio: 'ignore' },
  );
  let launchError: Error | undefined;
  child.on('error', (error) => {
    launchError = error;
  });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`WeChat CLI exited with ${code}`)),
    );
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    try {
      return await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(
    'WeChat automation connection timed out. Check IDE login, service port and project AppID.',
  );
}

async function main() {
  const output = resolve('output/wechat');
  await mkdir(output, { recursive: true });
  const mini = await launch();
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
