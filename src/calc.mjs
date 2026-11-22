// 風力發電底座支架設計器 v1.0 — 幾何與力學（瀏覽器與 Node 共用）
// 計算方法沿用方案 D 的 calcD.py：夾板體積 × 密度、推力 Ct=0.8、傾倒力矩、懸臂撓度。
// 座標：+X 迎風（風輪）、−X 順風（尾翼）、Z 向上、Y 向右。單位 mm、g、N。

export const VERSION = '1.1.0';

export const HUB_R = 35;
export const OVERHANG = 177.5;          // 轉動面到偏航軸
export const ROTOR_X = OVERHANG;         // 轉動面 x
export const GEAR_FRONT_X = 102.5;       // 齒輪底板前緣（迎風）
export const ROTOR_AHEAD = 75;           // 轉動面在底板前緣前方
export const HUB_LEN = 75;               // 加長輪轂（前緣到後端面）
export const SHAFT_STICKOUT = 37.5;
export const SHAFT_25 = 80;
export const SHAFT_30 = 85;
export const TURN = {size: 71, thick: 8.8, bore: 35.5, holeD: 4.1, boltR: 41};
// 齒輪底板：PDF 側視以 50 mm 框當比例尺，板長 189.4 mm，取 190；厚約 9.5 mm，取 10。
// 寬度側視看不到。80 齒外徑 82，兩排 M4 需要左右邊，取 100。
export const GEAR_PLATE = {len: 190, wid: 100, thick: 10};
// 兩排各 6 孔，對準 PDF 上框 1（兩處）、框 2、框 3、發電機兩處。y=±38 離板邊 12 mm。
export const GEAR_HOLE_X = [14, 44, 82, 122, 158, 178];
export const GEAR_HOLE_Y = 38;
// 中間大開口，中心在偏航軸。24×32 避開左右孔與方柱榫。
export const GEAR_OPENING = {w: 24, h: 32};
// 轉盤維持 45°：全長板不會破邊，但 0° 的對角螺帽會貼到方柱角。
export const TURN_DEG = 45;
export const GEAR_OD_80 = 82;            // 80 齒外徑，半徑 41，齒頂 = 輪轂高 + 41
export const GUSSET_LEG = 110;
export const GUSSET_H = 115;
export const GUSSET_TENON = 40;
export const COLLAR = 70;
export const COL_TENON_W = 20;
export const DIA_TENON_W = 10;
export const DIA_HOLE = 20;
export const WIRE = {w: 15, h: 20};
export const TOP_HOLE = 34;
export const PLAT = {len: 250, wid: 110, hole: 25};
export const BOOM = {len: 365, wid: 30};
export const BEND_ROOT = 10;
export const BEND_TIP = 40;
export const TE_AT_380 = 48.2;           // 葉長 380 時後緣最大後伸
export const CT = 0.8;
export const RHO_AIR = 1.2;
export const E_MPA = 6000;
export const GLUE_G = 15;
export const UPPER_25 = 661;             // 上半部＋轉盤下板（calcD：631+30）
export const UPPER_30 = 666;             // 30 倍齒輪組重 5 g
export const YAW_LIMIT = 170;
export const CYL_R = 500;
export const CYL_H = 1000;
export const SHEET = {w: 900, h: 600};
export const REF_HUB = 480;
export const REF_BLADE = 380;

export const DEFAULTS = {
  thickness: 5,
  slotFit: 5.2,
  tube: 50,
  diaphragms: 2,
  base: 600,
  blade: 430,
  gear: '25',
  tailLen: 220,
  tailH: 125,
  tailArm: 360,
  density: 0.65,
  hubZ: 520,
  shaftD: 6,
};

export const LIMITS = {
  thickness: [3, 8],
  slotFit: [3.2, 9],
  tube: [40, 80],
  diaphragms: [0, 8],
  base: [400, 600],
  blade: [200, 450],
  tailLen: [80, 340],
  tailH: [40, 220],
  tailArm: [180, 460],
  density: [0.40, 0.95],
  hubZ: [300, 700],
  shaftD: [3, 12],
};

