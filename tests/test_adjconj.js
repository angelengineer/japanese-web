// Offline checks for js/adjconj.js against hand-verified forms.
//   node tests/test_adjconj.js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const A = require('../js/adjconj.js');

const I = (k, r) => ({ k, r, t: 'i' }), NA = (k, r) => ({ k, r, t: 'na' });
const takai = I('高い', 'たかい'), ii = I('良い', 'いい'), kakkoii = I('かっこいい', 'かっこいい');
const atama = I('頭がいい', 'あたまがいい'), genki = I('元気がない', 'げんきがない'), tsumaranai = I('つまらない', 'つまらない');
const shizuka = NA('静かな', 'しずかな'), suki = NA('好きな', 'すきな'), kirei = NA('綺麗な', 'きれいな');
const kawaii = I('可愛い', 'かわいい'); // ends in いい but is not いい

const c = (voice, infl, neg = false, pol = false) => ({ voice, infl, neg, pol });

// [adjective, combo, expected kana forms (canonical first), expected canonical kanji]
const CASES = [
  [takai, c('plain', 'pres', true), ['たかくない'], '高くない'],
  [takai, c('plain', 'pres', false, true), ['たかいです']],
  [takai, c('plain', 'pres', true, true), ['たかくないです', 'たかくありません']],
  [takai, c('plain', 'past'), ['たかかった']],
  [takai, c('plain', 'past', false, true), ['たかかったです']],
  [takai, c('plain', 'past', true, true), ['たかくなかったです', 'たかくありませんでした']],
  [takai, c('plain', 'te', true), ['たかくなくて']],
  [takai, c('plain', 'ba'), ['たかければ']],
  [takai, c('plain', 'tara', true), ['たかくなかったら']],
  [takai, c('plain', 'adv'), ['たかく']],
  [takai, c('plain', 'sou'), ['たかそう']],
  [takai, c('plain', 'sou', true), ['たかくなさそう', 'たかそうじゃない']],
  [takai, c('sugiru', 'past', true, true), ['たかすぎませんでした'], '高すぎませんでした'],
  [takai, c('naru', 'te'), ['たかくなって']],
  [takai, c('naru', 'pres', true), ['たかくならない']],
  // いい and its compounds conjugate on よ
  [ii, c('plain', 'pres', true), ['よくない'], '良くない'],
  [ii, c('plain', 'past'), ['よかった']],
  [ii, c('plain', 'sou'), ['よさそう']],
  [ii, c('sugiru', 'pres'), ['よすぎる', 'よさすぎる']],
  [ii, c('plain', 'node'), ['いいので']],
  [kakkoii, c('plain', 'past', true), ['かっこよくなかった']],
  [atama, c('plain', 'te'), ['あたまがよくて'], '頭がよくて'],
  [kawaii, c('plain', 'past'), ['かわいかった'], '可愛かった'],
  [genki, c('plain', 'sou'), ['げんきがなさそう']],
  [genki, c('naru', 'past'), ['げんきがなくなった']],
  [tsumaranai, c('plain', 'sou'), ['つまらなそう', 'つまらなさそう']],
  [tsumaranai, c('plain', 'pres', true), ['つまらなくない']],
  // な-adjectives
  [shizuka, c('plain', 'pres'), ['しずかだ', 'しずか'], '静かだ'],
  [shizuka, c('plain', 'pres', true), ['しずかじゃない', 'しずかではない']],
  [shizuka, c('plain', 'pres', false, true), ['しずかです']],
  [shizuka, c('plain', 'past', false, true), ['しずかでした']],
  [shizuka, c('plain', 'past', true), ['しずかじゃなかった', 'しずかではなかった']],
  [shizuka, c('plain', 'te'), ['しずかで']],
  [shizuka, c('plain', 'te', true), ['しずかじゃなくて', 'しずかではなくて', 'しずかでなくて']],
  [shizuka, c('plain', 'ba'), ['しずかなら', 'しずかならば', 'しずかであれば']],
  [shizuka, c('plain', 'tara'), ['しずかだったら']],
  [shizuka, c('plain', 'adv'), ['しずかに']],
  [shizuka, c('plain', 'sou'), ['しずかそう']],
  [shizuka, c('naru', 'past', false, true), ['しずかになりました']],
  [shizuka, c('sugiru', 'te', true), ['しずかすぎなくて', 'しずかすぎないで']],
  // expressions: な / だ / nothing
  [shizuka, c('plain', 'node'), ['しずかなので']],
  [shizuka, c('plain', 'noni'), ['しずかなのに']],
  [shizuka, c('plain', 'you', false, true), ['しずかなようです']],
  [shizuka, c('plain', 'kara'), ['しずかだから']],
  [shizuka, c('plain', 'densou'), ['しずかだそうだ']],
  [shizuka, c('plain', 'mitai'), ['しずかみたいだ', 'しずかみたい']],
  [shizuka, c('plain', 'rashii'), ['しずからしい']],
  [shizuka, c('plain', 'kamo', false, true), ['しずかかもしれません']],
  [shizuka, c('plain', 'deshou', false, true), ['しずかでしょう']],
  [shizuka, c('plain', 'deshou'), ['しずかだろう']],
  [shizuka, c('plain', 'node', true), ['しずかじゃないので', 'しずかではないので']],
  [shizuka, c('plain', 'temo'), ['しずかでも']],
  [takai, c('plain', 'temo', true), ['たかくなくても']],
  [takai, c('plain', 'you'), ['たかいようだ']],
  [takai, c('plain', 'densou', true, true), ['たかくないそうです']],
];

