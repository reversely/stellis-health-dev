#!/usr/bin/env bash
# Install the pinned local models for the first macOS speech adapter.
set -euo pipefail

model_dir="${STELLIS_DATA_DIR:-$HOME/Library/Application Support/Stellis}/models"
mkdir -p "$model_dir"
chmod 700 "$model_dir"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

check_sha256() {
  local filename="$1" expected="$2" actual
  actual="$(shasum -a 256 "$filename" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum mismatch for $(basename "$filename")" >&2
    exit 1
  fi
}

whisper="$model_dir/ggml-small.en.bin"
if [[ ! -f "$whisper" ]]; then
  curl -fL --retry 3 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin' -o "$work_dir/ggml-small.en.bin"
  check_sha256 "$work_dir/ggml-small.en.bin" 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d'
  mv "$work_dir/ggml-small.en.bin" "$whisper"
fi
check_sha256 "$whisper" 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d'

segmentation="$model_dir/pyannote-segmentation-3.0-int8.onnx"
if [[ ! -f "$segmentation" ]]; then
  curl -fL --retry 3 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2' -o "$work_dir/segmentation.tar.bz2"
  tar -xjf "$work_dir/segmentation.tar.bz2" -C "$work_dir"
  cp "$work_dir/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx" "$segmentation"
fi
check_sha256 "$segmentation" 'd582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d'

embedding="$model_dir/nemo-en-titanet-small.onnx"
if [[ ! -f "$embedding" ]]; then
  curl -fL --retry 3 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx' -o "$work_dir/nemo_en_titanet_small.onnx"
  check_sha256 "$work_dir/nemo_en_titanet_small.onnx" 'ad4a1802485d8b34c722d2a9d04249662f2ece5d28a7a039063ca22f515a789e'
  mv "$work_dir/nemo_en_titanet_small.onnx" "$embedding"
fi
check_sha256 "$embedding" 'ad4a1802485d8b34c722d2a9d04249662f2ece5d28a7a039063ca22f515a789e'
chmod 600 "$whisper" "$segmentation" "$embedding"
echo "Local speech models are ready in $model_dir"
