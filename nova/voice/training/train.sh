#!/bin/bash
# Trains Nova's own voice on her checked recordings, then puts it in Nova. Run from this folder:
#   bash train.sh
# Takes a few hours. You can stop it (Ctrl+C) and run it again: finished steps are skipped.
# If it says the graphics card ran out of memory:  MAXDUR=40 bash train.sh
# To use recordings from another folder:  bash train.sh "/mnt/c/Users/you/Somewhere/Nova voice training"
set -euo pipefail

W=~/nova-voice
[ -d "$W/venv" ] || { echo "Run setup.sh first."; exit 1; }
win() { wslpath "$(cmd.exe /c "echo $1" 2>/dev/null | tr -d '\r')"; }
WINHOME=$(win %USERPROFILE%)
NOVA_APPDATA="$(win %APPDATA%)/Nova"

# where the checked recordings are (Documents, or Documents in OneDrive)
DATA=${1:-}
if [ -z "$DATA" ]; then
  for d in "$WINHOME/Documents/Nova voice training" "$WINHOME/OneDrive/Documents/Nova voice training"; do
    [ -f "$d/train.tsv" ] && DATA=$d && break
  done
fi
[ -n "$DATA" ] && [ -f "$DATA/train.tsv" ] || { echo "Can't find the checked recordings. Run 'npm run voice-check-data' on Windows first."; exit 1; }
echo "Recordings: $DATA"

MAXDUR=${MAXDUR:-60}            # seconds of audio per training step (lower it if memory runs out)
TEACHER_STEPS=${TEACHER_STEPS:-2000}
DISTILL_STEPS=${DISTILL_STEPS:-3000}
POLISH_STEPS=${POLISH_STEPS:-1000}

. "$W/venv/bin/activate"
cd "$W/ZipVoice/egs/zipvoice"
export PYTHONPATH=../../:${PYTHONPATH:-}
D=$W/download
mkdir -p data/raw "$W/done"
step() { [ -f "$W/done/$1" ]; }
finish() { touch "$W/done/$1"; }
common=(--tokenizer emilia --lang default --token-file "$D/zipvoice/tokens.txt" --dataset custom
        --train-manifest data/fbank/custom-finetune_cuts_train.jsonl.gz --dev-manifest data/fbank/custom-finetune_cuts_dev.jsonl.gz
        --model-config "$D/zipvoice/model.json" --max-duration "$MAXDUR" --max-len 20 --world-size 1 --use-fp16 1)

if ! step data; then
  echo; echo "== 1/6 Getting her recordings ready"
  rm -rf "$W/clean" && cp -r "$DATA/clean" "$W/clean"
  for s in train dev; do
    awk -F'\t' -v dir="$W" 'BEGIN{OFS="\t"} {print $1, $2, dir "/" $3}' "$DATA/$s.tsv" | tr -d '\r' > data/raw/custom_$s.tsv
  done
  for s in train dev; do
    python3 -m zipvoice.bin.prepare_dataset --tsv-path data/raw/custom_$s.tsv --prefix custom-finetune --subset raw_$s --num-jobs 4 --output-dir data/manifests
    python3 -m zipvoice.bin.prepare_tokens --input-file data/manifests/custom-finetune_cuts_raw_$s.jsonl.gz --output-file data/manifests/custom-finetune_cuts_$s.jsonl.gz --tokenizer emilia --lang default
    python3 -m zipvoice.bin.compute_fbank --source-dir data/manifests --dest-dir data/fbank --dataset custom-finetune --subset $s --num-jobs 4
  done
  finish data
fi

if ! step teacher; then
  echo; echo "== 2/6 Teaching ZipVoice her voice ($TEACHER_STEPS steps)"
  python3 -m zipvoice.bin.train_zipvoice "${common[@]}" --finetune 1 --checkpoint "$D/zipvoice/model.pt" \
    --base-lr 0.0001 --num-iters "$TEACHER_STEPS" --save-every-n 500 --exp-dir exp/nova_teacher
  python3 -m zipvoice.bin.generate_averaged_model --iter "$TEACHER_STEPS" --avg 2 --model-name zipvoice --exp-dir exp/nova_teacher
  finish teacher
fi

if ! step distill; then
  echo; echo "== 3/6 Making the fast version, so she can talk live ($DISTILL_STEPS steps)"
  python3 -m zipvoice.bin.train_zipvoice_distill "${common[@]}" \
    --teacher-model "exp/nova_teacher/iter-$TEACHER_STEPS-avg-2.pt" --student-model "$D/zipvoice_distill/model.pt" \
    --distill-stage first --base-lr 0.0001 --num-iters "$DISTILL_STEPS" --save-every-n 500 --exp-dir exp/nova_distill1
  python3 -m zipvoice.bin.generate_averaged_model --iter "$DISTILL_STEPS" --avg 2 --model-name zipvoice_distill --exp-dir exp/nova_distill1
  finish distill
fi

if ! step polish; then
  echo; echo "== 4/6 Polishing the fast version ($POLISH_STEPS steps)"
  python3 -m zipvoice.bin.train_zipvoice_distill "${common[@]}" \
    --teacher-model "exp/nova_distill1/iter-$DISTILL_STEPS-avg-2.pt" \
    --distill-stage second --base-lr 0.0001 --num-iters "$POLISH_STEPS" --save-every-n 500 --exp-dir exp/nova_distill2
  finish polish
fi

if ! step export; then
  echo; echo "== 5/6 Saving it in the format Nova uses"
  python3 -m zipvoice.bin.onnx_export --model-name zipvoice_distill --model-dir exp/nova_distill2 \
    --checkpoint-name "checkpoint-$POLISH_STEPS.pt" --onnx-model-dir exp/nova_onnx
  finish export
fi

echo; echo "== 6/6 Putting it in Nova"
OUT="$NOVA_APPDATA/models/nova-own-voice"
mkdir -p "$OUT"
for f in text_encoder.onnx fm_decoder.onnx text_encoder_int8.onnx fm_decoder_int8.onnx; do cp "exp/nova_onnx/$f" "$OUT/"; done
cp exp/nova_distill2/tokens.txt "$OUT/tokens.txt"
date > "$OUT/trained.txt"
echo
echo "Done! Her own voice is in: $OUT"
echo "Restart Nova to hear it. To compare it with her old voice: npm run voice-sample (on Windows)."
