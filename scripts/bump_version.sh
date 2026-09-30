#!/bin/sh
# Stamp ?v=<timestamp> on every local script/stylesheet link so browsers fetch
# fresh copies after a deploy (GitHub Pages serves them with max-age=600).
# Run before committing any change to js/, css/ or data/.
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
for f in index.html ayuda.html; do
  sed -i -E "s#(src|href)=\"((js|data|css)/[^\"?]+\.(js|css))(\?v=[0-9]+)?\"#\1=\"\2?v=$V\"#g" "$f"
done
echo "assets stamped v=$V" >&2
