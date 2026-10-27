#!/usr/bin/env python3
"""Build gramatica/index.html and the navigation inside each grammar ficha.

    python3 scripts/build_gramatica.py          # rebuild index + ficha navigation
    python3 scripts/build_gramatica.py --list   # title and JLPT level of every ficha

The study order lives in gramatica/bloques.json: eleven blocks, each with its
fichas in the order they are meant to be studied. Every gramatica/NN-*.html must
appear there exactly once; the build fails otherwise.

The fichas are hand-written pages. Their shared look lives in css/tokens.css
(the site palette, light and dark) and css/ficha.css (layout and the common
components); a ficha's own <style> holds only its figure-specific rules. This
script maintains three generated regions in each ficha, delimited by HTML
comments so a rebuild replaces them in place: <!--gen-head--> (title, fonts and
the shared stylesheets, before the ficha's own <style> so that one wins),
<!--gen-top--> (back to the index) after <body>, and <!--gen-bottom-->
(previous / next ficha) before <footer>. Edit everything else by hand.
Stdlib only. Files are rewritten only when their content changes.
"""
import argparse
import hashlib
import html
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIR = ROOT / "gramatica"
BLOCKS = DIR / "bloques.json"
INDEX = DIR / "index.html"

FONTS = ("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700"
         "&family=Noto+Serif+JP:wght@500;700&display=swap")
CSS = ["tokens.css", "style.css", "ficha.css"]


def css_version():
    """Cache-busting stamp: GitHub Pages lets browsers keep CSS for 10 minutes."""
    h = hashlib.sha1()
    for name in CSS:
        h.update((ROOT / "css" / name).read_bytes())
    return h.hexdigest()[:10]


def log(msg):
    print(msg, file=sys.stderr)


def text(pattern, src, readings=False):
    """Plain text of the first match; furigana dropped unless `readings`."""
    m = re.search(pattern, src, re.S)
    if not m:
        return ""
    s = m.group(1) if readings else re.sub(r"<rt>.*?</rt>", "", m.group(1))
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def meta(path):
    src = path.read_text()
    return {
        "name": path.name,
        "title": text(r"<h1[^>]*>(.*?)</h1>", src),
        "title_rt": text(r"<h1[^>]*>(.*?)</h1>", src, readings=True),
        "sub": text(r'class="sub">(.*?)</div>', src),
        "rom": text(r'class="rom">(.*?)</div>', src),
        "cat": text(r'class="cat">(.*?)</span>', src),
        "level": text(r'class="tag">(.*?)</span>', src).replace("JLPT ", ""),
    }


def load():
    blocks = json.loads(BLOCKS.read_text())
    listed = [n for b in blocks for n in b["fichas"]]
    on_disk = {p.name for p in DIR.glob("[0-9][0-9]-*.html")}
    dupes = {n for n in listed if listed.count(n) > 1}
    missing = [n for n in listed if n not in on_disk]
    unlisted = sorted(on_disk - set(listed))
    if dupes or missing or unlisted:
        for n in sorted(dupes):
            log(f"listed twice in bloques.json: {n}")
        for n in missing:
            log(f"in bloques.json but no such file: {n}")
        for n in unlisted:
            log(f"not in any block of bloques.json: {n}")
        sys.exit(1)
    fichas = {n: meta(DIR / n) for n in listed}
    return blocks, fichas


def region(src, tag, content, anchor, before=True):
    """Replace <!--tag-->...<!--/tag--> or insert it next to `anchor`."""
    block = f"<!--{tag}-->{content}<!--/{tag}-->"
    pat = re.compile(rf"<!--{tag}-->.*?<!--/{tag}-->", re.S)
    if pat.search(src):
        return pat.sub(lambda _: block, src, count=1)
    m = re.search(anchor, src)
    if not m:
        sys.exit(f"anchor {anchor!r} not found while inserting {tag}")
    i = m.start() if before else m.end()
    sep = "\n"
    return src[:i] + (block + sep if before else sep + block) + src[i:]


def esc(s):
    # The fichas are pure ASCII outside Japanese text; keep it that way.
    return html.escape(s, quote=True).encode("ascii", "xmlcharrefreplace").decode()


def jp(s):
    return html.escape(s, quote=True)


def write(path, content):
    if path.exists() and path.read_text() == content:
        return False
    path.write_text(content)
    return True


