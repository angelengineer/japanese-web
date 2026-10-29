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
  // Verbs that are keigo already, so they take no further 尊敬/謙譲 form.
  const KEIGO_VERBS = ['いらっしゃる', 'おっしゃる', 'くださる', 'なさる', 'ござる', 'まいる', 'もうす', 'いたす',
    'いただく', 'おる', 'うかがう', 'めしあがる', 'ぞんじる', 'さしあげる', 'はいけんする', 'もうしあげる'];

  // Intransitive verbs with a volitional subject, keyed by kanji spelling (the
  // readings collide: 怒る/起こる). Constructions that need someone acting on
  // purpose (てみる, ておく, てあげる, keigo…) only take these and transitive verbs,
  // so the drill never asks for 降ってあげる.
  const VOL_INTR = new Set(`挨拶する 会う 遊びに行く 遊ぶ 集まる 謝る 歩く 息抜きする 行く 急ぐ 行って来る いる
    動く 遠慮する 起きる 踊る 泳ぐ 下りる 降りる 買い物する 帰る 隠れる 通う 頑張る 帰国する 着て行く 休憩する
    協力する 気をつける 来る 結婚する 欠席する 喧嘩する 下山する 声をかける 答える 参加する 賛成する 散歩する 喋る
    就職する 集中する 出席する 出張する 出発する 食事する 進学する 進む 住む 座る 生活する 相談する 卒業する 退院する
    退会する 立つ 勤める テレビに出る 出掛ける 出る 到着する 投票する 通る 登山する 飛び出す 泊まる 取りに帰る 泣く
    並ぶ 逃げる 入学する 寝る 残る 登る 乗り換える 乗る 入る 走る 働く 発表する 反対する 引っ越す 返信する 返事する
    曲がる 回る 向かう 戻る 休む 寄る 喜ぶ 来日する 離婚する 旅行する 留守にする 連絡する 別れる 渡る 笑う 怒る
    急行する 知り合う 口を利く アイロンを掛ける ジョギングする デートする`.split(/\s+/));
  const volitional = (v) => v.t === 'tr' || VOL_INTR.has(v.k);

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

  // endsWith, so that 〜てくださる and 勉強なさる also take the い stem.
  const isHonorific = (w) => HONORIFIC.some((h) => w.r.endsWith(h));
  const isIku = (w) => w.r === 'いく' || /[行]く$/.test(w.k) || w.r.endsWith('ていく') || w.r.endsWith('にいく');
  const isAru = (w) => w.r === 'ある' || /[てで]ある$/.test(w.r);
  // Verbs already in 〜ている / 〜でいる (持っている, 混んでいる) take no further voice.
  const plainOnly = (v) => PLAIN_ONLY.includes(v.r) || /[てで]いる$/.test(v.r);

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
      case 'ichidan': return (w.r === 'くれる' || /[てで]くれる$/.test(w.r)) ? [tail(w, 1, '')] : [tail(w, 1, 'ろ'), tail(w, 1, 'よ')];
      case 'suru': return [tail(w, 2, 'しろ'), tail(w, 2, 'せよ')];
      case 'kuru': return [kuru(w, 'こい')];
      default: return [isHonorific(w) ? tail(w, 1, 'い') : godanRow(w, E, '')];
    }
  }

  const add = (w, s, cls) => ({ k: w.k + s, r: w.r + s, cls: cls || w.cls });
  // Suffix written differently in kanji and kana (と思う / とおもう).
  const addKR = (w, k, r) => ({ k: w.k + k, r: w.r + r, cls: w.cls });

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

    // 〜て + auxiliary verb: the result conjugates as the auxiliary. Spoken
    // contractions (てる, ちゃう, とく) are accepted as variants.
    teiru: (w) => { const t = teForm(w); return [add(t, 'いる', 'ichidan'), add(t, 'る', 'ichidan')]; },
    teshimau: (w) => {
      const t = teForm(w);
      return [add(t, 'しまう', 'godan'), tail(t, 1, last(t.r) === 'で' ? 'じゃう' : 'ちゃう', 'godan')];
    },
    tearu: (w) => [add(teForm(w), 'ある', 'godan')],
    teoku: (w) => {
      const t = teForm(w);
      return [add(t, 'おく', 'godan'), tail(t, 1, last(t.r) === 'で' ? 'どく' : 'とく', 'godan')];
    },
    temiru: (w) => [add(teForm(w), 'みる', 'ichidan')],
    teiku: (w) => [add(teForm(w), 'いく', 'godan')],
    tekuru: (w) => [add(teForm(w), 'くる', 'kuru')],
    teageru: (w) => [add(teForm(w), 'あげる', 'ichidan')],
    tekureru: (w) => [add(teForm(w), 'くれる', 'ichidan')],
    temorau: (w) => [add(teForm(w), 'もらう', 'godan')],
    tesashiageru: (w) => [add(teForm(w), 'さしあげる', 'ichidan')],
    tekudasaru: (w) => [add(teForm(w), 'くださる', 'godan')],
    teitadaku: (w) => [add(teForm(w), 'いただく', 'godan')],

    sugiru: (w) => [add(stemI(w), 'すぎる', 'ichidan')],
    tagaru: (w) => [add(stemI(w), 'たがる', 'godan')],
    koto: (w) => [add(w, 'ことができる', 'ichidan')],
    youninaru: (w) => [add(w, 'ようになる', 'godan')],

    sonkei: (w, v) => keigo(w, v, true),
    kenjou: (w, v) => keigo(w, v, false),
  };

  // --- keigo -------------------------------------------------------------------

  const kw = (k, r, cls) => ({ k, r, cls: cls || 'godan' });
  // Suppletive forms, keyed by kanji spelling; canonical first, then accepted variants.
  const SONKEI = {
    '行く': [kw('いらっしゃる', 'いらっしゃる'), kw('おいでになる', 'おいでになる')],
    '来る': [kw('いらっしゃる', 'いらっしゃる'), kw('おいでになる', 'おいでになる'), kw('お見えになる', 'おみえになる'), kw('お越しになる', 'おこしになる')],
    'いる': [kw('いらっしゃる', 'いらっしゃる'), kw('おいでになる', 'おいでになる')],
    '言う': [kw('おっしゃる', 'おっしゃる')],
    '食べる': [kw('召し上がる', 'めしあがる')],
    '飲む': [kw('召し上がる', 'めしあがる')],
    '見る': [kw('ご覧になる', 'ごらんになる')],
    'する': [kw('なさる', 'なさる')],
    '寝る': [kw('お休みになる', 'おやすみになる')],
    '着る': [kw('お召しになる', 'おめしになる')],
  };
  const KENJOU = {
    '行く': [kw('参る', 'まいる'), kw('伺う', 'うかがう')],
    '来る': [kw('参る', 'まいる'), kw('伺う', 'うかがう')],
    'いる': [kw('おる', 'おる')],
    '言う': [kw('申す', 'もうす'), kw('申し上げる', 'もうしあげる', 'ichidan')],
    '食べる': [kw('いただく', 'いただく')],
    '飲む': [kw('いただく', 'いただく')],
    'もらう': [kw('いただく', 'いただく')],
    '見る': [kw('拝見する', 'はいけんする', 'suru')],
    'する': [kw('いたす', 'いたす')],
    '知る': [kw('存じる', 'ぞんじる', 'ichidan'), kw('存じ上げる', 'ぞんじあげる', 'ichidan')],
    '会う': [kw('お目にかかる', 'おめにかかる'), kw('お会いする', 'おあいする', 'suru')],
    'あげる': [kw('差し上げる', 'さしあげる', 'ichidan')],
    '聞く': [kw('伺う', 'うかがう'), kw('お聞きする', 'おききする', 'suru')],
    '訪ねる': [kw('伺う', 'うかがう'), kw('お訪ねする', 'おたずねする', 'suru')],
  };
  const NO_SONKEI = ['あげる', 'もらう'];
  // A particle inside the spelling marks a phrase (気をつける, テレビに出る): お〜
  // would land on the wrong word, so those only get keigo through する/来る/行く.
  const PHRASE = /[\u4e00-\u9fff々ァ-ヶー][をがにで]|[をがにで][\u4e00-\u9fff]/;

  function keigo(w, v, son) {
    const table = son ? SONKEI : KENJOU;
    if (table[v.k]) return table[v.k].map((x) => Object.assign({}, x));
    if (w.cls === 'kuru' || isIku(w)) { // 持って来る → 持っていらっしゃる / 持って参る
      const head = son ? kw('いらっしゃる', 'いらっしゃる') : kw('参る', 'まいる');
      return [{ k: w.k.slice(0, -2) + head.k, r: w.r.slice(0, -2) + head.r, cls: 'godan' }];
    }
    if (w.cls === 'suru') return [tail(w, 2, son ? 'なさる' : 'いたす', 'godan')];
    const s = stemI(w);
    return son ? [{ k: 'お' + s.k + 'になる', r: 'お' + s.r + 'になる', cls: 'godan' }]
      : [{ k: 'お' + s.k + 'する', r: 'お' + s.r + 'する', cls: 'suru' }];
  }

  function regularKeigo(v) {
    if (/[ァ-ヶ]/.test(v.k) || PHRASE.test(v.k)) return false;
    const w = { k: v.k, r: v.r, cls: classify(v) };
    return w.cls !== 'suru' && w.cls !== 'kuru' && !isIku(w) && stemI(w).r.length >= 2;
  }

  function keigoAllows(v, son) {
    if (KEIGO_VERBS.includes(v.r) || isAru(v) || plainOnly(v)) return false;
    if ((son ? SONKEI : KENJOU)[v.k]) return true;
    if (son && NO_SONKEI.includes(v.k)) return false;
    const w = { k: v.k, r: v.r, cls: classify(v) };
    if (w.cls === 'suru') return true;
    if (w.cls === 'kuru' || isIku(w)) return volitional(v);
    return regularKeigo(v) && (son ? volitional(v) : v.t === 'tr');
  }

  // お〜ください: suppletive where the verb has one, else お + masu-stem.
  const OKUDASAI = {
    '見る': [kw('ご覧ください', 'ごらんください')],
    '食べる': [kw('お召し上がりください', 'おめしあがりください'), kw('召し上がってください', 'めしあがってください')],
    '飲む': [kw('お召し上がりください', 'おめしあがりください'), kw('召し上がってください', 'めしあがってください')],
    '来る': [kw('おいでください', 'おいでください'), kw('お越しください', 'おこしください'), kw('いらしてください', 'いらしてください')],
    '言う': [kw('おっしゃってください', 'おっしゃってください')],
    'する': [kw('なさってください', 'なさってください')],
    '寝る': [kw('お休みください', 'おやすみください')],
  };
  const okudasaiAllows = (v) => !!OKUDASAI[v.k] ||
    (!KEIGO_VERBS.includes(v.r) && !NO_SONKEI.includes(v.k) && regularKeigo(v) && volitional(v));

  // --- final inflection --------------------------------------------------------


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

  // Set expressions (〜てもいい, 〜なければならない…): a fixed ending on a stem of w.
  // Same contract as verbInflect: canonical answer first, then accepted variants.
  function exprInflect(w, infl, neg, pol) {
    const te = teForm(w), ta = taForm(w), nai = naiForm(w), naiB = tail(nai, 1, '');
    const contracted = tail(te, 1, last(te.r) === 'で' ? 'じゃ' : 'ちゃ');
    const ends = (base, list) => list.map((e) => add(base, e));
    switch (infl) {
      case 'temo': return neg ? [add(naiB, 'くても')] : [add(te, 'も')];
      case 'temoii': {
        const base = neg ? add(naiB, 'くても') : add(te, 'も');
        return ends(base, pol ? ['いいです', 'かまいません'] : ['いい', 'かまわない']);
      }
      case 'tewa': {
        const e = pol ? 'いけません' : 'いけない';
        return [add(te, 'は' + e), add(contracted, e)];
      }
      case 'nakereba': return ends(naiB, pol
        ? ['ければなりません', 'ければいけません', 'くてはなりません', 'くてはいけません']
        : ['ければならない', 'ければいけない', 'くてはならない', 'くてはいけない', 'きゃいけない']);
      case 'kudasai': return neg ? [add(nai, 'でください'), addKR(nai, 'で下さい', 'でください')]
        : [add(te, 'ください'), addKR(te, '下さい', 'ください')];
      case 'itadake': return [add(te, 'いただけませんか'), addKR(te, '頂けませんか', 'いただけませんか')];
      case 'goran': return [add(te, 'ごらん'), addKR(te, 'ご覧', 'ごらん')];
      case 'keiken': return [add(ta, 'ことが' + (neg ? (pol ? 'ありません' : 'ない') : (pol ? 'あります' : 'ある')))];
      case 'youto': return pol ? [addKR(volForm(w), 'と思います', 'とおもいます'), addKR(volForm(w), 'と思っています', 'とおもっています')]
        : [addKR(volForm(w), 'と思う', 'とおもう'), addKR(volForm(w), 'と思っている', 'とおもっている')];
      case 'tsumori': {
        const out = [add(neg ? nai : w, pol ? 'つもりです' : 'つもりだ')];
        if (!pol) out.push(add(neg ? nai : w, 'つもり'));
        if (neg) out.push(add(w, pol ? 'つもりはありません' : 'つもりはない'));
        return out;
      }
      case 'hou': {
        const base = neg ? nai : ta, e = pol ? 'がいいです' : 'がいい';
        return [add(base, 'ほう' + e), addKR(base, '方' + e, 'ほう' + e)];
      }
      case 'bakari': return pol ? [add(ta, 'ばかりです')] : [add(ta, 'ばかりだ'), add(ta, 'ばかり')];
      case 'densou': return [add(neg ? nai : w, pol ? 'そうです' : 'そうだ')];
      case 'furi': return [add(neg ? nai : w, pol ? 'ふりをします' : 'ふりをする')];
      case 'ppanashi': return [add(stemI(w), 'っぱなし'), addKR(stemI(w), 'っ放し', 'っぱなし')];
      case 'okudasai': return null; // needs the dictionary entry, see conjugate()
    }
    return [];
  }

  // --- catalogue ---------------------------------------------------------------

  // cat: settings group. The voices below the first group also restrict:
  //   infls     the inflections they combine with (instead of INFLS[].voices)
  //   neg:false no negative · pol:'only' polite only (where the form has a register)
  //   tr        transitive verbs only · vol: transitive or volitional intransitive
  //   allow(v)  any further per-verb rule
  const TE_INFLS = ['pres', 'past', 'te'];
  const noGoCome = (v) => !/(くる|いく)$/.test(v.r); // 行っていく, 来てくる
  const VOICES = [
    { id: 'plain', jp: '基本', es: 'Base', gloss: '' },
    { id: 'pot', jp: '可能', es: 'Potencial', gloss: 'poder …' },
    { id: 'pas', jp: '受身', es: 'Pasiva', gloss: 'ser …-ado / sufrir que …' },
    { id: 'cau', jp: '使役', es: 'Causativa', gloss: 'hacer / dejar que …' },
    { id: 'cp', jp: '使役受身', es: 'Causativa-pasiva', gloss: 'ser obligado a …' },
    { id: 'tai', jp: 'たい', es: 'Deseo', gloss: 'querer …' },

    { id: 'teiru', cat: 'te', jp: '〜ている', es: 'Progresivo / estado', gloss: 'estar …-ando', infls: [...TE_INFLS, 'ba', 'tara'] },
    { id: 'teshimau', cat: 'te', jp: '〜てしまう', es: 'Acabar / sin querer', gloss: 'terminar de … / … sin querer', infls: [...TE_INFLS, 'tara'] },
    { id: 'tearu', cat: 'te', jp: '〜てある', es: 'Resultado', gloss: 'estar …-ado (por alguien)', infls: ['pres', 'past'], neg: false, tr: true },
    { id: 'teoku', cat: 'te', jp: '〜ておく', es: 'Preparación', gloss: '… de antemano', infls: [...TE_INFLS, 'vol'], vol: true },
    { id: 'temiru', cat: 'te', jp: '〜てみる', es: 'Intento', gloss: 'probar a …', infls: [...TE_INFLS, 'vol', 'tara'], vol: true },
    { id: 'teiku', cat: 'te', jp: '〜ていく', es: 'Hacia allá / en adelante', gloss: 'ir …-ando', infls: TE_INFLS, allow: noGoCome },
    { id: 'tekuru', cat: 'te', jp: '〜てくる', es: 'Hacia aquí / hasta ahora', gloss: 'venir …-ando / ir a … y volver', infls: TE_INFLS, allow: noGoCome },
    { id: 'teageru', cat: 'te', jp: '〜てあげる', es: 'Hacer por otro', gloss: '… por alguien', infls: [...TE_INFLS, 'vol'], vol: true },
    { id: 'tekureru', cat: 'te', jp: '〜てくれる', es: 'Otro hace por mí', gloss: '(alguien) … por mí', infls: [...TE_INFLS, 'ba', 'tara'], vol: true },
    { id: 'temorau', cat: 'te', jp: '〜てもらう', es: 'Conseguir que otro haga', gloss: 'que alguien … por mí', infls: [...TE_INFLS, 'tara'], vol: true },
    { id: 'tesashiageru', cat: 'te', jp: '〜てさしあげる', es: 'Hacer por un superior', gloss: '… por usted (humilde)', infls: ['pres', 'past'], vol: true, pol: 'only' },
    { id: 'tekudasaru', cat: 'te', jp: '〜てくださる', es: 'Un superior hace por mí', gloss: '(usted) … por mí', infls: ['pres', 'past'], vol: true },
    { id: 'teitadaku', cat: 'te', jp: '〜ていただく', es: 'Favor de un superior', gloss: 'que usted … por mí', infls: ['pres', 'past'], vol: true },

    { id: 'sugiru', cat: 'aux', jp: '〜すぎる', es: 'Exceso', gloss: '… demasiado', infls: TE_INFLS },
    { id: 'tagaru', cat: 'aux', jp: '〜たがる', es: 'Deseo de otro', gloss: '(él / ella) quiere …', infls: ['pres', 'past'], vol: true },
    { id: 'koto', cat: 'aux', jp: '〜ことができる', es: 'Capacidad', gloss: 'poder … (formal)', infls: ['pres', 'past'],
      allow: (v) => !['できる', 'わかる', 'みえる', 'きこえる', 'ある'].includes(v.r) },
    { id: 'youninaru', cat: 'aux', jp: '〜ようになる', es: 'Cambio', gloss: 'llegar a … / empezar a …', infls: ['pres', 'past'],
      allow: (v) => !['なる', 'ある'].includes(v.r) },

    { id: 'sonkei', cat: 'keigo', jp: 'お〜になる', es: 'Respeto (尊敬語)', gloss: 'usted / él …', infls: TE_INFLS, pol: 'only',
      allow: (v) => keigoAllows(v, true) },
    { id: 'kenjou', cat: 'keigo', jp: 'お〜する', es: 'Humildad (謙譲語)', gloss: 'yo … (humilde)', infls: [...TE_INFLS, 'vol'], pol: 'only',
      allow: (v) => keigoAllows(v, false) },
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

    // Set expressions (cat 'expr'): plain voice unless `voices` says otherwise.
    // vol: needs a volitional verb · any: also for ある and the plain-only verbs.
    { id: 'temo', cat: 'expr', jp: '〜ても', es: 'Aunque', neg: true, gloss: 'aunque …', any: true },
    { id: 'temoii', cat: 'expr', jp: '〜てもいい', es: 'Permiso', neg: true, pol: true, gloss: 'se puede … / no hace falta …' },
    { id: 'tewa', cat: 'expr', jp: '〜てはいけない', es: 'Prohibición', pol: true, gloss: 'no se puede …' },
    { id: 'nakereba', cat: 'expr', jp: '〜なければならない', es: 'Obligación', pol: true, gloss: 'tener que …' },
    { id: 'kudasai', cat: 'expr', jp: '〜てください', es: 'Petición', neg: true, gloss: 'por favor, …', voices: ['plain', 'cau'], vol: true },
    { id: 'itadake', cat: 'expr', jp: '〜ていただけませんか', es: 'Petición formal', gloss: '¿podría …?', voices: ['plain', 'cau'], vol: true },
    { id: 'okudasai', cat: 'expr', jp: 'お〜ください', es: 'Petición (尊敬語)', gloss: 'tenga la bondad de …' },
    { id: 'goran', cat: 'expr', jp: '〜てごらん', es: 'Invitación', gloss: 'prueba a …', vol: true },
    { id: 'keiken', cat: 'expr', jp: '〜たことがある', es: 'Experiencia', neg: true, pol: true, gloss: 'haber … alguna vez' },
    { id: 'youto', cat: 'expr', jp: '〜(よ)うと思う', es: 'Intención', pol: true, gloss: 'pienso …', vol: true },
    { id: 'tsumori', cat: 'expr', jp: '〜つもりだ', es: 'Plan', neg: true, pol: true, gloss: 'tener intención de …', vol: true },
    { id: 'hou', cat: 'expr', jp: '〜ほうがいい', es: 'Consejo', neg: true, pol: true, gloss: 'mejor (no) …', any: true },
    { id: 'bakari', cat: 'expr', jp: '〜たばかりだ', es: 'Acabar de', pol: true, gloss: 'acabar de …' },
    { id: 'densou', cat: 'expr', jp: '〜そうだ (伝聞)', es: 'Rumor', neg: true, pol: true, gloss: 'dicen que …', any: true },
    { id: 'furi', cat: 'expr', jp: '〜ふりをする', es: 'Fingir', neg: true, pol: true, gloss: 'hacer como que …' },
    { id: 'ppanashi', cat: 'expr', jp: '〜っぱなし', es: 'Dejar tal cual', gloss: 'dejar … (sin parar / sin recoger)', vol: true },
  ];
  const TAI_INFLS = ['pres', 'past', 'te', 'ba', 'tara', 'tari'];

  const voiceById = Object.fromEntries(VOICES.map((v) => [v.id, v]));
  const inflById = Object.fromEntries(INFLS.map((i) => [i.id, i]));

  // Is the combination {voice, infl, neg, pol} a real form worth asking?
  function comboValid(c) {
    const inf = inflById[c.infl];
    if (!inf || !voiceById[c.voice]) return false;
    const vo = voiceById[c.voice];
    if (c.neg && !inf.neg) return false;
    if (c.pol && !inf.pol) return false;
    if (vo.infls) {
      if (!vo.infls.includes(c.infl)) return false;
      if (c.neg && vo.neg === false) return false;
      if (vo.pol === 'only' && inf.pol && !c.pol) return false;
    } else if (inf.cat === 'expr' ? !(inf.voices || ['plain']).includes(c.voice)
      : inf.voices && !inf.voices.includes(c.voice)) return false;
    if (c.voice === 'tai' && !TAI_INFLS.includes(c.infl)) return false;
    if (c.infl === 'imp' && c.neg && c.pol) return false; // no polite negative imperative at N3
    // Plain affirmative present of the base verb is the prompt itself.
    if (c.voice === 'plain' && c.infl === 'pres' && !c.neg && !c.pol) return false;
    return true;
  }

  // Is the combination valid for this particular verb?
  function verbAllows(v, c) {
    const vo = voiceById[c.voice], inf = inflById[c.infl];
    if (c.voice !== 'plain' && plainOnly(v)) return false;
    if (isAru(v) && (c.infl === 'vol' || c.infl === 'imp')) return false;
    if (isHonorific(v) && c.infl === 'imp' && c.pol) return false;
    if (vo.infls && isAru(v)) return false;
    if (vo.tr && v.t !== 'tr') return false;
    if ((vo.vol || inf.vol) && !volitional(v)) return false;
    if (vo.allow && !vo.allow(v)) return false;
    if (inf.cat === 'expr') {
      if (!inf.any && (plainOnly(v) || isAru(v))) return false;
      if (c.infl === 'okudasai') return okudasaiAllows(v);
    }
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
    const bases = VOICE_FN[c.voice](w, v);
    const answers = [];
    const seen = new Set();
    for (const b of bases) {
      const forms = c.infl === 'okudasai'
        ? (OKUDASAI[v.k] || [{ k: 'お' + stemI(b).k + 'ください', r: 'お' + stemI(b).r + 'ください' }])
        : inflById[c.infl].cat === 'expr' ? exprInflect(b, c.infl, c.neg, c.pol)
          : verbInflect(b, c.infl, c.neg, c.pol);
      for (const f of forms) {
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
