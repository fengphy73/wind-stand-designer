// 正視、側視、俯視、偏航掃掠、安全係數圖、爆炸圖。純 SVG，參數一變就重畫。
import {
  BOOM, CYL_H, CYL_R, GEAR_FRONT_X, GEAR_OD_80, GEAR_PLATE, GUSSET_H, GUSSET_LEG,
  HUB_R, OVERHANG, ROTOR_X, TURN, YAW_LIMIT,
} from './calc.mjs';

const fmt = (v, d = 0) => Number(v).toFixed(d);
const bad = '#b42318';
const okc = '#1b7f4a';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export const STEPS = [
  '壁板對齊「上」字，出線口那片朝順風。四片指接咬合，隔板槽兩兩相對，塗木工膠後夾緊，約一天。',
  '上下隔板從端部推入槽內（中孔 Ø20 對齊），中間保持中空。穿線先從上往下穿過。',
  '柱腳榫插入底板，套上柱腳套框，四片三角補強片榫入底板，全部塗膠。出線口不要被補強片擋住。',
  '塔頂下層套上柱頂榫，十字方向放入四顆 M4 螺帽，再蓋上上層板對齊膠合。',
  '3 寸轉盤相對方柱轉 45°，讓四個安裝孔落在十字方向，鎖上塔頂。',
  '下層全長板套上柱頂榫，十字方向放入四顆 M4 螺帽。轉盤轉 45° 鎖在下層板上。',
  '上層全長板鎖上轉盤上板。兩層的穿線開口中心都在偏航軸。限位環裝進下層中孔，擋銷鎖在上層板底，先用手轉一圈確認約 ±170°。',
  '尾桿座鎖在上層板順風端，尾桿推入，尾翼（3 mm 塑膠瓦楞板）鎖在尾桿末端。',
  '執行長的齒輪組用 M4×12 鎖在上層板，孔位對齊齒輪底板的兩排孔。齒輪組原檔不改。若齒輪底板實厚超過約 7 mm，M4×12 會吃不深，請改用較長的螺絲。',
  '加長輪轂套上主軸（孔徑請依實測），三片葉片鎖在輪轂圓盤上。導線從柱底出線口拉出，標明正負極。',
];

function frame(vb, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%">
<title>${esc(title)}</title>
<rect width="100%" height="100%" fill="#f6f3ec"/>
${body}
</svg>`;
}

/** 世界座標（y 向上）畫進 viewBox。proj(x,z) → [svgX, svgY]。 */
function painter(proj, texts) {
  const out = [];
  const P = (x, z) => proj(x, z);
  return {
    raw: s => out.push(s),
    poly(pts, attrs) {
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${P(p[0], p[1]).map(n => n.toFixed(1)).join(' ')}`).join(' ') + 'Z';
      out.push(`<path d="${d}" ${attrs}/>`);
    },
    line(a, b, attrs) {
      const A = P(a[0], a[1]), B = P(b[0], b[1]);
      out.push(`<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" ${attrs}/>`);
    },
    circ(cx, cz, r, attrs) {
      const [x, y] = P(cx, cz);
      out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" ${attrs}/>`);
    },
    text(x, z, str, size, extra = '') {
      const [sx, sy] = P(x, z);
      texts.push(`<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" font-size="${size}" font-family="sans-serif" fill="#1d2a33" ${extra}>${esc(str)}</text>`);
    },
    dimH(x1, x2, z, label) {
      this.line([x1, z], [x2, z], 'stroke="#1d2a33" stroke-width="1.2"');
      this.line([x1, z - 8], [x1, z + 8], 'stroke="#1d2a33" stroke-width="1.2"');
      this.line([x2, z - 8], [x2, z + 8], 'stroke="#1d2a33" stroke-width="1.2"');
      this.text((x1 + x2) / 2, z + 6, label, 16, 'text-anchor="middle"');
    },
    dimV(z1, z2, x, label) {
      this.line([x, z1], [x, z2], 'stroke="#1d2a33" stroke-width="1.2"');
      this.line([x - 8, z1], [x + 8, z1], 'stroke="#1d2a33" stroke-width="1.2"');
      this.line([x - 8, z2], [x + 8, z2], 'stroke="#1d2a33" stroke-width="1.2"');
      this.text(x + 8, (z1 + z2) / 2, label, 16, 'dominant-baseline="middle"');
    },
    body: () => out.join(''),
  };
}