def build_ficha(f, block, prev, nxt, v):
    path = DIR / f["name"]
    src = path.read_text()
    head = (f"\n<title>{jp(f['title'])} &middot; Gram&aacute;tica</title>\n"
            f'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            f'<link href="{FONTS}" rel="stylesheet">\n'
            f'<link rel="stylesheet" href="../css/tokens.css?v={v}">\n'
            f'<link rel="stylesheet" href="../css/ficha.css?v={v}">\n')
    top = (f'<nav class="gnav"><a href="./#{block["id"]}">&larr; Gram&aacute;tica</a>'
           f'<span>{block["id"]} &middot; {esc(block["title"])}</span></nav>')
    links = []
    if prev:
        links.append(f'<a class="prev" href="{prev["name"]}"><small>&larr; Anterior</small>'
                     f'<span class="jp">{jp(prev["title"])}</span></a>')
    if nxt:
        links.append(f'<a class="next" href="{nxt["name"]}"><small>Siguiente &rarr;</small>'
                     f'<span class="jp">{jp(nxt["title"])}</span></a>')
    bottom = f'<nav class="gpn">{"".join(links)}</nav>'
    src = region(src, "gen-head", head, r"<style>|</head>")
    src = region(src, "gen-top", top, r"<body[^>]*>", before=False)
    src = region(src, "gen-bottom", bottom, r"<footer>")
    return write(path, src)


def fold(s):
    """Lowercase without Latin accents, for the search box. Must match fold() in TEMPLATE.

    Only U+0300-036F is stripped: kana dakuten also decompose to combining
    marks under NFD, and dropping them would turn が into か.
    """
    s = unicodedata.normalize("NFD", s.lower())
    return unicodedata.normalize("NFC", re.sub("[\u0300-\u036f]", "", s))


def build_index(blocks, fichas, v):
    levels = sorted({lv for f in fichas.values() for lv in re.findall(r"N\d", f["level"])}, reverse=True)
    chips = "".join(f'<a href="#{b["id"]}">{b["emoji"]} {b["id"]}</a>' for b in blocks)
    sections = []
    for b in blocks:
        items = []
        for n in b["fichas"]:
            f = fichas[n]
            q = fold(" ".join([n, f["title"], f["title_rt"], f["sub"], f["rom"], f["cat"]]))
            items.append(
                f'<li data-q="{jp(q)}"><a href="{n}">'
                f'<span class="num">{n[:2]}</span>'
                f'<span class="body"><span class="t jp">{jp(f["title"])}</span>'
                f'<span class="s">{jp(f["sub"])}</span></span>'
                f'<span class="lv">{jp(f["level"])}</span></a></li>')
        warn = f'<p class="warn">⚠️ {b["warning"]}</p>' if b.get("warning") else ""
        sections.append(
            f'<section class="block" id="{b["id"]}">\n'
            f'<h2><span class="emo">{b["emoji"]}</span> {b["id"]} &middot; {jp(b["title"])}'
            f' <span class="desc">{jp(b["desc"])}</span></h2>\n'
            f'<p class="intro">{b["intro"]}</p>\n{warn}\n'
            f'<ol class="list">\n' + "\n".join(items) + "\n</ol>\n</section>")
    page = TEMPLATE.format(
        fonts=FONTS, v=v,
        count=len(fichas), nblocks=len(blocks), levels=" → ".join(levels),
        chips=chips, sections="\n\n".join(sections))
    return write(INDEX, page)


