#!/usr/bin/env node
// Merge the hand-written Spanish translations in translations/es/*.txt into
// data/examples_es.js, validating them against the verb list and the engine.
//
//   node scripts/build_translations.js          # validate + build
//   node scripts/build_translations.js --todo   # list verbs still to translate
//
// Each entry translates the verb's example sentence after the app rewrites its
// final verb (see rewriteExample in js/app.js). Format, sentences split by " | ":
//
//   == 挨拶する|あいさつする
//   src: 先生に
//   plain: Saludo al profesor | No saludo… | Saludé… | No saludé… | Voy a saludar… | ¡Saluda…! | ¡No saludes…!
//   pot: Puedo saludar al profesor | No puedo… | Pude… | No pude…
//   pas / cau / cp / tai: …
//
//   src    the Japanese before the verb, without furigana. If the Notion
//          example changes, src stops matching and the entry is reported as
//          stale instead of showing a wrong translation.
//   voices [present, present negative, past, past negative]; plain and cau
//          add [volitional, imperative, negative imperative].
//
// Every other form (ば, たら, て, たり, ながら, そう) is derived from these
// in js/app.js, and politeness does not change the Spanish.
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/conjugate.js');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'translations', 'es');
const OUT = path.join(ROOT, 'data', 'examples_es.js');
const VOICES = ['plain', 'pot', 'pas', 'cau', 'cp', 'tai'];

const verbsSrc = fs.readFileSync(path.join(ROOT, 'data', 'verbs.js'), 'utf8');
const VERBS = JSON.parse(verbsSrc.slice(verbsSrc.indexOf('['), verbsSrc.lastIndexOf(']') + 1));

// Same matching as rewriteExample() in js/app.js: the prefix of the example
// before its final verb form, or null when the verb is not found.
const KANJI = '一-鿿㐀-䶿々〆ヶ';
const IRU = ['いませんでした', 'いました', 'いません', 'います', 'いなかった', 'いない', 'いた', 'いる'];
function examplePrefix(v) {
  const ja = (v.ej || '').split(/\s+[—–-]\s+/)[0];
  const body = ja.replace(new RegExp('([' + KANJI + ']+)[(（][^)）]+[)）]', 'g'), '$1').replace(/[。．.！!？?」]+$/, '');
  const forms = new Set([v.k, v.r]);
  for (const c of C.allCombos()) {
    if (!C.verbAllows(v, c)) continue;
    for (const a of C.conjugate(v, c).answers) { forms.add(a.k); forms.add(a.r); }
  }
  for (const t of C.conjugate(v, { voice: 'plain', infl: 'te', neg: false, pol: false }).answers) {
    for (const i of IRU) { forms.add(t.k + i); forms.add(t.r + i); }
  }
  const hit = [...forms].sort((a, b) => b.length - a.length).find((f) => body.endsWith(f));
  return hit === undefined ? null : body.slice(0, body.length - hit.length);
}

// Expected array length per voice for this verb (0 = voice not asked).
function expectedShape(v) {
  const shape = {};
  for (const voice of VOICES) {
    if (!C.verbAllows(v, { voice, infl: 'pres', neg: true, pol: false })) { shape[voice] = 0; continue; }
    const vol = { voice, infl: 'vol', neg: false, pol: false };
    shape[voice] = C.comboValid(vol) && C.verbAllows(v, vol) ? 7 : 4;
  }
  return shape;
}

const entries = {};
const parseErrors = [];
if (fs.existsSync(SRC_DIR)) {
  for (const f of fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.txt')).sort()) {
    let cur = null;
    fs.readFileSync(path.join(SRC_DIR, f), 'utf8').split('\n').forEach((line, n) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      if (line.startsWith('==')) {
        const key = line.slice(2).trim();
        if (entries[key]) parseErrors.push(`${f}:${n + 1}: duplicate ${key}`);
        cur = entries[key] = {};
        return;
      }
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (!cur || !m) { parseErrors.push(`${f}:${n + 1}: cannot parse "${line}"`); return; }
      cur[m[1]] = m[1] === 'src' ? m[2] : m[2].split('|').map((x) => x.trim());
    });
  }
}

const out = {};
const errors = [], stale = [], todo = [];
const known = new Set();
for (const v of VERBS) {
  const key = `${v.k}|${v.r}`;
  known.add(key);
  const prefix = examplePrefix(v);
  if (prefix === null) continue; // example cannot be rewritten; the app shows the original
  const e = entries[key];
  if (!e) { todo.push({ v, key, prefix }); continue; }
  if (e.src !== prefix) { stale.push(`${key}: src "${e.src}" ≠ "${prefix}"`); todo.push({ v, key, prefix }); continue; }
  const shape = expectedShape(v);
  for (const voice of VOICES) {
    const got = e[voice];
    const want = shape[voice];
    if (!want) continue;
    if (!Array.isArray(got) || got.length !== want || got.some((s) => typeof s !== 'string' || !s.trim())) {
      errors.push(`${key}.${voice}: expected ${want} sentences`);
    }
  }
  if (!errors.length) {
    out[key] = { src: e.src };
    for (const voice of VOICES) if (shape[voice]) out[key][voice] = e[voice];
  }
}
const unknown = Object.keys(entries).filter((k) => !known.has(k));

if (process.argv.includes('--todo')) {
  for (const { v, key, prefix } of todo) {
    const s = expectedShape(v);
    const voices = Object.keys(s).filter((x) => s[x]).map((x) => `${x}:${s[x]}`).join(' ');
    console.log(`${key}\t${prefix}[${v.k}]\t${(v.ej.split(/\s+[—–-]\s+/)[1] || '').trim()}\t${voices}`);
  }
  process.exit(0);
}

for (const m of parseErrors.concat(errors)) console.error('ERROR', m);
for (const m of stale) console.error('STALE', m);
for (const m of unknown) console.error('UNKNOWN KEY (verb gone from Notion?)', m);
if (errors.length || parseErrors.length) process.exit(1);

fs.writeFileSync(OUT,
  '// Generated by scripts/build_translations.js from translations/es/*.txt. Do not edit.\n' +
  'window.EXAMPLES_ES = {\n' +
  Object.entries(out).map(([k, e]) => JSON.stringify(k) + ': ' + JSON.stringify(e)).join(',\n') +
  '\n};\n');
console.error(`wrote ${Object.keys(out).length} translated examples -> data/examples_es.js (${todo.length} still to translate, ${stale.length} stale)`);
