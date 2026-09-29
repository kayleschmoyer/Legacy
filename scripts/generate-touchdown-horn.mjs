#!/usr/bin/env node
/**
 * Generates the matchup scoreboard's touchdown horn (LS-10195).
 *
 * The asset is synthesized, not sampled, so there is no third-party licence to
 * verify: a two-tone air-horn chord built from band-limited sawtooth partials
 * with a fast attack, a short vibrato-free sustain and a soft release. Output is
 * a small 16-bit mono PCM WAV that both the web (HTMLAudioElement) and native
 * (expo-audio) players can decode without a codec dependency.
 *
 * Deterministic — re-running produces a byte-identical file. Usage:
 *
 *   node scripts/generate-touchdown-horn.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22050;
const DURATION_S = 1.5;
const ATTACK_S = 0.03;
const RELEASE_S = 0.35;
const PEAK = 0.8;

// Two horn bells a minor third apart (A#3 + C#4) — the classic stadium blast.
const TONES_HZ = [233.08, 277.18];
// Slightly detuned twin voice per tone gives the beating "brassy" edge.
const DETUNE_RATIOS = [1, 1.004];
const NYQUIST_GUARD = SAMPLE_RATE / 2 - 200;

const sampleCount = Math.round(SAMPLE_RATE * DURATION_S);
const samples = new Float64Array(sampleCount);

for (let i = 0; i < sampleCount; i += 1) {
  const t = i / SAMPLE_RATE;
  let value = 0;
  for (const tone of TONES_HZ) {
    for (const ratio of DETUNE_RATIOS) {
      const fundamental = tone * ratio;
      for (let n = 1; fundamental * n < NYQUIST_GUARD && n <= 24; n += 1) {
        value += Math.sin(2 * Math.PI * fundamental * n * t) / n ** 1.15;
      }
    }
  }
  const attack = Math.min(1, t / ATTACK_S);
  const release = Math.min(1, (DURATION_S - t) / RELEASE_S);
  samples[i] = value * attack * release * release;
}

const maxAbs = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
const pcm = Buffer.alloc(sampleCount * 2);
for (let i = 0; i < sampleCount; i += 1) {
  pcm.writeInt16LE(Math.round((samples[i] / maxAbs) * PEAK * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../lib/shared-components/src/assets/audio/touchdown-horn.wav',
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${outPath} (${header.length + pcm.length} bytes)`);
