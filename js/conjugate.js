// Conjugation engine. Pure functions, no DOM: loaded by the page as a classic
// script (window.Conj) and by tests/test_conjugate.js through require().
//
// A "word" is {k, r, cls}: the same form in kanji and in kana, plus its class
// (godan | ichidan | suru | kuru | adj). Every rule only touches the end of the
// word, so it is applied to both spellings at once; 来る is the one verb whose
// kanji and kana stems differ (来(こ)ない / 来(き)ます), handled by `kuru()`.
(function (root) {
  'use strict';

  // Godan final kana → [a, i, e, o] row.
  const ROW = {
    'う': ['わ', 'い', 'え', 'お'], 'く': ['か', 'き', 'け', 'こ'], 'ぐ': ['が', 'ぎ', 'げ', 'ご'],
    'す': ['さ', 'し', 'せ', 'そ'], 'つ': ['た', 'ち', 'て', 'と'], 'ぬ': ['な', 'に', 'ね', 'の'],
    'ぶ': ['ば', 'び', 'べ', 'ぼ'], 'む': ['ま', 'み', 'め', 'も'], 'る': ['ら', 'り', 'れ', 'ろ'],
  };
  const A = 0, I = 1, E = 2, O = 3;
  const TE = { 'う': 'って', 'つ': 'って', 'る': 'って', 'く': 'いて', 'ぐ': 'いで', 'す': 'して', 'ぬ': 'んで', 'ぶ': 'んで', 'む': 'んで' };

  // Honorific godan verbs: masu-stem and imperative in い (いらっしゃいます, ください).
  const HONORIFIC = ['いらっしゃる', 'おっしゃる', 'くださる', 'なさる', 'ござる'];
  // Verbs drilled in their plain voice only: the derived voices are either
  // non-existent (ある) or not something an N3 learner would produce.
  const PLAIN_ONLY = ['ある', 'くれる', 'もっている', ...HONORIFIC];

  const last = (s) => s.slice(-1);

  // Replace the last `drop` characters of both spellings with `add`.
  function tail(w, drop, add, cls) {
    return { k: w.k.slice(0, w.k.length - drop) + add, r: w.r.slice(0, w.r.length - drop) + add, cls: cls || w.cls };
  }

  // 来る: `kana` is the replacement for the final くる, e.g. 'こさせる'. The kanji
  // spelling keeps 来 and takes the rest of the ending (来させる).
  function kuru(w, kana, cls) {
    const pre = (s) => s.slice(0, s.length - 2);
    const k = w.k.endsWith('来る') ? pre(w.k) + '来' + kana.slice(1) : pre(w.k) + kana;
    return { k, r: pre(w.r) + kana, cls: cls || w.cls };
  }

  function classify(v) {
    if (v.g === '3') return v.r.endsWith('くる') ? 'kuru' : 'suru';
    return v.g === '2' ? 'ichidan' : 'godan';
  }

  const isHonorific = (w) => HONORIFIC.includes(w.r);
  const isIku = (w) => w.r === 'いく' || /[行]く$/.test(w.k) || w.r.endsWith('ていく') || w.r.endsWith('にいく');
  const isAru = (w) => w.r === 'ある';

  // --- stems -----------------------------------------------------------------

  function godanRow(w, col, add, cls) {
    return tail(w, 1, ROW[last(w.r)][col] + add, cls);
  }

  function stemI(w) { // 連用形: the masu-stem
    switch (w.cls) {
      case 'ichidan': return tail(w, 1, '');
      case 'suru': return tail(w, 2, 'し');
      case 'kuru': return kuru(w, 'き');
      default: return isHonorific(w) ? tail(w, 1, 'い') : godanRow(w, I, '');
    }
  }

  function naiForm(w) { // plain negative, which then inflects like an i-adjective
    switch (w.cls) {
      case 'ichidan': return tail(w, 1, 'ない', 'adj');
      case 'suru': return tail(w, 2, 'しない', 'adj');
      case 'kuru': return kuru(w, 'こない', 'adj');
      default: return isAru(w) ? tail(w, 2, 'ない', 'adj') : godanRow(w, A, 'ない', 'adj');
    }
  }

  function teForm(w) {
    switch (w.cls) {
      case 'ichidan': return tail(w, 1, 'て');
      case 'suru': return tail(w, 2, 'して');
      case 'kuru': return kuru(w, 'きて');
      default: return tail(w, 1, isIku(w) ? 'って' : TE[last(w.r)]);
    }
  }

  function taForm(w) {
    const te = teForm(w);
    const swap = (s) => s.slice(0, -1) + (last(s) === 'で' ? 'だ' : 'た');
    return { k: swap(te.k), r: swap(te.r), cls: w.cls };
  }

  function baForm(w) {
    switch (w.cls) {
      case 'ichidan': return tail(w, 1, 'れば');
      case 'suru': return tail(w, 2, 'すれば');
      case 'kuru': return kuru(w, 'くれば');
      default: return godanRow(w, E, 'ば');
    }
  }

  function volForm(w) {
    switch (w.cls) {
      case 'ichidan': return tail(w, 1, 'よう');
      case 'suru': return tail(w, 2, 'しよう');
      case 'kuru': return kuru(w, 'こよう');
      default: return godanRow(w, O, 'う');
    }
  }

  function impForms(w) {
    switch (w.cls) {
      case 'ichidan': return w.r === 'くれる' ? [tail(w, 1, '')] : [tail(w, 1, 'ろ'), tail(w, 1, 'よ')];
      case 'suru': return [tail(w, 2, 'しろ'), tail(w, 2, 'せよ')];
      case 'kuru': return [kuru(w, 'こい')];
      default: return [isHonorific(w) ? tail(w, 1, 'い') : godanRow(w, E, '')];
    }
  }

  // --- voices (each returns a list: canonical form first, then accepted variants)

  const VOICE_FN = {
    plain: (w) => [w],
    pot: (w) => {
      switch (w.cls) {
        case 'ichidan': return [tail(w, 1, 'られる')];
        case 'suru': return [tail(w, 2, 'できる', 'ichidan')];
        case 'kuru': return [kuru(w, 'こられる', 'ichidan')];
        default: return [godanRow(w, E, 'る', 'ichidan')];
      }
    },
    pas: (w) => {
      switch (w.cls) {
        case 'ichidan': return [tail(w, 1, 'られる')];
        case 'suru': return [tail(w, 2, 'される', 'ichidan')];
        case 'kuru': return [kuru(w, 'こられる', 'ichidan')];
        default: return [godanRow(w, A, 'れる', 'ichidan')];
      }
    },
    cau: (w) => {
      switch (w.cls) {
        case 'ichidan': return [tail(w, 1, 'させる')];
        case 'suru': return [tail(w, 2, 'させる', 'ichidan')];
        case 'kuru': return [kuru(w, 'こさせる', 'ichidan')];
        default: return [godanRow(w, A, 'せる', 'ichidan')];
      }
    },
    cp: (w) => {
      switch (w.cls) {
        case 'ichidan': return [tail(w, 1, 'させられる')];
        case 'suru': return [tail(w, 2, 'させられる', 'ichidan')];
        case 'kuru': return [kuru(w, 'こさせられる', 'ichidan')];
        default: {
          // Godan verbs take the contracted される, except す-verbs (話させられる).
          const long = godanRow(w, A, 'せられる', 'ichidan');
          return last(w.r) === 'す' ? [long] : [godanRow(w, A, 'される', 'ichidan'), long];
        }
      }
    },
    tai: (w) => {
      const s = stemI(w);
      return [{ k: s.k + 'たい', r: s.r + 'たい', cls: 'adj' }];
    },
  };

  // --- final inflection --------------------------------------------------------

  const add = (w, s) => ({ k: w.k + s, r: w.r + s, cls: w.cls });

  // i-adjective (the たい form, and the ない form of every verb).
  function adjInflect(w, infl, neg, polite) {
    const b = tail(w, 1, '');
    const out = (plain, politeAlt) => {
      if (!polite) return [plain];
      const forms = [add(plain, 'です')];
      if (politeAlt) forms.push(add(b, politeAlt));
      return forms;
    };
    if (!neg) {
      switch (infl) {
        case 'pres': return out(w);
        case 'past': return out(add(b, 'かった'));
        case 'te': return [add(b, 'くて')];
        case 'ba': return [add(b, 'ければ')];
        case 'tara': return [add(b, 'かったら')];
        case 'tari': return [add(b, 'かったり')];
      }
    } else {
      switch (infl) {
        case 'pres': return out(add(b, 'くない'), 'くありません');
        case 'past': return out(add(b, 'くなかった'), 'くありませんでした');
        case 'te': return [add(b, 'くなくて')];
        case 'ba': return [add(b, 'くなければ')];
        case 'tara': return [add(b, 'くなかったら')];
        case 'tari': return [add(b, 'くなかったり')];
      }
    }
    return [];
  }

  function verbInflect(w, infl, neg, polite) {
    if (w.cls === 'adj') return adjInflect(w, infl, neg, polite);
    const masu = (s) => [add(stemI(w), s)];
    if (neg) {
      const nai = naiForm(w);
      if (polite && infl === 'pres') return masu('ません');
      if (polite && infl === 'past') return masu('ませんでした');
      if (infl === 'te') return [add(tail(nai, 1, ''), 'いで'), add(tail(nai, 1, ''), 'くて')];
      if (infl === 'imp') return [add(w, 'な')];
      return adjInflect(nai, infl, false, false);
    }
    switch (infl) {
      case 'pres': return polite ? masu('ます') : [w];
      case 'past': return polite ? masu('ました') : [taForm(w)];
      case 'te': return [teForm(w)];
      case 'ba': return [baForm(w)];
      case 'tara': return [add(taForm(w), 'ら')];
      case 'tari': return [add(taForm(w), 'り')];
      case 'vol': return polite ? masu('ましょう') : [volForm(w)];
      case 'imp': return polite ? masu('なさい') : impForms(w);
      case 'nagara': return masu('ながら');
      case 'sou': return masu('そう');
    }
    return [];
  }

  // --- catalogue ---------------------------------------------------------------

  const VOICES = [
    { id: 'plain', jp: '基本', es: 'Base', gloss: '' },
    { id: 'pot', jp: '可能', es: 'Potencial', gloss: 'poder …' },
    { id: 'pas', jp: '受身', es: 'Pasiva', gloss: 'ser …-ado / sufrir que …' },
    { id: 'cau', jp: '使役', es: 'Causativa', gloss: 'hacer / dejar que …' },
    { id: 'cp', jp: '使役受身', es: 'Causativa-pasiva', gloss: 'ser obligado a …' },
    { id: 'tai', jp: 'たい', es: 'Deseo', gloss: 'querer …' },
  ];

  // neg / pol: whether the inflection has a negative / polite variant.
  // voices: which voices it combines with (omitted = all).
  const INFLS = [
    { id: 'pres', jp: '現在', es: 'Presente', neg: true, pol: true, gloss: '' },
    { id: 'past', jp: '過去', es: 'Pasado', neg: true, pol: true, gloss: '' },
    { id: 'te', jp: 'て形', es: 'Forma て', neg: true, gloss: 'y … / …ando' },
    { id: 'ba', jp: 'ば', es: 'Condicional ば', neg: true, gloss: 'si …' },
    { id: 'tara', jp: 'たら', es: 'Condicional たら', neg: true, gloss: 'si / cuando …' },
    { id: 'tari', jp: 'たり', es: 'Forma たり', neg: true, gloss: 'cosas como …' },
    { id: 'vol', jp: '意向', es: 'Volitiva', pol: true, gloss: 'vamos a … / voy a …', voices: ['plain', 'cau'] },
    { id: 'imp', jp: '命令', es: 'Imperativo', neg: true, pol: true, gloss: '¡…!', voices: ['plain', 'cau'] },
    { id: 'nagara', jp: 'ながら', es: 'Mientras', gloss: 'mientras …', voices: ['plain'] },
    { id: 'sou', jp: 'そう', es: 'Apariencia', gloss: 'parece que …', voices: ['plain', 'pot'] },
  ];
  const TAI_INFLS = ['pres', 'past', 'te', 'ba', 'tara', 'tari'];

  const voiceById = Object.fromEntries(VOICES.map((v) => [v.id, v]));
  const inflById = Object.fromEntries(INFLS.map((i) => [i.id, i]));

  // Is the combination {voice, infl, neg, pol} a real form worth asking?
  function comboValid(c) {
    const inf = inflById[c.infl];
    if (!inf || !voiceById[c.voice]) return false;
    if (c.neg && !inf.neg) return false;
    if (c.pol && !inf.pol) return false;
    if (inf.voices && !inf.voices.includes(c.voice)) return false;
    if (c.voice === 'tai' && !TAI_INFLS.includes(c.infl)) return false;
    if (c.infl === 'imp' && c.neg && c.pol) return false; // no polite negative imperative at N3
    // Plain affirmative present of the base verb is the prompt itself.
    if (c.voice === 'plain' && c.infl === 'pres' && !c.neg && !c.pol) return false;
    return true;
  }

  // Is the combination valid for this particular verb?
  function verbAllows(v, c) {
    if (c.voice !== 'plain' && PLAIN_ONLY.includes(v.r)) return false;
    if (isAru(v) && (c.infl === 'vol' || c.infl === 'imp')) return false;
    if (isHonorific(v) && c.infl === 'imp' && c.pol) return false;
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

  // Conjugate verb entry v ({k, r, g}) into combo c.
  // Returns {answers: [{k, r}], base: {k, r} | null}; answers[0] is canonical,
  // base is the intermediate voice form (受身形 etc.) for the explanation.
  function conjugate(v, c) {
    const w = { k: v.k, r: v.r, cls: classify(v) };
    const bases = VOICE_FN[c.voice](w);
    const answers = [];
    const seen = new Set();
    for (const b of bases) {
      for (const f of verbInflect(b, c.infl, c.neg, c.pol)) {
        const key = f.k + '|' + f.r;
        if (!seen.has(key)) { seen.add(key); answers.push({ k: f.k, r: f.r }); }
      }
    }
    const base = c.voice === 'plain' ? null : { k: bases[0].k, r: bases[0].r };
    return { answers, base };
  }

  const api = { VOICES, INFLS, voiceById, inflById, comboValid, verbAllows, allCombos, conjugate, classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Conj = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
