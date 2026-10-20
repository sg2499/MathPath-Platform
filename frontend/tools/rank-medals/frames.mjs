// node tools/rank-medals/frames.mjs <outPrefix> "<query>" <W>x<H> <t,t,...> [dpr]
// Renders exact frames of /cutscenes/rank.html (clock=manual) with SwiftShader.
import { chromium } from '/tmp/claude-0/-home-claude/3eb57ea5-8fe4-57bf-a42d-819581ccd223/scratchpad/student-preview/test/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const pub = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../public');
const [prefix, query, size = '1440x900', times = '0,1,2,3,4,5,6', dpr = '1'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((q, s) => { const p = path.join(pub, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(pub) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(dpr), isMobile: W < 700, hasTouch: W < 700 });
const errs = [], msgs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const blocked = [];
await page.route('**/*', (r) => { const u = r.request().url(); if (!u.startsWith('http://127.0.0.1')) { blocked.push(u); return r.abort(); } r.continue(); });
await page.goto(`http://127.0.0.1:${server.address().port}/cutscenes/rank.html?clock=manual&${query}`, { timeout: 120000 });
await page.waitForFunction(() => window.__rank, null, { timeout: 120000 });
fs.mkdirSync(path.dirname(prefix), { recursive: true });
for (const t of times.split(',').map(Number)) {
  await page.evaluate((x) => window.__rank.seek(x), t);
  if (t === Number(times.split(",")[0])) console.log("build ms", await page.evaluate(() => window.__rankBuildMs));
  await page.screenshot({ path: `${prefix}-${String(t).replace('.', '_')}s.png`, timeout: 300000 });
}
console.log(path.basename(prefix), 'end', await page.evaluate(() => window.__rank.end), errs.length ? 'ERR ' + errs.slice(0, 3).join(' | ') : 'no errors', blocked.length ? 'OUTSIDE REQUESTS ' + blocked.slice(0, 3) : 'no outside requests');
await browser.close(); server.close();
