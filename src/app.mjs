import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import Module from 'manifold-3d';
import {
  VERSION, DEFAULTS, LIMITS, LABELS, compute, autoFit, referenceCalcD, round1, round2, round3,
  HUB_R, ROTOR_X, YAW_LIMIT, CYL_R, CYL_H, TURN, GEAR_FRONT_X, GEAR_PLATE, GEAR_OD_80, BOOM,
} from './calc.mjs';
import {laserSvgs, buildPrinted, buildLaserSolids, placePrinted} from './make.mjs';
import {meshArrays, binarySTL, makeZip, edgeCheck} from './mesh.mjs';
import {frontView, sideView, topView, sfChart, explodeView, STEPS} from './draw.mjs';

const $ = s => document.querySelector(s);
const app = $('#app');
app.innerHTML = `
<header>
  <h1>風力發電底座支架設計器 <small>v${VERSION}</small></h1>
  <p>給執行長的 KidWind 2026 亞洲聯賽（台灣版 AESEA v2.4）方案 D：5 mm 夾板雷切 50×50 指接方柱、底板、偏航轉盤與加長輪轂。預覽和 STL 用同一個網格。</p>
</header>
<main>
  <section class="panel" id="form"></section>
  <div class="stack">
    <section class="panel card" id="summary"></section>
    <section class="panel card" id="view-3d">
      <h2>3D 整機</h2>
      <div class="toolbar">
        <label>偏航 <input id="yaw" type="range" min="-${YAW_LIMIT}" max="${YAW_LIMIT}" value="0" step="1"> <b id="yawv">0°</b></label>
        <button id="yawplay" type="button">播放掃掠</button>
        <label>爆炸 <input id="explode" type="range" min="0" max="100" value="0" step="1"></label>
        <button id="fit" type="button">重設視角</button>
      </div>
      <div id="canvas"></div>
      <p class="note">半透明圓柱是 Ø100 cm × 高 100 cm。木色是雷切件，藍色是加長輪轂。葉片與齒輪組是示意，齒輪底板不在本設計器修改。</p>
    </section>
    <section class="panel card" id="view-ortho">
      <h2>正視、側視、俯視</h2>
      <div class="views">
        <div class="fig" id="fig-front"></div>
        <div class="fig tall" id="fig-side"></div>
        <div class="fig wide" id="fig-top"></div>
      </div>
    </section>
    <section class="panel card" id="view-chart">
      <h2>防傾倒安全係數</h2>
      <div id="sfpills" class="sf"></div>
      <div id="chart"></div>
      <p class="note">推力係數 Ct=0.8、空氣密度 1.2 kg/m³，支撐距離取底板半邊。大於 1.5 以綠色表示。方法與 calcD.py 相同。</p>
    </section>
    <section class="panel card" id="view-explode">
      <h2>組裝順序</h2>
      <div class="views">
        <div class="fig tall" id="fig-explode"></div>
        <ol class="steps" id="steps"></ol>
      </div>
    </section>
    <section class="panel card" id="view-laser">
      <h2>雷切排版（900×600 mm，實際尺寸）</h2>
      <div id="laser"></div>
      <div class="btns">
        <button type="button" data-svg="0">下載第 1 張 SVG</button>
        <button type="button" data-svg="1">下載第 2 張 SVG</button>
      </div>
      <p class="note">紅線切割、藍線與藍字雕刻。檔案以 mm 為單位，請照實際尺寸匯入，不要另外縮放。預覽為了塞進畫面才縮小，下載檔不會縮。</p>
    </section>
    <section class="panel card" id="view-parts">
      <h2>零件與下載</h2>
      <div id="bom"></div>
      <div class="btns">
        <button type="button" data-stl="hub">下載加長輪轂 STL</button>
        <button type="button" data-stl="ring">下載限位環 STL</button>
        <button type="button" data-stl="pin">下載限位擋銷 STL</button>
        <button type="button" data-stl="mount">下載尾桿座 STL</button>
        <button type="button" class="primary" id="zip">下載全部列印件（ZIP）</button>
      </div>
    </section>
  </div>
</main>`;

