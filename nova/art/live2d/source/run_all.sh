#!/usr/bin/env bash
# Rebuilds every Nova Live2D deliverable from the character sheet.
# Needs Python 3 with numpy, scipy, pillow and psd-tools (pip install numpy scipy pillow psd-tools),
# and ImageMagick for one check. Run from this folder: bash run_all.sh
set -e
cd "$(dirname "$0")"
mkdir -p work/layers
cp -n ../Nova_Reference_Sheet_Original.png sheet.png 2>/dev/null || true
python3 stage1.py          # her neutral body at 3000x4000: lines + silhouette
python3 label.py           # split into parts (seeds + cut lines in parts.py)
python3 build.py | tee work/build.log   # layers with hidden overlap; checks they stack back exactly
python3 check.py
python3 newart.py          # mouths, expression parts, hands, effects, shadows
python3 - <<'PY'
import json, os
from groups import STACK
have = [k for k in STACK if os.path.exists(f'work/layers/{k}.png')]
hidden = set(json.load(open('work/newart.json'))) - {'Nose', 'Mouth_Neutral'}
json.dump(have, open('work/full_order.json', 'w')); json.dump([k for k in have if k not in hidden], open('work/default_visible.json', 'w'))
PY
python3 expressions.py
python3 pose.py
python3 deliver.py ..      # PSD, previews, exported layers
python3 manifest.py ..
python3 docs.py ..
python3 validate.py ..
python3 verify.py ..
