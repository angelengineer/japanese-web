// Adjective page configuration for js/app.js (see the contract at the top of app.js).
(function () {
  'use strict';
  const A = window.AdjConj;
  const TYPE_NAME = { i: 'Adjetivo い', na: 'Adjetivo な' };

  window.DRILL = {
    engine: A,
    items: window.ADJECTIVES,
    allows: A.adjAllows,
    store: 'adj:',
    noun: 'adjetivos',
    classKey: 't',
    classes: TYPE_NAME,
    classLegend: 'Tipo de adjetivo',
    metaLabel: 'Tipo',
    meta: (a) => TYPE_NAME[a.t],
    voiceGroups: [[undefined, 'Base']],
    inflGroups: [[undefined, 'Forma'], ['expr', 'Expresiones (な・だ・∅)']],
    emptyHint: 'p. ej. 〜すぎる no tiene たり, そう ni adverbio',
  };
})();
