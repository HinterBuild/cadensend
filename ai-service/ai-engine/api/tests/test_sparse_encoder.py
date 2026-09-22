"""Tests for the dependency-free sparse (lexical) vector encoder."""

from app.rag.sparse import encode_sparse, tokenize
from app.rag.sparse.encoder import VOCAB_SIZE, _token_index


class TestTokenize:
    def test_lowercases_and_splits(self):
        assert tokenize("Continuous Batching") == ["continuous", "batching"]

    def test_drops_stopwords(self):
        tokens = tokenize("the quick fox and the lazy dog")
        assert "the" not in tokens
        assert "and" not in tokens
        assert "quick" in tokens

    def test_drops_single_characters(self):
        assert "a" not in tokenize("a b vllm")

    def test_keeps_hyphenated_and_underscored_identifiers(self):
        tokens = tokenize("paged_attention and kv-cache are related")
        assert "paged_attention" in tokens
        assert "kv-cache" in tokens

    def test_empty_text_is_empty(self):
        assert tokenize("") == []
        assert tokenize(None) == []


class TestTokenIndex:
    def test_deterministic(self):
        assert _token_index("vllm") == _token_index("vllm")

    def test_within_vocab_range(self):
        for token in ["vllm", "paging", "kv-cache", "attention", "batching"]:
            idx = _token_index(token)
            assert 0 <= idx < VOCAB_SIZE

    def test_different_tokens_usually_differ(self):
        tokens = ["vllm", "paging", "attention", "batching", "throughput", "latency"]
        indices = {_token_index(t) for t in tokens}
        # Not a collision-freedom guarantee, but with VOCAB_SIZE=2**18 and
        # 6 tokens, a collision would be a near-impossible coincidence.
        assert len(indices) == len(tokens)


class TestEncodeSparse:
    def test_deterministic_same_text_same_vector(self):
        a = encode_sparse("vLLM pages KV cache blocks for throughput.")
        b = encode_sparse("vLLM pages KV cache blocks for throughput.")
        assert a.indices == b.indices
        assert a.values == b.values

    def test_empty_text_is_empty_vector(self):
        vector = encode_sparse("")
        assert vector.indices == []
        assert vector.values == []

    def test_indices_are_sorted_ascending(self):
        vector = encode_sparse("zebra apple mango banana cherry date")
        assert vector.indices == sorted(vector.indices)

    def test_indices_and_values_are_parallel_arrays(self):
        vector = encode_sparse("paging paging paging attention")
        assert len(vector.indices) == len(vector.values)
        assert len(vector.indices) == 2  # two distinct non-stopword tokens

    def test_repeated_token_gets_higher_weight_than_single(self):
        single = encode_sparse("attention is useful")
        repeated = encode_sparse("attention attention attention attention is useful")
        single_idx = _token_index("attention")
        repeated_value = dict(zip(repeated.indices, repeated.values))[single_idx]
        single_value = dict(zip(single.indices, single.values))[single_idx]
        assert repeated_value > single_value

    def test_log_scaling_dampens_high_repetition(self):
        # log-scaled weight should grow much slower than raw count: going
        # from 2 to 20 occurrences should not multiply the weight by 10x.
        low = encode_sparse(" ".join(["paging"] * 2))
        high = encode_sparse(" ".join(["paging"] * 20))
        low_value = low.values[0]
        high_value = high.values[0]
        assert high_value < low_value * 10

    def test_stopword_only_text_is_empty_vector(self):
        vector = encode_sparse("the a an of to")
        assert vector.indices == []
