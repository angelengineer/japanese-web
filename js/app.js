// Quiz UI. Depends on window.wanakana, window.VERBS and window.Conj.
(function () {
  'use strict';

  const { VOICES, INFLS, voiceById, inflById, allCombos, verbAllows, conjugate } = window.Conj;
  const VERBS = window.VERBS;
  const $ = (id) => document.getElementById(id);

  // --- persistence (per-browser convenience only; everything works without it)

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('conj:' + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('conj:' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
  };

  const DEFAULTS = {
    voices: VOICES.map((v) => v.id),
    infls: INFLS.map((i) => i.id),
    aff: true, neg: true,
    plain: true, polite: true,
    groups: ['1', '2', '3'],
    showKanji: true, furigana: true, showEs: true, showGroup: true,
  };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  let formStats = store.get('stats', {});
  let best = store.get('best', 0);

  // --- text helpers ------------------------------------------------------------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KANJI = '\\u4e00-\\u9fff\\u3400-\\u4dbf々〆ヶ';
  const isKanjiRun = (s) => new RegExp('^[' + KANJI + ']+$').test(s);
  const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Align a kanji spelling with its reading and return <ruby> HTML, one ruby
  // per kanji run: 持って来る / もってくる → 持(も)って来(く)る.
  function ruby(k, r) {
    if (!new RegExp('[' + KANJI + ']').test(k)) return esc(k);
    const segs = k.match(new RegExp('[' + KANJI + ']+|[^' + KANJI + ']+', 'g'));
    const pattern = '^' + segs.map((s) => (isKanjiRun(s) ? '(.+?)' : '(' + reEsc(toHira(s)) + ')')).join('') + '$';
    const m = toHira(r).match(new RegExp(pattern));
    if (!m) return `<ruby>${esc(k)}<rt>${esc(r)}</rt></ruby>`;
    return segs.map((s, i) => (isKanjiRun(s) ? `<ruby>${esc(s)}<rt>${esc(m[i + 1])}</rt></ruby>` : esc(s))).join('');
  }

  // Notion example sentences: "電車(でんしゃ)の席(せき)が… — Quedó libre…",
  // parsed into segments {s, rt}; rt is the furigana of a kanji run.
  function parseJa(ja) {
    const segs = [];
    const re = new RegExp('([' + KANJI + ']+)[(（]([^)）]+)[)）]', 'g');
    let at = 0, m;
    while ((m = re.exec(ja))) {
      if (m.index > at) segs.push({ s: ja.slice(at, m.index) });
      segs.push({ s: m[1], rt: m[2] });
      at = re.lastIndex;
    }
    if (at < ja.length) segs.push({ s: ja.slice(at) });
    return segs;
  }
  const segHTML = (g) => (g.rt ? `<ruby>${esc(g.s)}<rt>${esc(g.rt)}</rt></ruby>` : esc(g.s));

  // Every spelling (kanji and kana) of every form of verb vi, longest first,
  // including 〜ている so progressive examples (住んでいます) are recognised.
  const IRU = ['いませんでした', 'いました', 'いません', 'います', 'いなかった', 'いない', 'いた', 'いる'];
  const formCache = new Map();
  function knownForms(vi) {
    if (formCache.has(vi)) return formCache.get(vi);
    const v = VERBS[vi];
    const set = new Set([v.k, v.r]);
    for (const c of COMBOS) {
      if (!verbAllows(v, c)) continue;
      for (const a of conjugate(v, c).answers) { set.add(a.k); set.add(a.r); }
    }
    for (const t of conjugate(v, { voice: 'plain', infl: 'te', neg: false, pol: false }).answers) {
      for (const i of IRU) { set.add(t.k + i); set.add(t.r + i); }
    }
    const list = [...set].sort((a, b) => b.length - a.length);
    formCache.set(vi, list);
    return list;
  }

  // Forms that cannot end a sentence get "…" instead of the original 。
  const OPEN_ENDED = ['te', 'ba', 'tara', 'tari', 'nagara'];

  // The example with its final verb swapped for `ans`, or null when the
  // sentence does not end in a recognisable form of the verb.
  function rewriteExample(vi, segs, ans, combo) {
    const surface = segs.map((g) => g.s).join('');
    const body = surface.replace(/[。．.！!？?」]+$/, '');
    const hit = knownForms(vi).find((f) => body.endsWith(f));
    if (!hit) return null;
    const cut = body.length - hit.length;
    let html = '', pos = 0;
    for (const g of segs) {
      if (pos >= cut) break;
      const end = pos + g.s.length;
      if (end <= cut) html += segHTML(g);
      else if (g.rt) return null; // the verb starts inside a kanji compound
      else html += esc(g.s.slice(0, cut - pos));
      pos = end;
    }
    const tailPunct = OPEN_ENDED.includes(combo.infl) ? '…' : surface.slice(body.length);
    return `${html}<mark>${ruby(ans.k, ans.r)}</mark>${esc(tailPunct)}`;
  }

  function exampleHTML(vi, ans, combo) {
    const ej = VERBS[vi].ej;
    if (!ej) return '';
    const [ja, es] = ej.split(/\s+[—–-]\s+/);
    const segs = parseJa(ja);
    const original = segs.map(segHTML).join('');
    const rewritten = rewriteExample(vi, segs, ans, combo);
    const esHTML = es ? `<div class="es">${esc(es)}</div>` : '';
    if (!rewritten) return `<div class="example"><div class="ja" lang="ja">${original}</div>${esHTML}</div>`;
    return `<div class="example">
        <div class="lbl">Ejemplo en esta forma</div>
        <div class="ja" lang="ja">${rewritten}</div>
        <div class="lbl">Frase original</div>
        <div class="ja orig" lang="ja">${original}</div>${esHTML}
      </div>`;
  }

  // Comparison key: NFKC, no spaces, katakana folded to hiragana (ー kept).
  const norm = (s) => toHira(s.normalize('NFKC').replace(/\s+/g, ''));

  // --- question pool -----------------------------------------------------------

  const COMBOS = allCombos();
  const comboKey = (c) => `${c.voice}|${c.infl}|${+c.neg}|${+c.pol}`;

  function comboEnabled(c) {
    return settings.voices.includes(c.voice) && settings.infls.includes(c.infl) &&
      (c.neg ? settings.neg : settings.aff) && (c.pol ? settings.polite : settings.plain);
  }

  let pool = []; // [{combo, verbs: [index]}]
  function rebuildPool() {
    const verbIdx = VERBS.map((v, i) => i).filter((i) => settings.groups.includes(VERBS[i].g));
    pool = COMBOS.filter(comboEnabled)
      .map((combo) => ({ combo, verbs: verbIdx.filter((i) => verbAllows(VERBS[i], combo)) }))
      .filter((p) => p.verbs.length);
    const n = pool.reduce((a, p) => a + p.verbs.length, 0);
    const el = $('pool-count');
    el.textContent = pool.length
      ? `${pool.length} formas × ${verbIdx.length} verbos → ${n.toLocaleString('es')} preguntas posibles`
      : 'Ninguna combinación posible: activa más opciones.';
    el.classList.toggle('warn', !pool.length);
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Missed questions come back a few turns later.
  let retry = [];
  let lastVerb = -1;

  function nextQuestion() {
    retry.forEach((r) => r.due--);
    const i = retry.findIndex((r) => r.due <= 0 && comboEnabled(r.combo));
    if (i >= 0) return retry.splice(i, 1)[0];
    if (!pool.length) return null;
    const p = pick(pool);
    let v = pick(p.verbs);
    if (v === lastVerb && p.verbs.length > 1) v = pick(p.verbs);
    return { verb: v, combo: p.combo };
  }

  // --- rendering ---------------------------------------------------------------

  let q = null;          // current question {verb, combo}
  let result = null;     // conjugate() output for q
  let answered = false;
  let streak = 0, ok = 0, total = 0;

  const GROUP_NAME = { '1': 'Grupo 1 · godan', '2': 'Grupo 2 · ichidan', '3': 'Grupo 3 · irregular' };
  const TYPE_NAME = { tr: 'transitivo', intr: 'intransitivo' };

  function chips(c) {
    const v = voiceById[c.voice], inf = inflById[c.infl];
    const out = [];
    if (c.voice !== 'plain') out.push(['voice', v.jp, v.es]);
    out.push(['infl', inf.jp, inf.es]);
    if (inf.neg) out.push(['neg', c.neg ? '否定' : '肯定', c.neg ? 'Negativo' : 'Afirmativo']);
    if (inf.pol) out.push(['pol', c.pol ? '丁寧' : '普通', c.pol ? 'Cortés' : 'Llano']);
    return out.map(([cls, ja, es]) => `<span class="chip ${cls}"><span class="ja">${ja}</span><span class="es">${es}</span></span>`).join('');
  }

  function glossText(c) {
    const parts = [voiceById[c.voice].gloss, inflById[c.infl].gloss].filter(Boolean);
    return parts.length ? parts.join(' · ') : '';
  }

  function renderQuestion() {
    const card = $('card');
    card.classList.toggle('no-furigana', !settings.furigana);
    if (!q) {
      $('verb').textContent = '—';
      $('meta').textContent = $('meaning').textContent = $('form').innerHTML = $('gloss').textContent = '';
      return;
    }
    const v = VERBS[q.verb];
    $('meta').textContent = settings.showGroup ? [GROUP_NAME[v.g], TYPE_NAME[v.t]].filter(Boolean).join(' · ') : '';
    $('verb').innerHTML = settings.showKanji ? ruby(v.k, v.r) : esc(v.r);
    $('meaning').textContent = settings.showEs ? v.es : '';
    $('form').innerHTML = chips(q.combo);
    $('gloss').textContent = glossText(q.combo);
    result = conjugate(v, q.combo);
  }

  function next() {
    q = nextQuestion();
    if (q) lastVerb = q.verb;
    answered = false;
    const input = $('answer');
    input.value = '';
    input.className = '';
    input.readOnly = false;
    $('submit').textContent = 'Comprobar';
    $('skip').hidden = false;
    $('feedback').hidden = true;
    renderQuestion();
    input.focus();
  }

  function record(correct) {
    total++;
    if (correct) { ok++; streak++; } else { streak = 0; }
    if (streak > best) { best = streak; store.set('best', best); }
    const key = comboKey(q.combo);
    const s = formStats[key] || [0, 0];
    formStats[key] = [s[0] + (correct ? 1 : 0), s[1] + 1];
    store.set('stats', formStats);
    if (!correct) retry.push({ verb: q.verb, combo: q.combo, due: 4 });
    $('streak').textContent = streak;
    $('best').textContent = best;
    $('score').textContent = `${ok}/${total}`;
    renderStats();
  }

  function check(skipped) {
    if (!q) return;
    const input = $('answer');
    let raw = input.value.trim();
    if (!skipped && !raw) return;
    if (/[a-z]/i.test(raw)) raw = wanakana.toKana(raw);  // trailing "n", unconverted romaji
    input.value = raw;
    const given = norm(raw);
    const correct = !skipped && result.answers.some((a) => norm(a.r) === given || norm(a.k) === given);
    record(correct);
    answered = true;
    input.readOnly = true;
    input.className = correct ? 'ok' : 'bad';
    $('submit').textContent = 'Siguiente';
    $('skip').hidden = true;
    renderFeedback(correct, skipped ? '' : raw);
    input.focus({ preventScroll: true });
  }

  function renderFeedback(correct, given) {
    const v = VERBS[q.verb];
    const [main, ...alts] = result.answers;
    const chain = [ruby(v.k, v.r)];
    if (result.base) chain.push(ruby(result.base.k, result.base.r));
    if (!result.base || result.base.k !== main.k) chain.push(ruby(main.k, main.r));
    const altText = alts.map((a) => (a.k !== a.r ? `${a.k}（${a.r}）` : a.r)).join('、 ');
    const fb = $('feedback');
    fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
    fb.innerHTML = `
      <h2>${correct ? '✓ Correcto' : given ? '✗ Incorrecto' : 'Respuesta'}</h2>
      ${given && !correct ? `<div class="row"><span>Tu respuesta</span><span class="ans wrong" lang="ja">${esc(given)}</span></div>` : ''}
      <div class="row"><span>Respuesta</span><span class="ans" lang="ja">${ruby(main.k, main.r)}</span></div>
      ${alts.length ? `<div class="row"><span>También vale</span><span class="alt" lang="ja">${esc(altText)}</span></div>` : ''}
      <div class="row"><span>Derivación</span><span class="chain" lang="ja">${chain.join('<span class="arrow">→</span>')}</span></div>
      <div class="row"><span>Significado</span><span>${esc(v.es)}</span></div>
      ${exampleHTML(q.verb, main, q.combo)}`;
    fb.hidden = false;
  }

  // --- settings panel ------------------------------------------------------------

  function optHTML(name, value, checked, ja, es) {
    return `<label class="opt"><input type="checkbox" data-set="${name}" value="${value}" ${checked ? 'checked' : ''}>` +
      `<span>${ja ? `<span class="ja">${ja}</span>` : ''}${es}</span></label>`;
  }

  function renderSettings() {
    const s = settings;
    $('settings').innerHTML = `
      <fieldset><legend>Voz / base</legend><div class="opts">
        ${VOICES.map((v) => optHTML('voices', v.id, s.voices.includes(v.id), v.jp, v.es)).join('')}
      </div></fieldset>
      <fieldset><legend>Forma</legend><div class="opts">
        ${INFLS.map((i) => optHTML('infls', i.id, s.infls.includes(i.id), i.jp, i.es)).join('')}
      </div></fieldset>
      <fieldset><legend>Polaridad y registro</legend><div class="opts">
        ${optHTML('aff', 1, s.aff, '肯定', 'Afirmativo')}${optHTML('neg', 1, s.neg, '否定', 'Negativo')}
        ${optHTML('plain', 1, s.plain, '普通', 'Llano')}${optHTML('polite', 1, s.polite, '丁寧', 'Cortés')}
      </div></fieldset>
      <fieldset><legend>Grupos de verbos</legend><div class="opts">
        ${['1', '2', '3'].map((g) => optHTML('groups', g, s.groups.includes(g), '', GROUP_NAME[g])).join('')}
      </div></fieldset>
      <fieldset><legend>Mostrar</legend><div class="opts">
        ${optHTML('showKanji', 1, s.showKanji, '漢字', 'Kanji')}${optHTML('furigana', 1, s.furigana, 'ふりがな', 'Furigana')}
        ${optHTML('showEs', 1, s.showEs, '', 'Traducción')}${optHTML('showGroup', 1, s.showGroup, '', 'Grupo y tipo')}
      </div></fieldset>`;
  }

  function onSettingChange(e) {
    const t = e.target;
    const name = t.dataset.set;
    if (!name) return;
    if (Array.isArray(settings[name])) {
      const set = new Set(settings[name]);
      t.checked ? set.add(t.value) : set.delete(t.value);
      settings[name] = [...set];
    } else {
      settings[name] = t.checked;
    }
    store.set('settings', settings);
    const displayOnly = ['showKanji', 'furigana', 'showEs', 'showGroup'].includes(name);
    if (displayOnly) { renderQuestion(); return; }
    rebuildPool();
    if (!q || !comboEnabled(q.combo) || !settings.groups.includes(VERBS[q.verb].g)) next();
  }

  // --- per-form stats ------------------------------------------------------------

  function renderStats() {
    const agg = {};
    for (const [key, [good, n]] of Object.entries(formStats)) {
      const [voice, infl] = key.split('|');
      if (!voiceById[voice] || !inflById[infl]) continue;
      const k = voice + '|' + infl;
      agg[k] = agg[k] || [0, 0];
      agg[k][0] += good; agg[k][1] += n;
    }
    const rows = Object.entries(agg).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]);
    if (!rows.length) { $('form-stats').innerHTML = '<p class="empty">Todavía no hay respuestas.</p>'; return; }
    $('form-stats').innerHTML = `<table class="stats-table"><thead><tr><th>Forma</th><th></th><th class="num">Aciertos</th></tr></thead><tbody>` +
      rows.map(([k, [good, n]]) => {
        const [voice, infl] = k.split('|');
        const pct = Math.round((100 * good) / n);
        const name = (voice === 'plain' ? '' : voiceById[voice].jp + '・') + inflById[infl].jp;
        const es = (voice === 'plain' ? '' : voiceById[voice].es + ' · ') + inflById[infl].es;
        return `<tr><td><span class="jp">${name}</span> <small>${es}</small></td>` +
          `<td><div class="bar ${pct < 70 ? 'low' : ''}"><i style="width:${pct}%"></i></div></td>` +
          `<td class="num">${good}/${n} (${pct}%)</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  // --- wiring ----------------------------------------------------------------------

  function init() {
    $('verb-count').textContent = VERBS.length;
    $('best').textContent = best;
    renderSettings();
    rebuildPool();
    renderStats();

    wanakana.bind($('answer'), { IMEMode: 'toHiragana' });

    $('answer-form').addEventListener('submit', (e) => {
      e.preventDefault();
      answered ? next() : check(false);
    });
    $('skip').addEventListener('click', () => { if (!answered) check(true); });
    $('settings').addEventListener('change', onSettingChange);
    $('reset-stats').addEventListener('click', () => {
      if (!confirm('¿Borrar todas las estadísticas guardadas?')) return;
      formStats = {}; best = 0;
      store.set('stats', formStats); store.set('best', 0);
      $('best').textContent = 0;
      renderStats();
    });

    next();
  }

  init();
})();
