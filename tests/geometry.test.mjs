import {readFileSync} from 'node:fs';
import Module from 'manifold-3d';
import {compute} from '../src/calc.mjs';
import {laserSvgs, layoutSheets, sheetBounds, wallOutline, buildPrinted, limitAngle, gearCorrectionSvg} from '../src/make.mjs';
import {edgeCheck, binarySTL} from '../src/mesh.mjs';
import {frontView, sideView, topView, sfChart} from '../src/draw.mjs';

let fail = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const spec = compute({});
const lay = layoutSheets(spec);
ok(lay.sheets.length === 2 && lay.overflow.length === 0, `排版 ${lay.sheets.length} 張，溢出 ${lay.overflow.length}`);
const names = lay.sheets.flatMap(s => s.items.map(i => i.part.name));
ok(names.filter(n => n.startsWith('壁板')).length === 4, '壁板 4 片');
ok(names.filter(n => n === '內隔板').length === 2, '隔板 2 片（另有備品）');
ok(names.filter(n => n === '三角補強片').length === 4, '補強片 4 片');
ok(names.some(n => n.startsWith('上木板')) && names.some(n => n.startsWith('下木板 L1')) && names.some(n => n.startsWith('下木板 L2')), '上木板與 L1、L2');
const up = lay.sheets.flatMap(s => s.items).find(i => i.part.id === 'upper').part;
ok(Math.abs(up.w - 130) < 0.1 && Math.abs(up.h - 130) < 0.1 && up.holes.length >= 12, `上木板 ${up.w.toFixed(0)}，孔 ${up.holes.length}`);
let overlap = 0, outside = 0;
for (const sh of lay.sheets) {
  const bs = sh.items.map(it => ({n: it.part.name, ...sheetBounds(it)}));
  for (const b of bs) if (b.x0 < -0.05 || b.y0 < -0.05 || b.x1 > 900.05 || b.y1 > 600.05) outside++;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const sep = a.x1 <= b.x0 + 0.4 || b.x1 <= a.x0 + 0.4 || a.y1 <= b.y0 + 0.4 || b.y1 <= a.y0 + 0.4;
    if (!sep) overlap++;
  }
}
ok(overlap === 0 && outside === 0, `重疊 ${overlap}、超出紙張 ${outside}`);

const svg = laserSvgs(spec);
for (const sh of svg.sheets) {
  ok(sh.svg.includes('width="900mm"') && sh.svg.includes('height="600mm"') && sh.svg.includes('viewBox="0 0 900 600"'), `${sh.title} 是 900×600 mm`);
  ok(sh.svg.includes('#ff0000') && sh.svg.includes('#0000ff'), `${sh.title} 紅切藍雕`);
  ok((sh.svg.match(/<path /g) || []).length > 8, `${sh.title} 的切割線是 path，不是純文字`);
  ok(!/scale\s*\(/i.test(sh.svg) && !sh.svg.includes('transform="matrix'), `${sh.title} 沒有另做縮放`);
}

const wall = wallOutline(spec);
const at = y => wall.filter(p => Math.abs(p[1] - y) < 0.15);
const rightBottom = Math.max(...at(spec.body0).filter(p => p[0] > 0).map(p => p[0]));
const leftBottom = Math.min(...at(spec.body0).filter(p => p[0] < 0).map(p => p[0]));
ok(Math.abs(rightBottom - (spec.OUT / 2 - spec.T)) < 0.1 && Math.abs(leftBottom + spec.OUT / 2) < 0.1, `指接左右錯開：右緣下端 ${rightBottom}（缺口）、左緣下端 ${leftBottom}（指）`);

const M = await Module();
M.setup();
const pr = buildPrinted(M, spec);
const gearSvg = gearCorrectionSvg(spec);
ok(gearSvg.includes('教具老師修正') && gearSvg.includes('待確認') && gearSvg.includes('Ø20') && !gearSvg.includes('執行長'), '修正檔有 Ø20 穿線、待確認，且不改原設計的稱呼');
for (const k of ['hub']) {
  const e = edgeCheck(pr[k].solid);
  const stl = binarySTL(pr[k].solid);
  ok(pr[k].status === 'NoError' && e.closed && pr[k].volume > 0, `${pr[k].name} 封閉（破邊 ${e.open}）`);
  ok(stl.length === 84 + pr[k].tris * 50 && stl[80] === (pr[k].tris & 255), `${pr[k].name} STL 位元組數正確`);
}
const hb = pr.hub.solid.boundingBox();
ok(Math.abs((hb.max[0] - hb.min[0]) - 70) < 0.2 && Math.abs((hb.max[2] - hb.min[2]) - 75) < 0.2, `輪轂包絡 ${[0, 1, 2].map(i => (hb.max[i] - hb.min[i]).toFixed(1)).join('×')}（直徑 70、長 75）`);
ok(limitAngle() > 165 && limitAngle() < 172, `限位約 ±${limitAngle().toFixed(1)}°`);

for (const [name, svgText] of [['正視', frontView(spec)], ['側視', sideView(spec, 0)], ['俯視', topView(spec, 40)], ['圖', sfChart(spec)]]) {
  ok(svgText.includes('<svg') && /[\u4e00-\u9fff]/.test(svgText), name + ' 有圖也有中文');
}

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
ok(html.includes('href="style.css"') && html.includes('src="app.js"') && !html.includes('src="/') && !html.includes('href="/'), '頁面資源用相對路徑');

if (fail) { console.log(fail + ' 項失敗'); process.exit(1); }
console.log('幾何全部通過');
