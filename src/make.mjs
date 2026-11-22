// 雷切輪廓、600×450 排版、3D 列印實體。紅線切割、藍線雕刻，單位 mm，不另做縮放。
import {
  COLLAR, COL_TENON_W, DIA_TENON_W, DIA_HOLE, GUSSET_H, GUSSET_LEG, GUSSET_TENON,
  HUB_LEN, HUB_R, ROTOR_X, SHEET, TURN, WIRE, BOOM, GEAR_FRONT_X, GEAR_PLATE, GEAR_EXT,
  GEAR_HOLE_XS, STUD_XS, DECK, PIN_R, HEX_CORNER, VERSION,
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
  const ten = spec.topTenon || T;
  const u0 = spec.body0, u1 = spec.body1, n = spec.nSeg;
  const outer = W / 2, inner = W / 2 - T;
  const pts = [[-tw / 2, 0], [tw / 2, 0], [tw / 2, u0]];
  for (let i = 0; i < n; i++) {
    const tab = i % 2 === 1;
    const v = tab ? outer : inner;
    const a = u0 + i * spec.pitch, b = a + spec.pitch;
    pts.push([v, a], [v, b]);
  }
  pts.push([tw / 2, u1], [tw / 2, u1 + ten], [-tw / 2, u1 + ten], [-tw / 2, u1]);
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
  const L = GUSSET_LEG, H = GUSSET_H, tw = GUSSET_TENON;
  const tab = spec.baseT;
  const x0 = (L - tw) / 2, x1 = x0 + tw;
  return ccw([[0, 0], [x0, 0], [x0, -tab], [x1, -tab], [x1, 0], [L, 0], [0, H]]);
}

