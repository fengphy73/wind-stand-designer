import {spawn} from 'node:child_process';
import {mkdir, copyFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const port = 8765;
const root = new URL('../docs/', import.meta.url);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {cwd: root.pathname, stdio: 'ignore'});
await new Promise(r => setTimeout(r, 400));

const outDir = '/tmp/wsd-shots';
await mkdir(outDir, {recursive: true});
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'],
});
let fail = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});
  await page.goto(`http://127.0.0.1:${port}/index.html`, {waitUntil: 'networkidle0', timeout: 60000});
  await page.waitForFunction('window.__ready === true', {timeout: 60000});
  await new Promise(r => setTimeout(r, 400));
  ok(errors.length === 0, '頁面沒有例外：' + errors.join(' | '));
  const text = await page.$eval('#summary', el => el.innerText);
  ok(text.includes('2.74'), '畫面上有 calcD 對照 2.74');
  ok(/葉尖最大半徑/.test(text) && /安全係數/.test(text), '摘要有葉尖半徑與安全係數');
  const sf4 = await page.$eval('[data-k="sf4"]', el => el.textContent);
  ok(Number(sf4) > 1.5, `預設 4 m/s 係數 ${sf4} 大於 1.5`);
  const shots = [
    ['01-summary', '#summary'],
    ['02-3d', '#view-3d'],
    ['03-ortho', '#view-ortho'],
    ['04-chart', '#view-chart'],
    ['05-explode', '#view-explode'],
    ['06-laser', '#view-laser'],
  ];
  for (const [name, sel] of shots) {
    const el = await page.$(sel);
    await el.screenshot({path: `${outDir}/${name}.png`});
    ok(true, '截圖 ' + name);
  }
  await page.evaluate(() => window.__wsd.pose(60));
  await new Promise(r => setTimeout(r, 200));
  await (await page.$('#fig-top')).screenshot({path: `${outDir}/07-yaw.png`});
  await page.evaluate(() => window.__wsd.set({blade: 450, hubZ: 520}));
  await page.waitForFunction(() => document.querySelector('#summary')?.innerText.includes('超出'), {timeout: 20000});
  const warn = await page.$eval('#summary', el => el.innerText);
  ok(warn.includes('超出') && /超出圓柱半徑\s+\d/.test(warn), '葉長 450 會紅字寫出超出多少');
  await (await page.$('#summary')).screenshot({path: `${outDir}/08-over.png`});
  const canvas = await page.$('#canvas canvas');
  const blank = await canvas.evaluate(c => {
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    if (!ctx) return true;
    const pix = new Uint8Array(4);
    ctx.readPixels(c.width / 2, c.height / 2, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pix);
    return pix[3] === 0 && pix[0] === 0;
  }).catch(() => false);
  ok(!blank, '3D 畫布有畫到東西');
} finally {
  await browser.close();
  server.kill();
}
if (fail) { console.log(fail + ' 項失敗'); process.exit(1); }
console.log('截圖通過，檔案在 ' + outDir);
