#!/usr/bin/env bash
set -euo pipefail
BASE="$1"; ADAPTER="$2"; LLAMA_CPP="$3"; OUT="${4:-finetune/outputs/gguf}"; mkdir -p "$OUT"
python -m pip install -U peft transformers
python -c 'from peft import PeftModel; from transformers import AutoModelForCausalLM,AutoTokenizer; import sys; b,a,o=sys.argv[1:]; m=AutoModelForCausalLM.from_pretrained(b,torch_dtype="auto",device_map="cpu"); m=PeftModel.from_pretrained(m,a).merge_and_unload(); m.save_pretrained(o,safe_serialization=True); AutoTokenizer.from_pretrained(b).save_pretrained(o)' "$BASE" "$ADAPTER" "$OUT/merged"
python "$LLAMA_CPP/convert_hf_to_gguf.py" "$OUT/merged" --outfile "$OUT/model-f16.gguf" --outtype f16
cmake -S "$LLAMA_CPP" -B "$LLAMA_CPP/build" -DGGML_CUDA=OFF && cmake --build "$LLAMA_CPP/build" --config Release -j
"$LLAMA_CPP/build/bin/llama-quantize" "$OUT/model-f16.gguf" "$OUT/model-q4_k_m.gguf" q4_k_m
