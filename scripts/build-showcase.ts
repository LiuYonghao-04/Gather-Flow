import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, relative, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';

async function main() {
  const root = resolve('.');
  const release = JSON.parse(
    await readFile(resolve(root, 'apps/miniapp/showcase/release.json'), 'utf8'),
  ) as { appid: string; projectname: string };
  assert.match(release.appid, /^wx[a-f0-9]{16}$/);
  const source = resolve(root, 'output/showcase-source');
  const scratch = relative(resolve(root, 'output'), source);
  assert.ok(scratch && !scratch.startsWith('..') && !isAbsolute(scratch));
  await rm(source, { recursive: true, force: true });
  await mkdir(source, { recursive: true });
  await cp(resolve(root, 'apps/miniapp/src'), source, { recursive: true });
  await cp(resolve(root, 'apps/miniapp/showcase/App.vue'), resolve(source, 'App.vue'));
  const config = JSON.parse(await readFile(resolve(source, 'pages.json'), 'utf8'));
  config.pages = ['pages/demo/index', 'pages/guide/index'].map((path) => {
    const page = config.pages.find((item: { path: string }) => item.path === path);
    assert.ok(page, `Missing showcase page: ${path}`);
    return page;
  });
  await writeFile(resolve(source, 'pages.json'), JSON.stringify(config, null, 2));
  const project = JSON.parse(await readFile(resolve(source, 'project.config.json'), 'utf8'));
  project.appid = release.appid;
  project.projectname = release.projectname;
  project.description = '无需登录的五人档案与新人指南展示';
  project.setting.urlCheck = true;
  await writeFile(resolve(source, 'project.config.json'), JSON.stringify(project, null, 2));
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  manifest['mp-weixin'].appid = release.appid;
  manifest['mp-weixin'].setting.urlCheck = true;
  await writeFile(resolve(source, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await new Promise<void>((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        resolve(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
        'build',
        '-p',
        'mp-weixin',
        '--mode',
        'showcase',
        '--outDir',
        resolve(root, 'apps/miniapp/dist/showcase/mp-weixin'),
      ],
      {
        cwd: resolve(root, 'apps/miniapp'),
        env: {
          ...process.env,
          UNI_INPUT_DIR: source,
          VITE_SHOWCASE: 'true',
          VITE_API_BASE_URL: '',
          VITE_DEMO_API_BASE_URL: '',
        },
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error(`Showcase build exited ${code}`)),
    );
  });
  const app = JSON.parse(
    await readFile(resolve(root, 'apps/miniapp/dist/showcase/mp-weixin/app.json'), 'utf8'),
  );
  assert.deepEqual(app.pages, ['pages/demo/index', 'pages/guide/index']);
  const builtProject = JSON.parse(
    await readFile(
      resolve(root, 'apps/miniapp/dist/showcase/mp-weixin/project.config.json'),
      'utf8',
    ),
  );
  assert.equal(builtProject.appid, release.appid);
  console.log('PASS: standalone showcase contains only the archive and guide pages.');
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