export const LABELS = {
  thickness: '板厚', slotFit: '榫孔寬', tube: '方管邊長', diaphragms: '隔板片數',
  base: '底板邊長', blade: '葉片長度', gear: '齒輪組', tailLen: '尾翼長度', tailH: '尾翼高度',
  tailArm: '尾翼中心距偏航軸', density: '夾板密度', hubZ: '輪轂中心高', shaftD: '主軸直徑',
};

export function round1(v) { return Math.round(v * 10) / 10; }
export function round2(v) { return Math.round(v * 100) / 100; }
export function round3(v) { return Math.round(v * 1000) / 1000; }

export function shaftH(gear) { return gear === '30' ? SHAFT_30 : SHAFT_25; }

/** 不超出 Ø1000 圓柱、並保住葉尖間隙的最大葉長與所需輪轂高。25／30 倍葉長相同，塔高不同。 */
export function autoFit(thickness) {
  const notes = [];
  const maxRb = Math.sqrt(CYL_R * CYL_R - OVERHANG * OVERHANG);
  const rawL = maxRb - HUB_R;
  let blade = Math.floor(rawL / 5) * 5;
  const tipR = L => Math.hypot(L + HUB_R, OVERHANG);
  while (blade > LIMITS.blade[0] && tipR(blade) > CYL_R - 0.05) blade -= 5;
  notes.push(`圓柱半徑 ${CYL_R} mm：√((葉長+${HUB_R})²+${OVERHANG}²) ≤ ${CYL_R}。未取整上限 ${rawL.toFixed(1)} mm，向下取 5 mm 為 ${blade} mm，葉尖半徑 ${tipR(blade).toFixed(1)} mm，餘裕 ${(CYL_R - tipR(blade)).toFixed(1)} mm。`);
  const T = thickness;
  const tipMin = T + BEND_TIP + 10;
  let Rb = blade + HUB_R;
  let hub = Math.ceil((tipMin + Rb) * 10) / 10;
  while (hub + Rb > CYL_H + 1e-6 && blade > LIMITS.blade[0]) {
    blade -= 5;
    Rb = blade + HUB_R;
    hub = Math.ceil((tipMin + Rb) * 10) / 10;
    notes.push(`葉長再減 5 mm，否則最高點超過 ${CYL_H} mm。`);
  }
  const low = hub - Rb;
  const high = hub + Rb;
  notes.push(`葉尖最低要 ≥ ${tipMin.toFixed(0)} mm（板厚 ${T} + 彎曲預留 ${BEND_TIP} + 餘裕 10）。輪轂中心 ${hub} mm：葉尖最低 ${low.toFixed(1)} mm、最高 ${high.toFixed(1)} mm（上限 ${CYL_H}，餘裕 ${(CYL_H - high).toFixed(1)} mm）。若維持原方案輪轂高 ${REF_HUB} mm，葉尖會低到 ${(REF_HUB - Rb).toFixed(0)} mm，扣預留後會碰到底板，所以把塔加高。`);
  return {blade, hubZ: hub, tipMin, low, high, marginR: CYL_R - tipR(blade), notes};
}

