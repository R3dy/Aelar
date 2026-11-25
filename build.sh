#!/bin/sh
# Build the playable bundle into dist/
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/assets
npx esbuild src/main.js --bundle --format=iife --minify --target=es2020 --outfile=dist/game.js --log-level=warning
cp index.html dist/
cp -r assets/hud assets/tex assets/fonts assets/models dist/assets/ && rm -f dist/assets/models/README.md
rm -f dist/assets/hud/layout.json
# Artifact variant: the host adds doctype/head, so strip ours
python3 - <<'PY'
import re
s=open('dist/index.html').read()
s=re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*','',s,flags=re.I)
s=re.sub(r'<meta[^>]*>\s*','',s)
s=s.replace('</head>\n<body>\n','').replace('</body>\n</html>\n','')
s=s.replace('<title>Training Grounds</title>','<title>Training Grounds</title>\n<meta name="claude:viewport-fit-sides" content="cover">',1)
s=s.replace(":root { --s: 1; --bg: #000; }",":root { --s: 1; --bg: #000; color-scheme: dark; }")
open('dist/page.html','w').write(s)
PY
