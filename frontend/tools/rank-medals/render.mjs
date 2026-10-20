// node tools/rank-medals/render.mjs <outDir> <size> <tier,tier,...>
// Renders medallion stills with SwiftShader WebGL. Serves frontend/ itself.
import { chromium } from '/tmp/claude-0/-home-claude/3eb57ea5-8fe4-57bf-a42d-819581ccd223/scratchpad/student-preview/test/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [outDir, size = '1024', list = ''] = process.argv.slice(2);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((q, s) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(root) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/tools/rank-medals/render.html`);
await page.waitForFunction(() => window.ready, null, { timeout: 60000 }).catch(() => {});
if (errs.length) console.log('errors', errs.slice(0, 5));
fs.mkdirSync(outDir, { recursive: true });
const opts = JSON.parse(process.env.OPTS || '{}');
for (const tier of list.split(',').filter(Boolean)) {
  const t0 = Date.now();
  const url = await page.evaluate(([t, s, o]) => window.renderTier(t, s, o), [tier, Number(size), opts]);
  fs.writeFileSync(path.join(outDir, `${tier}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(tier, Date.now() - t0, 'ms');
}
if (errs.length) console.log('errors', errs.slice(0, 5));
await browser.close(); server.close();
