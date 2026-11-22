import {compute, referenceCalcD, autoFit, round2, round3} from '../src/calc.mjs';

let fail = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

const ref = referenceCalcD();
ok(Math.round(ref.towerMass) === 1196, `對照塔重 ${Math.round(ref.towerMass)} g（calcD.json 1196）`);
ok(Math.round(ref.totalMass) === 1857, `對照整機 ${Math.round(ref.totalMass)} g（1857）`);
ok(round2(ref.sf[2].SF0) === 10.96 && round2(ref.sf[2].SF1) === 16.86, `2 m/s ${ref.sf[2].SF0.toFixed(2)}／${ref.sf[2].SF1.toFixed(2)}`);
ok(round2(ref.sf[3].SF0) === 4.87 && round2(ref.sf[3].SF1) === 7.5, `3 m/s ${ref.sf[3].SF0.toFixed(2)}／${ref.sf[3].SF1.toFixed(2)}`);
ok(round2(ref.sf[4].SF0) === 2.74 && round2(ref.sf[4].SF1) === 4.22, `4 m/s ${ref.sf[4].SF0.toFixed(2)}／${ref.sf[4].SF1.toFixed(2)}`);
ok(round2(ref.sf[5].SF0) === 1.75 && round2(ref.sf[5].SF1) === 2.7, `5 m/s ${ref.sf[5].SF0.toFixed(2)}／${ref.sf[5].SF1.toFixed(2)}`);
ok(round3(ref.deflTop) === 0.057 && round3(ref.deflHub) === 0.08, `撓度頂 ${ref.deflTop.toFixed(3)}、輪轂 ${ref.deflHub.toFixed(3)}`);
ok(Math.round(ref.EI / 1e6) === 1845 && ref.I === 307500, `EI ${ref.EI / 1e6}、I ${ref.I}`);
ok(Math.round(ref.wood['柱壁板']) === 220 && Math.round(ref.wood['底板']) === 819, '分項重量與 calcD 零件表一致');
ok(ref.zT === 386.2 && ref.Lcol === 376.2, `對照塔頂 ${ref.zT}、柱長 ${ref.Lcol}`);

const fit = autoFit(5);
ok(fit.blade === 430 && fit.hubZ === 520, `自動葉長 ${fit.blade}、輪轂高 ${fit.hubZ}`);
ok(fit.marginR > 0 && fit.marginR < 5, `半徑餘裕 ${fit.marginR.toFixed(2)} mm（取整後的小餘裕）`);
ok(fit.high <= 1000 && fit.low >= 55, `最高 ${fit.high}、葉尖最低 ${fit.low}`);

const d = compute({});
ok(d.params.diaphragms === 2 && d.diaZ.length === 2, `預設隔板 ${d.diaZ.join(', ')}`);
ok(d.diaZ[0] < 60 && d.diaZ[1] > d.colTop - 30, '兩片隔板在方管上下兩端，中間沒有');
ok(d.diaZ[1] - d.diaZ[0] > 200, '兩片之間是空的');
ok(d.env.tipR < 500 && d.env.tipR > 490, `預設葉尖半徑 ${d.env.tipR.toFixed(2)}`);
ok(d.env.topZ <= 1000 && d.env.tailR <= 500 && d.env.baseR <= 500, '預設包絡在圓柱內（轉盤頂面）');
ok(d.sf[4].SF0 > 1.5, `預設 4 m/s 安全係數 ${d.sf[4].SF0.toFixed(2)} > 1.5`);
ok(d.clearance.abovePlateAfter > 0, `扣彎曲預留後葉尖仍高於底板 ${d.clearance.abovePlateAfter.toFixed(1)} mm`);

const over = compute({blade: 450, hubZ: 520});
ok(over.env.tipOver > 10 && over.env.tipOver < 25, `葉長 450 超出半徑 ${over.env.tipOver.toFixed(2)} mm`);
ok(over.params.blade === 450, '葉長上限允許 450');

const b590 = compute({base: 590});
ok(b590.sf[4].SF0 > 1.5 && b590.sf[4].SF0 < d.sf[4].SF0, `底板 590 的 4 m/s 係數 ${b590.sf[4].SF0.toFixed(2)}，仍大於 1.5 且低於 600`);

const g30 = compute({gear: '30'});
ok(g30.zT === round1(d.zT - 5), `30 倍塔頂 ${g30.zT}，比 25 倍低 5 mm`);

const badIn = compute({blade: 999, density: 'x', diaphragms: -3});
ok(badIn.warnings.length >= 2 && badIn.warnings.every(w => /[\u4e00-\u9fff]/.test(w)), '超範圍會以中文修正：' + badIn.warnings.join('；'));

function round1(v) { return Math.round(v * 10) / 10; }

if (fail) { console.log(fail + ' 項失敗'); process.exit(1); }
console.log('計算全部通過');