export function sanitize(input = {}) {
  const warnings = [];
  const p = {...DEFAULTS, ...input};
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (k === 'gear') continue;
    let v = Number(p[k]);
    if (!Number.isFinite(v)) { v = DEFAULTS[k]; warnings.push(`${LABELS[k]}不是數字，已改回 ${v}`); }
    if (v < lo || v > hi) {
      const c = Math.min(hi, Math.max(lo, v));
      warnings.push(`${LABELS[k]}超出 ${lo}–${hi}，已改為 ${c}`);
      v = c;
    }
    p[k] = v;
  }
  p.diaphragms = Math.round(p.diaphragms);
  p.gear = p.gear === '30' ? '30' : '25';
  p.thickness = round1(p.thickness);
  p.slotFit = round1(p.slotFit);
  p.tube = round1(p.tube);
  p.base = round1(p.base);
  p.blade = round1(p.blade);
  p.hubZ = round1(p.hubZ);
  p.density = Math.round(p.density * 1000) / 1000;
  p.shaftD = round1(p.shaftD);
  p.tailLen = round1(p.tailLen);
  p.tailH = round1(p.tailH);
  p.tailArm = round1(p.tailArm);
  if (p.slotFit < p.thickness + 0.15) {
    p.slotFit = round1(p.thickness + 0.2);
    warnings.push(`榫孔寬比板厚還小，已改為 ${p.slotFit} mm`);
  }
  const inn = p.tube - 2 * p.thickness;
  if (inn < 24) {
    const t = Math.max(LIMITS.thickness[0], round1((p.tube - 24) / 2));
    warnings.push(`板太厚，方管內徑會小於 24 mm，板厚已改為 ${t} mm`);
    p.thickness = t;
  }
  if (p.tube / 2 - p.thickness < COL_TENON_W / 2 + 1) {
    const t = Math.max(LIMITS.thickness[0], round1(p.tube / 2 - COL_TENON_W / 2 - 1));
    warnings.push(`指接根部會切到上下榫，板厚已改為 ${t} mm`);
    p.thickness = t;
  }
  return {params: p, warnings};
}

function squareReach(half, ang) {
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  return half / Math.max(c, s, 1e-6);
}

