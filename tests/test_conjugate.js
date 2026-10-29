// Offline checks for js/conjugate.js against hand-verified forms.
//   node tests/test_conjugate.js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const C = require('../js/conjugate.js');

const V = (k, r, g, t) => ({ k, r, g, t });
const iku = V('行く', 'いく', '1'), kaku = V('書く', 'かく', '1'), hanasu = V('話す', 'はなす', '1');
const matsu = V('待つ', 'まつ', '1'), yomu = V('読む', 'よむ', '1'), kau = V('買う', 'かう', '1');
const taberu = V('食べる', 'たべる', '2'), miru = V('見る', 'みる', '2'), kaeru = V('帰る', 'かえる', '1');
const suru = V('する', 'する', '3'), benkyou = V('勉強する', 'べんきょうする', '3');
const kuru = V('来る', 'くる', '3'), ittekuru = V('行って来る', 'いってくる', '3'), mottekuru = V('持ってくる', 'もってくる', '3');
const aru = V('ある', 'ある', '1'), irassharu = V('いらっしゃる', 'いらっしゃる', '1');
const kureru = V('くれる', 'くれる', '2'), kakureru = V('隠れる', 'かくれる', '2');
const tsureteiku = V('連れて行く', 'つれていく', '1'), check = V('チェックする', 'チェックする', '3');
const kakuT = V('書く', 'かく', '1', 'tr'), matsuT = V('待つ', 'まつ', '1', 'tr'), taberuT = V('食べる', 'たべる', '2', 'tr');
const miruT = V('見る', 'みる', '2', 'tr'), kiku = V('聞く', 'きく', '1', 'tr'), au = V('会う', 'あう', '1', 'intr');
const kaeruI = V('帰る', 'かえる', '1', 'intr'), furu = V('降る', 'ふる', '1', 'intr'), yomuT = V('読む', 'よむ', '1', 'tr');
const kuruI = V('来る', 'くる', '3', 'intr'), benkyouT = V('勉強する', 'べんきょうする', '3', 'tr');
const mottekuruT = V('持ってくる', 'もってくる', '3', 'tr'), konde = V('混んでいる', 'こんでいる', '2', 'intr');

const c = (voice, infl, neg = false, pol = false) => ({ voice, infl, neg, pol });

// [verb, combo, expected kana forms (canonical first), expected canonical kanji]
// A kanji-only variant (下さい, 方) repeats its reading in the kana list.
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
  // 〜て auxiliaries
  [kakuT, c('teiru', 'pres'), ['かいている', 'かいてる'], '書いている'],
  [yomuT, c('teshimau', 'past'), ['よんでしまった', 'よんじゃった']],
  [kakuT, c('tearu', 'pres', false, true), ['かいてあります']],
  [kakuT, c('teoku', 'vol'), ['かいておこう', 'かいとこう']],
  [taberuT, c('temiru', 'tara'), ['たべてみたら']],
  [kakuT, c('teiku', 'past'), ['かいていった']],
  [kakuT, c('tekuru', 'pres', true), ['かいてこない']],
  [kakuT, c('tekureru', 'pres', true, true), ['かいてくれません']],
  [kakuT, c('tekudasaru', 'past', false, true), ['かいてくださいました']],
  [kakuT, c('teitadaku', 'pres', false, true), ['かいていただきます']],
  [taberuT, c('sugiru', 'past'), ['たべすぎた']],
  [iku, c('tagaru', 'pres', true), ['いきたがらない']],
  // keigo
  [iku, c('sonkei', 'pres', false, true), ['いらっしゃいます', 'おいでになります']],
  [kuruI, c('kenjou', 'pres', false, true), ['まいります', 'うかがいます'], '参ります'],
  [miruT, c('sonkei', 'past', false, true), ['ごらんになりました'], 'ご覧になりました'],
  [kiku, c('kenjou', 'pres', false, true), ['うかがいます', 'おききします']],
  [au, c('kenjou', 'pres', false, true), ['おめにかかります', 'おあいします']],
  [matsuT, c('sonkei', 'te'), ['おまちになって'], 'お待ちになって'],
  [matsuT, c('kenjou', 'vol', false, true), ['おまちしましょう']],
  [benkyouT, c('sonkei', 'pres', false, true), ['べんきょうなさいます']],
  [mottekuruT, c('kenjou', 'pres', false, true), ['もってまいります'], '持って参ります'],
  [kaeruI, c('sonkei', 'past', false, true), ['おかえりになりました']],
  // set expressions
  [kakuT, c('plain', 'temoii', true), ['かかなくてもいい', 'かかなくてもかまわない']],
  [yomuT, c('plain', 'tewa'), ['よんではいけない', 'よんじゃいけない']],
  [iku, c('plain', 'nakereba', false, true), ['いかなければなりません', 'いかなければいけません', 'いかなくてはなりません', 'いかなくてはいけません']],
  [matsuT, c('plain', 'kudasai', true), ['またないでください', 'またないでください']],
  [kaeruI, c('cau', 'itadake'), ['かえらせていただけませんか', 'かえらせていただけませんか']],
  [matsuT, c('plain', 'okudasai'), ['おまちください']],
  [miruT, c('plain', 'okudasai'), ['ごらんください']],
  [iku, c('plain', 'keiken', true, true), ['いったことがありません']],
  [kuruI, c('plain', 'youto'), ['こようとおもう', 'こようとおもっている'], '来ようと思う'],
  [V('する', 'する', '3', 'tr'), c('plain', 'tsumori', true), ['しないつもりだ', 'しないつもり', 'するつもりはない']],
  [taberu, c('plain', 'hou', true), ['たべないほうがいい', 'たべないほうがいい']],
  [furu, c('plain', 'densou', true), ['ふらないそうだ']],
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
  [furu, c('teageru', 'pres')],          // needs a volitional verb
  [furu, c('tearu', 'pres')],            // transitive only
  [kakuT, c('tearu', 'pres', true)],     // no negative
  [kakuT, c('sonkei', 'pres')],          // keigo is polite only
  [kaeruI, c('kenjou', 'pres', false, true)], // お〜する needs a transitive verb
  [konde, c('teiru', 'pres')],           // already 〜でいる
  [kuruI, c('tekuru', 'pres')],
  [aru, c('plain', 'keiken')],
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
