/**
 * Сетка долей трека: темп, фаза первой доли, энергия по долям и по секундам.
 * analyze(file) → { duration, bpm, period, offset, energyBeat[], energySec[] } (энергия 0–9).
 * Своим FFmpeg декодируем в моно 11 кГц, онсеты по огибающей, темп автокорреляцией 90–150 BPM.
 */
import { execFileSync } from "node:child_process";
import { ffmpegBin } from "./env.mjs";

export function analyze(file) {
  const SR = 11025, HOP = 256, WIN = 1024, fps = SR / HOP;
  const raw = execFileSync(ffmpegBin(), ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  const env = [];
  for (let i = 0; i + WIN < x.length; i += HOP) { let s = 0; for (let k = 0; k < WIN; k++) s += x[i + k] * x[i + k]; env.push(Math.sqrt(s / WIN)); }
  const on = env.map((v, i) => Math.max(0, Math.log1p(100 * v) - Math.log1p(100 * (env[i - 1] ?? v))));
  let best = { bpm: 120, score: -1 };
  for (let bpm = 90; bpm <= 150; bpm += 0.25) {
    const l = Math.round((60 / bpm) * fps); let s = 0;
    for (let i = 0; i + l * 4 < on.length; i++) s += on[i] * (on[i + l] + 0.5 * on[i + 2 * l] + 0.25 * on[i + 4 * l]);
    if (s > best.score) best = { bpm, score: s };
  }
  const period = 60 / best.bpm;
  let phase = { t: 0, s: -1 };
  for (let t = 0; t < period; t += 0.005) {
    let s = 0; for (let b = t; b * fps < on.length; b += period) s += on[Math.round(b * fps)] || 0;
    if (s > phase.s) phase = { t, s };
  }
  const duration = x.length / SR;
  const avg = (a, b) => { let m = 0, n = 0; for (let i = Math.max(0, Math.floor(a * fps)); i < Math.min(env.length, Math.floor(b * fps)); i++) { m += env[i]; n++; } return n ? m / n : 0; };
  const secs = []; for (let s = 0; s < Math.floor(duration); s++) secs.push(avg(s, s + 1));
  const beats = []; for (let b = phase.t; b + period <= duration; b += period) beats.push(avg(b, b + period));
  const norm = (a) => { const mx = Math.max(...a, 1e-9); return a.map((v) => Math.round((v / mx) * 9)); };
  return { duration: +duration.toFixed(3), bpm: best.bpm, period: +period.toFixed(5), offset: +phase.t.toFixed(3), energyBeat: norm(beats), energySec: norm(secs) };
}

/** Доля «дропа» – начало такта (кратно 4), где энергия сильнее всего вырастает. */
export function findDrop(a, from = 24, to = 40) {
  const e = a.energyBeat;
  const mean = (i, j) => { const s = e.slice(Math.max(0, i), Math.min(e.length, j)); return s.length ? s.reduce((p, c) => p + c, 0) / s.length : 0; };
  let best = { beat: 32, score: -99 };
  for (let d = from; d <= to; d += 4) {
    if (d + 8 > e.length) break;
    const score = mean(d, d + 8) - mean(d - 8, d);
    if (score > best.score) best = { beat: d, score };
  }
  return best.beat;
}

if (process.argv[1] && process.argv[1].endsWith("beats.mjs") && process.argv[2]) {
  const a = analyze(process.argv[2]);
  console.log(`Длина ${a.duration} с · темп ≈ ${a.bpm} BPM · доля ${a.period} с · первая доля ${a.offset} с · дроп на доле ${findDrop(a)}`);
  console.log("Энергия по секундам:", a.energySec.join(""));
}
