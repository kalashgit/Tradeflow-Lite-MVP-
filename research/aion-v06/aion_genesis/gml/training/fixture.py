"""A tiny random causal LM and tokenizer for offline pipeline tests.

NOT a language model worth evaluating: it exists so the full
train → save → reload → score path can run without network access or large
weights. Results obtained with it say nothing about Qwen.
"""

from pathlib import Path

FIXTURE_NAME = "gml-fixture-tiny-gpt2"


def build_fixture_model(folder, corpus: list[str], seed=0) -> str:
    import torch
    from tokenizers import Tokenizer, models, pre_tokenizers, trainers
    from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    raw = Tokenizer(models.WordLevel(unk_token="<unk>"))
    raw.pre_tokenizer = pre_tokenizers.Split(r"[\s=:,\[\]]", "isolated")
    raw.train_from_iterator(corpus, trainers.WordLevelTrainer(
        special_tokens=["<unk>", "<eos>", "<pad>"]))
    tokenizer = PreTrainedTokenizerFast(tokenizer_object=raw, unk_token="<unk>",
                                        eos_token="<eos>", pad_token="<pad>")
    torch.manual_seed(seed)
    model = GPT2LMHeadModel(GPT2Config(
        vocab_size=tokenizer.vocab_size + 3, n_positions=1024, n_embd=48, n_layer=2,
        n_head=4, bos_token_id=1, eos_token_id=1))
    model.save_pretrained(str(folder))
    tokenizer.save_pretrained(str(folder))
    return str(folder)
