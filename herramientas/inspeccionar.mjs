// Lista las mallas del GLB con su caja (para separar hotel de entorno)
import fs from 'node:fs';
const b = fs.readFileSync(process.argv[2]);
const jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl).toString());
const acc = j.accessors;
const out = [];
function walk(i, t) {
  const n = j.nodes[i]; const tt = [t[0] + (n.translation?.[0] || 0), t[1] + (n.translation?.[1] || 0), t[2] + (n.translation?.[2] || 0)];
  if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) { const a = acc[p.attributes.POSITION]; out.push({ n: n.name || j.meshes[n.mesh].name || '', min: a.min.map((v, k) => +(v + tt[k]).toFixed(1)), max: a.max.map((v, k) => +(v + tt[k]).toFixed(1)), mat: j.materials?.[p.material]?.name || '', inst: !!n.extensions?.EXT_mesh_gpu_instancing, v: a.count, rot: !!n.rotation }); }
  (n.children || []).forEach(c => walk(c, tt));
}
j.scenes[0].nodes.forEach(i => walk(i, [0, 0, 0]));
const lejos = out.filter(o => o.min[0] < -70 || o.max[0] > 75 || o.min[2] < -110 || o.max[2] > 100);
console.log('total', out.length, 'fuera de la zona del hotel', lejos.length);
lejos.slice(0, 30).forEach(o => console.log(JSON.stringify(o)));
const mats = {}; out.forEach(o => mats[o.mat] = (mats[o.mat] || 0) + o.v); console.log(mats);
console.log('texturas', (j.images || []).length, 'materiales', (j.materials || []).length, 'ext', j.extensionsUsed);
