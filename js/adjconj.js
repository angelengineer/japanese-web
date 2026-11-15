// Adjective conjugation engine. Pure functions, no DOM: loaded by the page as a
// classic script (window.AdjConj, after js/conjugate.js) and by
// tests/test_adjconj.js through require().
//
// An adjective entry is {k, r, t}: kanji spelling, reading and type ('i' | 'na'),
// as in data/adjectives.js. な-adjectives keep their な (静かな / しずかな), like
// the Notion list. Every form is built on the stem — the word without its final
// い / な — applied to both spellings at once, the same way js/conjugate.js does.
// 〜すぎる and 〜くなる turn the adjective into a verb, which is then inflected by
// the verb engine (Conj.inflect).
(function (root) {
  'use strict';

  const Conj = root.Conj || (typeof require === 'function' ? require('./conjugate.js') : null);

  // --- per-word exceptions (kanji spelling as in Notion) --------------------------

  // Already negative in meaning: a negative form would mean the opposite word.
  const NO_NEG = new Set(['あり得ない', '元気がない']);
  // No adverbial 〜く / 〜に in normal use (好きに, 大丈夫に…).
  const NO_ADV = new Set(['好きな', '嫌いな', '大好きな', '大丈夫な', '苦手な', '得意な', '心配な', '残念な',
    '欲しい', 'だめな', 'そっくりな', 'かわいそうな', '天気がいい', '景色がいい', '都合がいい', '仲がいい',
    '背が高い', '具合が悪い', '元気がない', 'あり得ない', '朝早い', '眠い', '痒い', 'かゆい', '羨ましい']);
  // No 〜そう of appearance: the quality is seen directly (綺麗そう ✕, 赤そう ✕),
  // or 〜そう means something else (可愛い → かわいそう «pobrecito»).
  const NO_SOU = new Set(['可愛い', '綺麗な', '赤い', '青い', '白い', '黒い', '黄色い', 'かわいそうな', 'そっくりな',
    'あり得ない']);
  // No 〜すぎる / 〜くなる (なりすぎる of 大丈夫, 元気がなくなる of 元気がない…).
  const NO_VERB = new Set(['大丈夫な', 'あり得ない', 'かわいそうな', 'そっくりな']);

  // いい and its compounds (かっこいい, 頭がいい…) conjugate on よ: よくない, よかった.
  const isIi = (a) => a.t === 'i' && (a.r === 'いい' || /がいい$/.test(a.r) || ['かっこいい', 'ちょうどいい'].includes(a.r));
  // Final adjective ない (元気がない, but not つまらない): さ before そう / すぎる.
  const isNai = (a) => a.t === 'i' && (a.r === 'ない' || /がない$/.test(a.r));

  // --- stems and building blocks -------------------------------------------------

  const w = (k, r) => ({ k, r });
  const add = (x, s) => w(x.k + s, x.r + s);

  function stem(a) {
    if (a.t === 'na') return w(a.k.replace(/な$/, ''), a.r.replace(/な$/, ''));
    if (isIi(a)) return w(a.k.endsWith('いい') ? a.k.slice(0, -2) + 'よ' : a.k.slice(0, -1), a.r.slice(0, -2) + 'よ');
    return w(a.k.slice(0, -1), a.r.slice(0, -1));
  }
  // Dictionary form used before a noun or a sentence ending (いい, not よい).
  const dict = (a) => (a.t === 'na' ? stem(a) : w(a.k, a.r));

  // Plain present, affirmative or negative; canonical first.
  function plainPres(a, neg) {
    const s = stem(a);
    if (a.t === 'i') return [neg ? add(s, 'くない') : dict(a)];
    return neg ? [add(s, 'じゃない'), add(s, 'ではない')] : [add(s, 'だ')];
  }

  // 〜そう / 〜すぎる stem: よさ (いい), なさ (元気がない); other ない-adjectives
  // accept both (つまらなそう / つまらなさそう).
  function souStems(a) {
    const s = stem(a);
    if (isIi(a) || isNai(a)) return [add(s, 'さ')];
    if (a.t === 'i' && a.r.endsWith('ない')) return [s, add(s, 'さ')];
    return [s];
  }

  // --- the adjective's own inflections ------------------------------------------

  function adjInflect(a, infl, neg, pol) {
    const s = stem(a);
    const out = (...xs) => xs;
    if (a.t === 'i') {
      // The ending after the stem; いい also takes よい in the polite present.
      if (!neg) {
        switch (infl) {
          case 'pres': return isIi(a) ? out(add(dict(a), 'です'), add(s, 'いです')) : out(add(dict(a), 'です'));
          case 'past': return out(add(s, pol ? 'かったです' : 'かった'));
          case 'te': return out(add(s, 'くて'));
          case 'ba': return out(add(s, 'ければ'));
          case 'tara': return out(add(s, 'かったら'));
          case 'tari': return out(add(s, 'かったり'));
          case 'adv': return out(add(s, 'く'));
          case 'sou': return souStems(a).map((x) => add(x, 'そう'));
        }
      } else {
        switch (infl) {
          case 'pres': return pol ? out(add(s, 'くないです'), add(s, 'くありません')) : out(add(s, 'くない'));
          case 'past': return pol ? out(add(s, 'くなかったです'), add(s, 'くありませんでした')) : out(add(s, 'くなかった'));
          case 'te': return out(add(s, 'くなくて'));
          case 'ba': return out(add(s, 'くなければ'));
          case 'tara': return out(add(s, 'くなかったら'));
          case 'tari': return out(add(s, 'くなかったり'));
          case 'sou': return out(add(s, 'くなさそう'), ...souStems(a).map((x) => add(x, 'そうじゃない')));
        }
      }
      return [];
    }
    // な-adjective: copula だ after the stem. じゃ is the spoken では; both count.
    if (!neg) {
      switch (infl) {
        case 'pres': return pol ? out(add(s, 'です')) : out(add(s, 'だ'), s);
        case 'past': return out(add(s, pol ? 'でした' : 'だった'));
        case 'te': return out(add(s, 'で'));
        case 'ba': return out(add(s, 'なら'), add(s, 'ならば'), add(s, 'であれば'));
        case 'tara': return out(add(s, 'だったら'));
        case 'tari': return out(add(s, 'だったり'));
        case 'adv': return out(add(s, 'に'));
        case 'sou': return out(add(s, 'そう'));
      }
    } else {
      switch (infl) {
        case 'pres': return pol
          ? out(add(s, 'じゃないです'), add(s, 'じゃありません'), add(s, 'ではありません'), add(s, 'ではないです'))
          : out(add(s, 'じゃない'), add(s, 'ではない'));
        case 'past': return pol
          ? out(add(s, 'じゃなかったです'), add(s, 'じゃありませんでした'), add(s, 'ではありませんでした'), add(s, 'ではなかったです'))
          : out(add(s, 'じゃなかった'), add(s, 'ではなかった'));
        case 'te': return out(add(s, 'じゃなくて'), add(s, 'ではなくて'), add(s, 'でなくて'));
        case 'ba': return out(add(s, 'じゃなければ'), add(s, 'でなければ'), add(s, 'ではなければ'));
        case 'tara': return out(add(s, 'じゃなかったら'), add(s, 'ではなかったら'), add(s, 'でなかったら'));
        case 'tari': return out(add(s, 'じゃなかったり'), add(s, 'ではなかったり'));
        case 'sou': return out(add(s, 'じゃなさそう'), add(s, 'ではなさそう'), add(s, 'そうじゃない'), add(s, 'そうではない'));
      }
    }
    return [];
  }

  // --- set expressions -----------------------------------------------------------

  // What a な-adjective takes before each ending in the affirmative: な (ので,
  // のに, ようだ), だ (から, そうだ «dicen») or nothing (らしい, かもしれない…).
  // い-adjectives always use the plain form as is. This is the point of the drill.
  const NA_LINK = { kara: 'だ', node: 'な', noni: 'な', densou: 'だ', you: 'な', mitai: '', rashii: '', kamo: '', deshou: '' };
  const ENDINGS = {
    kara: () => ['から'],
    node: () => ['ので'],
    noni: () => ['のに'],
    densou: (pol) => [pol ? 'そうです' : 'そうだ'],
    you: (pol) => [pol ? 'ようです' : 'ようだ'],
    mitai: (pol) => (pol ? ['みたいです'] : ['みたいだ', 'みたい']),
    rashii: (pol) => [pol ? 'らしいです' : 'らしい'],
    kamo: (pol) => (pol ? ['かもしれません'] : ['かもしれない', 'かも']),
    deshou: (pol) => [pol ? 'でしょう' : 'だろう'],
  };

  function exprInflect(a, infl, neg, pol) {
    const s = stem(a);
    if (infl === 'temo') {
      if (a.t === 'i') return [add(s, neg ? 'くなくても' : 'くても')];
      return neg ? [add(s, 'じゃなくても'), add(s, 'でなくても'), add(s, 'ではなくても')] : [add(s, 'でも')];
    }
    const bases = neg ? plainPres(a, true) : [a.t === 'na' ? add(s, NA_LINK[infl]) : dict(a)];
    const out = [];
    for (const b of bases) for (const e of ENDINGS[infl](pol)) out.push(add(b, e));
    return out;
  }

  // --- catalogue -----------------------------------------------------------------

  // Bases (the "voices" of the verb drill). sugiru / naru make a verb, which takes
  // the inflections in `infls` through the verb engine.
  const VERB_INFLS = ['pres', 'past', 'te', 'ba', 'tara'];
  const VOICES = [
    { id: 'plain', jp: '基本', es: 'Base', gloss: '' },
    { id: 'sugiru', jp: '〜すぎる', es: 'Exceso', gloss: 'demasiado …', infls: VERB_INFLS },
    { id: 'naru', jp: '〜くなる・〜になる', es: 'Cambio', gloss: 'volverse … / ponerse …', infls: VERB_INFLS },
  ];

  // neg / pol: whether the form has a negative / polite variant.
  const INFLS = [
    { id: 'pres', jp: '現在', es: 'Presente', neg: true, pol: true, gloss: '' },
    { id: 'past', jp: '過去', es: 'Pasado', neg: true, pol: true, gloss: '' },
    { id: 'te', jp: 'て形', es: 'Forma て', neg: true, gloss: 'y … / … y' },
    { id: 'ba', jp: 'ば・なら', es: 'Condicional', neg: true, gloss: 'si …' },
    { id: 'tara', jp: 'たら', es: 'Condicional たら', neg: true, gloss: 'si / cuando …' },
    { id: 'tari', jp: 'たり', es: 'Forma たり', neg: true, gloss: 'a veces … / cosas como …' },
    { id: 'adv', jp: '副詞形', es: 'Adverbio', gloss: '…mente (〜く / 〜に)' },
    { id: 'sou', jp: 'そう', es: 'Apariencia', neg: true, gloss: 'parece …' },

    { id: 'temo', cat: 'expr', jp: '〜ても・〜でも', es: 'Aunque', neg: true, gloss: 'aunque sea …' },
    { id: 'kara', cat: 'expr', jp: '〜から', es: 'Causa', neg: true, gloss: 'porque …' },
    { id: 'node', cat: 'expr', jp: '〜ので', es: 'Causa (objetiva)', neg: true, gloss: 'como … / ya que …' },
    { id: 'noni', cat: 'expr', jp: '〜のに', es: 'Contraste', neg: true, gloss: 'a pesar de que …' },
    { id: 'densou', cat: 'expr', jp: '〜そうだ (伝聞)', es: 'Rumor', neg: true, pol: true, gloss: 'dicen que …' },
    { id: 'you', cat: 'expr', jp: '〜ようだ', es: 'Apariencia (deducción)', neg: true, pol: true, gloss: 'parece que …' },
    { id: 'mitai', cat: 'expr', jp: '〜みたいだ', es: 'Apariencia (hablado)', neg: true, pol: true, gloss: 'parece que …' },
    { id: 'rashii', cat: 'expr', jp: '〜らしい', es: 'Por lo que se oye', neg: true, pol: true, gloss: 'según parece …' },
    { id: 'kamo', cat: 'expr', jp: '〜かもしれない', es: 'Posibilidad', neg: true, pol: true, gloss: 'puede que …' },
    { id: 'deshou', cat: 'expr', jp: '〜だろう・〜でしょう', es: 'Suposición', neg: true, pol: true, gloss: 'seguramente …' },
  ];

  const voiceById = Object.fromEntries(VOICES.map((v) => [v.id, v]));
  const inflById = Object.fromEntries(INFLS.map((i) => [i.id, i]));

  // Is {voice, infl, neg, pol} a real form? (Independent of the adjective.)
  function comboValid(c) {
    const vo = voiceById[c.voice], inf = inflById[c.infl];
    if (!vo || !inf) return false;
    if (c.neg && !inf.neg) return false;
    if (c.pol && !inf.pol) return false;
    if (vo.infls && !vo.infls.includes(c.infl)) return false;
    if (inf.cat === 'expr' && c.voice !== 'plain') return false;
    return true;
  }

  // Is the combination valid for this adjective?
  function adjAllows(a, c) {
    // Plain affirmative present of an い-adjective is the prompt itself; a な-adjective's is 〜だ.
    if (c.voice === 'plain' && c.infl === 'pres' && !c.neg && !c.pol && a.t === 'i') return false;
    if (c.neg && NO_NEG.has(a.k)) return false;
    if (c.infl === 'adv' && NO_ADV.has(a.k)) return false;
    if (c.infl === 'sou' && NO_SOU.has(a.k)) return false;
    if (c.voice !== 'plain' && NO_VERB.has(a.k)) return false;
    return true;
  }

  function allCombos() {
    const out = [];
    for (const v of VOICES) for (const i of INFLS) for (const neg of [false, true]) for (const pol of [false, true]) {
      const c = { voice: v.id, infl: i.id, neg, pol };
      if (comboValid(c)) out.push(c);
    }
    return out;
  }

  // The verb a base turns the adjective into, as a {k, r, cls} word for Conj.inflect.
  function verbBase(a, voice) {
    if (voice === 'sugiru') {
      // よすぎる (よさすぎる is also heard); otherwise the same stems as 〜そう.
      const stems = isIi(a) ? [stem(a), add(stem(a), 'さ')] : souStems(a);
      return stems.map((x) => Object.assign(add(x, 'すぎる'), { cls: 'ichidan' }));
    }
    const s = stem(a); // naru
    return [Object.assign(add(s, a.t === 'na' ? 'になる' : 'くなる'), { cls: 'godan' })];
  }

  // Conjugate adjective a into combo c: {answers: [{k, r}], base: {k, r} | null}.
  // answers[0] is canonical; base is the intermediate verb (高すぎる) if any.
  function conjugate(a, c) {
    let forms, base = null;
    if (c.voice === 'plain') {
      forms = inflById[c.infl].cat === 'expr' ? exprInflect(a, c.infl, c.neg, c.pol) : adjInflect(a, c.infl, c.neg, c.pol);
    } else {
      const bases = verbBase(a, c.voice);
      base = { k: bases[0].k, r: bases[0].r };
      forms = bases.flatMap((b) => Conj.inflect(b, c.infl, c.neg, c.pol));
      // After an adjective the negative て that links clauses is 〜なくて, not 〜ないで.
      if (c.infl === 'te' && c.neg) forms.sort((x, y) => y.r.endsWith('くて') - x.r.endsWith('くて'));
    }
    const answers = [], seen = new Set();
    for (const f of forms) {
      const key = f.k + '|' + f.r;
      if (!seen.has(key)) { seen.add(key); answers.push({ k: f.k, r: f.r }); }
    }
    return { answers, base };
  }

  const api = { VOICES, INFLS, voiceById, inflById, comboValid, adjAllows, allCombos, conjugate, stem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdjConj = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
