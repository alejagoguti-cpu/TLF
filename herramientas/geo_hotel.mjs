// Georreferencia del GLB del hotel y polígonos para recortar la fotogrametría de Google.
// Marco local del GLB (el de ref/hotel_la_fontana): x = este, y = arriba, z = sur, en metros.
//   x = (lon - LON0) * MLON + DX     z = -(lat - LAT0) * MLAT + DZ   (scripts/process-catastro.cjs)
// Uso: node herramientas/geo_hotel.mjs  -> modelos/hotel_geo.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REF = path.resolve(AQUI, '../../ref/hotel_la_fontana/data');
const LON0 = -74.043696, LAT0 = 4.704585, MLON = 110945, MLAT = 110574, DX = -13.47, DZ = 7.15;
const MARGEN = Number(process.env.MARGEN || 1.5); // m alrededor de cada volumen (alero 0,75 m + error de la malla de Google)

const aGeo = ([x, z]) => [+(LON0 + (x - DX) / MLON).toFixed(8), +(LAT0 - (z - DZ) / MLAT).toFixed(8)];

const area = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function limpiar(P) { // quita puntos repetidos y casi colineales
  const R = [];
  for (const p of P) if (!R.length || Math.hypot(p[0] - R[R.length - 1][0], p[1] - R[R.length - 1][1]) > 0.05) R.push(p);
  if (R.length > 1 && Math.hypot(R[0][0] - R.at(-1)[0], R[0][1] - R.at(-1)[1]) < 0.05) R.pop();
  return R;
}
function ampliar(P, d) { // desplazamiento en inglete hacia afuera, con límite
  const s = area(P) > 0 ? 1 : -1, n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const n1 = norm([(b[1] - a[1]) * s, -(b[0] - a[0]) * s]), n2 = norm([(c[1] - b[1]) * s, -(c[0] - b[0]) * s]);
    let m = norm([n1[0] + n2[0], n1[1] + n2[1]]); const cos = m[0] * n2[0] + m[1] * n2[1];
    const k = Math.min(d / Math.max(cos, 0.35), d * 2.5);
    out.push([b[0] + m[0] * k, b[1] + m[1] * k]);
  }
  return out;
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
function seCruza(P) {
  const n = P.length, cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
    if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return true;
  }
  return false;
}

const catastro = JSON.parse(fs.readFileSync(path.join(REF, 'geometry/catastro-buildings-3d.json')));
const arch = JSON.parse(fs.readFileSync(path.join(REF, 'geometry/p2-architecture.json')));
const huellas = catastro.filter(b => b.isHotel && b.pts?.length >= 3).map(b => b.pts);
huellas.push(arch.slabLoops[0].loops[0].map(([x, y]) => [x / 1000, -y / 1000])); // ala principal (losa Revit P2)

