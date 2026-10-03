// Охотник: поднять сервер карты для папки охот (общий для «открой карту охоты» и «открой табло»).
// Уже работает с той же папкой и той же версией – берём его. Другая версия (после «обнови скиллы») или другая папка
// охот – просим старый выключиться (/__quit) и запускаем свой.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from './kasaniya.mjs';

export const PORT = 4790;
const BASE = `http://localhost:${PORT}`;
const ping = () => fetch(BASE + '/__ping', { signal: AbortSignal.timeout(800) }).then((r) => r.json()).catch(() => null);
const real = (p) => { try { return fs.realpathSync.native(p).toLowerCase(); } catch { return path.resolve(p).toLowerCase(); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// вернёт адрес сервера или null, если поднять не вышло
export async function ensureServer(huntsRoot) {
  let up = await ping();
  if (up && up.version === VERSION && real(up.root) === real(huntsRoot)) return BASE;
  if (up) {
    await fetch(BASE + '/__quit', { method: 'POST' }).catch(() => {});
    for (let i = 0; i < 8 && (await ping()); i++) await sleep(250);
    if (await ping()) killPort(); // сервер 1.1.0 не знает /__quit – завершаем процесс, который держит порт
    for (let i = 0; i < 12 && (await ping()); i++) await sleep(250);
  }
  const server = path.join(path.dirname(fileURLToPath(import.meta.url)), 'karta-server.mjs');
  spawn(process.execPath, [server, '--root', huntsRoot, '--port', String(PORT)], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 20; i++) { await sleep(250); up = await ping(); if (up && up.version === VERSION) return BASE; }
  return null;
}

function killPort() {
  try {
    if (process.platform === 'win32') {
      const out = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }).stdout || '';
      const pids = new Set(out.split('\n').filter((l) => l.includes(`127.0.0.1:${PORT} `) && /LISTENING/.test(l)).map((l) => l.trim().split(/\s+/).pop()));
      for (const pid of pids) if (/^\d+$/.test(pid)) spawnSync('taskkill', ['/PID', pid, '/F']);
    } else {
      const pids = (spawnSync('lsof', ['-ti', `tcp:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout || '').split('\n').filter(Boolean);
      for (const pid of pids) process.kill(+pid);
    }
  } catch { /* не вышло – ensureServer вернёт null, карта откроется файлом */ }
}

export function openInBrowser(target) {
  const p = process.platform;
  const cmd = p === 'win32' ? ['cmd', ['/c', 'start', '', target]] : p === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
}