const FIELDS = [
  ['材料', [
    ['thickness', '板厚', 'mm', 0.1],
    ['slotFit', '榫孔寬（厚度方向）', 'mm', 0.1],
    ['density', '夾板密度', 'g/cm³', 0.01],
    ['tube', '方管邊長', 'mm', 1],
    ['diaphragms', '隔板片數', '片', 1],
    ['base', '底板邊長', 'mm', 1],
  ]],
  ['風輪與齒輪', [
    ['gear', '齒輪組', '', 0],
    ['blade', '葉片長度', 'mm', 1],
    ['hubZ', '輪轂中心高', 'mm', 1],
    ['shaftD', '主軸直徑（假設）', 'mm', 0.1],
  ]],
  ['尾翼', [
    ['tailLen', '尾翼長度', 'mm', 1],
    ['tailH', '尾翼高度', 'mm', 1],
    ['tailArm', '尾翼中心距偏航軸', 'mm', 1],
  ]],
];

const state = {...DEFAULTS};
let autoOn = true;
const form = $('#form');
form.innerHTML = `<h2 style="margin:0 0 8px;font-size:16px;color:#7a1f2b">參數</h2>`;
for (const [title, list] of FIELDS) {
  const fs = document.createElement('fieldset');
  fs.innerHTML = `<legend>${title}</legend>`;
  for (const [key, label, unit, step] of list) {
    const row = document.createElement('label');
    row.className = 'row';
    if (key === 'gear') {
      row.innerHTML = `<span>${label}</span><select data-k="gear"><option value="25">25 倍（主軸高 80）</option><option value="30">30 倍（主軸高 85）</option></select><em></em>`;
    } else {
      const [lo, hi] = LIMITS[key];
      row.innerHTML = `<span>${label}</span><input type="number" data-k="${key}" min="${lo}" max="${hi}" step="${step}" value="${state[key]}"><em>${unit}</em>`;
    }
    fs.appendChild(row);
  }
  form.appendChild(fs);
}
const actions = document.createElement('div');
actions.innerHTML = `
  <button class="go" id="auto" type="button">自動取最大葉長（目前齒輪組）</button>
  <div class="btns">
    <button type="button" id="base600">底板 600</button>
    <button type="button" id="base590">底板 590（留邊）</button>
    <button type="button" id="refbtn">套用 calcD 對照</button>
    <button type="button" id="reset">恢復預設</button>
  </div>
  <p class="note" id="autonote"></p>`;
form.appendChild(actions);

function syncForm() {
  for (const el of form.querySelectorAll('[data-k]')) el.value = state[el.dataset.k];
}
form.addEventListener('input', e => {
  const k = e.target.dataset.k;
  if (!k) return;
  if (k === 'gear') state.gear = e.target.value;
  else {
    if (e.target.value === '' || !Number.isFinite(+e.target.value)) return;
    state[k] = +e.target.value;
  }
  if (k === 'blade' || k === 'hubZ') autoOn = false;
  if (k === 'gear' && autoOn) applyAuto();
  schedule();
});
$('#auto').onclick = () => { autoOn = true; applyAuto(); schedule(); };
$('#base600').onclick = () => { state.base = 600; syncForm(); schedule(); };
$('#base590').onclick = () => { state.base = 590; syncForm(); schedule(); };
$('#reset').onclick = () => { Object.assign(state, DEFAULTS); autoOn = true; applyAuto(); syncForm(); schedule(); };
$('#refbtn').onclick = () => {
  autoOn = false;
  Object.assign(state, {thickness: 5, slotFit: 5.2, tube: 50, diaphragms: 4, base: 600, blade: 380, gear: '25', tailLen: 220, tailH: 125, tailArm: 360, density: 0.65, hubZ: 480, shaftD: 6});
  syncForm(); schedule();
};
function applyAuto() {
  const fit = autoFit(state.thickness);
  state.blade = fit.blade;
  state.hubZ = fit.hubZ;
  syncForm();
}