export function compute(input = {}, opt = {}) {
  const {params: p, warnings} = sanitize(input);
  const T = p.thickness;
  const OUT = p.tube;
  const INN = OUT - 2 * T;
  const sH = shaftH(p.gear);
  const legacy = !!opt.legacy;
  // v1.1：主軸在齒輪底板頂面之上 sH。往下是齒輪底板 10、上層板、轉盤、下層板，再接到方柱。
  // legacy 維持 v1.0／calcD 的塔頂兩層小板＋平台，用來對照 json。
  const zGearTop = round1(p.hubZ - sH);
  const zUpperTop = round1(zGearTop - (legacy ? 0 : GEAR_PLATE.thick));
  const zUpperBot = round1(zUpperTop - (legacy ? 0 : T));
  const zT = legacy
    ? round1(p.hubZ - sH - T - TURN.thick)
    : round1(zUpperBot - TURN.thick);          // 下層板頂面
  const colTop = legacy ? round1(zT - 2 * T) : round1(zT - T);
  const Lcol = colTop;
  const wallLen = round1(colTop + T);
  const body0 = T;
  const body1 = colTop;
  const bodyLen = round1(body1 - body0);
  let nSeg = Math.max(4, Math.round(bodyLen / 25.4));
  if (nSeg % 2 === 1) nSeg += 1;               // 偶數段，左右錯開後兩端都收得乾淨
  const pitch = bodyLen / nSeg;
  const topSize = opt.topSize || (legacy ? 80 : Math.max(96, Math.ceil(OUT + 16)));
  const holeR = Math.min(DIA_HOLE / 2, INN / 2 - 3);

  // 隔板：上下兩端各一片為預設；多于 2 片時中間均布。下端避開出線口。
  const wireBot = round1(T + 2);
  const wireTop = round1(wireBot + WIRE.h);
  const zLo = round1(Math.max(wireTop + T / 2 + 3, T + 18));
  const zHi = round1(colTop - 16);
  const diaZ = [];
  const nDia = p.diaphragms;
  if (nDia === 1) diaZ.push(round1((zLo + zHi) / 2));
  else if (nDia >= 2) {
    for (let i = 0; i < nDia; i++) diaZ.push(round1(zLo + (zHi - zLo) * i / (nDia - 1)));
  }

  const platTop = legacy ? round1(zT + TURN.thick + T) : zUpperBot;
  const gearTop = round1(p.hubZ + GEAR_OD_80 / 2);
  const tailTop = round1(p.hubZ - 2);
  const tailBot = round1(tailTop - p.tailH);
  const gussetOuter = OUT / 2 + GUSSET_LEG;

  // ── 質量（calcD 同式；塔頂板用實際邊長）──
  const rho = p.density;
  const cm3 = (mm3) => mm3 / 1000;
  const openArea = GEAR_OPENING.w * GEAR_OPENING.h;
  const deckNet = GEAR_PLATE.len * GEAR_PLATE.wid - openArea;
  const wood = {
    '柱壁板': cm3((OUT * OUT - INN * INN) * Lcol) * rho,
    '內隔板': nDia * cm3((INN * INN - Math.PI * holeR * holeR) * T) * rho,
    '底板': cm3(p.base * p.base * T) * 0.70 * rho,
    '三角補強片': 4 * cm3((GUSSET_LEG * GUSSET_H / 2) * T) * rho,
    '柱腳套框': cm3((COLLAR * COLLAR - (OUT + 0.4) * (OUT + 0.4)) * T) * rho,
    '木工膠': GLUE_G,
  };
  if (legacy) wood['塔頂板'] = 2 * cm3((topSize * topSize - Math.PI * (TOP_HOLE / 2) ** 2) * T) * rho;
  else wood['下層板'] = cm3(deckNet * T) * rho;
  const towerMass = Object.values(wood).reduce((a, b) => a + b, 0);
  // v1.0 的 661 g 含 250×110×5 平台。v1.1 換成 190×100 上層板，齒輪底板仍算在 661 裡。
  const oldPlatCm3 = legacy ? 0 : 250 * 110 * 5 / 1000;
  const newUpperCm3 = legacy ? 0 : deckNet * T / 1000;
  const upper = (p.gear === '30' ? UPPER_30 : UPPER_25) + (newUpperCm3 - oldPlatCm3) * rho;
  const totalMass = towerMass + upper;

  const Rmm = p.blade + HUB_R;
  const Rm = Rmm / 1000;
  const area = Math.PI * Rm * Rm;
  const thrust = (v, ct = CT) => 0.5 * RHO_AIR * area * v * v * ct;
  const Hm = p.hubZ / 1000;
  const bm = (p.base / 2) / 1000;
  const sfAt = (v, ballast = 0, ct = CT) => (totalMass / 1000 + ballast) * 9.81 * bm / (thrust(v, ct) * Hm);
  const sf = {};
  for (const v of [1, 2, 3, 4, 5]) sf[v] = {T: thrust(v), SF0: sfAt(v, 0), SF1: sfAt(v, 1)};

  const I = (OUT ** 4 - INN ** 4) / 12;
  const EI = E_MPA * I;                         // N·mm²
  const Lcant = legacy ? zT - T : zT - T; // 地面底板頂到固定板頂
  const F4 = thrust(4);
  const arm = p.hubZ - (legacy ? zT : zT);
  const M4 = F4 * arm;
  const deflTop = F4 * Lcant ** 3 / (3 * EI) + M4 * Lcant ** 2 / (2 * EI);
  const theta = F4 * Lcant ** 2 / (2 * EI) + M4 * Lcant / EI;
  const deflHub = deflTop + theta * arm;

  const te = TE_AT_380 * (p.blade / REF_BLADE);
  const rootGap = ROTOR_AHEAD - te;
  const rootGapAfter = rootGap - BEND_ROOT;

  // 包絡
  const tipR = Math.hypot(Rmm, OVERHANG);
  const tailR = p.tailArm + p.tailLen / 2;
  const baseR = (p.base / 2) * Math.SQRT2;
  const topZ = Math.max(p.hubZ + Rmm, tailTop, gearTop);
  const env = {
    tipR, tailR, baseR, topZ,
    tipOver: tipR - CYL_R,
    tailOver: tailR - CYL_R,
    baseOver: baseR - CYL_R,
    topOver: topZ - CYL_H,
    ground50: topZ + 50,
    ground100: topZ + 100,
    ground50Over: topZ + 50 - CYL_H,
    ground100Over: topZ + 100 - CYL_H,
  };
  env.radiusOk = env.tipOver <= 0 && env.tailOver <= 0 && env.baseOver <= 0;
  env.topOk = env.topOver <= 0;

  // 間隙：轉動面整圈取樣，結構用包絡半徑（補強片沿徑向線形外伸）
  function reach(z) {
    if (z < 0 || z > (legacy ? zT : zGearTop)) return 0;
    if (z <= T) return squareReach(p.base / 2, Math.PI / 4); // 底板對角，取最大
    if (!legacy && z >= colTop) return Math.hypot(GEAR_FRONT_X, GEAR_PLATE.wid / 2);
    if (legacy && z >= zT - 2 * T) return squareReach(topSize / 2, Math.PI / 4);
    const col = squareReach(OUT / 2, Math.PI / 4);
    if (z >= T + GUSSET_H) return col;
    const t = (T + GUSSET_H - z) / GUSSET_H;
    return Math.max(col, OUT / 2 + GUSSET_LEG * t);
  }
  let hMin = Infinity, hAt = null, vMin = Infinity;
  const tipZ = p.hubZ - Rmm;
  const tipZBend = tipZ - BEND_TIP;
  for (let s = 0; s <= 1.0001; s += 0.05) {
    const rad = HUB_R + s * p.blade;
    const bend = BEND_ROOT + (BEND_TIP - BEND_ROOT) * s;
    const delta = te * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(s, 1))) + bend; // 後緣＋迎風彎向塔
    for (let a = 0; a < 360; a += 15) {
      const ar = a * Math.PI / 180;
      const z = p.hubZ + rad * Math.cos(ar);
      const y = rad * Math.sin(ar);
      const xEff = ROTOR_X - delta;
      const horiz = Math.hypot(xEff, y);
      const rch = reach(z);
      const gap = horiz - rch;
      if (gap < hMin) { hMin = gap; hAt = {z, s, a, horiz, rch}; }
      const zEff = z - bend * Math.max(0, -Math.cos(ar)); // 下半圈下垂
      if (horiz < p.base / 2 && zEff > T) vMin = Math.min(vMin, zEff - T);
    }
  }
  const clearance = {
    tipZ, tipZBend,
    abovePlate: tipZ - T,
    abovePlateAfter: tipZBend - T,
    horizontal: hMin,
    horizontalAt: hAt,
    verticalMin: vMin,
    rootGap, rootGapAfter, te,
  };

  const fit25 = autoFit(T);
  const fit30 = autoFit(T); // 葉長與輪轂高不隨倍率變；塔頂高會變
  const drop = (shaft) => legacy
    ? round1(p.hubZ - shaft - T - TURN.thick)
    : round1(p.hubZ - shaft - GEAR_PLATE.thick - T - TURN.thick);
  const tower30 = drop(SHAFT_30);
  const tower25 = drop(SHAFT_25);
  const turnNote = legacy ? '' : '全長板 190×100 裝得下 R41 孔，板邊不再破。0° 時四孔在對角，螺帽槽離 50 mm 方柱角只剩約 1.6 mm（方案說明約 0.5 mm）。維持轉 45°，讓孔落在十字方向、螺帽在柱壁外。';

  return {
    params: p, warnings, T, OUT, INN, sH, zT, colTop, Lcol, wallLen, body0, body1, bodyLen,
    nSeg, pitch, topSize, holeR, diaZ, wireBot, wireTop, platTop, gearTop, tailTop, tailBot,
    gussetOuter, wood, towerMass, upper, totalMass, area, thrust, sfAt, sf, I, EI, Lcant,
    deflTop, deflHub, F4, env, clearance, fit25, fit30, tower25, tower30,
    finger: {nSeg, pitch, depth: T},
    legacy, zGearTop, zUpperTop, zUpperBot, zLowerTop: zT, zLowerBot: colTop,
    deck: {len: GEAR_PLATE.len, wid: GEAR_PLATE.wid, thick: GEAR_PLATE.thick, yawFromFront: GEAR_FRONT_X, holes: GEAR_HOLE_X.length * 2, opening: GEAR_OPENING, turnDeg: TURN_DEG},
    turnNote, overhang: OVERHANG,
  };
}

/** 與 calcD.json 完全相同的假設，用來鎖定計算方法。 */
export function referenceCalcD() {
  return compute({
    thickness: 5, slotFit: 5.2, tube: 50, diaphragms: 4, base: 600,
    blade: 380, gear: '25', tailLen: 220, tailH: 125, tailArm: 360,
    density: 0.65, hubZ: 480, shaftD: 6,
  }, {topSize: 80, legacy: true});
}