let fail = 0;
for (const [a, combo, kana, kanji] of CASES) {
  const label = `${a.k} ${JSON.stringify(combo)}`;
  try {
    assert.ok(A.comboValid(combo) && A.adjAllows(a, combo), `${label}: combo rejected`);
    const { answers } = A.conjugate(a, combo);
    assert.deepStrictEqual(answers.map((x) => x.r), kana, label);
    if (kanji) assert.strictEqual(answers[0].k, kanji, label);
  } catch (e) {
    fail++;
    console.error('FAIL', e.message);
  }
}

const rejected = [
  [takai, c('plain', 'pres')],           // the prompt itself
  [takai, c('plain', 'adv', true)],      // no negative adverb
  [takai, c('sugiru', 'tari')],
  [takai, c('naru', 'kara')],            // expressions only on the plain adjective
  [takai, c('plain', 'kara', false, true)],
  [genki, c('plain', 'pres', true)],     // 元気がなくない: means the opposite word
  [kirei, c('plain', 'sou')],            // 綺麗そう ✕
  [kawaii, c('plain', 'sou')],           // かわいそう is another word
  [suki, c('plain', 'adv')],
];
for (const [a, combo] of rejected) {
  if (A.comboValid(combo) && A.adjAllows(a, combo)) { fail++; console.error('FAIL accepted', a.k, JSON.stringify(combo)); }
}

// Every real adjective × every combo must produce at least one non-empty answer.
const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'adjectives.js'), 'utf8');
const adjs = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
let total = 0;
for (const a of adjs) for (const combo of A.allCombos()) {
  if (!A.adjAllows(a, combo)) continue;
  total++;
  const { answers } = A.conjugate(a, combo);
  if (!answers.length || answers.some((x) => !x.k || !x.r || /undefined/.test(x.k + x.r))) {
    fail++; console.error('FAIL empty', a.k, JSON.stringify(combo));
  }
}

console.log(`${CASES.length} cases, ${rejected.length} rejections, ${total} adjective×form pairs (${A.allCombos().length} forms) — ${fail ? fail + ' FAILED' : 'all OK'}`);
process.exit(fail ? 1 : 0);
