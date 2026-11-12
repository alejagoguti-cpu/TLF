// Exporta el hotel de la referencia (ref/hotel_la_fontana) a GLB con Chrome sin ventana.
// Uso: node herramientas/servidor_exportar.mjs  -> deja herramientas/salida/hotel_bruto.glb
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REF = path.resolve(AQUI, '../../ref/hotel_la_fontana');
const SALIDA = path.join(AQUI, 'salida');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO = Number(process.env.PUERTO || 8791);
fs.mkdirSync(SALIDA, { recursive: true });

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream' };

let chrome;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => {
      const cuerpo = Buffer.concat(partes);
      if (u.pathname === '/guardar') {
        const f = path.basename(u.searchParams.get('f'));
        fs.writeFileSync(path.join(SALIDA, f), cuerpo);
        console.log('guardado', f, (cuerpo.length / 1e6).toFixed(2), 'MB');
      } else if (u.pathname === '/fin') {
        console.log('fin:', cuerpo.toString());
        setTimeout(() => { chrome?.kill(); srv.close(); process.exit(cuerpo.toString() === 'ok' ? 0 : 1); }, 300);
      }
      res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(u.pathname);
  const archivo = p === '/exportar_hotel.html' ? path.join(AQUI, 'exportar_hotel.html') : path.join(REF, p);
  if (!archivo.startsWith(REF) && !archivo.startsWith(AQUI)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    res.end(d);
  });
});
srv.listen(PUERTO, () => {
  const perfil = path.join(SALIDA, 'perfil_chrome');
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--user-data-dir=' + perfil, `http://localhost:${PUERTO}/exportar_hotel.html`], { stdio: 'ignore' });
  setTimeout(() => { console.log('tiempo agotado'); chrome.kill(); process.exit(2); }, 240000);
});