function sideProj(spec) {
  // 世界 x,z → 畫面。留白給標註。
  const x0 = -680, x1 = 720, z0 = -120, z1 = 1120;
  const W = x1 - x0, H = z1 - z0;
  const proj = (x, z) => [x - x0, z1 - z];
  return {vb: `${0} ${0} ${W} ${H}`, proj, x0, z1};
}

export function sideView(spec, yaw = 0) {
  const g = sideProj(spec);
  const texts = [];
  const d = painter(g.proj, texts);
  const p = spec.params;
  const envBad = !spec.env.radiusOk || !spec.env.topOk;
  const cyl = envBad ? bad : okc;
  // 圓柱範圍（側視是 1000×1000 的矩形）
  d.poly([[-CYL_R, 0], [CYL_R, 0], [CYL_R, CYL_H], [-CYL_R, CYL_H]], `fill="${cyl}" fill-opacity="0.06" stroke="${cyl}" stroke-width="2" stroke-dasharray="10 6"`);
  d.text(0, CYL_H + 28, envBad ? '超出 Ø100 cm × 高 100 cm' : 'KidWind 圓柱 Ø100 cm × 高 100 cm', 18, 'text-anchor="middle" fill="' + cyl + '"');
  // 地面、大會轉盤示意
  d.line([-CYL_R, 0], [CYL_R, 0], 'stroke="#8a8175" stroke-width="3"');
  d.text(-CYL_R + 8, -18, '轉盤頂面／放置面 z=0', 14, 'fill="#667"');

  const yawC = Math.cos(yaw * Math.PI / 180), yawS = Math.sin(yaw * Math.PI / 180);
  // 側視只畫偏航角在 XZ 的投影：迎風距離乘 cos
  const rx = ROTOR_X * yawC;
  // 底板
  d.poly([[-p.base / 2, 0], [p.base / 2, 0], [p.base / 2, spec.T], [-p.base / 2, spec.T]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.5"');
  // 柱
  d.poly([[-spec.OUT / 2, spec.T], [spec.OUT / 2, spec.T], [spec.OUT / 2, spec.colTop], [-spec.OUT / 2, spec.colTop]], 'fill="#d7b98a" stroke="#6a4b2b" stroke-width="1.5"');
  d.poly([[-spec.INN / 2, spec.T], [spec.INN / 2, spec.T], [spec.INN / 2, spec.colTop], [-spec.INN / 2, spec.colTop]], 'fill="#f6f3ec" stroke="none"');
  // 隔板
  for (const z of spec.diaZ) d.line([-spec.INN / 2, z], [spec.INN / 2, z], 'stroke="#6a4b2b" stroke-width="3"');
  // 補強（側視看到前後兩片的外廓）
  const go = spec.OUT / 2 + GUSSET_LEG;
  d.poly([[spec.OUT / 2, spec.T], [go, spec.T], [spec.OUT / 2, spec.T + GUSSET_H]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.2" fill-opacity="0.85"');
  d.poly([[-spec.OUT / 2, spec.T], [-go, spec.T], [-spec.OUT / 2, spec.T + GUSSET_H]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.2" fill-opacity="0.85"');
  // 塔頂
  const deck = (z0, z1) => {
    const x1 = GEAR_FRONT_X * yawC, x0 = (GEAR_FRONT_X - GEAR_PLATE.len) * yawC;
    d.poly([[Math.min(x0, x1), z0], [Math.max(x0, x1), z0], [Math.max(x0, x1), z1], [Math.min(x0, x1), z1]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.2"');
  };
  deck(spec.colTop, spec.zT);
  d.poly([[-TURN.size / 2, spec.zT], [TURN.size / 2, spec.zT], [TURN.size / 2, spec.zT + TURN.thick], [-TURN.size / 2, spec.zT + TURN.thick]], 'fill="#c5ccd3" stroke="#5c6b78" stroke-width="1.2"');
  deck(spec.zUpperBot, spec.zUpperTop);
  const gf = GEAR_FRONT_X * yawC, gr = (GEAR_FRONT_X - GEAR_PLATE.len) * yawC;
  d.poly([[Math.min(gf, gr), spec.zUpperTop], [Math.max(gf, gr), spec.zUpperTop], [Math.max(gf, gr), spec.zGearTop], [Math.min(gf, gr), spec.zGearTop]], 'fill="#8aa0b2" stroke="#3e5160" stroke-width="1.2"');
  const zPlat = spec.zUpperTop;
  d.line([rx, p.hubZ], [gf, p.hubZ], 'stroke="#3e5160" stroke-width="3"');
  d.circ(rx, p.hubZ, 8, 'fill="#2f6f9f"');
  // 葉片圓
  const over = spec.env.tipOver > 0;
  d.circ(rx, p.hubZ, p.blade + HUB_R, `fill="none" stroke="${over ? bad : '#1f7a4d'}" stroke-width="3"`);
  d.line([rx, p.hubZ - (p.blade + HUB_R)], [rx, p.hubZ + (p.blade + HUB_R)], `stroke="${over ? bad : '#1f7a4d'}" stroke-width="2" stroke-dasharray="6 4"`);
  // 尾翼
  const arm = -p.tailArm * yawC;
  d.line([0, zPlat + 2], [arm, zPlat + 2], 'stroke="#6a4b2b" stroke-width="4"');
  const finX = arm, finTop = spec.tailTop, finBot = spec.tailBot;
  d.poly([[finX - p.tailLen / 2 * yawC, finBot], [finX + p.tailLen / 2 * Math.max(yawC, 0.15), finBot], [finX + p.tailLen / 2 * Math.max(yawC, 0.15), finTop], [finX - p.tailLen / 2 * yawC, finTop]], 'fill="#e09a3e" fill-opacity="0.85" stroke="#8a5a12" stroke-width="1.2"');

  // 標註
  d.dimV(0, p.hubZ, 560, `輪轂高 ${fmt(p.hubZ, 0)}`);
  d.dimV(0, spec.env.topZ, 630, `最高 ${fmt(spec.env.topZ, 0)}`);
  d.dimH(0, rx, p.hubZ + (p.blade + HUB_R) + 36, `懸伸 ${fmt(OVERHANG, 1)}`);
  d.dimV(p.hubZ, p.hubZ + p.blade + HUB_R, rx + 36, `葉尖半徑 ${fmt(p.blade + HUB_R, 0)}`);
  d.dimV(spec.T, spec.clearance.tipZ, rx - 50, `葉尖離底板 ${fmt(spec.clearance.abovePlate, 0)}`);
  d.text(rx, -36, over ? `葉尖超出圓柱 ${fmt(spec.env.tipOver, 1)} mm` : `葉尖半徑 ${fmt(spec.env.tipR, 1)}（餘裕 ${fmt(CYL_R - spec.env.tipR, 1)}）`, 16, `text-anchor="middle" fill="${over ? bad : okc}" font-weight="700"`);
  d.text(-520, 180, '風 →', 20, 'fill="#7a1f2b" font-weight="700"');
  d.line([-430, 168], [-250, 168], 'stroke="#7a1f2b" stroke-width="2"');
  // 風從右：在右側畫箭頭指向左（從迎風吹向尾翼）
  d.text(400, p.hubZ + 80, '風從右來', 16, 'fill="#7a1f2b"');
  d.line([520, p.hubZ + 60], [300, p.hubZ + 60], 'stroke="#7a1f2b" stroke-width="2"');

  const title = `側視（風從右來）${Math.abs(yaw) > 0.5 ? '　偏航 ' + fmt(yaw, 0) + '°' : ''}`;
  return frame(`0 0 ${g.vb.split(' ')[2]} ${g.vb.split(' ')[3]}`, title, `${d.body()}<g>${texts.join('')}</g>`);
}

export function frontView(spec) {
  const x0 = -680, x1 = 680, z0 = -80, z1 = 1120;
  const proj = (y, z) => [y - x0, z1 - z];
  const texts = [];
  const d = painter(proj, texts);
  const p = spec.params;
  const over = spec.env.tipOver > 0 || spec.env.topOver > 0;
  const cyl = over ? bad : okc;
  d.poly([[-CYL_R, 0], [CYL_R, 0], [CYL_R, CYL_H], [-CYL_R, CYL_H]], `fill="${cyl}" fill-opacity="0.06" stroke="${cyl}" stroke-width="2" stroke-dasharray="10 6"`);
  d.poly([[-p.base / 2, 0], [p.base / 2, 0], [p.base / 2, spec.T], [-p.base / 2, spec.T]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.5"');
  d.poly([[-spec.OUT / 2, spec.T], [spec.OUT / 2, spec.T], [spec.OUT / 2, spec.colTop], [-spec.OUT / 2, spec.colTop]], 'fill="#d7b98a" stroke="#6a4b2b" stroke-width="1.5"');
  d.poly([[-GEAR_PLATE.wid / 2, spec.colTop], [GEAR_PLATE.wid / 2, spec.colTop], [GEAR_PLATE.wid / 2, spec.zGearTop], [-GEAR_PLATE.wid / 2, spec.zGearTop]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.2" fill-opacity="0.85"');
  // 左右補強
  d.poly([[-spec.OUT / 2, spec.T], [-spec.OUT / 2 - GUSSET_LEG, spec.T], [-spec.OUT / 2, spec.T + GUSSET_H]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.2"');
  d.poly([[spec.OUT / 2, spec.T], [spec.OUT / 2 + GUSSET_LEG, spec.T], [spec.OUT / 2, spec.T + GUSSET_H]], 'fill="#c4a574" stroke="#6a4b2b" stroke-width="1.2"');
  d.circ(0, p.hubZ, p.blade + HUB_R, `fill="none" stroke="${spec.env.tipOver > 0 ? bad : '#1f7a4d'}" stroke-width="3"`);
  d.circ(0, p.hubZ, HUB_R, 'fill="#2f6f9f" stroke="#1d4e73" stroke-width="1.5"');
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * 2 * Math.PI / 3;
    const R = p.blade + HUB_R;
    d.line([Math.cos(a) * HUB_R, p.hubZ + Math.sin(a) * HUB_R], [Math.cos(a) * R, p.hubZ + Math.sin(a) * R], 'stroke="#1f7a4d" stroke-width="8" stroke-linecap="round"');
  }
  d.dimH(-p.base / 2, p.base / 2, -40, `底板 ${fmt(p.base, 0)}`);
  d.dimV(0, spec.env.topZ, CYL_R + 40, `最高 ${fmt(spec.env.topZ, 0)}`);
  d.dimH(0, p.blade + HUB_R, p.hubZ + 24, `R ${fmt(p.blade + HUB_R, 0)}`);
  d.text(0, CYL_H + 36, '正視（從迎風側看風輪）', 18, 'text-anchor="middle"');
  const W = x1 - x0, H = z1 - z0;
  return frame(`0 0 ${W} ${H}`, '正視', `${d.body()}<g>${texts.join('')}</g>`);
}

export function topView(spec, yaw = 0) {
  const S = 620;
  const proj = (x, y) => [x + S, S - y];
  const texts = [];
  const d = painter(proj, texts);
  const p = spec.params;
  const yr = yaw * Math.PI / 180;
  const rot = (x, y) => [x * Math.cos(yr) - y * Math.sin(yr), x * Math.sin(yr) + y * Math.cos(yr)];
  const radiusBad = spec.env.tipOver > 0 || spec.env.tailOver > 0 || spec.env.baseOver > 0;
  d.circ(0, 0, CYL_R, `fill="${radiusBad ? bad : okc}" fill-opacity="0.05" stroke="${radiusBad ? bad : okc}" stroke-width="2" stroke-dasharray="8 5"`);
  // 允許偏航扇形（尾翼那側，以對風為 0）
  // 允許範圍：對風（+X，畫面右側）左右各 170°。紅弧是順風側轉不過去的約 20°。
  const a0 = -YAW_LIMIT * Math.PI / 180, a1 = YAW_LIMIT * Math.PI / 180;
  const arc = [[0, 0]];
  for (let i = 0; i <= 64; i++) {
    const a = a0 + (a1 - a0) * i / 64;
    arc.push([Math.cos(a) * (CYL_R - 8), Math.sin(a) * (CYL_R - 8)]);
  }
  d.poly(arc, 'fill="#1b7f4a" fill-opacity="0.08" stroke="#1b7f4a" stroke-width="1.5"');
  d.text(CYL_R - 180, 36, `可偏航 ±${YAW_LIMIT}°`, 16, 'fill="#1b7f4a"');
  const gap0 = YAW_LIMIT * Math.PI / 180, gap1 = (360 - YAW_LIMIT) * Math.PI / 180;
  d.raw(`<path d="M${proj(Math.cos(gap0) * CYL_R, Math.sin(gap0) * CYL_R).join(' ')} A${CYL_R} ${CYL_R} 0 0 0 ${proj(Math.cos(gap1) * CYL_R, Math.sin(gap1) * CYL_R).join(' ')}" fill="${bad}" fill-opacity="0.18" stroke="${bad}" stroke-width="3"/>`);

  // 底板（不轉）
  d.poly([[-p.base / 2, -p.base / 2], [p.base / 2, -p.base / 2], [p.base / 2, p.base / 2], [-p.base / 2, p.base / 2]], 'fill="#c4a574" fill-opacity="0.55" stroke="#6a4b2b" stroke-width="1.5"');
  d.poly([[-spec.OUT / 2, -spec.OUT / 2], [spec.OUT / 2, -spec.OUT / 2], [spec.OUT / 2, spec.OUT / 2], [-spec.OUT / 2, spec.OUT / 2]], 'fill="#8d6a3f" stroke="#4a3420" stroke-width="1.5"');
  // 轉盤菱形（轉 45°）
  const t = TURN.size / 2;
  d.poly([[0, t], [t, 0], [0, -t], [-t, 0]], 'fill="none" stroke="#5c6b78" stroke-width="1.5"');

  const deck = [[GEAR_FRONT_X, GEAR_PLATE.wid / 2], [GEAR_FRONT_X, -GEAR_PLATE.wid / 2], [GEAR_FRONT_X - GEAR_PLATE.len, -GEAR_PLATE.wid / 2], [GEAR_FRONT_X - GEAR_PLATE.len, GEAR_PLATE.wid / 2]].map(([x, y]) => rot(x, y));
  d.poly(deck, 'fill="#d7b98a" fill-opacity="0.9" stroke="#6a4b2b" stroke-width="1.2"');
  const gear = [[GEAR_FRONT_X, 50], [GEAR_FRONT_X, -50], [GEAR_FRONT_X - GEAR_PLATE.len, -50], [GEAR_FRONT_X - GEAR_PLATE.len, 50]].map(([x, y]) => rot(x, y));
  d.poly(gear, 'fill="#8aa0b2" fill-opacity="0.85" stroke="#3e5160" stroke-width="1.2"');
  // 建議穿線
  const yawP = rot(0, 0);
  d.circ(yawP[0], yawP[1], 10, 'fill="none" stroke="#1d4e89" stroke-width="1.5" stroke-dasharray="3 2"');

  const c = rot(ROTOR_X, 0);
  const dir = rot(0, 1); // 葉片在俯視是一條垂直於懸伸的線
  const R = p.blade + HUB_R;
  const t1 = [c[0] + dir[0] * R, c[1] + dir[1] * R];
  const t2 = [c[0] - dir[0] * R, c[1] - dir[1] * R];
  d.line(t1, t2, `stroke="${spec.env.tipOver > 0 ? bad : '#1f7a4d'}" stroke-width="6" stroke-linecap="round"`);
  d.circ(c[0], c[1], HUB_R, 'fill="#2f6f9f" stroke="#1d4e73"');
  // 葉尖圓（任何偏航的最大半徑）
  d.circ(0, 0, spec.env.tipR, `fill="none" stroke="${spec.env.tipOver > 0 ? bad : '#1f7a4d'}" stroke-width="1.4" stroke-dasharray="4 4"`);

  const finC = rot(-p.tailArm, 0);
  const finDir = rot(-1, 0);
  const finN = rot(0, 1);
  const fl = p.tailLen / 2, fw = 16;
  const fin = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [finC[0] + finDir[0] * fl * a + finN[0] * fw * b, finC[1] + finDir[1] * fl * a + finN[1] * fw * b]);
  d.poly(fin, `fill="${spec.env.tailOver > 0 ? bad : '#e09a3e'}" fill-opacity="0.9" stroke="#8a5a12" stroke-width="1.2"`);
  d.line(rot(-20, 0), finC, 'stroke="#6a4b2b" stroke-width="3"');

  d.text(0, CYL_R + 36, `俯視　葉尖最大半徑 ${fmt(spec.env.tipR, 1)}　尾翼 ${fmt(spec.env.tailR, 0)}　底座角 ${fmt(spec.env.baseR, 0)}`, 16, 'text-anchor="middle"');
  d.text(0, -CYL_R - 28, spec.env.tipOver > 0 ? `葉尖超出 ${fmt(spec.env.tipOver, 1)} mm` : `葉尖餘裕 ${fmt(-spec.env.tipOver, 1)} mm`, 16, `text-anchor="middle" fill="${spec.env.tipOver > 0 ? bad : okc}" font-weight="700"`);
  return frame(`0 0 ${S * 2} ${S * 2}`, '俯視', `${d.body()}<g>${texts.join('')}</g>`);
}

export function sfChart(spec) {
  const W = 640, H = 320, L = 54, R = 16, T = 16, B = 36;
  const xs = [], s0 = [], s1 = [];
  for (let v = 1; v <= 5.001; v += 0.1) {
    xs.push(v); s0.push(spec.sfAt(v, 0)); s1.push(spec.sfAt(v, 1));
  }
  const ymax = 10;
  const X = v => L + (v - 1) / 4 * (W - L - R);
  const Y = s => T + (1 - s / ymax) * (H - T - B);
  const path = arr => arr.map((s, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(Math.min(s, ymax)).toFixed(1)}`).join(' ');
  const y15 = Y(1.5);
  const ticks = [];
  for (let s = 0; s <= ymax; s += ymax > 16 ? 4 : 2) {
    ticks.push(`<line x1="${L}" y1="${Y(s).toFixed(1)}" x2="${W - R}" y2="${Y(s).toFixed(1)}" stroke="#e4ddd2"/>`);
    ticks.push(`<text x="${L - 6}" y="${(Y(s) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#667" font-family="sans-serif">${s.toFixed(0)}</text>`);
  }
  const marks = [2, 3, 4].map(v => {
    const s = spec.sf[v].SF0;
    const col = s >= 1.5 ? okc : bad;
    return `<circle cx="${X(v).toFixed(1)}" cy="${Y(s).toFixed(1)}" r="4.5" fill="${col}"/><text x="${X(v).toFixed(1)}" y="${(Y(s) - 8).toFixed(1)}" font-size="12" text-anchor="middle" fill="${col}" font-family="sans-serif" font-weight="700">${s.toFixed(2)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
<title>安全係數對風速</title>
<rect width="100%" height="100%" fill="#f6f3ec"/>
${ticks.join('')}
<line x1="${L}" y1="${y15.toFixed(1)}" x2="${W - R}" y2="${y15.toFixed(1)}" stroke="${bad}" stroke-dasharray="5 4" stroke-width="1.4"/>
<text x="${W - R}" y="${(y15 - 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${bad}" font-family="sans-serif">1.5 門檻</text>
<path d="${path(s1)}" fill="none" stroke="#8aa0b2" stroke-width="2" stroke-dasharray="5 3"/>
<path d="${path(s0)}" fill="none" stroke="#7a1f2b" stroke-width="2.4"/>
${marks}
<text x="${(L + W) / 2}" y="${H - 8}" font-size="12" text-anchor="middle" fill="#1d2a33" font-family="sans-serif">風速（m/s）</text>
<text x="14" y="${H / 2}" font-size="12" fill="#1d2a33" font-family="sans-serif" transform="rotate(-90 14 ${H / 2})">安全係數</text>
<text x="${L}" y="14" font-size="12" fill="#7a1f2b" font-family="sans-serif">實線：不加重</text>
<text x="${L + 130}" y="14" font-size="12" fill="#5c6b78" font-family="sans-serif">虛線：+1 kg 沙袋</text>
</svg>`;
}

export function explodeView(spec) {
  // 簡化側視，零件沿高度拆開，右側編號。
  const p = spec.params;
  const gap = 70;
  let z = 28;
  const blocks = [];
  const add = (h, draw, label) => { blocks.push({z, h, draw, label}); z += h + gap; };
  add(spec.T, (d, z0) => d.poly([[-p.base / 2, z0], [p.base / 2, z0], [p.base / 2, z0 + spec.T], [-p.base / 2, z0 + spec.T]], 'fill="#c4a574" stroke="#6a4b2b"'), '1 底板');
  add(GUSSET_H, (d, z0) => {
    d.poly([[-spec.OUT / 2, z0], [spec.OUT / 2, z0], [spec.OUT / 2, z0 + 20], [-spec.OUT / 2, z0 + 20]], 'fill="#d7b98a" stroke="#6a4b2b"');
    d.poly([[spec.OUT / 2, z0], [spec.OUT / 2 + 70, z0], [spec.OUT / 2, z0 + GUSSET_H]], 'fill="#c4a574" stroke="#6a4b2b"');
    d.poly([[-spec.OUT / 2, z0], [-spec.OUT / 2 - 70, z0], [-spec.OUT / 2, z0 + GUSSET_H]], 'fill="#c4a574" stroke="#6a4b2b"');
  }, '2 柱與三角補強');
  add(36, (d, z0) => {
    d.poly([[-spec.INN / 2, z0], [spec.INN / 2, z0], [spec.INN / 2, z0 + 8], [-spec.INN / 2, z0 + 8]], 'fill="#8d6a3f" stroke="#4a3420"');
    d.poly([[-spec.INN / 2, z0 + 28], [spec.INN / 2, z0 + 28], [spec.INN / 2, z0 + 36], [-spec.INN / 2, z0 + 36]], 'fill="#8d6a3f" stroke="#4a3420"');
  }, '3 上下隔板（中間中空）');
  add(spec.T, (d, z0) => d.poly([[-90, z0], [100, z0], [100, z0 + spec.T], [-90, z0 + spec.T]], 'fill="#b9926a" stroke="#6a4b2b"'), '4 下層全長板');
  add(TURN.thick, (d, z0) => d.poly([[-36, z0], [36, z0], [36, z0 + TURN.thick], [-36, z0 + TURN.thick]], 'fill="#c5ccd3" stroke="#5c6b78"'), '5 轉盤（轉 45°，夾在兩層中間）');
  add(spec.T + 14, (d, z0) => {
    d.poly([[-90, z0], [100, z0], [100, z0 + spec.T], [-90, z0 + spec.T]], 'fill="#c4a574" stroke="#6a4b2b"');
    d.poly([[-90, z0 + spec.T], [100, z0 + spec.T], [100, z0 + spec.T + 10], [-90, z0 + spec.T + 10]], 'fill="#8aa0b2" stroke="#3e5160"');
  }, '6 上層板與齒輪組');
  add(30, (d, z0) => {
    d.circ(90, z0 + 15, 14, 'fill="#2f6f9f"');
    d.line([40, z0 + 15], [90, z0 + 15], 'stroke="#2f6f9f" stroke-width="4"');
    d.line([-160, z0 + 8], [-20, z0 + 8], 'stroke="#6a4b2b" stroke-width="4"');
    d.poly([[-220, z0], [-140, z0], [-140, z0 + 28], [-220, z0 + 28]], 'fill="#e09a3e" stroke="#8a5a12"');
  }, '7 輪轂、尾桿、尾翼');
  const zMax = z + 36;
  const proj = (x, zz) => [x + 360, zMax - zz];
  const texts = [];
  const d = painter(proj, texts);
  for (const b of blocks) {
    b.draw(d, b.z);
    d.text(200, b.z + b.h / 2, b.label, 16, 'dominant-baseline="middle"');
  }
  d.text(0, zMax - 16, '爆炸圖（由下往上組）', 18, 'text-anchor="middle"');
  return frame(`0 0 720 ${zMax}`, '爆炸圖', `${d.body()}<g>${texts.join('')}</g>`);
}
