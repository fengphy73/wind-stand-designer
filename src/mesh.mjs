// 網格、STL、ZIP。預覽與 STL 用同一份 Manifold 網格。

export function meshArrays(solid) {
  const m = solid.getMesh();
  const np = m.numProp;
  const pos = new Float32Array((m.vertProperties.length / np) * 3);
  for (let i = 0, j = 0; i < m.vertProperties.length; i += np, j += 3) {
    pos[j] = m.vertProperties[i];
    pos[j + 1] = m.vertProperties[i + 1];
    pos[j + 2] = m.vertProperties[i + 2];
  }
  return {positions: pos, indices: Uint32Array.from(m.triVerts)};
}

export function binarySTL(solid, header = 'wind-stand') {
  const {positions: P, indices: I} = meshArrays(solid);
  const n = I.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = header.slice(0, 80);
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < head.length ? head.charCodeAt(i) & 0x7f : 32);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
    for (const v of [a, b, c]) {
      dv.setFloat32(o, P[v], true); dv.setFloat32(o + 4, P[v + 1], true); dv.setFloat32(o + 8, P[v + 2], true); o += 12;
    }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

export function edgeCheck(solid) {
  const {positions: P, indices: I} = meshArrays(solid);
  const key = i => `${P[3 * i].toFixed(3)},${P[3 * i + 1].toFixed(3)},${P[3 * i + 2].toFixed(3)}`;
  const id = new Map();
  const vid = new Uint32Array(P.length / 3);
  for (let i = 0; i < vid.length; i++) {
    const k = key(i);
    if (!id.has(k)) id.set(k, id.size);
    vid[i] = id.get(k);
  }
  const edges = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = vid[I[t + e]], b = vid[I[t + (e + 1) % 3]];
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    const r = edges.get(k) || {f: 0, b: 0};
    if (a < b) r.f++; else r.b++;
    edges.set(k, r);
  }
  let open = 0, bad = 0;
  for (const r of edges.values()) {
    if (r.f + r.b === 1) open++;
    else if (r.f !== 1 || r.b !== 1) bad++;
  }
  return {edges: edges.size, open, nonManifold: bad, closed: open === 0 && bad === 0};
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(d) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let off = 0;
  for (const {name, data} of files) {
    const nb = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    chunks.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
