import {readFileSync} from 'node:fs';
import Module from 'manifold-3d';
import {compute, SHEET, GEAR_FRONT_X, GEAR_PLATE, BOOM} from '../src/calc.mjs';
import {laserSvgs, layoutSheets, sheetBounds, wallOutline, buildPrinted, buildLaserSolids, limitAngle, gearCorrectionSvg, BASE_MARGIN} from '../src/make.mjs';
import {edgeCheck, binarySTL} from '../src/mesh.mjs';
import {frontView, sideView, topView, sfChart} from '../src/draw.mjs';

let fail = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
const spec = compute({});
const lay = layoutSheets(spec);
ok(lay.overflow.length === 0 && !lay.sheets.some(s => s.items.some(i => i.part.id === 'base')), `600×450 共 ${lay.sheets.length} 張，不含底板`);
ok(lay.base && Math.abs(lay.base.w - 500) < 0.1 && Math.abs(lay.base.h - 500) < 0.1, `底板外框 ${lay.base.w.toFixed(0)}×${lay.base.h.toFixed(0)}`);
ok(lay.sheets.some(s => s.items.some(i => i.part.id === 'gear-lower')), '加長下板有排進板材');
const gus = lay.sheets.flatMap(s => s.items).find(i => i.part.id === 'gus-0').part;
ok(Math.abs(gus.h - (115 + 7)) < 0.2 || Math.abs(gus.w - (115 + 7)) < 0.2, `補強片含 7 mm 底板榫，外框 ${gus.w.toFixed(1)}×${gus.h.toFixed(1)}`);
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
  for (const b of bs) if (b.x0 < -0.05 || b.y0 < -0.05 || b.x1 > SHEET.w + 0.05 || b.y1 > SHEET.h + 0.05) outside++;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const sep = a.x1 <= b.x0 + 0.4 || b.x1 <= a.x0 + 0.4 || a.y1 <= b.y0 + 0.4 || b.y1 <= a.y0 + 0.4;
    if (!sep) overlap++;
  }
}
ok(overlap === 0 && outside === 0, `重疊 ${overlap}、超出紙張 ${outside}`);

const svg = laserSvgs(spec);
for (const sh of svg.sheets) {
  ok(sh.svg.includes(`width="${SHEET.w}mm"`) && sh.svg.includes(`height="${SHEET.h}mm"`) && sh.svg.includes(`viewBox="0 0 ${SHEET.w} ${SHEET.h}"`) && sh.title.includes('利用率'), `${sh.title} 是 ${SHEET.w}×${SHEET.h} mm`);
  ok(sh.svg.includes('#ff0000') && sh.svg.includes('#0000ff'), `${sh.title} 紅切藍雕`);
  ok((sh.svg.match(/<path /g) || []).length > 8, `${sh.title} 的切割線是 path，不是純文字`);
  ok(!/scale\s*\(/i.test(sh.svg) && !sh.svg.includes('transform="matrix'), `${sh.title} 沒有另做縮放`);
}
const baseSvg = svg.base;
ok(baseSvg.notice.includes('底板需另用大板切割（至少 500×500 加邊距）') && baseSvg.svg.includes(`width="${baseSvg.w}mm"`) && baseSvg.w === 500 + BASE_MARGIN * 2, `底板大板 ${baseSvg.w}×${baseSvg.h}，${baseSvg.notice}`);

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
const solids = buildLaserSolids(M, spec);
const box = s => s.solid.boundingBox();
const boom = solids.find(s => s.id === 'boom');
const lower = solids.find(s => s.id === 'gear-lower');
const bB = box(boom), lB = box(lower);
ok(Math.abs((lB.max[2] - lB.min[2]) - spec.params.gearPlateT) < 0.2 && Math.abs(lB.min[2] - spec.stack.zGearBot) < 0.2, `下板厚 ${(lB.max[2] - lB.min[2]).toFixed(1)}，底面 z ${lB.min[2].toFixed(1)}`);
ok(Math.abs((bB.max[2] - bB.min[2]) - BOOM.thick) < 0.2 && Math.abs(bB.min[2] - lB.max[2]) < 0.2, `尾桿厚 ${(bB.max[2] - bB.min[2]).toFixed(1)}，底面貼下板頂 ${lB.max[2].toFixed(1)}`);
ok(Math.abs(bB.max[0] - (GEAR_FRONT_X - GEAR_PLATE.len - 20)) < 0.3 && Math.abs((lB.max[0] - lB.min[0]) - (GEAR_PLATE.len + 80)) < 0.5, `尾桿從縮寬處 ${bB.max[0].toFixed(1)} 起，下板長 ${(lB.max[0] - lB.min[0]).toFixed(1)}`);
for (const s of solids) s.solid.delete();
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