// ── 3D ──
const holder = $('#canvas');
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
holder.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3efe7);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8899aa, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.position.set(-400, -700, 900);
scene.add(sun);
const world = new THREE.Group();
scene.add(world);
const fixedG = new THREE.Group();
const yawG = new THREE.Group();
world.add(fixedG, yawG);

function solidMesh(solid, color, opacity = 1) {
  const {positions, indices} = meshArrays(solid);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({color, roughness: 0.72, metalness: 0.04, transparent: opacity < 1, opacity});
  return new THREE.Mesh(ng, mat);
}
function put(mesh, group, explode) {
  mesh.userData.home = mesh.position.clone();
  mesh.userData.explode = explode || new THREE.Vector3();
  group.add(mesh);
  return mesh;
}

let M = null, spec = null, printed = null, lasers = [], copies = [], timer = 0, sheets = null;
function schedule() { clearTimeout(timer); timer = setTimeout(rebuild, 60); }

function paint2d() {
  spec = compute(state);
  const fit = autoFit(state.thickness);
  $('#autonote').textContent = (autoOn ? '目前依自動葉長。' : '葉長或輪轂高已手動改過。') + fit.notes.join('');
  const env = spec.env, cl = spec.clearance;
  const tipCls = env.tipOver > 0 ? 'bad' : 'ok';
  const topCls = env.topOver > 0 ? 'bad' : 'ok';
  const sf4 = spec.sf[4].SF0;
  const ref = referenceCalcD();
  const rows = [2, 3, 4].map(v => {
    const s = spec.sf[v].SF0;
    return `<span class="pill ${s >= 1.5 ? 'ok' : 'bad'}">${v} m/s　${s.toFixed(2)}${s >= 1.5 ? '　穩' : '　未達 1.5'}</span>`;
  }).join('');
  const warns = [];
  if (env.tipOver > 0) warns.push(`葉尖離偏航軸 ${env.tipR.toFixed(1)} mm，超出圓柱半徑 ${env.tipOver.toFixed(1)} mm。`);
  if (env.tailOver > 0) warns.push(`尾翼最遠 ${env.tailR.toFixed(1)} mm，超出 ${env.tailOver.toFixed(1)} mm。`);
  if (env.baseOver > 0) warns.push(`底座對角 ${env.baseR.toFixed(1)} mm，超出 ${env.baseOver.toFixed(1)} mm。`);
  if (env.topOver > 0) warns.push(`最高點 ${env.topZ.toFixed(1)} mm，超出 1000 mm 達 ${env.topOver.toFixed(1)} mm。`);
  if (cl.abovePlateAfter < 0) warns.push(`扣掉葉尖彎曲預留 40 mm 後，葉尖低於底板 ${(-cl.abovePlateAfter).toFixed(1)} mm。`);
  if (cl.horizontal < 0) warns.push(`葉片與塔／補強的水平間隙為 ${cl.horizontal.toFixed(1)} mm（已扣後緣與彎曲）。`);
  if (cl.rootGapAfter < 0) warns.push(`葉根後緣距齒輪底板前緣，扣預留後為 ${cl.rootGapAfter.toFixed(1)} mm。`);
  const ground = env.ground100Over > 0
    ? `<div class="warn">若高度從風洞地面起算、再加 10 cm 大會轉盤：最高 ${env.ground100.toFixed(0)} mm，超出 ${env.ground100Over.toFixed(0)} mm。條文沒寫從哪裡起算。以轉盤頂面為準目前${env.topOver <= 0 ? '合格' : '不合格'}。加 5 cm 時為 ${env.ground50.toFixed(0)} mm${env.ground50Over > 0 ? '，超出 ' + env.ground50Over.toFixed(0) + ' mm' : ''}。</div>`
    : `<div class="oknote">從地面起算（轉盤 10 cm）最高 ${env.ground100.toFixed(0)} mm，仍在 1000 mm 內。</div>`;
  $('#summary').innerHTML = `
    <h2>一眼看懂</h2>
    <div class="metrics">
      <div class="metric ${tipCls}"><b data-k="tipR">${env.tipR.toFixed(1)}</b><span>葉尖最大半徑 mm／500</span></div>
      <div class="metric ${env.tailOver > 0 ? 'bad' : 'ok'}"><b data-k="tailR">${env.tailR.toFixed(0)}</b><span>尾翼最遠 mm／500</span></div>
      <div class="metric ${topCls}"><b data-k="topZ">${env.topZ.toFixed(0)}</b><span>最高點 mm（轉盤頂面）／1000</span></div>
      <div class="metric ${sf4 >= 1.5 ? 'ok' : 'bad'}"><b data-k="sf4">${sf4.toFixed(2)}</b><span>4 m/s 安全係數（不加重）</span></div>
    </div>
    <div class="sf" style="margin-top:8px">${rows}</div>
    ${warns.map(w => `<div class="warn">${w}</div>`).join('') || '<div class="oknote">以轉盤頂面為準，葉尖、尾翼、底座角與最高點都在 Ø100 cm × 高 100 cm 圓柱內。</div>'}
    ${ground}
    <p class="note">v1.1 塔頂是兩片 ${spec.deck.len}×${spec.deck.wid} 全長板，中間夾 3 寸轉盤（轉 ${spec.deck.turnDeg}°）。偏航軸在板前緣後方 ${spec.deck.yawFromFront} mm，懸伸 ${spec.overhang} mm。上層板有 ${spec.deck.holes} 個 M4 孔，對齊齒輪底板；兩層穿線開口 ${spec.deck.opening.w}×${spec.deck.opening.h}，中心都在偏航軸。</p>
    <p class="note">${spec.turnNote}</p>
    <p class="note">25 倍與 30 倍建議葉長都是 ${fit.blade} mm、輪轂高 ${fit.hubZ} mm。30 倍主軸高 5 mm，塔頂面會再低 5 mm。目前是 ${state.gear} 倍，下層板頂 ${spec.zT} mm，柱身（含下榫）${spec.wallLen} mm，隔板在 ${spec.diaZ.map(z => z.toFixed(1)).join('、')} mm。</p>
    <p class="note">塔重 <b data-k="tower">${Math.round(spec.towerMass)}</b> g，整機 <b data-k="total">${Math.round(spec.totalMass)}</b> g（密度 ${state.density} g/cm³，上半部沿用 ${spec.upper} g）。4 m/s 塔頂撓度 <b data-k="defl">${spec.deflTop.toFixed(3)}</b> mm。葉尖離底板 ${cl.abovePlate.toFixed(0)} mm，扣彎曲預留後 ${cl.abovePlateAfter.toFixed(0)} mm。葉根後緣距齒輪前緣 ${cl.rootGap.toFixed(1)} mm。</p>
    <table class="compare"><thead><tr><th></th><th>目前</th><th>calcD.json 原假設（隔板 4、葉長 380、輪轂 480、塔頂 80）</th></tr></thead><tbody>
      <tr><td>塔重 g</td><td>${Math.round(spec.towerMass)}</td><td>${Math.round(ref.towerMass)}</td></tr>
      <tr><td>整機 g</td><td>${Math.round(spec.totalMass)}</td><td>${Math.round(ref.totalMass)}</td></tr>
      <tr><td>2 / 3 / 4 m/s 安全係數</td><td>${spec.sf[2].SF0.toFixed(2)} / ${spec.sf[3].SF0.toFixed(2)} / ${spec.sf[4].SF0.toFixed(2)}</td><td>${ref.sf[2].SF0.toFixed(2)} / ${ref.sf[3].SF0.toFixed(2)} / ${ref.sf[4].SF0.toFixed(2)}</td></tr>
      <tr><td>4 m/s 塔頂撓度 mm</td><td>${spec.deflTop.toFixed(3)}</td><td>${ref.deflTop.toFixed(3)}</td></tr>
    </tbody></table>`;
  if (spec.warnings.length) $('#summary').insertAdjacentHTML('beforeend', spec.warnings.map(w => `<div class="warn">${w}</div>`).join(''));

  const yaw = +$('#yaw').value;
  $('#fig-front').innerHTML = frontView(spec);
  $('#fig-side').innerHTML = sideView(spec, yaw);
  $('#fig-top').innerHTML = topView(spec, yaw);
  $('#chart').innerHTML = sfChart(spec);
  $('#sfpills').innerHTML = [1, 2, 3, 4, 5].map(v => {
    const s = spec.sf[v].SF0;
    return `<span class="pill ${s >= 1.5 ? 'ok' : 'bad'}">${v} m/s ${s.toFixed(2)}</span>`;
  }).join('');
  $('#fig-explode').innerHTML = explodeView(spec);
  $('#steps').innerHTML = STEPS.map(s => `<li>${s}</li>`).join('');

  sheets = laserSvgs(spec);
  $('#laser').innerHTML = sheets.sheets.map(sh => `<h3 style="margin:8px 0 4px;font-size:14px">${sh.title}</h3><div class="laser">${sh.svg.replace(/^<\?xml[^>]*>\s*/, '')}</div>`).join('')
    + (sheets.overflow.length ? `<div class="warn">放不下：${sheets.overflow.join('、')}</div>` : '');

  const woodRows = Object.entries(spec.wood).map(([k, v]) => `<tr><td>${k}</td><td>${Math.round(v)}</td><td>夾板估算</td></tr>`).join('');
  $('#bom').innerHTML = `<table><thead><tr><th>項目</th><th>估重 g</th><th>說明</th></tr></thead><tbody>${woodRows}
    <tr><td>上半部（齒輪、葉片、尾、轉盤下板）</td><td>${spec.upper}</td><td>沿用方案 D，不隨葉長增減</td></tr>
    <tr><td>合計</td><td>${Math.round(spec.totalMass)}</td><td>4 m/s 安全係數 ${sf4.toFixed(2)}</td></tr>
    </tbody></table>
    <p class="note">雷切：壁板 4、隔板 ${state.diaphragms}＋備品、補強 4、套框、上下層板各 1（${spec.deck.len}×${spec.deck.wid}）、底板 ${state.base}、尾桿 365×30、限位擋塊（可選）。上層用 M4×12 鎖執行長的齒輪組。列印：加長輪轂（半徑 ${HUB_R}、加長 75）、限位環、擋銷、尾桿座。外購：3 寸全珠轉盤、M4、木工膠。尾翼用 3 mm 塑膠瓦楞板。</p>`;
}

