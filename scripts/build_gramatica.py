#!/usr/bin/env python3
"""Build gramatica/index.html and the navigation inside each grammar ficha.

    python3 scripts/build_gramatica.py          # rebuild index + ficha navigation
    python3 scripts/build_gramatica.py --list   # title and JLPT level of every ficha

The study order lives in gramatica/bloques.json: eleven blocks, each with its
fichas in the order they are meant to be studied. Every gramatica/NN-*.html must
appear there exactly once; the build fails otherwise.

The fichas are hand-written, self-contained pages. This script only maintains
three generated regions in each, delimited by HTML comments so a rebuild
replaces them in place: <!--gen-head--> (title + nav styles) before </head>,
<!--gen-top--> (back to the index) after <body>, and <!--gen-bottom-->
(previous / next ficha) before <footer>. Edit everything else by hand.
Stdlib only. Files are rewritten only when their content changes.
"""
import argparse
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

FONTS = ("https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400"
         "&family=Poppins:wght@400;500;600&family=Noto+Serif+JP:wght@400;700&display=swap")

NAV_CSS = """\
.gnav{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;
font-family:"Poppins",sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
color:var(--sub);margin-bottom:10px;}
.gnav a{color:var(--midori);text-decoration:none;font-weight:500;}
.gpn{display:flex;gap:10px;margin-top:28px;flex-wrap:wrap;}
.gpn a{flex:1 1 220px;display:block;text-decoration:none;color:var(--sumi);background:#fff;
border:1px solid var(--kasumi);border-radius:6px;padding:10px 13px;}
.gpn a:hover{border-color:var(--midori);}
.gpn a.next{text-align:right;}
.gpn small{display:block;font-family:"Poppins",sans-serif;font-size:10px;letter-spacing:.12em;
text-transform:uppercase;color:var(--sub);margin-bottom:2px;}
.gpn .jp{font-size:15px;color:var(--midori);}"""


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


def build_ficha(f, block, prev, nxt):
    path = DIR / f["name"]
    src = path.read_text()
    head = f"\n<title>{jp(f['title'])} &middot; Gram&aacute;tica</title>\n<style>\n{NAV_CSS}\n</style>\n"
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
    src = region(src, "gen-head", head, r"</head>")
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