export function hex(cx, cy, af, rotDeg = 0) {
  const R = (af / 2) / Math.cos(Math.PI / 6);
  const rot = rotDeg * Math.PI / 180;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3 + rot;
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
  engrave.push({kind: 'text', text: `底板 ${spec.params.base}×${spec.params.baseT} mm`, x: 0, y: 28});
  push(part('base', `底板 ${spec.params.base}×${spec.params.base}×${spec.params.baseT}`, 1, basePts, baseHoles, engrave, '底板'));

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

  const plates = yawPlates(spec);
  push(plates.upper);
  push(plates.l1);
  push(plates.l2);
  push(plates.stop);

  const boom = boomGeom(spec);
  push(part('boom', '尾桿 30×5×350', 1, boom.outline, boom.holes, boom.eng, '尾桿'));

  const gear = gearCorrection(spec);
  push(part('gear-lower', '齒輪下板加長 270×5（接尾）', 1, gear.outline, gear.holes, [
    {kind: 'text', text: '下板·5 mm·加長接尾', x: 40, y: gear.W / 2 - 8},
  ], '下板'));
  gear.guides.forEach((gd, i) => {
    push(part('gear-guide-' + i, '尾桿導槽條', 1, gd, [], [
      {kind: 'text', text: '導槽', x: 30, y: 4},
    ], '導槽'));
  });

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

function yawPlates(spec) {
  const S = DECK / 2;
  const outline = rect(-S, -S, S, S);
  const wire = [
    circlePts(0, 0, 10, 32),
    rect(-28, -4, -8, 4),
  ];
  const at = (deg, r, dia) => {
    const a = deg * Math.PI / 180;
    return circlePts(Math.cos(a) * r, Math.sin(a) * r, dia / 2, 20);
  };
  const cross = [0, 90, 180, 270].map(a => at(a, TURN.boltR, 4.2));
  const diag = [45, 135, 225, 315].map(a => at(a, TURN.boltR, 10));
  const clear12 = [0, 90, 180, 270].map(a => at(a, TURN.boltR, 12));
  const studs = [];
  const yRow = spec.params.gearWid / 2 - spec.params.gearEdge;
  for (const from of STUD_XS) for (const s of [1, -1]) {
    studs.push(circlePts(GEAR_FRONT_X - from, s * yRow, 4.2, 20));
  }
  const sink = [0, 90, 180, 270].map(a => {
    const r = a * Math.PI / 180;
    return {kind: 'circle', x: Math.cos(r) * TURN.boltR, y: Math.sin(r) * TURN.boltR, r: 4};
  });
  const upper = part('upper', '上木板 130×130×7', 1, outline, [...wire, ...cross, ...diag, ...studs], [
    {kind: 'text', text: '上木板·7 mm', x: 0, y: S - 8},
    {kind: 'text', text: '4×M4 鎖齒輪組，整組可拆', x: 0, y: -S + 8},
    ...sink,
  ], '上木板');
  const l1 = part('l1', '下木板 L1 130×130×7', 1, outline, [...wire, ...diag.map((_, i) => at([45, 135, 225, 315][i], TURN.boltR, 4.2)), ...clear12], [
    {kind: 'text', text: 'L1·鎖下框', x: 0, y: S - 8},
  ], 'L1');
  const socket = tubeSocket(spec.OUT + 0.4, 2.5);
  const nuts = [45, 135, 225, 315].map(a => {
    const r = a * Math.PI / 180;
    return hex(Math.cos(r) * TURN.boltR, Math.sin(r) * TURN.boltR, 7, 45);
  });
  const l2 = part('l2', '下木板 L2 130×130×7', 1, outline, [socket, ...nuts, circlePts(0, 0, 10, 24)], [
    {kind: 'text', text: 'L2·套方管', x: 0, y: S - 8},
    {kind: 'text', text: '六角孔平邊朝柱', x: 0, y: -S + 8},
  ], 'L2');
  const stop = part('stop', '限位擋塊（黏在 L1 頂）', 1, rect(0, 0, 22, 14), [], [
    {kind: 'text', text: '限位', x: 11, y: 7},
  ], '限位');
  return {upper, l1, l2, stop};
}

function tubeSocket(side, chamfer) {
  const h = side / 2, c = chamfer;
  return ccw([[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]]);
}

export function gearCorrection(spec) {
  const p = spec.params;
  const L = GEAR_PLATE.len + GEAR_EXT;
  const W = p.gearWid;
  const yRow = W / 2 - p.gearEdge;
  const neck = GEAR_PLATE.len + 20;
  const outline = ccw([
    [0, -W / 2], [neck, -W / 2], [neck, -25], [L, -25], [L, 25], [neck, 25], [neck, W / 2], [0, W / 2],
  ]);
  const holes = [];
  for (const x of GEAR_HOLE_XS) for (const s of [1, -1]) holes.push(circlePts(x, s * yRow, p.gearHoleD / 2, 16));
  const inner = rect((GEAR_PLATE.len - p.gearInnerL) / 2, -p.gearInnerW / 2, (GEAR_PLATE.len + p.gearInnerL) / 2, p.gearInnerW / 2);
  holes.push(inner);
  holes.push(circlePts(neck + 20, 0, 2.1, 16), circlePts(neck + 50, 0, 2.1, 16));
  holes.push(circlePts(GEAR_FRONT_X, 0, 10, 32));
  const guides = [rect(0, 0, 60, 8), rect(0, 0, 60, 8)];
  return {outline, holes, guides, L, W, pending: true};
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

export const BASE_MARGIN = 10;

export function layoutSheets(spec) {
  const parts = laserParts(spec);
  const base = parts.find(p => p.id === 'base');
  const pack = parts.filter(p => p.id !== 'base');
  const gap = 3.5;
  const margin = 2;
  const limitW = SHEET.w - margin;
  const limitH = SHEET.h - margin;
  const sheets = [];
  const overflow = [];

  function orientations(part) {
    const list = [];
    if (part.w <= limitW + 0.05 && part.h <= limitH + 0.05) list.push({rot: 0, w: part.w, h: part.h});
    if (Math.abs(part.w - part.h) > 0.05 && part.h <= limitW + 0.05 && part.w <= limitH + 0.05) {
      list.push({rot: 90, w: part.h, h: part.w});
    }
    list.sort((a, b) => a.h - b.h || a.w - b.w);
    return list;
  }

  function tryPlace(sheet, part, orient) {
    const pw = orient.w, ph = orient.h;
    for (const row of sheet.rows) {
      if (row.x + pw <= limitW + 0.05 && ph <= row.h + 0.05) {
        sheet.items.push({part, rot: orient.rot, placeX: row.x, placeY: row.y});
        row.x += pw + gap;
        return true;
      }
    }
    const y = sheet.rows.length ? sheet.rows[sheet.rows.length - 1].y + sheet.rows[sheet.rows.length - 1].h + gap : margin;
    if (y + ph <= limitH + 0.05 && margin + pw <= limitW + 0.05) {
      sheet.rows.push({y, h: ph, x: margin + pw + gap});
      sheet.items.push({part, rot: orient.rot, placeX: margin, placeY: y});
      return true;
    }
    return false;
  }

  const ordered = [...pack].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.h - a.h);
  for (const part of ordered) {
    const orients = orientations(part);
    if (!orients.length) {
      overflow.push(`${part.name}（${Math.round(part.w)}×${Math.round(part.h)} mm，大於板材 ${SHEET.w}×${SHEET.h}）`);
      continue;
    }
    let placed = false;
    for (const sheet of sheets) {
      for (const orient of orients) {
        if (tryPlace(sheet, part, orient)) { placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) {
      const sheet = {id: sheets.length + 1, items: [], rows: []};
      sheets.push(sheet);
      for (const orient of orients) {
        if (tryPlace(sheet, part, orient)) { placed = true; break; }
      }
      if (!placed) {
        sheets.pop();
        overflow.push(`${part.name}（${Math.round(part.w)}×${Math.round(part.h)} mm）`);
      }
    }
  }

  const area = SHEET.w * SHEET.h;
  for (const sheet of sheets) {
    const used = sheet.items.reduce((s, it) => s + it.part.w * it.part.h, 0);
    sheet.util = used / area;
    sheet.partNames = sheet.items.map(it => it.part.name);
  }
  return {sheets, overflow, parts, base, sheet: {w: SHEET.w, h: SHEET.h}};
}

function mapLocal(item, p) {
  const {part, rot, placeX, placeY} = item;
  if (rot === 90) return [placeX + (part.y1 - p[1]), placeY + (p[0] - part.x0)];
  return [placeX + (p[0] - part.x0), placeY + (part.y1 - p[1])];
}

function sheetItemSvg(item) {
  const {part} = item;
  const map = p => mapLocal(item, p);
  let cut = mapPath(part.outline, map);
  for (const h of part.holes) cut += mapPath(h, map);
  let eng = '';
  for (const e of part.eng || []) {
    if (e.kind === 'text') {
      const [x, y] = map([e.x, e.y]);
      eng += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" fill="#0000ff" font-size="3.2" font-family="sans-serif" text-anchor="middle">${escapeXml(e.text)}</text>`;
    } else if (e.kind === 'rect') {
      const a = map([e.x, e.y]);
      const b = map([e.x + e.w, e.y + e.h]);
      const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
      const w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
      eng += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}"/>`;
      if (e.label) eng += `<text x="${(x + w / 2).toFixed(2)}" y="${(y + h / 2).toFixed(2)}" fill="#0000ff" font-size="3.2" font-family="sans-serif" text-anchor="middle">${escapeXml(e.label)}</text>`;
    } else if (e.kind === 'circle') {
      const [x, y] = map([e.x, e.y]);
      eng += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${e.r.toFixed(2)}"/>`;
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

function renderSheet(items, w, h, title, desc) {
  let cut = '', eng = '';
  for (const it of items) {
    const g = sheetItemSvg(it);
    cut += g.cut;
    eng += g.eng;
  }
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<title>${escapeXml(title)}</title>
<desc>${escapeXml(desc)}</desc>
<g id="cut" fill="none" stroke="#ff0000" stroke-width="0.15" stroke-linejoin="round">${cut}</g>
<g id="engrave" fill="none" stroke="#0000ff" stroke-width="0.12">${eng}</g>
</svg>`;
  return svg;
}

export function laserSvgs(spec) {
  const lay = layoutSheets(spec);
  const {sheets, overflow, base} = lay;
  const n = sheets.length;
  const pack = sheets.map(sh => {
    const pct = Math.round(sh.util * 1000) / 10;
    const title = `第 ${sh.id} 張／共 ${n} 張　${SHEET.w}×${SHEET.h} mm　零件 ${sh.items.length}　外框利用率 ${pct}%`;
    const desc = `風力發電底座支架設計器 v${VERSION} ${title}。1 單位 = 1 mm，請以實際尺寸匯入，不要為了軟體比例另做縮放。紅 #ff0000 切割，藍 #0000ff 雕刻。原點在左上角，Y 向下。`;
    return {
      id: sh.id, title, svg: renderSheet(sh.items, SHEET.w, SHEET.h, title, desc), util: sh.util, w: SHEET.w, h: SHEET.h,
      partNames: sh.partNames,
      items: sh.items.map(it => ({id: it.part.id, name: it.part.name, w: it.part.w, h: it.part.h, rot: it.rot, placeX: it.placeX, placeY: it.placeY})),
    };
  });
  const edge = Math.round(base.w);
  const notice = `底板需另用大板切割（至少 ${edge}×${edge} 加邊距）`;
  const bw = Math.ceil(base.w + BASE_MARGIN * 2);
  const bh = Math.ceil(base.h + BASE_MARGIN * 2);
  const baseUtil = (base.w * base.h) / (bw * bh);
  const baseTitle = `底板大板　${bw}×${bh} mm　零件 1　外框利用率 ${Math.round(baseUtil * 1000) / 10}%`;
  const baseItem = {part: base, rot: 0, placeX: BASE_MARGIN, placeY: BASE_MARGIN};
  const baseSheet = {
    id: 'base', title: baseTitle, notice, w: bw, h: bh, util: baseUtil,
    svg: renderSheet([baseItem], bw, bh, baseTitle, `${notice}。風力發電底座支架設計器 v${VERSION}。圖紙每邊留 ${BASE_MARGIN} mm。1 單位 = 1 mm，請以實際尺寸匯入。紅 #ff0000 切割，藍 #0000ff 雕刻。`),
    partNames: [base.name],
  };
  return {
    overflow,
    count: n,
    sheet: {w: SHEET.w, h: SHEET.h},
    sheets: pack,
    base: baseSheet,
  };
}

export function sheetBounds(item) {
  const {part, rot = 0, placeX, placeY} = item;
  if (rot === 90) return {x0: placeX, y0: placeY, x1: placeX + part.h, y1: placeY + part.w, w: part.h, h: part.w};
  return {x0: placeX, y0: placeY, x1: placeX + part.w, y1: placeY + part.h, w: part.w, h: part.h};
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
  const across = spec.params.shaftD;
  const hexPts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    hexPts.push([Math.cos(a) * across / 2, Math.sin(a) * across / 2]);
  }
  const hexCs = new M.CrossSection([ccw(hexPts)]);
  const bore = hexCs.extrude(32).translate([0, 0, HUB_LEN - 30]);
  hexCs.delete();
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
  const ringOD = 33.2, ringID = 18, ringH = spec.T;
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
  const {Manifold} = M;
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
  const baseT = spec.baseT;
  add('base', [byId.base.outline, ...byId.base.holes], baseT, mat4([1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0]), '底板');

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
    const solid = extrude(M, [src.outline, ...src.holes], T).translate([0, 0, baseT]);
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
      -T / 2, spec.OUT / 2, baseT, 1,
    ]);
    for (let k = 0; k < 4; k++) {
      const c = Math.cos(k * Math.PI / 2), s = Math.sin(k * Math.PI / 2);
      const copy = placed.transform([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      solids.push({id: 'gus-' + k, name: '三角補強片', solid: copy});
    }
    placed.delete();
  }

  // 下層板固定在方柱上。本地 x 迎風為 0，世界 x = 102.5 - 本地 x。
  const lay = (src, z0, yaw, name, h) => {
    if (!src) return;
    solids.push({id: src.id, name, yaw, solid: extrude(M, [src.outline, ...src.holes], h || T).translate([0, 0, z0])});
  };
  if (spec.params.yawType !== 'bearing') {
    lay(byId.l2, spec.stack.zL2Bot, false, '下木板 L2', spec.params.deckT);
    lay(byId.l1, spec.stack.zL1Bot, false, '下木板 L1', spec.params.deckT);
    lay(byId.upper, spec.stack.zUpperBot, true, '上木板', spec.params.deckT);
    const stopSrc = byId.stop;
    solids.push({id: 'stop', name: '限位擋塊', yaw: false, solid: extrude(M, [stopSrc.outline, ...stopSrc.holes], T).translate([-PIN_R, -7, spec.stack.zL1Top])});
  } else {
    const box = Manifold.cube([70, 70, 40], true);
    solids.push({id: 'bearing-box', name: '軸承盒（待確認）', yaw: false, solid: box.translate([0, 0, spec.stack.zL2Bot + 20])});
  }
  // 齒輪下板：前緣在迎風，本地 +x 往尾端。只擠出下板那 5 mm。上板不加長，留在示意裡。
  {
    const src = byId['gear-lower'];
    if (src && spec.stack) {
      solids.push({
        id: 'gear-lower', name: src.name, yaw: true,
        solid: extrude(M, [src.outline, ...src.holes], spec.params.gearPlateT).transform([
          -1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          GEAR_FRONT_X, 0, spec.stack.zGearBot, 1,
        ]),
      });
    }
  }
  // 尾桿厚 5 mm，底面貼在下板頂面。從加長段開始縮成寬 50 的地方往尾端伸出，不穿進上板。
  {
    const src = byId.boom;
    const neckX = GEAR_FRONT_X - (GEAR_PLATE.len + 20);
    solids.push({
      id: 'boom', name: '尾桿', yaw: true,
      solid: extrude(M, [src.outline, ...src.holes], BOOM.thick).transform([
        -1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        neckX, 0, spec.stack.zLowerTop, 1,
      ]),
    });
  }
  return solids;
}

export function placePrinted(M, spec, printed) {
  const hub = printed.hub.solid.transform([
    0, 1, 0, 0,
    0, 0, 1, 0,
    -1, 0, 0, 0,
    ROTOR_X, 0, spec.params.hubZ, 1,
  ]);
  return [{id: 'hub', name: '加長輪轂', solid: hub, yaw: true, print: printed.hub}];
}

export function gearCorrectionSvg(spec) {
  const g = gearCorrection(spec);
  const map = p => [10 + p[0], 80 - p[1]];
  const path = pts => `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${map(p).map(n => n.toFixed(2)).join(' ')}`).join(' ')}Z"/>`;
  let cut = path(g.outline);
  for (const h of g.holes) cut += path(h);
  g.guides.forEach((gd, i) => {
    const shift = p => [p[0] + 10, p[1] - 70 - i * 14];
    cut += `<path d="${gd.map((pt, k) => `${k ? 'L' : 'M'}${shift(pt).map(n => (n + (k ? 0 : 0)).toFixed(2)).join(' ')}`).join(' ')}Z"/>`;
  });
  const w = g.L + 40, h = g.W + 80;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
<title>齒輪組下板加長尾桿（教具老師修正）</title>
<desc>教具老師修正，另存新檔。原齒輪組設計不改。這是下板：厚 5 mm（兩片各 5 mm，總厚 10 mm，上板不加長）。偏航軸（距前緣 102.5 mm）開 Ø20 穿線孔。另含往後加長 80 mm 的尾桿段。孔距、孔徑、內框、寬度除板長 190 外都待確認。紅線切割，藍字雕刻。1 單位 = 1 mm。</desc>
<g fill="none" stroke="#ff0000" stroke-width="0.15">${cut}</g>
<g fill="#0000ff" font-size="3.5" font-family="sans-serif">
<text x="20" y="12">教具老師修正·另存新檔·原齒輪組不改·偏航軸 Ø20 穿線</text>
<text x="${map([g.L / 2, 0])[0]}" y="${map([0, -g.W / 2 - 6])[1]}">前緣在左。孔距 15/55/95/135/175、距邊 ${spec.params.gearEdge}、孔徑 ${spec.params.gearHoleD} 皆待確認</text>
</g>
</svg>`;
}
function Tsafe(spec) { return spec.T; }
