import { chromium } from 'playwright';
import { spawn } from 'child_process';
const srv = spawn('python3', ['-m', 'http.server', '8765'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const views = process.argv.slice(2);
for (const v of views) {
  const [view, extra] = v.split('?');
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('console', m => console.log(view, m.text()));
  p.on('pageerror', e => console.log(view, 'ERR', e.message));
  await p.goto(`http://localhost:8765/render.html?view=${view}&w=1600&h=1000&${extra||''}`);
  await p.waitForFunction(() => window.__done, null, { timeout: 120000 });
  await p.locator('canvas').screenshot({ path: `out_${view}${extra ? '_' + extra.replace(/[^a-z0-9]/gi, '') : ''}.png` });
  await p.close();
}
await b.close(); srv.kill();
