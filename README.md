# 活用 · Conjugación

Japanese verb-conjugation drill up to JLPT N3, with a Spanish interface and Spanish meanings.
Static site, no build step, deployable to GitHub Pages as is.

Each question takes a random verb and a random form:

| Dimension | Options |
|---|---|
| Voice / base | 基本 · 可能 · 受身 · 使役 · 使役受身 · たい |
| Inflection | 現在 · 過去 · て · ば · たら · たり · 意向 · 命令 · ながら · そう |
| Polarity / register | 肯定/否定 · 普通/丁寧 (where the form has them) |

Only real combinations are asked (108 forms; no potential volitional, no 〜たい imperative, …).
Type in romaji (converted live by WanaKana) or with a Japanese IME; kana and kanji
answers are both accepted. Missed questions come back four turns later.
Settings and per-form accuracy are kept in `localStorage`.

## Layout

```
index.html               page
js/conjugate.js          conjugation engine (pure, also require()-able from Node)
js/app.js                quiz UI
js/vendor/wanakana.*     romaji → kana IME (MIT)
data/verbs.js            GENERATED verb list — do not edit
scripts/build_verbs.py   builds data/verbs.js from the Notion snapshot
tests/test_conjugate.js  engine tests
```

## Updating the verb list

The verbs come from the Notion **Verbos** database via the snapshot kept by
`../anki/notion_sync.py` (sibling folder in the `Japanese` repo).

```bash
python3 ../anki/notion_sync.py pull      # refresh the Notion snapshot (needs NOTION_TOKEN)
python3 scripts/build_verbs.py           # -> data/verbs.js
node tests/test_conjugate.js             # every verb × every form must conjugate
```

`build_verbs.py` skips grammar auxiliaries (〜てある, てみる, てもらう…), merges
duplicate senses, and overrides three rows whose Notion `Grupo` is wrong
(閉じる, 持っている, 行って来る — see `GROUP_FIXES`).

## Run locally

Open `index.html` directly, or `python3 -m http.server` and visit http://localhost:8000.
