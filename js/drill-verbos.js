// Verb page configuration for js/app.js (see the contract at the top of app.js).
(function () {
  'use strict';
  const C = window.Conj;
  const GROUP_NAME = { '1': 'Grupo 1 · godan', '2': 'Grupo 2 · ichidan', '3': 'Grupo 3 · irregular' };
  const TYPE_NAME = { tr: 'transitivo', intr: 'intransitivo' };
  // 〜ている endings, so progressive examples (住んでいます) are recognised and rewritten.
  const IRU = ['いませんでした', 'いました', 'いません', 'います', 'いなかった', 'いない', 'いた', 'いる'];

  window.DRILL = {
    engine: C,
    items: window.VERBS,
    allows: C.verbAllows,
    store: 'conj:',
    noun: 'verbos',
    classKey: 'g',
    classes: GROUP_NAME,
    classLegend: 'Grupos de verbos',
    metaLabel: 'Grupo y tipo',
    meta: (v) => [GROUP_NAME[v.g], TYPE_NAME[v.t]].filter(Boolean).join(' · '),
    voiceGroups: [[undefined, 'Voz / base'], ['te', 'Auxiliares con て'], ['aux', 'Otras construcciones'], ['keigo', 'Keigo']],
    inflGroups: [[undefined, 'Forma'], ['expr', 'Expresiones']],
    // Ids a browser had before `seen` was recorded; anything newer starts enabled.
    firstRelease: {
      voices: ['plain', 'pot', 'pas', 'cau', 'cp', 'tai'],
      infls: ['pres', 'past', 'te', 'ba', 'tara', 'tari', 'vol', 'imp', 'nagara', 'sou'],
    },
    extraForms: (v) => C.conjugate(v, { voice: 'plain', infl: 'te', neg: false, pol: false }).answers
      .flatMap((t) => IRU.flatMap((i) => [{ k: t.k + i, r: t.r + i }])),
    examples: window.EXAMPLES_ES,
    emptyHint: 'p. ej. 可能 no tiene 意向 ni 命令',
  };
})();
