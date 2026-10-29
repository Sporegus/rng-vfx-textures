#!/bin/bash
# Sets up training for Nova's own voice, inside WSL (Ubuntu). Run once, from this folder:
#   bash setup.sh
# Everything goes in ~/nova-voice inside Linux (about 8 GB).
set -euo pipefail

W=~/nova-voice
HERE=$(cd "$(dirname "$0")" && pwd)
# the version of ZipVoice these scripts were written and checked against
ZV_COMMIT=2f7326fbfe999a3ad179e3f1af82a424d4a62819

echo "1/5 Checking your graphics card..."
if ! nvidia-smi >/dev/null 2>&1; then
  echo "  WSL can't see your NVIDIA graphics card. Update the NVIDIA driver on Windows"
  echo "  (nvidia.com/drivers or the NVIDIA app), restart the PC, and run this again."
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | sed 's/^/  /'

echo "2/5 Installing tools (it may ask for the Linux password you made for WSL)..."
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential git ffmpeg curl >/dev/null
# Python 3.11 (one of ZipVoice's parts only comes ready-made for it), through uv
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
export PATH="$HOME/.local/bin:$PATH"

mkdir -p "$W" && cd "$W"
[ -d ZipVoice ] || git clone -q https://github.com/k2-fsa/ZipVoice.git
(cd ZipVoice && git fetch -q origin && git checkout -q "$ZV_COMMIT" && python3 "$HERE/patch_zipvoice.py")

[ -d venv ] || uv venv -q --seed --python 3.11 venv
. venv/bin/activate
pip install -q --upgrade pip

echo "3/5 Installing PyTorch with graphics card support (about 3 GB, takes a while)..."
pip install -q torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121

echo "4/5 Installing ZipVoice's requirements..."
pip install -q -r ZipVoice/requirements.txt onnx onnxruntime
python - <<'EOF'
import torch
assert torch.cuda.is_available(), "PyTorch can't use the graphics card"
print("  graphics card ready:", torch.cuda.get_device_name(0))
EOF

echo "5/5 Downloading ZipVoice's starting models (about 1 GB)..."
python - <<'EOF'
from huggingface_hub import hf_hub_download
for m in ("zipvoice", "zipvoice_distill"):
    for f in ("model.pt", "model.json", "tokens.txt"):
        hf_hub_download("k2-fsa/ZipVoice", f"{m}/{f}", local_dir="download")
print("  done")
EOF

echo
echo "Setup finished. Next:  bash train.sh"