// Ajuste medido contra la fotogrametría de Google (herramientas/alinear.mjs, capturas cenitales a 0,163 m/px):
// el catastro + Revit quedaban corridos; se corrige con un giro en planta y una traslación (ENU: este, norte).
const AJUSTE = { giro_grados: 1.25, este_m: -4.9, norte_m: -7.51, pivote_rel_centro_m: [-16.3, 2.45] };
const todos = huellas.flat();
const C0 = [todos.reduce((s, p) => s + p[0], 0) / todos.length, -todos.reduce((s, p) => s + p[1], 0) / todos.length]; // ENU
const th = AJUSTE.giro_grados * Math.PI / 180, co = Math.cos(th), si = Math.sin(th);
const [pe, pn] = AJUSTE.pivote_rel_centro_m; // giro medido alrededor de este punto: t = (I - R) p + d
const T = [pe - (co * pe - si * pn) + AJUSTE.este_m, pn - (si * pe + co * pn) + AJUSTE.norte_m];
const corregir = ([x, z]) => { const e = x - C0[0], n = -z - C0[1]; return [C0[0] + co * e - si * n + T[0], -(C0[1] + si * e + co * n + T[1])]; };
// ---- unión de todas las huellas (+ margen) en UN contorno: Cesium se vuelve muy lento con muchos polígonos de recorte ----
// Se rasteriza en una malla de 0,25 m, se dilata con un disco (= margen) y se extraen los contornos. Los patios
// (huecos) no se recortan: se unen al contorno exterior con un corte de 5 cm (polígono simple "con ojal").
const RES = 0.25, avisos = [];
const enu = huellas.map(h => limpiar(h).map(corregir).map(([x, z]) => [x, -z]));
const todosE = enu.flat();
const e0 = Math.min(...todosE.map(p => p[0])) - MARGEN - 2, n0 = Math.min(...todosE.map(p => p[1])) - MARGEN - 2;
const W = Math.ceil((Math.max(...todosE.map(p => p[0])) + MARGEN + 2 - e0) / RES), Hh = Math.ceil((Math.max(...todosE.map(p => p[1])) + MARGEN + 2 - n0) / RES);
let grid = new Uint8Array(W * Hh);
for (const P of enu) { // relleno por filas (par-impar) de cada huella
  for (let j = 0; j < Hh; j++) {
    const n = n0 + (j + 0.5) * RES, xs = [];
    for (let i = 0, k = P.length - 1; i < P.length; k = i++) {
      const [ea, na] = P[i], [eb, nb] = P[k];
      if ((na > n) !== (nb > n)) xs.push(ea + (n - na) * (eb - ea) / (nb - na));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2)
      for (let i = Math.max(0, Math.ceil((xs[q] - e0) / RES - 0.5)); i <= Math.min(W - 1, Math.floor((xs[q + 1] - e0) / RES - 0.5)); i++) grid[j * W + i] = 1;
  }
}
function dilatar(g, r) { // disco de radio r celdas (separable no sirve para disco: se hace por desplazamientos)
  const out = new Uint8Array(g.length), off = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) off.push([dx, dy]);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) if (g[j * W + i]) for (const [dx, dy] of off) { const a = i + dx, b = j + dy; if (a >= 0 && b >= 0 && a < W && b < Hh) out[b * W + a] = 1; }
  return out;
}
// se dilata MARGEN + TOL y luego se simplifica con TOL: el contorno queda siempre a >= MARGEN del edificio
grid = dilatar(grid, Math.round((MARGEN + Number(process.env.TOL || 0.5)) / RES));
// contornos: aristas entre celda llena (izquierda) y vacía, encadenadas; exterior antihorario, huecos horario
const llena = (i, j) => i >= 0 && j >= 0 && i < W && j < Hh && grid[j * W + i] === 1;
const sig = new Map(), clave = (x, y) => x * 100000 + y;
for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
  if (!llena(i, j)) continue;
  if (!llena(i, j - 1)) sig.set(clave(i, j) * 4 + 0, [i, j, i + 1, j]);         // abajo: va hacia +e
  if (!llena(i + 1, j)) sig.set(clave(i + 1, j) * 4 + 1, [i + 1, j, i + 1, j + 1]); // derecha: +n
  if (!llena(i, j + 1)) sig.set(clave(i + 1, j + 1) * 4 + 2, [i + 1, j + 1, i, j + 1]); // arriba: -e
  if (!llena(i - 1, j)) sig.set(clave(i, j + 1) * 4 + 3, [i, j + 1, i, j]);     // izquierda: -n
}
const porInicio = new Map();
for (const [, s] of sig) { const k = clave(s[0], s[1]); if (!porInicio.has(k)) porInicio.set(k, []); porInicio.get(k).push(s); }
const usados = new Set(), lazos = [];
for (const [, s0] of sig) {
  if (usados.has(s0)) continue;
  const L = []; let s = s0;
  while (s && !usados.has(s)) {
    usados.add(s); L.push([s[0], s[1]]);
    const cand = (porInicio.get(clave(s[2], s[3])) || []).filter(c => !usados.has(c));
    // en vértices ambiguos (diagonales) girar a la izquierda para no cruzar lazos
    const dir = [s[2] - s[0], s[3] - s[1]];
    s = cand.sort((a, b) => giro(dir, a) - giro(dir, b))[0];
  }
  lazos.push(L.map(([i, j]) => [e0 + i * RES, n0 + j * RES]));
}
function giro(d, c) { const e = [c[2] - c[0], c[3] - c[1]], z = d[0] * e[1] - d[1] * e[0], p = d[0] * e[0] + d[1] * e[1]; return z > 0 ? 0 : p > 0 ? 1 : 2; }
function dp(P, tol) { // Douglas-Peucker en lazo cerrado
  if (P.length < 4) return P;
  let a = 0, b = 0, m = -1;
  for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > m) { m = d; b = i; } }
  const seg = (Q, i0, i1) => {
    let mx = -1, k = -1; const [x0, y0] = Q[i0], [x1, y1] = Q[i1], L = Math.hypot(x1 - x0, y1 - y0) || 1e-9;
    for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((x1 - x0) * (y0 - Q[i][1]) - (x0 - Q[i][0]) * (y1 - y0)) / L; if (d > mx) { mx = d; k = i; } }
    return mx > tol ? [...seg(Q, i0, k).slice(0, -1), ...seg(Q, k, i1)] : [Q[i0], Q[i1]];
  };
  const Q = [...P, P[0]]; // partir el lazo en el punto más lejano del inicio y simplificar cada mitad
  return [...seg(Q, 0, b).slice(0, -1), ...seg(Q, b, Q.length - 1).slice(0, -1)];
}
const TOL = Number(process.env.TOL || 0.5); // m; menos vértices = recorte mucho más rápido en Cesium
const simpl = lazos.map(L => dp(L, TOL)).filter(L => L.length >= 3 && Math.abs(area(L)) > 4);
const exteriores = simpl.filter(L => area(L) > 0), huecos = simpl.filter(L => area(L) < 0);
const dentro = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (((P[i][1] > p[1]) !== (P[j][1] > p[1])) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const cruzaSeg = (a, b, c, d) => { const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0; };
const poligonos = exteriores.map(O => {
  let P = O.slice();
  const mios = huecos.filter(h => dentro(h[0], O)).sort((a, b) => Math.min(...a.map(p => p[0])) - Math.min(...b.map(p => p[0])));
  for (const h of mios) { // puente más corto que no cruce ningún borde
    const bordes = [...P.map((p, i) => [p, P[(i + 1) % P.length]]), ...huecos.flatMap(H => H.map((p, i) => [p, H[(i + 1) % H.length]]))];
    let mejor = null;
    for (let i = 0; i < P.length; i++) for (let j = 0; j < h.length; j++) {
      const d = Math.hypot(P[i][0] - h[j][0], P[i][1] - h[j][1]);
      if (mejor && d >= mejor.d) continue;
      if (bordes.some(([a, b]) => a !== P[i] && b !== P[i] && a !== h[j] && b !== h[j] && cruzaSeg(P[i], h[j], a, b))) continue;
      mejor = { d, i, j };
    }
    if (!mejor) { avisos.push('un patio no se pudo unir: se recorta entero'); continue; }
    const { i, j } = mejor, ux = h[j][0] - P[i][0], uy = h[j][1] - P[i][1], L = Math.hypot(ux, uy) || 1, nx = -uy / L * 0.05, ny = ux / L * 0.05;
    const anillo = [...h.slice(j), ...h.slice(0, j)];
    P = [...P.slice(0, i + 1), [h[j][0] + nx, h[j][1] + ny], ...anillo.slice(1), [h[j][0] - nx, h[j][1] - ny], [P[i][0] - nx, P[i][1] - ny], ...P.slice(i + 1)];
    P[i] = [P[i][0] + nx, P[i][1] + ny];
  }
  return P;
});
avisos.push(`${exteriores.length} contorno(s), ${huecos.length} patio(s) conservado(s), ${poligonos.reduce((s, P) => s + P.length, 0)} vértices`);
// de ENU (origen del GLB) a lon/lat
const recorte = poligonos.map(P => P.map(([e, n]) => aGeo([e, -n])));

const salida = {
  nota: 'Generado por herramientas/geo_hotel.mjs. Origen = punto (0,0,0) del GLB; el GLB es Y arriba, -Z norte.',
  origen: aGeo([0, 0]),
  marco: { LON0, LAT0, MLON, MLAT, DX, DZ },
  margen_m: MARGEN,
  ajuste: { ...AJUSTE, giro_rad: th, centro_enu_m: C0.map(v => +v.toFixed(3)), traslacion_enu_m: T.map(v => +v.toFixed(3)),
    nota: 'modelo: p_enu -> centro + R(p_enu - centro) + traslacion (ENU desde el origen)' },
  recorte
};
fs.mkdirSync(path.resolve(AQUI, '../modelos'), { recursive: true });
fs.writeFileSync(path.resolve(AQUI, '../modelos/hotel_geo.json'), JSON.stringify(salida));
console.log("origen", salida.origen, avisos.join("; "));