TEMPLATE = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>文法 · Gramática japonesa</title>
<meta name="description" content="Fichas de gramática japonesa en español, de N5 a N3, en orden de estudio.">
<!-- GENERATED by scripts/build_gramatica.py from bloques.json; do not edit. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{fonts}" rel="stylesheet">
<link rel="stylesheet" href="../css/tokens.css?v={v}">
<link rel="stylesheet" href="../css/style.css?v={v}">
<style>
.wrap{{max-width:680px;margin:0 auto;padding:0 16px;}}
.wrap>header{{padding:20px 0 14px;}}
h1{{font-size:1.15rem;font-weight:600;margin:0;}}
h1 .jp{{color:var(--accent);font-family:var(--jp-serif);margin-right:.25em;}}
.lede{{margin:6px 0 0;color:var(--muted);}}
.lede b{{color:var(--text);}}
.tools{{position:sticky;top:0;z-index:1;background:var(--bg);padding:8px 0 10px;}}
#q{{width:100%;font:inherit;font-size:16px;padding:10px 14px;border:2px solid var(--border);border-radius:12px;
background:var(--surface);color:var(--text);outline:none;}}
#q:focus{{border-color:var(--accent);}}
.chips{{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}}
.chips a{{font-size:.88rem;text-decoration:none;color:var(--muted);border:1px solid var(--border);
background:var(--surface);border-radius:999px;padding:4px 11px;}}
.chips a:hover{{border-color:var(--accent);color:var(--text);background:var(--accent-soft);}}
.block{{margin-top:16px;scroll-margin-top:120px;background:var(--surface);border:1px solid var(--border);
border-radius:14px;box-shadow:var(--shadow);padding:16px 20px 8px;}}
h2{{font-size:1.1rem;margin:0;}}
h2 .desc{{display:block;font-weight:400;font-size:.88rem;color:var(--muted);margin-top:2px;}}
.intro{{margin:10px 0 0;font-size:.95rem;line-height:1.6;}}
.intro b{{color:var(--accent);}}
.warn{{margin:10px 0 0;font-size:.92rem;line-height:1.6;background:var(--bad-soft);border-left:4px solid var(--bad);
border-radius:10px;padding:9px 12px;}}
.warn b{{color:var(--bad);}}
.list{{list-style:none;margin:8px 0 0;padding:0;}}
.list a{{display:flex;gap:12px;align-items:baseline;padding:11px 6px;border-top:1px solid var(--line);
text-decoration:none;color:inherit;border-radius:8px;}}
.list a:hover{{background:var(--accent-soft);}}
.num{{font-size:.78rem;color:var(--muted);flex:0 0 20px;font-variant-numeric:tabular-nums;}}
.body{{flex:1;min-width:0;}}
.t{{display:block;font-size:1.05rem;font-weight:700;color:var(--accent);}}
.s{{display:block;font-size:.92rem;color:var(--text);margin-top:1px;}}
.lv{{flex:0 0 auto;font-size:.75rem;font-weight:600;color:var(--chip-pol-t);background:var(--chip-pol);
border-radius:8px;padding:2px 8px;white-space:nowrap;}}
#none{{margin-top:24px;color:var(--muted);text-align:center;}}
</style>
</head>
<body>
<nav class="switch" aria-label="Sección">
<a href="../"><span lang="ja">活用</span> Conjugación</a>
<a href="./" aria-current="page"><span lang="ja">文法</span> Gramática</a>
</nav>
<div class="wrap">
<header>
<h1><span class="jp">文法</span> Gramática</h1>
<p class="lede"><b>{count} fichas · {nblocks} bloques · {levels}</b> — en orden de estudio. Cada ficha trae el matiz que la separa de sus vecinas, la formación, ejemplos con furigana y los errores más comunes.</p>
</header>
<div class="tools">
<input id="q" type="search" placeholder="Buscar: わけ, condicional, keigo…" aria-label="Buscar ficha" autocomplete="off">
<nav class="chips">{chips}</nav>
</div>

{sections}

<p id="none" hidden>Ninguna ficha coincide.</p>
</div>
<footer>Biblioteca de gramática japonesa</footer>
<script>
// Filter fichas by title, reading, romaji, description or category, ignoring accents.
const fold = s => s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").normalize("NFC");
const q = document.getElementById("q");
q.addEventListener("input", () => {{
  const words = fold(q.value).split(/\\s+/).filter(Boolean);
  let shown = 0;
  for (const sec of document.querySelectorAll(".block")) {{
    let n = 0;
    for (const li of sec.querySelectorAll("li")) {{
      const hit = words.every(w => li.dataset.q.includes(w));
      li.hidden = !hit;
      n += hit;
    }}
    sec.hidden = !n;
    shown += n;
  }}
  document.getElementById("none").hidden = shown > 0;
}});
</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", action="store_true", help="print every ficha with its level and title")
    args = ap.parse_args()
    blocks, fichas = load()

    if args.list:
        for b in blocks:
            for n in b["fichas"]:
                f = fichas[n]
                print(f"{b['id']}  {n:30} {f['level']:9} {f['title']}  — {f['sub']}")
        return

    v = css_version()
    order = [(b, fichas[n]) for b in blocks for n in b["fichas"]]
    changed = 0
    for i, (b, f) in enumerate(order):
        prev = order[i - 1][1] if i > 0 else None
        nxt = order[i + 1][1] if i + 1 < len(order) else None
        changed += build_ficha(f, b, prev, nxt, v)
    idx = build_index(blocks, fichas, v)
    log(f"{len(order)} fichas in {len(blocks)} blocks; {changed} fichas updated"
        f"{', index rebuilt' if idx else ''}")


if __name__ == "__main__":
    main()
