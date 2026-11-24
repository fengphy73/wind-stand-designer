// 檢查雷切排版：外框、板邊 5 mm、零件間距 ≥ 3 mm，以及放不下時的提示。
import {compute} from '../src/calc.mjs';
import {laserSvgs, packParts, groupNotice, sheetBounds, STOCKS, SHEET_MARGIN, SHEET_GAP} from '../src/make.mjs';

let fail = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

function pairGap(a, b) {
  const xGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
  const yGap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
  if (xGap > 0 && yGap > 0) return Math.hypot(xGap, yGap);
  if (xGap > 0) return xGap;
  if (yGap > 0) return yGap;
  return Math.min(xGap, yGap);
}

function cutBox(svg) {
  const cut = svg.slice(svg.indexOf('id="cut"'), svg.indexOf('id="engrave"'));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const m of cut.matchAll(/d="([^"]+)"/g)) {
    const nums = m[1].match(/-?\d+\.\d+/g);
    if (!nums) continue;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = +nums[i], y = +nums[i + 1];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      n++;
    }
  }
  return {x0, y0, x1, y1, n};
}

const svg = laserSvgs(compute({}));
ok(svg.groups.length === 2 && svg.overflow.length === 0, `預設兩種板，超出 ${svg.overflow.length} 件`);

for (const g of svg.groups) {
  ok(g.sheets.length === 1, `${g.thick} mm 張數 ${g.sheets.length}`);
  const sh = g.sheets[0];
  const frame = sh.svg.match(/width="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  ok(!!frame && +frame[1] === g.w && +frame[2] === g.h && +frame[3] === g.w && +frame[4] === g.h, `${g.thick} mm 外框 ${frame && frame[1]}×${frame && frame[2]}，viewBox ${frame && frame[3]}×${frame && frame[4]}`);
  ok(!/scale\s*\(/i.test(sh.svg) && !sh.svg.includes('transform="matrix'), `${g.thick} mm SVG 沒有另做縮放`);
  const box = cutBox(sh.svg);
  const edge = Math.min(box.x0, box.y0, g.w - box.x1, g.h - box.y1);
  const bs = sh.items.map(it => sheetBounds(it));
  let minGap = Infinity;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) minGap = Math.min(minGap, pairGap(bs[i], bs[j]));
  const bboxEdge = Math.min(...bs.flatMap(b => [b.x0, b.y0, g.w - b.x1, g.h - b.y1]));
  ok(box.n > 20 && edge >= SHEET_MARGIN - 0.02, `${g.thick} mm 切割點 ${box.n}，離板邊最小 ${edge.toFixed(3)} mm`);
  ok(bboxEdge >= SHEET_MARGIN - 0.02 && minGap >= SHEET_GAP - 0.02, `${g.thick} mm 外框離板邊最小 ${bboxEdge.toFixed(3)} mm，零件間距最小 ${minGap.toFixed(3)} mm`);
  console.log(`量測 ${g.thick} mm 外框 ${g.w}×${g.h} 張數 ${g.sheets.length} 零件 ${sh.items.length} 切割點離板邊 ${edge.toFixed(3)} mm 外框離板邊 ${bboxEdge.toFixed(3)} mm 最小間距 ${minGap.toFixed(3)} mm`);
  console.log(`  零件：${sh.partNames.join('、')}`);
}

const expect7 = ['底板', '上木板', '下木板 L1', '下木板 L2'];
const names7 = svg.groups.find(g => g.thick === 7).sheets[0].partNames;
ok(names7.length === 4 && expect7.every(k => names7.some(n => n.includes(k))), `7 mm：${names7.join('、')}`);
const names5 = svg.groups.find(g => g.thick === 5).sheets[0].partNames;
const expect5 = ['壁板', '內隔板', '備品', '三角補強片', '柱腳套框', '尾桿', '齒輪下板', '導槽', '限位'];
ok(names5.length === 17 && expect5.every(k => names5.some(n => n.includes(k))), `5 mm ${names5.length} 件：${names5.join('、')}`);

const big = laserSvgs(compute({base: 500}));
const big7 = big.groups.find(g => g.thick === 7);
ok(big7.overflow.length === 1 && big7.overflow[0].includes('底板') && big7.overflow[0].includes('500') && big7.overflow[0].includes('450×900'), big7.overflow[0]);
ok(big7.notice.includes('超出') && big7.notice.includes('底板') && !big7.sheets.some(sh => sh.partNames.some(n => n.startsWith('底板'))), big7.notice);
ok(big7.sheets.length === 1 && big7.sheets[0].partNames.length === 3, `500 底板拿掉後 7 mm 仍 ${big7.sheets.length} 張、${big7.sheets[0].partNames.length} 件`);
const big5 = big.groups.find(g => g.thick === 5);
ok(big5.sheets.length === 1 && big5.overflow.length === 0, `底板改 500 時 5 mm 仍是 ${big5.sheets.length} 張`);

const fake = Array.from({length: 10}, (_, i) => ({id: 'fake-' + i, name: '試排' + (i + 1), w: 200, h: 200}));
const many = packParts(fake, STOCKS[0]);
ok(many.sheets.length === 2 && many.overflow.length === 0, `200×200 十件在 7 mm 板上需要 ${many.sheets.length} 張`);
const manyNote = groupNotice({thick: 7, w: 450, h: 900, count: many.sheets.length, overflow: many.overflow});
ok(manyNote.includes('需要 2 張') && manyNote.includes('450×900'), manyNote);

const huge = packParts([{id: 'huge', name: '太大的板', w: 500, h: 500}], STOCKS[0]);
ok(huge.sheets.length === 0 && huge.overflow.length === 1 && huge.overflow[0].includes('太大的板') && huge.overflow[0].includes('可用 440×890'), huge.overflow[0] || '沒有提示');
const hugeNote = groupNotice({thick: 7, w: 450, h: 900, count: huge.sheets.length, overflow: huge.overflow});
ok(hugeNote.includes('超出') && hugeNote.includes('太大的板'), hugeNote);

if (fail) { console.log(fail + ' 項失敗'); process.exit(1); }
console.log('排版檢查通過');
