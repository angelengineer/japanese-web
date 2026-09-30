// Offline checks for js/conjugate.js against hand-verified forms.
//   node tests/test_conjugate.js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const C = require('../js/conjugate.js');

const V = (k, r, g) => ({ k, r, g });
const iku = V('行く', 'いく', '1'), kaku = V('書く', 'かく', '1'), hanasu = V('話す', 'はなす', '1');
const matsu = V('待つ', 'まつ', '1'), yomu = V('読む', 'よむ', '1'), kau = V('買う', 'かう', '1');
const taberu = V('食べる', 'たべる', '2'), miru = V('見る', 'みる', '2'), kaeru = V('帰る', 'かえる', '1');
const suru = V('する', 'する', '3'), benkyou = V('勉強する', 'べんきょうする', '3');
const kuru = V('来る', 'くる', '3'), ittekuru = V('行って来る', 'いってくる', '3'), mottekuru = V('持ってくる', 'もってくる', '3');
const aru = V('ある', 'ある', '1'), irassharu = V('いらっしゃる', 'いらっしゃる', '1');
const kureru = V('くれる', 'くれる', '2'), kakureru = V('隠れる', 'かくれる', '2');
const tsureteiku = V('連れて行く', 'つれていく', '1'), check = V('チェックする', 'チェックする', '3');

const c = (voice, infl, neg = false, pol = false) => ({ voice, infl, neg, pol });

// [verb, combo, expected kana forms (canonical first), expected canonical kanji]
const CASES = [
  [iku, c('plain', 'te'), ['いって'], '行って'],
  [iku, c('plain', 'past'), ['いった']],
  [iku, c('plain', 'tara', true), ['いかなかったら']],
  [tsureteiku, c('plain', 'past'), ['つれていった'], '連れて行った'],
  [kaku, c('plain', 'te'), ['かいて']],
  [hanasu, c('cp', 'pres'), ['はなさせられる']],
  [kaku, c('cp', 'pres'), ['かかされる', 'かかせられる']],
  [matsu, c('pot', 'past', true, true), ['まてませんでした']],
  [yomu, c('pas', 'past', true), ['よまれなかった']],
  [kau, c('plain', 'pres', true), ['かわない']],
  [kau, c('cau', 'pres'), ['かわせる']],
  [taberu, c('pot', 'pres'), ['たべられる']],
  [taberu, c('plain', 'vol'), ['たべよう']],
  [taberu, c('plain', 'imp'), ['たべろ', 'たべよ']],
  [taberu, c('plain', 'imp', true), ['たべるな']],
  [taberu, c('plain', 'imp', false, true), ['たべなさい']],
  [miru, c('plain', 'te', true), ['みないで', 'みなくて']],
  [kaeru, c('plain', 'ba'), ['かえれば']],
  [kaeru, c('plain', 'ba', true), ['かえらなければ']],
  [suru, c('pot', 'pres'), ['できる']],
  [benkyou, c('pot', 'pres', true, true), ['べんきょうできません'], '勉強できません'],
  [benkyou, c('cp', 'past'), ['べんきょうさせられた']],
  [benkyou, c('plain', 'imp'), ['べんきょうしろ', 'べんきょうせよ']],
  [kuru, c('plain', 'pres', true), ['こない'], '来ない'],
  [kuru, c('plain', 'past', false, true), ['きました'], '来ました'],
  [kuru, c('pot', 'pres'), ['こられる'], '来られる'],
  [kuru, c('cau', 'past', true), ['こさせなかった'], '来させなかった'],
  [kuru, c('plain', 'imp'), ['こい'], '来い'],
  [kuru, c('plain', 'ba'), ['くれば'], '来れば'],
  [ittekuru, c('plain', 'te'), ['いってきて'], '行って来て'],
  [mottekuru, c('plain', 'vol'), ['もってこよう'], '持ってこよう'],
  [aru, c('plain', 'pres', true), ['ない']],
  [aru, c('plain', 'past', true, true), ['ありませんでした']],
  [irassharu, c('plain', 'pres', false, true), ['いらっしゃいます']],
  [irassharu, c('plain', 'imp'), ['いらっしゃい']],
  [kureru, c('plain', 'imp'), ['くれ']],
  [kakureru, c('plain', 'imp'), ['かくれろ', 'かくれよ']],
  [iku, c('tai', 'pres', true, true), ['いきたくないです', 'いきたくありません']],
  [iku, c('tai', 'past'), ['いきたかった']],
  [iku, c('tai', 'te', true), ['いきたくなくて']],
  [iku, c('pot', 'sou'), ['いけそう']],
  [iku, c('plain', 'nagara'), ['いきながら']],
  [yomu, c('plain', 'tari', true), ['よまなかったり']],
  [check, c('pas', 'past'), ['チェックされた']],
];

let fail = 0;
for (const [v, combo, kana, kanji] of CASES) {
  const label = `${v.k} ${JSON.stringify(combo)}`;
  try {
    assert.ok(C.comboValid(combo) && C.verbAllows(v, combo), `${label}: combo rejected`);
    const { answers } = C.conjugate(v, combo);
    assert.deepStrictEqual(answers.map((a) => a.r), kana, label);
    if (kanji) assert.strictEqual(answers[0].k, kanji, label);
  } catch (e) {
    fail++;
    console.error('FAIL', e.message);
  }
}

// Rejections.
const rejected = [
  [taberu, c('plain', 'pres')],        // the prompt itself
  [taberu, c('pot', 'vol')],
  [taberu, c('tai', 'imp')],
  [aru, c('pot', 'pres')],
  [aru, c('plain', 'imp')],
  [irassharu, c('plain', 'imp', false, true)],
  [taberu, c('plain', 'imp', true, true)],
];
for (const [v, combo] of rejected) {
  if (C.comboValid(combo) && C.verbAllows(v, combo)) { fail++; console.error('FAIL accepted', v.k, JSON.stringify(combo)); }
}

// Every real verb × every combo must produce at least one non-empty answer.
const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'verbs.js'), 'utf8');
const verbs = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
let total = 0;
for (const v of verbs) for (const combo of C.allCombos()) {
  if (!C.verbAllows(v, combo)) continue;
  total++;
  const { answers } = C.conjugate(v, combo);
  if (!answers.length || answers.some((a) => !a.k || !a.r || /undefined/.test(a.k + a.r))) {
    fail++; console.error('FAIL empty', v.k, JSON.stringify(combo));
  }
}

console.log(`${CASES.length} cases, ${rejected.length} rejections, ${total} verb×form pairs (${C.allCombos().length} forms) — ${fail ? fail + ' FAILED' : 'all OK'}`);
process.exit(fail ? 1 : 0);
