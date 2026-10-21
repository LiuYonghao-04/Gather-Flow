import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import automator from 'miniprogram-automator';
import { spawn } from 'node:child_process';

export const wechatProject = resolve(
  process.env.WECHAT_PROJECT_PATH ?? 'apps/miniapp/dist/build/mp-weixin',
);
type Mini = Awaited<ReturnType<typeof automator.connect>>;
export type RenderedNode = {
  width: number;
  height: number;
  disabled?: boolean;
  dataset: Record<string, string>;
};

export async function bounded<T>(
  operation: Promise<T>,
  label: string,
  timeout = 15000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function until(check: () => Promise<boolean>, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Condition not met: ${label}`);
}

// Page/Element RPCs hang in DevTools 2.01.2510290. The official evaluate channel still
// reaches the real app service; use native selector queries and existing WXML handlers.
// Never inject sessions, setData, Vue state, business responses or mock modal outcomes.
export class WechatDriver {
  constructor(readonly mini: Mini) {}

  async nodes(selector: string, component = ''): Promise<RenderedNode[]> {
    return bounded(
      this.mini.evaluate(
        `(selector, component) => new Promise(resolve => {
        const page = getCurrentPages().slice(-1)[0];
        const scope = component && page ? page.selectComponent(component) : page;
        if (!scope) { resolve([]); return; }
        wx.createSelectorQuery().in(scope).selectAll(selector)
          .fields({dataset: true, size: true, rect: true, properties: ['disabled']}, resolve).exec();
      })`,
        selector,
        component,
      ),
      `query ${selector}`,
    );
  }

  async waitNode(selector: string, component = '') {
    await until(
      async () =>
        (await this.nodes(selector, component)).some(
          (node) => node.width > 0 && node.height > 0 && !node.disabled,
        ),
      `enabled ${selector}`,
    );
  }

  async navigate(path: string) {
    await until(
      () =>
        bounded(
          this.mini.evaluate(
            '() => typeof getCurrentPages === "function" && getCurrentPages().length > 0',
          ),
          'app readiness',
          5000,
        )
          .then(Boolean)
          .catch(() => false),
      'simulator app service ready',
      45000,
    );
    await bounded(this.mini.reLaunch(path), 'navigate', 30000);
    await until(
      async () => (await this.mini.currentPage())?.path === path.slice(1).split('?')[0],
      path,
    );
  }

  async hasText(text: string, component = ''): Promise<boolean> {
    return bounded(
      this.mini.evaluate(
        `(text, component) => {
      const p = getCurrentPages().slice(-1)[0];
      const scope = component && p ? p.selectComponent(component) : p;
      return !!scope && JSON.stringify(scope.data).includes(text);
    }`,
        text,
        component,
      ),
      'rendered text',
    );
  }

  async tap(options: {
    selector: string;
    marker: string;
    wxml: string;
    component?: string;
    rowValue?: string;
  }) {
    const { selector, marker, component = '', rowValue = '' } = options;
    await this.waitNode(selector, component);
    const source = await readFile(resolve(wechatProject, options.wxml + '.wxml'), 'utf8');
    const tags = [...source.matchAll(/<button\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => tag.includes(marker));
    assert.equal(tags.length, 1, `Unique compiled button: ${marker}`);
    const binding = tags[0]!.match(/bindtap="{{([\w.]+)}}"/)?.[1];
    assert.ok(binding, `Compiled tap binding missing for ${marker}`);
    const parts = binding.split('.');
    assert.ok(parts.length <= 2, `Unsupported binding ${binding}; inspect new compiler output`);
    await bounded(
      this.mini.evaluate(
        `(selector, component, key, repeated, rowValue) => {
      const page = getCurrentPages().slice(-1)[0];
      const scope = component ? page.selectComponent(component) : page;
      if (!scope) throw new Error('Component unavailable');
      const matches = [];
      function visit(value) {
        if (!value || typeof value !== 'object') return;
        if (!Array.isArray(value) && typeof value[key] === 'string'
            && typeof scope[value[key]] === 'function'
            && (!rowValue || Object.values(value).includes(rowValue))) matches.push(value[key]);
        Object.values(value).forEach(visit);
      }
      if (repeated) visit(scope.data); else matches.push(scope.data[key]);
      if (matches.length !== 1 || typeof scope[matches[0]] !== 'function')
        throw new Error('Expected exactly one rendered event handler');
      scope[matches[0]]({
        type: 'tap', detail: {}, timeStamp: Date.now(),
        target: {id: selector.replace(/^#/, ''), dataset: {}},
        currentTarget: {id: selector.replace(/^#/, ''), dataset: {}}
      });
      return true;
    }`,
        selector,
        component,
        parts.at(-1),
        parts.length === 2,
        rowValue,
      ),
      `tap ${marker}`,
    );
  }

  async confirm() {
    // Native.confirmModal acknowledges the real simulator dialog; no mockWxMethod.
    await new Promise((done) => setTimeout(done, 400));
    await bounded(this.mini.native().confirmModal(), 'native confirmation');
  }

  async login(user: 'A' | 'B', returnTo: string) {
    await this.navigate('/pages/login/index?returnTo=' + encodeURIComponent(returnTo));
    await this.tap({
      selector: '#demo-user-' + user,
      marker: 'class="identity ',
      wxml: 'pages/login/index',
      rowValue: user,
    });
    await until(
      async () => (await this.mini.currentPage())?.path === returnTo.slice(1).split('?')[0],
      `login ${user} returnTo`,
    );
  }
}

export async function launchWechat() {
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
