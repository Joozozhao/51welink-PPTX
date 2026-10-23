#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportDeckToPdf} from './export-deck.mjs';
import {validateDeck} from '../renderer.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.dirname(dir);
const root = fs.realpathSync(path.dirname(pagesDir));
const portArg = process.argv.indexOf('--port');
const port = Number(portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须是 1-65535 的整数');
const origins = new Set(['http://127.0.0.1:' + port, 'http://localhost:' + port]);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.pdf':'application/pdf','.woff':'font/woff','.woff2':'font/woff2','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.zip':'application/zip'};
let exporting = false;
function json(res, status, value) {
  if (res.writableEnded) return;
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(value));
}
function readBody(req, res) {
  return new Promise((resolve, reject) => {
    const chunks = []; let length = 0, rejected = false;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > 128 * 1024) {
        if (!rejected) {rejected = true; json(res, 413, {error:'方案文件过大'}); reject(new Error('body too large'));}
      } else chunks.push(chunk);
    });
    req.on('end', () => {if (!rejected) resolve(Buffer.concat(chunks).toString('utf8'));});
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (!origins.has('http://' + req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) {
    json(res, 403, {error:'请从本机组装站访问'}); return;
  }
  let pathname;
  try {pathname = decodeURIComponent(new URL(req.url, 'http://' + req.headers.host).pathname);}
  catch {json(res, 400, {error:'无效路径'}); return;}
  if (pathname === '/api/health' && req.method === 'GET') {json(res, 200, {pdfExport:true, status:'ok'}); return;}
  if (pathname === '/api/export' && req.method === 'POST') {
    let deck, catalog;
    try {
      deck = JSON.parse(await readBody(req, res));
      catalog = JSON.parse(fs.readFileSync(path.join(pagesDir, 'pages.json'), 'utf8'));
      validateDeck(deck, catalog);
    } catch (error) {json(res, 400, {error:error.message}); return;}
    if (exporting) {json(res, 503, {error:'另一个 PDF 正在生成，请稍后重试'}); return;}
    exporting = true;
    let pdf;
    try {
      pdf = await exportDeckToPdf(deck, catalog, {outputDir:path.join(dir, 'generated'), uniqueJob:true, baseUrl:'http://127.0.0.1:' + port + '/Pages/'});
      const bytes = fs.readFileSync(pdf);
      const title = Array.from((deck.title || '演示文稿').replace(/[\x00-\x1f/\\?%*:|"<>]/g, '_')).slice(0, 48).join('');
      res.writeHead(200, {'Content-Type':'application/pdf','Content-Length':bytes.length,'Content-Disposition':"attachment; filename=\"presentation.pdf\"; filename*=UTF-8''" + encodeURIComponent(title + '.pdf')});
      res.end(bytes);
    } catch (error) {console.error('PDF export failed:', error.message); json(res, 500, {error:'PDF 生成失败：' + error.message});}
    finally {exporting = false; if (pdf) fs.rmSync(path.dirname(pdf), {recursive:true, force:true});}
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {json(res, 405, {error:'不支持此操作'}); return;}
  const segments = pathname.split('/').filter(Boolean);
  if (pathname.includes('\0') || segments.some(s => s.startsWith('.') || s.startsWith('_') || ['build','tests','node_modules'].includes(s))) {json(res, 403, {error:'Forbidden'}); return;}
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) {json(res, 403, {error:'Forbidden'}); return;}
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    file = fs.realpathSync(file);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile() || !mime[path.extname(file).toLowerCase()]) {json(res, 403, {error:'Forbidden'}); return;}
    const stat = fs.statSync(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file).toLowerCase()], 'Content-Length':stat.size});
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {json(res, 404, {error:'Not Found'});}
});
server.requestTimeout = 120000;
server.listen(port, '127.0.0.1', () => console.log('Pages server running at http://127.0.0.1:' + port + '/Pages/'));