function clearGroup(g) {
  for (const o of [...g.children]) {
    g.remove(o);
    o.traverse(n => { if (n.geometry) n.geometry.dispose(); });
  }
}
function disposeSolids(list) {
  for (const s of list) if (s?.solid?.delete) s.solid.delete();
}

function rebuild() {
  paint2d();
  if (!M) return;
  disposeSolids(lasers);
  disposeSolids(copies);
  copies = [];
  if (printed) for (const k of ['hub', 'ring', 'pin', 'mount']) printed[k].solid.delete();
  clearGroup(fixedG); clearGroup(yawG);
  printed = buildPrinted(M, spec);
  lasers = buildLaserSolids(M, spec);
  const placed = placePrinted(M, spec, printed);
  const colorOf = id => id.startsWith('hub') ? 0x2f6f9f : id.startsWith('dia') ? 0x8d6a3f : id.startsWith('gus') ? 0xb08968 : 0xc4a574;
  for (const s of lasers) {
    const mesh = solidMesh(s.solid, colorOf(s.id));
    const dir = new THREE.Vector3(0, 0, s.id.startsWith('top') ? 1 : s.id.startsWith('dia') ? 0.3 : 0);
    put(mesh, s.yaw ? yawG : fixedG, dir.multiplyScalar(1.2));
  }
  for (const s of placed) {
    const mesh = solidMesh(s.solid, s.id === 'hub' ? 0x2f6f9f : 0x3d6b4f);
    put(mesh, s.yaw ? yawG : fixedG, new THREE.Vector3(s.id === 'hub' ? 0.4 : 0, 0, 0.2));
    copies.push(s);
  }
  addSchematic();
  applyPose();
  if (!rebuild.framed) { fit(); rebuild.framed = true; }
  window.__wsd.spec = spec;
  window.__wsd.printed = printed;
  window.__wsd.sheets = sheets;
}

