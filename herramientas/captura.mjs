// Capturas y registro de errores de maqueta.html con Chrome sin ventana (protocolo DevTools, sin dependencias).
// Uso: node herramientas/captura.mjs salida.png "maqueta.html?vista=cubiertas" [espera_s] [ancho] [alto] [js_a_evaluar]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const [, , SALIDA = 'captura.png', PAGINA = 'maqueta.html', ESPERA = '45', ANCHO = '1600', ALTO = '900', EVAL = ''] = process.argv;
const PUERTO = 8792, DEPURA = 9333;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.glb': 'model/gltf-binary' };

const srv = http.createServer((req, res) => {
  const p = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PUERTO);

const perfil = path.join(AQUI, 'salida', 'perfil_captura');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEPURA}`, ...(process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--ignore-gpu-blocklist', '--no-first-run', `--user-data-dir=${perfil}`, `--window-size=${ANCHO},${ALTO}`, 'about:blank'], { stdio: 'ignore' });
const fin = code => { try { chrome.kill(); } catch {} srv.close(); process.exit(code); };
setTimeout(() => { console.log('tiempo agotado'); fin(2); }, (+ESPERA + 120) * 1000);

const dormir = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${DEPURA}/json`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch {}
  if (!ws) await dormir(250);
}
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map();
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const mensajes = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') mensajes.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') mensajes.push('[EXCEPCIÓN] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Network.loadingFailed' && !m.params.canceled) mensajes.push('[RED] ' + m.params.errorText);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) mensajes.push(`[HTTP ${m.params.response.status}] ${m.params.response.url.slice(0, 120)}`);
});
await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: +ANCHO, height: +ALTO, deviceScaleFactor: 1, mobile: +ANCHO < 700 });
await cdp('Page.navigate', { url: `http://localhost:${PUERTO}/${PAGINA}` });
await dormir(+ESPERA * 1000);
if (EVAL) { const r = await cdp('Runtime.evaluate', { expression: EVAL, awaitPromise: true, returnByValue: true }); console.log('eval:', JSON.stringify(r.result?.value ?? r)); await dormir(1500); }
const shot = await cdp('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(SALIDA, Buffer.from(shot.data, 'base64'));
console.log('captura', SALIDA);
console.log(mensajes.filter(m => !/GPU stall|WebGL-/.test(m)).slice(0, 40).join('\n'));
fin(0);
