
import argparse
import json
import yaml
import torch

from pathlib import Path
from collections import Counter

from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
)
from peft import (
    LoraConfig,
    prepare_model_for_kbit_training,
)
from trl import SFTTrainer, SFTConfig


def load_jsonl(path):
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    rows = [
        json.loads(line)
        for line in path.read_text().splitlines()
        if line.strip()
    ]

    if not rows:
        raise ValueError(f"Dataset is empty: {path}")

    return rows


def format_example(x):
    return (
        f"### Instruction\n{x['instruction']}\n\n"
        f"### Context\n{x['input']}\n\n"
        f"### Response\n{x['output']}"
    )


def main():

    # 1. Load configuration
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--config",
        default="/content/finetune/config.yaml"
    )

    args_cli = parser.parse_args()

    config_path = Path(args_cli.config)

    if not config_path.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_path}"
        )

    with open(config_path, "r") as f:
        c = yaml.safe_load(f)

    # 2. Check GPU
    if not torch.cuda.is_available():
        raise SystemExit(
            "CUDA GPU required. Enable GPU in Colab Runtime settings."
        )

    print("GPU:", torch.cuda.get_device_name(0))
    print("Compute capability:", torch.cuda.get_device_capability(0))

    # T4 GPU: use FP16, not BF16
    compute_dtype = torch.float16

    # 3. Configure 4-bit quantization
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=True
    )

    # 4. Load tokenizer
    print("\nLoading tokenizer...")

    tokenizer = AutoTokenizer.from_pretrained(
        c["model_name"]
    )

    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    tokenizer.padding_side = "right"

    # 5. Load base model
    print("\nLoading 4-bit model...")

    model = AutoModelForCausalLM.from_pretrained(
        c["model_name"],
        quantization_config=bnb_config,
        torch_dtype=compute_dtype,
        device_map="auto"
    )

    model.config.use_cache = False
    model.config.pad_token_id = tokenizer.pad_token_id

    # 6. Prepare model for QLoRA
    print("\nPreparing model for k-bit training...")

    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=True
    )

    model.config.use_cache = False

    # 7. Load datasets
    print("\nLoading datasets...")

    train_rows = load_jsonl(c["train_file"])
    valid_rows = load_jsonl(c["validation_file"])

    train_dataset = Dataset.from_dict({
        "text": [format_example(x) for x in train_rows]
    })

    valid_dataset = Dataset.from_dict({
        "text": [format_example(x) for x in valid_rows]
    })

    print("Training examples:", len(train_dataset))
    print("Validation examples:", len(valid_dataset))

    # 8. LoRA configuration
    peft_config = LoraConfig(
        r=int(c["lora_r"]),
        lora_alpha=int(c["lora_alpha"]),
        lora_dropout=float(c["lora_dropout"]),
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear"
    )

    # 9. Create output directory
    output_dir = Path(c["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    # 10. Training configuration
    training_args = SFTConfig(
        output_dir=str(output_dir),

        learning_rate=float(c["learning_rate"]),
        num_train_epochs=float(c["num_train_epochs"]),

        per_device_train_batch_size=int(
            c["per_device_train_batch_size"]
        ),

        gradient_accumulation_steps=int(
            c["gradient_accumulation_steps"]
        ),

        eval_strategy="steps",
        eval_steps=int(c["eval_steps"]),

        save_strategy="steps",
        save_steps=int(c["save_steps"]),
        save_total_limit=2,

        logging_steps=10,
        report_to="none",

        # Diagnostic setting:
        # Disable AMP GradScaler while investigating
        # the previous BFloat16 gradient error.
        fp16=False,
        bf16=False,

        # Memory optimization
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",

        # Dataset configuration
        max_length=int(c["max_seq_length"]),
        dataset_text_field="text",
        packing=False,

        seed=42
    )

    # 11. Initialize trainer
    print("\nInitializing SFTTrainer...")

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=valid_dataset,
        peft_config=peft_config,
        processing_class=tokenizer
    )

    # 12. Inspect parameter data types
    print("\nParameter dtype summary:")

    print(
        "All parameters:",
        Counter(
            str(p.dtype)
            for p in trainer.model.parameters()
        )
    )

    print(
        "Trainable parameters:",
        Counter(
            str(p.dtype)
            for p in trainer.model.parameters()
            if p.requires_grad
        )
    )

    # 13. Start training
    print("\nStarting QLoRA training...\n")

    trainer.train()

    # 14. Save final LoRA adapter
    print("\nSaving trained adapter...")

    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    print("\nTraining completed successfully!")
    print("Model saved at:", output_dir)


if __name__ == "__main__":
    main()