function addSchematic() {
  const p = spec.params;
  const envBad = spec.env.tipOver > 0 || spec.env.topOver > 0 || spec.env.tailOver > 0 || spec.env.baseOver > 0;
  const cylColor = envBad ? 0xb42318 : 0x1b7f4a;
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(CYL_R, CYL_R, CYL_H, 48, 1, true),
    new THREE.MeshStandardMaterial({color: cylColor, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false}),
  );
  cyl.rotation.x = Math.PI / 2;
  cyl.position.z = CYL_H / 2;
  put(cyl, fixedG);
  const ringAt = z => {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * CYL_R, Math.sin(a) * CYL_R, z));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color: cylColor}));
  };
  fixedG.add(ringAt(2), ringAt(CYL_H));
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const x = Math.cos(a) * CYL_R, y = Math.sin(a) * CYL_R;
    fixedG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, 2), new THREE.Vector3(x, y, CYL_H)]), new THREE.LineBasicMaterial({color: cylColor})));
  }

  const tt = new THREE.Mesh(new THREE.BoxGeometry(TURN.size, TURN.size, TURN.thick), new THREE.MeshStandardMaterial({color: 0xc5ccd3, metalness: 0.45, roughness: 0.35}));
  tt.rotation.z = Math.PI / 4;
  tt.position.z = spec.zT + TURN.thick / 2;
  put(tt, fixedG, new THREE.Vector3(0, 0, 0.6));

  // 齒輪組示意（不修改執行長的設計，只標位置）
  const gear = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(GEAR_PLATE.len, GEAR_PLATE.wid, GEAR_PLATE.thick), new THREE.MeshStandardMaterial({color: 0x8aa0b2, transparent: true, opacity: 0.85}));
  plate.position.set(GEAR_FRONT_X - GEAR_PLATE.len / 2, 0, spec.zUpperTop + GEAR_PLATE.thick / 2);
  gear.add(plate);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(p.shaftD / 2, p.shaftD / 2, 70, 16), new THREE.MeshStandardMaterial({color: 0x667, metalness: 0.6, roughness: 0.3}));
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(GEAR_FRONT_X + 10, 0, p.hubZ);
  gear.add(shaft);
  const tooth = new THREE.Mesh(new THREE.CylinderGeometry(GEAR_OD_80 / 2, GEAR_OD_80 / 2, 8, 32), new THREE.MeshStandardMaterial({color: 0x98a8b8}));
  tooth.rotation.z = Math.PI / 2;
  tooth.position.set(GEAR_FRONT_X - 30, 0, p.hubZ);
  gear.add(tooth);
  yawG.add(gear);

  const len = p.blade;
  const radial = new THREE.Vector3();
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    radial.set(0, Math.sin(a), Math.cos(a));
    const blade = new THREE.Mesh(new THREE.BoxGeometry(3, 16, len), new THREE.MeshStandardMaterial({color: 0x1f7a4d, roughness: 0.55}));
    blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), radial);
    blade.position.set(ROTOR_X, radial.y * (HUB_R + len / 2), p.hubZ + radial.z * (HUB_R + len / 2));
    yawG.add(blade);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(p.tailLen, 4, p.tailH), new THREE.MeshStandardMaterial({color: 0xe09a3e, transparent: true, opacity: 0.92}));
  fin.position.set(-p.tailArm, 0, (spec.tailTop + spec.tailBot) / 2);
  yawG.add(fin);
}

