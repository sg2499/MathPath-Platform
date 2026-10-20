// node tools/rank-medals/record.mjs <out.mp4> "<query>" <W>x<H> <fps> <seconds> [audio.wav|-] [dpr]
// Frame-perfect video of /cutscenes/rank.html: every frame is rendered at its
// exact time with clock=manual, then encoded with ffmpeg.
import { chromium } from '/tmp/claude-0/-home-claude/3eb57ea5-8fe4-57bf-a42d-819581ccd223/scratchpad/student-preview/test/node_modules/playwright/index.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process';
const pub = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../public');
const [out, query, size = '1920x1080', fps = '60', secs = '8', audioArg, dpr = '1'] = process.argv.slice(2);
const audio = audioArg && audioArg !== '-' ? audioArg : null;
const [W, H] = size.split('x').map(Number);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp' };
const server = http.createServer((q, s) => { const p = path.join(pub, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(pub) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(s); }).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(dpr), isMobile: W < 700, hasTouch: W < 700 });
await page.goto(`http://127.0.0.1:${server.address().port}/cutscenes/rank.html?clock=manual&${query}`, { timeout: 300000 });
await page.waitForFunction(() => window.__rank, null, { timeout: 300000 });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rankrec-'));
const n = Math.round(Number(fps) * Number(secs));
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__rank.seek(t), i / Number(fps));
  await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, '0')}.png`), timeout: 300000 });
  if (i % 60 === 0) console.log(path.basename(out), 'frame', i, '/', n);
}
await browser.close(); server.close();
const args = ['-y', '-loglevel', 'error', '-framerate', fps, '-i', path.join(dir, 'f%05d.png')];
if (audio) args.push('-i', audio, '-c:a', 'aac', '-b:a', '160k', '-shortest');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'slow', '-tune', 'film', '-movflags', '+faststart', out);
execFileSync('ffmpeg', args);
fs.rmSync(dir, { recursive: true, force: true });
console.log(path.basename(out), n, 'frames,', Math.round(fs.statSync(out).size / 1024), 'KB');
