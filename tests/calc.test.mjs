import {compute, referenceCalcD, autoFit, round2, round3, VERSION, GEAR_LAYERS} from '../src/calc.mjs';

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

const fit = autoFit({});
ok(fit.blade === 415 && Math.round(fit.zShaft) === 507, `自動葉長 ${fit.blade}、主軸 ${fit.zShaft}`);
ok(fit.high <= 1000 && fit.low >= 55, `最高 ${fit.high}、葉尖最低 ${fit.low}`);

const d = compute({});
ok(d.params.diaphragms === 2 && d.diaZ.length === 2, `預設隔板 ${d.diaZ.join(', ')}`);
ok(d.diaZ[0] < 60 && d.diaZ[1] > d.colTop - 30, '兩片隔板在方管上下兩端，中間沒有');
ok(d.diaZ[1] - d.diaZ[0] > 200, '兩片之間是空的');
ok(d.env.tipR < 500 && d.env.tipR > 470, `預設葉尖半徑 ${d.env.tipR.toFixed(2)}`);
ok(Math.abs(d.clearance.abovePlate - 50) < 1, `葉尖到底板頂面 ${d.clearance.abovePlate.toFixed(1)} mm`);
ok(Math.abs(d.stack.towerAbove - 387.2) < 0.2 && Math.abs(d.stack.approx397 - 397.2) < 0.2, `塔身精算 ${d.stack.towerAbove}，不含齒輪板厚約 ${d.stack.approx397}`);
ok(d.env.topZ <= 1000 && d.env.tailR <= 500 && d.env.baseR <= 500, '預設包絡在圓柱內（轉盤頂面）');
ok(d.sf[4].SF0 > 1.5, `預設 4 m/s 安全係數 ${d.sf[4].SF0.toFixed(2)} > 1.5`);
ok(d.clearance.abovePlateAfter > 0, `扣彎曲預留後葉尖仍高於底板 ${d.clearance.abovePlateAfter.toFixed(1)} mm`);

const over = compute({blade: 450, hubZ: 520});
ok(over.env.tipOver > 10 && over.env.tipOver < 25, `葉長 450 超出半徑 ${over.env.tipOver.toFixed(2)} mm`);
ok(over.params.blade === 450, '葉長上限允許 450');

const b590 = compute({base: 590});
const b600 = compute({base: 600});
ok(b590.sf[4].SF0 > d.sf[4].SF0 && b590.sf[4].SF0 < b600.sf[4].SF0, `底板 590 的 4 m/s 係數 ${b590.sf[4].SF0.toFixed(2)}，介於 500 與 600 之間`);

ok(VERSION === '1.1.1', '版本 ' + VERSION);
ok(GEAR_LAYERS === 2 && d.params.gearPlateT === 5 && d.stack.gearTotal === 10, `齒輪底板 ${d.stack.gearLayers} 片 × ${d.stack.gearEach} mm，總厚 ${d.stack.gearTotal}`);
ok(!d.pending.join('').includes('單層厚') && !d.pending.join('').includes('厚 5') && d.pending.join('').includes('寬 100') && d.pending.join('').includes('內框'), '厚度已不是待確認，寬度與內框仍是');
ok(d.deck.len === 130 && d.deck.thick === 7, `轉盤木板 ${d.deck.len}×${d.deck.thick}`);
ok(d.turnNote.includes('方柱') && d.nutGap.rawGapPoint < 2 && d.nutGap.gapFlat > 3, `螺帽間隙原 ${d.nutGap.rawGapPoint.toFixed(1)}、調整後 ${d.nutGap.gapFlat.toFixed(1)}`);
ok(d.overhang === 177.5 && d.deck.yawFromFront === 102.5, `懸伸 ${d.overhang}、偏航軸距前緣 ${d.deck.yawFromFront}`);
ok(d.params.base === 500 && d.params.baseT === 7 && d.body0 === 7, `底板 ${d.params.base}×${d.params.baseT}，榫長 ${d.body0}`);
ok(Math.round(d.params.hubZ) === 507 && Math.abs((d.params.hubZ - d.baseT) - 500) < 0.2, `輪轂絕對高 ${d.params.hubZ}，離底板頂面 ${(d.params.hubZ - d.baseT).toFixed(1)}`);
ok(d.env.tipR < 500 && Math.abs(d.clearance.abovePlate - 50) < 0.2, `葉尖半徑 ${d.env.tipR.toFixed(2)}，離底板頂面 ${d.clearance.abovePlate.toFixed(1)}`);
ok(d.sfAt(4, 0) > 1.9 && d.sfAt(4, 0) < 2 && d.sfAt(5, 0) > 1.2 && d.sfAt(5, 0) < 1.3, `4 m/s ${d.sfAt(4, 0).toFixed(3)}、5 m/s ${d.sfAt(5, 0).toFixed(3)}、6 m/s ${d.sfAt(6, 0).toFixed(3)}，整機 ${Math.round(d.totalMass)} g`);
const g30 = compute({gear: '30'});
ok(g30.zT === d.zT && Math.round(g30.params.hubZ - d.params.hubZ) === 5, `30 倍塔頂不變 ${g30.zT}，主軸高 5 mm 到 ${g30.params.hubZ}`);

const badIn = compute({blade: 999, density: 'x', diaphragms: -3});
ok(badIn.warnings.length >= 2 && badIn.warnings.every(w => /[\u4e00-\u9fff]/.test(w)), '超範圍會以中文修正：' + badIn.warnings.join('；'));

function round1(v) { return Math.round(v * 10) / 10; }

if (fail) { console.log(fail + ' 項失敗'); process.exit(1); }
console.log('計算全部通過');