function applyPose() {
  const yaw = (+$('#yaw').value) * Math.PI / 180;
  const ex = (+$('#explode').value) / 100;
  yawG.rotation.z = yaw;
  for (const g of [fixedG, yawG]) for (const o of g.children) {
    if (!o.userData.home) continue;
    o.position.copy(o.userData.home).addScaledVector(o.userData.explode, ex * 160);
  }
  $('#yawv').textContent = `${$('#yaw').value}°`;
  if (spec) {
    $('#fig-side').innerHTML = sideView(spec, +$('#yaw').value);
    $('#fig-top').innerHTML = topView(spec, +$('#yaw').value);
  }
}

function fit() {
  const target = new THREE.Vector3(0, 0, 480);
  camera.position.set(900, -1100, 700);
  controls.target.copy(target);
  controls.update();
}
function resize() {
  const w = holder.clientWidth || 640, h = holder.clientHeight || 460;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(holder);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
$('#fit').onclick = fit;
$('#yaw').oninput = applyPose;
$('#explode').oninput = applyPose;
let playing = false, playDir = 1;
$('#yawplay').onclick = () => { playing = !playing; $('#yawplay').textContent = playing ? '停止' : '播放掃掠'; };
setInterval(() => {
  if (!playing) return;
  const el = $('#yaw');
  let v = +el.value + playDir * 2;
  if (v >= YAW_LIMIT || v <= -YAW_LIMIT) { playDir *= -1; v = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, v)); }
  el.value = v;
  applyPose();
}, 40);

