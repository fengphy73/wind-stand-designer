// 雷切輪廓、900×600 排版、3D 列印實體。紅線切割、藍線雕刻，單位 mm，不另做縮放。
import {
  COLLAR, COL_TENON_W, DIA_TENON_W, DIA_HOLE, GUSSET_H, GUSSET_LEG, GUSSET_TENON,
  HUB_LEN, HUB_R, PLAT, ROTOR_X, SHEET, TOP_HOLE, TURN, WIRE, BOOM, GEAR_FRONT_X, GEAR_PLATE,
} from './calc.mjs';

const r2 = v => Math.round(v * 100) / 100;

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}
export function ccw(pts) {
  const q = pts.map(p => [r2(p[0]), r2(p[1])]);
  const c = [];
  for (const p of q) {
    const last = c[c.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) c.push(p);
  }
  if (c.length > 2 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c.pop();
  return signedArea(c) < 0 ? c.reverse() : c;
}

/** 壁板外形。右緣從缺口起、左緣從指起，四片同形轉 90° 可咬合。 */
export function wallOutline(spec) {
  const T = spec.T, W = spec.OUT, tw = COL_TENON_W;
  const u0 = spec.body0, u1 = spec.body1, n = spec.nSeg;
  const outer = W / 2, inner = W / 2 - T;
  const pts = [[-tw / 2, 0], [tw / 2, 0], [tw / 2, u0]];
  for (let i = 0; i < n; i++) {
    const tab = i % 2 === 1;
    const v = tab ? outer : inner;
    const a = u0 + i * spec.pitch, b = a + spec.pitch;
    pts.push([v, a], [v, b]);
  }
  pts.push([tw / 2, u1], [tw / 2, u1 + T], [-tw / 2, u1 + T], [-tw / 2, u1]);
  for (let i = n - 1; i >= 0; i--) {
    const tab = i % 2 === 0;
    const v = tab ? -outer : -inner;
    const b = u0 + (i + 1) * spec.pitch, a = u0 + i * spec.pitch;
    pts.push([v, b], [v, a]);
  }
  pts.push([-tw / 2, u0]);
  return ccw(pts);
}

export function rect(x0, y0, x1, y1) {
  return ccw([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

export function wallHoles(spec, kind) {
  const holes = [];
  const sw = DIA_TENON_W + 0.2, sh = spec.params.slotFit;
  if (kind === 'slot') {
    for (const z of spec.diaZ) holes.push(rect(-sw / 2, z - sh / 2, sw / 2, z + sh / 2));
  }
  if (kind === 'wire') {
    holes.push(rect(-WIRE.w / 2, spec.wireBot, WIRE.w / 2, spec.wireTop));
  }
  return holes;
}

export function diaphragmPoly(spec) {
  const h = spec.INN / 2, T = spec.T, tw = DIA_TENON_W / 2;
  return ccw([
    [-h, -h], [h, -h], [h, -tw], [h + T, -tw], [h + T, tw], [h, tw], [h, h],
    [-h, h], [-h, tw], [-h - T, tw], [-h - T, -tw], [-h, -tw],
  ]);
}

export function gussetPoly(spec) {
  const T = spec.T, L = GUSSET_LEG, H = GUSSET_H, tw = GUSSET_TENON;
  const x0 = (L - tw) / 2, x1 = x0 + tw;
  return ccw([[0, 0], [x0, 0], [x0, -T], [x1, -T], [x1, 0], [L, 0], [0, H]]);
}

export function hex(cx, cy, af) {
  const R = (af / 2) / Math.cos(Math.PI / 6);
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return ccw(pts);
}

export function circlePts(cx, cy, r, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return ccw(pts);
}

function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  return {x0, y0, x1, y1, w: x1 - x0, h: y1 - y0};
}

function mapPath(pts, map) {
  let s = '';
  pts.forEach((p, i) => {
    const [x, y] = map(p);
    s += `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)} `;
  });
  return `<path d="${s}Z"/>`;
}

function svgCircle(cx, cy, r) {
  return `M${(cx - r).toFixed(3)} ${cy.toFixed(3)} A${r.toFixed(3)} ${r.toFixed(3)} 0 1 0 ${(cx + r).toFixed(3)} ${cy.toFixed(3)} A${r.toFixed(3)} ${r.toFixed(3)} 0 1 0 ${(cx - r).toFixed(3)} ${cy.toFixed(3)} Z`;
}

/** 每個零件：local polys、holes、engrave、bbox、放到圖紙的 draw。 */
export function laserParts(spec) {
  const T = spec.T;
  const parts = [];
  const push = (p) => parts.push(p);

  const basePts = rect(-spec.params.base / 2, -spec.params.base / 2, spec.params.base / 2, spec.params.base / 2);
  const baseHoles = [];
  const slotW = COL_TENON_W + 0.4, slotT = spec.params.slotFit;
  const cWall = spec.OUT / 2 - T / 2;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const cx = dx * cWall, cy = dy * cWall;
    if (dy !== 0) baseHoles.push(rect(cx - slotW / 2, cy - slotT / 2, cx + slotW / 2, cy + slotT / 2));
    else baseHoles.push(rect(cx - slotT / 2, cy - slotW / 2, cx + slotT / 2, cy + slotW / 2));
  }
  const g0 = spec.OUT / 2, g1 = g0 + GUSSET_LEG;
  const gt0 = (g0 + g1) / 2 - (GUSSET_TENON + 0.4) / 2;
  const gt1 = gt0 + GUSSET_TENON + 0.4;
  for (const [sx, sy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (sy !== 0) baseHoles.push(rect(-slotT / 2, sy > 0 ? gt0 : -gt1, slotT / 2, sy > 0 ? gt1 : -gt0));
    else baseHoles.push(rect(sx > 0 ? gt0 : -gt1, -slotT / 2, sx > 0 ? gt1 : -gt0, slotT / 2));
  }
  const half = spec.params.base / 2;
  const inner = Math.max(130, spec.gussetOuter + 8);
  const outer = half - 18;
  const holeSize = outer - inner;
  const engrave = [];
  if (holeSize >= 36) {
    const rad = Math.min(12, holeSize / 5);
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx > 0 ? inner : -outer, y = sy > 0 ? inner : -outer;
      baseHoles.push(roundPoly(x, y, holeSize, holeSize, rad));
    }
    // 沙袋區刻在四邊實心帶
    const m = 8;
    engrave.push({kind: 'rect', x: -half + m, y: -half + m, w: half - inner - 2 * m, h: 28, label: '沙袋'});
    engrave.push({kind: 'rect', x: inner + m, y: -half + m, w: half - inner - 2 * m, h: 28});
    engrave.push({kind: 'rect', x: -half + m, y: half - m - 28, w: half - inner - 2 * m, h: 28});
    engrave.push({kind: 'rect', x: inner + m, y: half - m - 28, w: half - inner - 2 * m, h: 28});
  }
  engrave.push({kind: 'cross', x: 0, y: 0, s: 12});
  push(part('base', '底板', 1, basePts, baseHoles, engrave, '底板'));

  const wOut = wallOutline(spec);
  for (let i = 0; i < 2; i++) push(part('wall-slot-' + i, '壁板（隔板槽）', 1, wOut, wallHoles(spec, 'slot'), [{kind: 'text', text: '上·槽', x: 0, y: spec.wallLen - 14}], '壁板槽'));
  push(part('wall-wire', '壁板（出線口）', 1, wOut, wallHoles(spec, 'wire'), [{kind: 'text', text: '上·出線', x: 0, y: spec.wallLen - 14}], '出線'));
  push(part('wall-plain', '壁板', 1, wOut, [], [{kind: 'text', text: '上', x: 0, y: spec.wallLen - 14}], '壁板'));

  const dia = diaphragmPoly(spec);
  const diaHoles = [circlePts(0, 0, spec.holeR, 40)];
  for (let i = 0; i < spec.params.diaphragms; i++) {
    push(part('dia-' + i, '內隔板', 1, dia, diaHoles, [{kind: 'text', text: '隔' + (i + 1), x: 0, y: spec.INN / 2 - 6}], '隔板'));
  }
  if (spec.params.diaphragms > 0) {
    push(part('dia-spare', '內隔板（備品）', 1, dia, diaHoles, [{kind: 'text', text: '備品', x: 0, y: 0}], '備品'));
  }

  const gus = gussetPoly(spec);
  for (let i = 0; i < 4; i++) push(part('gus-' + i, '三角補強片', 1, gus, [], [{kind: 'text', text: '補強', x: 28, y: 20}], '補強'));

  const col = rect(-COLLAR / 2, -COLLAR / 2, COLLAR / 2, COLLAR / 2);
  const colHole = rect(-(spec.OUT + 0.4) / 2, -(spec.OUT + 0.4) / 2, (spec.OUT + 0.4) / 2, (spec.OUT + 0.4) / 2);
  push(part('collar', '柱腳套框', 1, col, [colHole], [{kind: 'text', text: '套框', x: 0, y: COLLAR / 2 - 8}], '套框'));

  const S = spec.topSize;
  const top = rect(-S / 2, -S / 2, S / 2, S / 2);
  const center = circlePts(0, 0, TOP_HOLE / 2, 48);
  const tenonHoles = [];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const cx = dx * cWall, cy = dy * cWall;
    if (dy !== 0) tenonHoles.push(rect(cx - slotW / 2, cy - slotT / 2, cx + slotW / 2, cy + slotT / 2));
    else tenonHoles.push(rect(cx - slotT / 2, cy - slotW / 2, cx + slotT / 2, cy + slotW / 2));
  }
  const nuts = [0, 90, 180, 270].map(a => {
    const r = a * Math.PI / 180;
    return hex(Math.cos(r) * TURN.boltR, Math.sin(r) * TURN.boltR, 7.2);
  });
  const bolts = [0, 90, 180, 270].map(a => {
    const r = a * Math.PI / 180;
    return circlePts(Math.cos(r) * TURN.boltR, Math.sin(r) * TURN.boltR, 2.1, 24);
  });
  push(part('top-lo', '塔頂板下層', 1, top, [center, ...tenonHoles, ...nuts], [{kind: 'text', text: '下層', x: 0, y: S / 2 - 8}], '塔頂下'));
  push(part('top-hi', '塔頂板上層', 1, top, [center, ...bolts], [{kind: 'text', text: '上層', x: 0, y: S / 2 - 8}], '塔頂上'));

  // 偏航平台：長度沿本地 x（迎風端 x 大）。圖紙上照輪廓切。
  const plat = platformGeom(spec);
  push(part('plat', '偏航平台板', 1, plat.outline, plat.holes, plat.eng, '平台'));

  const boom = boomGeom(spec);
  push(part('boom', '尾桿', 1, boom.outline, boom.holes, boom.eng, '尾桿'));

  const stop = rect(0, 0, 36, 18);
  push(part('stop-laser', '限位擋塊（雷切，可選）', 1, stop, [circlePts(10, 9, 1.6, 20)], [{kind: 'text', text: '限位', x: 22, y: 9}], '限位'));

  return parts;
}

function roundPoly(x, y, w, h, rad) {
  const r = Math.min(rad, w / 3, h / 3);
  const n = 6;
  const pts = [];
  const corners = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return ccw(pts);
}

function platformGeom(spec) {
  // 本地：x = 0 在順風端、x = 250 在迎風端，y = ±55。偏航軸在距迎風端 122.5。
  const L = PLAT.len, W = PLAT.wid;
  const outline = rect(0, -W / 2, L, W / 2);
  const yawX = 122.5, yawY = 0;
  const holes = [circlePts(yawX, yawY, PLAT.hole / 2, 40)];
  for (const a of [45, 135, 225, 315]) {
    const r = a * Math.PI / 180;
    holes.push(circlePts(yawX + TURN.boltR * Math.cos(r), yawY + TURN.boltR * Math.sin(r), 2.1, 20));
  }
  // 齒輪底板足跡：前緣在偏航軸前方 102.5，長 190、寬 100。本地 x 迎風為正方向（x 越大越迎風）。
  const gearFront = yawX + (GEAR_FRONT_X - 0); // 偏航軸在 yawX，迎風 +x
  // 世界 +X 迎風對應本地 +x。齒輪前緣世界 x=102.5，偏航軸世界 0，所以本地 = yawX + 102.5。
  // 但平台只有 250，yawX=122.5，前緣會在 225，後緣在 225-190=35。都在 0..250 內。
  const gf = yawX + GEAR_FRONT_X;
  const gr = gf - GEAR_PLATE.len;
  const gy = GEAR_PLATE.wid / 2;
  // 四個固定孔，內縮 16
  for (const [x, y] of [[gf - 16, gy - 16], [gf - 16, -gy + 16], [gr + 16, gy - 16], [gr + 16, -gy + 16]]) {
    holes.push(circlePts(x, y, 2.1, 20));
  }
  // 尾桿座兩孔，靠近順風端
  holes.push(circlePts(28, -12, 2.1, 20), circlePts(28, 12, 2.1, 20));
  const eng = [
    {kind: 'rect', x: gr, y: -gy, w: GEAR_PLATE.len, h: GEAR_PLATE.wid},
    {kind: 'text', text: '齒輪底板範圍（不改原檔）', x: (gf + gr) / 2, y: gy - 8},
    {kind: 'text', text: '建議在齒輪底板偏航軸另開 Ø20', x: yawX, y: -W / 2 + 8},
  ];
  return {outline, holes, eng};
}

function boomGeom() {
  const outline = rect(0, -BOOM.wid / 2, BOOM.len, BOOM.wid / 2);
  const holes = [
    circlePts(18, 0, 2.1, 20), circlePts(42, 0, 2.1, 20),
    circlePts(BOOM.len - 40, 0, 2.1, 20), circlePts(BOOM.len - 18, 0, 2.1, 20),
  ];
  const eng = [{kind: 'text', text: '尾桿·此端接尾翼', x: BOOM.len / 2, y: 0}];
  return {outline, holes, eng};
}

function part(id, name, count, outline, holes, eng, short) {
  const b = bounds(outline);
  return {id, name, count, short, outline, holes, eng, ...b};
}

export function layoutSheets(spec) {
  const parts = laserParts(spec);
  const base = parts[0];
  const rest = parts.slice(1);
  const gap = 3.5;
  const sheets = [
    {id: 1, title: '第 1 張　塔身與底板', items: [{part: base, x: -base.x0, y: -base.y0}]},
    {id: 2, title: '第 2 張　平台、尾桿、補強與備品', items: []},
  ];
  // 底板放在左下（圖紙 y 向下，零件本地 +y 向上，所以圖紙 y = oy - (py - y0)）。
  // 這裡 x,y 是「本地原點」在圖紙上的位置？改成記錄平移：圖紙 = (ox + px, oy - py)，並讓 bbox 落在範圍內。
  // 重新定義：item.ox, item.oy 使圖紙座標 = (ox + localX, oy - localY)，且零件 bbox 的圖紙範圍在紙內。
  function place(sheet, part, ox, oy) {
    sheet.items.push({part, ox, oy});
  }
  // 底板：本地 ±base/2，放到圖紙左上角對齊 0,0（圖紙 y 向下，本地 +y 在圖紙是向上，所以本地 +base/2 放到圖紙 y=0）
  sheets[0].items = [];
  place(sheets[0], base, -base.x0, base.y1); // 本地 x0→圖紙 0，本地 y1→圖紙 0

  const stripX = base.w + gap;
  let x = stripX, y = gap, rowH = 0, si = 0;
  const overflow = [];
  for (const part of rest) {
    const pw = part.w, ph = part.h;
    if (x + pw > SHEET.w - 2) {
      x = si === 0 ? stripX : gap;
      y += rowH + gap;
      rowH = 0;
    }
    if (y + ph > SHEET.h - 2) {
      if (si === 0) { si = 1; x = gap; y = gap; rowH = 0; }
    }
    if (y + ph > SHEET.h - 2) overflow.push(part.name);
    // 本地 (x0,y1) 放到圖紙 (x,y)
    const ox = x - part.x0;
    const oy = y + part.y1;
    place(sheets[si], part, ox, oy);
    x += pw + gap;
    rowH = Math.max(rowH, ph);
  }
  return {sheets, overflow, parts};
}

function sheetItemSvg(item) {
  const {part, ox, oy} = item;
  const map = p => [ox + p[0], oy - p[1]];
  let cut = mapPath(part.outline, map);
  for (const h of part.holes) cut += mapPath(h, map);
  let eng = '';
  for (const e of part.eng || []) {
    if (e.kind === 'text') {
      const [x, y] = map([e.x, e.y]);
      eng += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="#0000ff" font-size="3.2" font-family="sans-serif" text-anchor="middle">${escapeXml(e.text)}</text>`;
    } else if (e.kind === 'rect') {
      const [x, y] = map([e.x, e.y + e.h]); // 本地 y 向上，矩形的上邊是 y+h
      eng += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${e.w.toFixed(2)}" height="${e.h.toFixed(2)}"/>`;
      if (e.label) eng += `<text x="${(x + e.w / 2).toFixed(2)}" y="${(y + e.h / 2).toFixed(2)}" fill="#0000ff" font-size="3.2" font-family="sans-serif" text-anchor="middle">${escapeXml(e.label)}</text>`;
    } else if (e.kind === 'cross') {
      const [x, y] = map([e.x, e.y]);
      eng += `<path d="M${(x - e.s).toFixed(2)} ${y.toFixed(2)} H${(x + e.s).toFixed(2)} M${x.toFixed(2)} ${(y - e.s).toFixed(2)} V${(y + e.s).toFixed(2)}"/>`;
    }
  }
  return {cut, eng};
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function laserSvgs(spec) {
  const {sheets, overflow} = layoutSheets(spec);
  return {
    overflow,
    sheets: sheets.map(sh => {
      let cut = '', eng = '';
      for (const it of sh.items) {
        const g = sheetItemSvg(it);
        cut += g.cut;
        eng += g.eng;
      }
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.w}mm" height="${SHEET.h}mm" viewBox="0 0 ${SHEET.w} ${SHEET.h}">
<title>${escapeXml(sh.title)}</title>
<desc>風力發電底座支架設計器 v1.0 ${escapeXml(sh.title)}。1 單位 = 1 mm，請以實際尺寸匯入，不要為了軟體比例另做縮放。紅 #ff0000 切割，藍 #0000ff 雕刻。原點在左上角，Y 向下。</desc>
<g id="cut" fill="none" stroke="#ff0000" stroke-width="0.15" stroke-linejoin="round">${cut}</g>
<g id="engrave" fill="none" stroke="#0000ff" stroke-width="0.12">${eng}</g>
</svg>`;
      return {id: sh.id, title: sh.title, svg, items: sh.items.map(it => ({id: it.part.id, name: it.part.name, w: it.part.w, h: it.part.h, ox: it.ox, oy: it.oy, x0: it.part.x0, y0: it.part.y0, x1: it.part.x1, y1: it.part.y1}))};
    }),
  };
}

export function sheetBounds(item) {
  // 圖紙座標： (ox+localX, oy-localY)
  const {part, ox, oy} = item;
  const xs = [ox + part.x0, ox + part.x1];
  const ys = [oy - part.y0, oy - part.y1];
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return {x0, y0, x1, y1, w: x1 - x0, h: y1 - y0};
}

// ── 3D 列印 ──
function sectionFrom(M, polys) {
  let s = new M.CrossSection([polys[0]]);
  for (const h of polys.slice(1)) {
    const hole = new M.CrossSection([h]);
    const next = s.subtract(hole);
    s.delete(); hole.delete(); s = next;
  }
  return s;
}

function extrude(M, polys, h) {
  const cs = sectionFrom(M, polys.map(ccw));
  const solid = cs.extrude(h);
  cs.delete();
  return solid;
}

export function limitAngle(pinR = 1.1, tabHalf = 6, R = 14) {
  const pinDeg = Math.asin(pinR / R) * 180 / Math.PI;
  return 180 - tabHalf - pinDeg;
}

export function buildPrinted(M, spec) {
  const {Manifold} = M;
  M.setCircularSegments(48);
  const out = {};

  // 輪轂：圓盤在床上，柄往上。前緣（圓盤底）是轉動面。
  const disc = Manifold.cylinder(8, HUB_R, HUB_R, 64, false);
  const shank = Manifold.cylinder(HUB_LEN - 8, 16, 16, 48, false).translate([0, 0, 8]);
  let hub = disc.add(shank);
  disc.delete(); shank.delete();
  const boreR = spec.params.shaftD / 2 + 0.15;
  const bore = Manifold.cylinder(30, boreR, boreR, 32, false).translate([0, 0, HUB_LEN - 28]);
  const hub2 = hub.subtract(bore); hub.delete(); bore.delete(); hub = hub2;
  for (let k = 0; k < 3; k++) {
    const a = (90 + k * 120) * Math.PI / 180;
    for (const rad of [22, 30]) {
      const hx = Math.cos(a) * rad, hy = Math.sin(a) * rad;
      const hole = Manifold.cylinder(12, 2.1, 2.1, 20, false).translate([hx, hy, -2]);
      const n = hub.subtract(hole); hub.delete(); hole.delete(); hub = n;
    }
  }
  out.hub = finishPrint(M, hub, '加長輪轂');

  // 限位環
  const ringOD = 33.2, ringID = 18, ringH = spec.T * 2;
  let ring = Manifold.cylinder(ringH, ringOD / 2, ringOD / 2, 64, false);
  const ringBore = Manifold.cylinder(ringH + 2, ringID / 2, ringID / 2, 40, false).translate([0, 0, -1]);
  const ring3 = ring.subtract(ringBore); ring.delete(); ringBore.delete(); ring = ring3;
  const tabHalf = 6 * Math.PI / 180;
  const tabPts = [[0, 0]];
  const r0 = 7, r1 = 16;
  for (let i = 0; i <= 8; i++) {
    const a = -tabHalf + 2 * tabHalf * i / 8;
    tabPts.push([Math.sin(a) * r1, Math.cos(a) * r1]);
  }
  for (let i = 8; i >= 0; i--) {
    const a = -tabHalf + 2 * tabHalf * i / 8;
    tabPts.push([Math.sin(a) * r0, Math.cos(a) * r0]);
  }
  const tabCs = new M.CrossSection([ccw(tabPts)]);
  const tab = tabCs.extrude(8).translate([0, 0, ringH]);
  tabCs.delete();
  const ring4 = ring.add(tab); ring.delete(); tab.delete(); ring = ring4;
  out.ring = finishPrint(M, ring, '限位環');

  // 擋銷：底座＋Ø2.2 銷，銷朝上方便列印
  let pin = Manifold.cube([18, 12, 4], false).translate([-9, -6, 0]);
  const screw = Manifold.cylinder(8, 1.6, 1.6, 20, false).translate([-4, 0, -2]);
  const pin3 = pin.subtract(screw); pin.delete(); screw.delete(); pin = pin3;
  const peg = Manifold.cylinder(14, 1.1, 1.1, 20, false).translate([5, 0, 4]);
  const pin4 = pin.add(peg); pin.delete(); peg.delete(); pin = pin4;
  out.pin = finishPrint(M, pin, '限位擋銷');

  // 尾桿座：兩頰夾住平放的尾桿，一端留橋連接。開口朝上列印，裝到平台上時尾桿貼著平台。
  const mountH = spec.T + 8;
  let mount = Manifold.cube([56, 42, mountH], false).translate([-28, -21, 0]);
  const slot = Manifold.cube([40, BOOM.wid + 0.6, spec.T + 2], false).translate([-28, -(BOOM.wid + 0.6) / 2, 0]);
  const mount2 = mount.subtract(slot); mount.delete(); slot.delete(); mount = mount2;
  for (const x of [-12, 12]) {
    const h = Manifold.cylinder(14, 2.1, 2.1, 18, false).translate([x, 0, -2]);
    const n = mount.subtract(h); mount.delete(); h.delete(); mount = n;
  }
  out.mount = finishPrint(M, mount, '尾桿座');

  out.limitDeg = limitAngle();
  return out;
}

function finishPrint(M, solid, name) {
  const b = solid.boundingBox();
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  return {
    name, solid, size,
    tris: solid.numTri(), status: solid.status(), volume: solid.volume(),
  };
}

/** 雷切件擠出後放到世界座標，給 3D 預覽。與圖紙同一個輪廓。 */
export function buildLaserSolids(M, spec) {
  const T = spec.T;
  const parts = laserParts(spec);
  const byId = Object.fromEntries(parts.map(p => [p.id, p]));
  const solids = [];
  const add = (id, polys, height, mat, name) => {
    const solid = extrude(M, polys, height).transform(mat);
    solids.push({id, name: name || byId[id]?.name || id, solid});
    return solid;
  };
  const mat4 = (m, t) => [
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    t[0], t[1], t[2], 1,
  ];

  // 底板 z=0..T，輪廓在 XY（本地 y 就是世界 Y）
  add('base', [byId.base.outline, ...byId.base.holes], T, mat4([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]), '底板');

  // 壁板：輪廓 (v→本地 x，高度→本地 y)，擠出厚度後立到四面。
  // 未旋轉時本地 x→世界 X、本地 y→世界 Z、厚度→世界 +Y，外側面在 +Y。
  const wallMatrix = (rot, ty) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const Rz = (x, y, z) => [c * x - s * y, s * x + c * y, z];
    const ex = Rz(1, 0, 0), ey = Rz(0, 0, 1), ez = Rz(0, 1, 0), t = Rz(0, ty, 0);
    return [ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], 0, ez[0], ez[1], ez[2], 0, t[0], t[1], t[2], 1];
  };
  const wallKinds = [
    ['wall-slot-0', 0],               // +Y
    ['wall-slot-1', Math.PI],         // −Y
    ['wall-wire', Math.PI / 2],       // −X 順風，出線口
    ['wall-plain', -Math.PI / 2],     // +X 迎風
  ];
  wallKinds.forEach(([id, rot], i) => {
    const src = byId[id];
    const solid = extrude(M, [src.outline, ...src.holes], T).transform(wallMatrix(rot, spec.OUT / 2 - T));
    solids.push({id: id + '-' + i, name: src.name, solid});
  });

  // 隔板：水平，中心在 diaZ
  byId && spec.diaZ.forEach((z, i) => {
    const src = byId['dia-' + i];
    if (!src) return;
    const solid = extrude(M, [src.outline, ...src.holes], T).translate([0, 0, z - T / 2]);
    solids.push({id: 'dia-' + i, name: '內隔板', solid});
  });

  // 套框
  {
    const src = byId.collar;
    const solid = extrude(M, [src.outline, ...src.holes], T).translate([0, 0, T]);
    solids.push({id: 'collar', name: '柱腳套框', solid});
  }

  // 補強片：直角在柱面，+Y 為原型，再複製到四面
  {
    const src = byId['gus-0'];
    const proto = extrude(M, [src.outline], T);
    // 輪廓 x=0..110 徑向、y=0..115 高度、榫在 y 負。擠出在 z。
    // 要把它立到 +Y：徑向沿 Y、厚度沿 X、底部在 z=T。
    // 本地 x→世界 Y，本地 y→世界 Z，本地 z→世界 X。
    const m = mat4([0, 0, 1, 1, 0, 0, 0, 1, 0], [-(T / 2), spec.OUT / 2, T]);
    // 等等 mat4 的排列要對。改用手動。
    proto.delete();
    const placed = extrude(M, [src.outline], T).transform([
      0, 1, 0, 0,   // local x → world Y
      0, 0, 1, 0,   // local y → world Z
      1, 0, 0, 0,   // local z → world X
      -T / 2, spec.OUT / 2, T, 1,
    ]);
    for (let k = 0; k < 4; k++) {
      const c = Math.cos(k * Math.PI / 2), s = Math.sin(k * Math.PI / 2);
      const copy = placed.transform([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      solids.push({id: 'gus-' + k, name: '三角補強片', solid: copy});
    }
    placed.delete();
  }

  // 塔頂
  {
    const lo = byId['top-lo'], hi = byId['top-hi'];
    solids.push({id: 'top-lo', name: '塔頂板下層', solid: extrude(M, [lo.outline, ...lo.holes], T).translate([0, 0, spec.colTop])});
    solids.push({id: 'top-hi', name: '塔頂板上層', solid: extrude(M, [hi.outline, ...hi.holes], T).translate([0, 0, spec.colTop + T])});
  }

  // 平台：本地 x 迎風為大。世界 +X = 本地 x - yawLocal，世界 Y = 本地 y，z = platTop
  {
    const src = byId.plat;
    const yawLocal = 122.5;
    solids.push({
      id: 'plat', name: '偏航平台板', yaw: true,
      solid: extrude(M, [src.outline, ...src.holes], T).translate([-yawLocal, 0, spec.platTop]),
    });
  }
  // 尾桿：本地 x 從偏航軸往順風。世界 x = -本地 x
  {
    const src = byId.boom;
    solids.push({
      id: 'boom', name: '尾桿', yaw: true,
      solid: extrude(M, [src.outline, ...src.holes], T).transform([
        -1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, spec.platTop + T, 1,
      ]),
    });
  }
  return solids;
}

export function placePrinted(M, spec, printed) {
  // 輪轂世界矩陣：見檔頭說明
  const hub = printed.hub.solid.transform([
    0, 1, 0, 0,
    0, 0, 1, 0,
    -1, 0, 0, 0,
    ROTOR_X, 0, spec.params.hubZ, 1,
  ]);
  // 限位環在塔頂孔內，擋片朝順風（−X）。列印時擋片在 +Y。
  // 要把 +Y 轉到 −X：繞 Z −90°？ +Y → −X 是 Rz(−90) 或 Rz(90)：(x,y)→(−y,x) 把 +Y 送到 −X。Rz(90)。
  const ring = printed.ring.solid.transform([
    0, 1, 0, 0,
    -1, 0, 0, 0,
    0, 0, 1, 0,
    0, 0, spec.colTop, 1,
  ]);
  // 擋銷在平台下方、R14、迎風側。銷朝下。
  const pin = printed.pin.solid.transform([
    1, 0, 0, 0,
    0, -1, 0, 0,
    0, 0, -1, 0,
    14, 0, spec.platTop, 1,
  ]);
  // 尾桿座在平台順風側
  const mount = printed.mount.solid.transform([
    0, 1, 0, 0,
    1, 0, 0, 0,
    0, 0, 1, 0,
    -70, 0, spec.platTop + spec.T, 1,
  ]);
  return [
    {id: 'hub', name: '加長輪轂', solid: hub, yaw: true, print: printed.hub},
    {id: 'ring', name: '限位環', solid: ring, yaw: false, print: printed.ring},
    {id: 'pin', name: '限位擋銷', solid: pin, yaw: true, print: printed.pin},
    {id: 'mount', name: '尾桿座', solid: mount, yaw: true, print: printed.mount},
  ];
}
function Tsafe(spec) { return spec.T; }