def build_index(blocks, fichas):
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
            f' <span class="desc">— {jp(b["desc"])}</span></h2>\n'
            f'<p class="intro">{b["intro"]}</p>\n{warn}\n'
            f'<ol class="list">\n' + "\n".join(items) + "\n</ol>\n</section>")
    page = TEMPLATE.format(
        fonts=FONTS,
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
<link href="{fonts}" rel="stylesheet">
<style>
:root{{--sumi:#16211C;--washi:#FCFBF7;--midori:#3F6B4E;--midori-pale:#EAF0E9;
--shu:#B23A2E;--shu-pale:#FDF8F7;--kasumi:#DCE2D8;--sub:#6E7A72;}}
*{{box-sizing:border-box;margin:0;padding:0;}}
body{{font-family:"Lora",Georgia,serif;background:var(--washi);color:var(--sumi);
font-size:15px;line-height:1.55;padding:20px 16px 40px;}}
.wrap{{max-width:760px;margin:0 auto;}}
.jp{{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;}}
.back{{font-family:"Poppins",sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;}}
.back a{{color:var(--midori);text-decoration:none;font-weight:500;}}
header{{border-top:3px solid var(--sumi);border-bottom:1px solid var(--kasumi);padding:14px 0 14px;margin:10px 0 16px;}}
h1{{font-size:clamp(24px,5.4vw,34px);font-weight:700;line-height:1.15;}}
h1 .jp{{color:var(--midori);margin-right:.3em;}}
.lede{{margin-top:8px;font-size:clamp(14px,2.6vw,16px);}}
.lede b{{color:var(--midori);}}
.tools{{position:sticky;top:0;background:var(--washi);padding:10px 0;z-index:1;border-bottom:1px solid var(--kasumi);}}
#q{{width:100%;font:inherit;font-size:16px;padding:9px 12px;border:1px solid var(--kasumi);
border-radius:6px;background:#fff;color:var(--sumi);}}
#q:focus{{outline:2px solid var(--midori);outline-offset:-1px;}}
.chips{{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;}}
.chips a{{font-family:"Poppins",sans-serif;font-size:12px;text-decoration:none;color:var(--midori);
background:var(--midori-pale);border-radius:99px;padding:3px 10px;}}
.block{{margin-top:26px;scroll-margin-top:110px;}}
h2{{font-family:"Poppins",sans-serif;font-weight:600;font-size:13px;letter-spacing:.12em;
text-transform:uppercase;color:var(--midori);padding-bottom:6px;border-bottom:1px solid var(--kasumi);}}
h2 .desc{{font-weight:400;color:var(--sub);text-transform:none;letter-spacing:0;font-size:12.5px;}}
.intro{{margin-top:9px;font-size:14px;}}
.intro b,.warn b{{color:var(--midori);}}
.warn{{margin-top:9px;font-size:13.5px;background:var(--shu-pale);border:1px solid #EBD6D3;
border-left:3px solid var(--shu);border-radius:5px;padding:9px 12px;}}
.warn b{{color:var(--shu);}}
.list{{list-style:none;margin-top:10px;}}
.list a{{display:flex;gap:12px;align-items:baseline;padding:10px 4px;border-bottom:1px solid #EFF1EC;
text-decoration:none;color:inherit;}}
.list a:hover{{background:var(--midori-pale);}}
.num{{font-family:"Poppins",sans-serif;font-size:11px;color:var(--sub);flex:0 0 20px;}}
.body{{flex:1;min-width:0;}}
.t{{display:block;font-size:16px;font-weight:700;color:var(--midori);}}
.s{{display:block;font-size:13.5px;margin-top:1px;}}
.lv{{flex:0 0 auto;font-family:"Poppins",sans-serif;font-size:10.5px;letter-spacing:.08em;color:var(--midori);
border:1px solid var(--midori);border-radius:4px;padding:2px 6px;white-space:nowrap;}}
#none{{margin-top:24px;color:var(--sub);}}
footer{{margin-top:34px;padding-top:10px;border-top:1px solid var(--kasumi);font-family:"Poppins",sans-serif;
font-size:11px;color:#9AA69E;text-align:center;}}
footer a{{color:inherit;}}
</style>
</head>
<body>
<div class="wrap">
<div class="back"><a href="../">&larr; 活用 Conjugación</a></div>
<header>
<h1><span class="jp">文法</span>Gramática</h1>
<p class="lede"><b>{count} fichas · {nblocks} bloques · {levels}</b>. Referencia de gramática japonesa en español, en orden de estudio. Cada ficha trae el matiz que la separa de sus vecinas, la formación, ejemplos con furigana, dónde la vas a encontrar y los errores más comunes.</p>
</header>
<div class="tools">
<input id="q" type="search" placeholder="Buscar: わけ, condicional, keigo…" aria-label="Buscar ficha" autocomplete="off">
<nav class="chips">{chips}</nav>
</div>

{sections}

<p id="none" hidden>Ninguna ficha coincide.</p>
<footer>Biblioteca de gramática japonesa · <a href="https://github.com/angelengineer/japanese-web">código</a></footer>
</div>
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

    order = [(b, fichas[n]) for b in blocks for n in b["fichas"]]
    changed = 0
    for i, (b, f) in enumerate(order):
        prev = order[i - 1][1] if i > 0 else None
        nxt = order[i + 1][1] if i + 1 < len(order) else None
        changed += build_ficha(f, b, prev, nxt)
    idx = build_index(blocks, fichas)
    log(f"{len(order)} fichas in {len(blocks)} blocks; {changed} fichas updated"
        f"{', index rebuilt' if idx else ''}")


if __name__ == "__main__":
    main()