function save(data, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], {type}));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
document.querySelectorAll('[data-svg]').forEach(b => b.onclick = () => {
  if (!sheets) return;
  const sh = sheets.sheets[+b.dataset.svg];
  save(new TextEncoder().encode(sh.svg), `底座支架_${sh.id}_900x600.svg`, 'image/svg+xml');
});
document.querySelectorAll('[data-stl]').forEach(b => b.onclick = () => {
  if (!printed) return;
  const k = b.dataset.stl;
  save(binarySTL(printed[k].solid, 'wind-stand'), `${printed[k].name}.stl`, 'model/stl');
});
$('#zip').onclick = () => {
  if (!printed) return;
  const files = ['hub', 'ring', 'pin', 'mount'].map(k => ({name: printed[k].name + '.stl', data: binarySTL(printed[k].solid)}));
  save(makeZip(files), `底座支架列印件_v${VERSION}.zip`, 'application/zip');
};

applyAuto();
syncForm();
paint2d();
window.__wsd = {
  VERSION, compute, autoFit, referenceCalcD, edgeCheck, state, camera, controls, THREE,
  set(patch) {
    if (patch.blade != null || patch.hubZ != null) autoOn = false;
    Object.assign(state, patch);
    if (patch.auto) { autoOn = true; applyAuto(); }
    syncForm();
    rebuild();
  },
  pose(yaw) { $('#yaw').value = yaw; applyPose(); },
};
window.__ready = false;
Module({locateFile: () => new URL('manifold.wasm', document.baseURI).href}).then(lib => {
  lib.setup();
  M = lib;
  rebuild();
  window.__ready = true;
  window.__wsd.M = M;
}).catch(e => {
  $('#summary').insertAdjacentHTML('beforeend', `<div class="warn">幾何引擎載入失敗：${e.message}</div>`);
});
