// Mide el desplazamiento/giro entre el modelo y la fotogrametría de Google comparando los tejados (máscara naranja)
// en dos capturas cenitales idénticas. Uso: node herramientas/alinear.mjs google.png modelo.png metros_por_pixel
import fs from 'node:fs';
import zlib from 'node:zlib';

function leerPNG(f) {
  const b = fs.readFileSync(f); let p = 8, w, h, ct, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), tipo = b.toString('ascii', p + 4, p + 8), d = b.slice(p + 8, p + 8 + len);
    if (tipo === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; }
    if (tipo === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), st = w * bpp;
  for (let y = 0; y < h; y++) {
    const f0 = raw[y * (st + 1)], fila = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[y * st + x - bpp] : 0, u = y ? px[(y - 1) * st + x] : 0, c = x >= bpp && y ? px[(y - 1) * st + x - bpp] : 0;
      let v = fila[x];
      if (f0 === 1) v += a; else if (f0 === 2) v += u; else if (f0 === 3) v += (a + u) >> 1;
      else if (f0 === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      px[y * st + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
const [, , fG, fM, MPP = '0.163'] = process.argv;
const G = leerPNG(fG), M = leerPNG(fM);
const naranja = (I, x, y) => { const i = (y * I.w + x) * I.bpp, r = I.px[i], g = I.px[i + 1], b = I.px[i + 2]; return r > 120 && r > g + 35 && r > b + 55; };
// zona útil: evitar la interfaz (columna derecha y bordes)
const X0 = 60, X1 = G.w - 260, Y0 = 60, Y1 = G.h - 90, PASO = 2;
const mG = [], mM = [];
for (let y = Y0; y < Y1; y += PASO) for (let x = X0; x < X1; x += PASO) { if (naranja(G, x, y)) mG.push([x, y]); if (naranja(M, x, y)) mM.push([x, y]); }
const setG = new Set(mG.map(([x, y]) => (y << 12) | x));
const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
function puntaje(dx, dy, ang) {
  const c = Math.cos(ang), s = Math.sin(ang); let n = 0;
  for (const [x, y] of mM) {
    let X = Math.round((cx + (x - cx) * c - (y - cy) * s + dx) / PASO) * PASO, Y = Math.round((cy + (x - cx) * s + (y - cy) * c + dy) / PASO) * PASO;
    if (setG.has((Y << 12) | X)) n++;
  }
  return n / mM.length;
}
let mejor = { p: -1 };
for (let a = -4; a <= 4; a += 1) for (let dy = -90; dy <= 90; dy += 4) for (let dx = -90; dx <= 90; dx += 4) { const p = puntaje(dx, dy, a * Math.PI / 180); if (p > mejor.p) mejor = { p, dx, dy, a }; }
for (let a = mejor.a - 1; a <= mejor.a + 1; a += 0.25) for (let dy = mejor.dy - 4; dy <= mejor.dy + 4; dy += 2) for (let dx = mejor.dx - 4; dx <= mejor.dx + 4; dx += 2) { const p = puntaje(dx, dy, a * Math.PI / 180); if (p > mejor.p) mejor = { p, dx, dy, a }; }
const m = +MPP;
console.log(JSON.stringify({ pixeles_tejado: { google: mG.length, modelo: mM.length }, coincidencia_sin_mover: +puntaje(0, 0, 0).toFixed(3),
  mejor: { coincidencia: +mejor.p.toFixed(3), giro_grados_horario: mejor.a, este_m: +(mejor.dx * m).toFixed(2), norte_m: +(-mejor.dy * m).toFixed(2) } }));
