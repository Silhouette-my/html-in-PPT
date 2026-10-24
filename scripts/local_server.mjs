import http from 'node:http';
import { spawn } from 'node:child_process';

// Only the explicitly selected document is served, never its containing folder.
export async function serveHtml(html, name, port = 0) {
  const pathname = `/${encodeURIComponent(name)}`;
  const server = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let requested;
    try { requested = new URL(request.url, 'http://127.0.0.1').pathname; }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      response.writeHead(400); response.end(); return;
    }
    if (requested === '/') { response.writeHead(302, { Location: pathname }); response.end(); return; }
    if (requested !== pathname) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : html);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}${pathname}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
export function browserOpenCommand(url, platform = process.platform) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] };
  return { command: 'xdg-open', args: [url] };
}
export async function openBrowser(url) {
  const { command, args } = browserOpenCommand(url);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: 'ignore', windowsHide: true });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
