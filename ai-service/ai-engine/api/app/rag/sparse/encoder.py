"""A dependency-free sparse (lexical) vector encoder for hybrid retrieval.

Dense embeddings (from model_service.get_embeddings) capture semantic
similarity but miss exact-keyword matches — a query for an exact API name,
error code, or acronym can score poorly against a paraphrased chunk. A
sparse term-frequency vector, searched alongside the dense vector and
fused (see plan.md's Update 1: "dense and sparse retrieval in parallel...
fuse with Reciprocal Rank Fusion"), recovers those exact-match cases.

This encoder does not need a pretrained model or corpus-wide statistics:
it tokenizes text and maps each token to a fixed-width index via a stable
hash (the "hashing trick"), weighted by log-scaled term frequency within
the chunk. That keeps it a pure function — same text always produces the
same sparse vector — which matters here because chunk indexing already
relies on deterministic point IDs elsewhere in this codebase. A true IDF
term would require corpus-wide document-frequency statistics this encoder
deliberately doesn't depend on; term-frequency-only is the accepted
starting point for a first hybrid-search slice (see README.md).
"""

from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from typing import Dict, List

# Keeps the sparse index space fixed and small enough for Qdrant's sparse
# index while large enough that hash collisions stay rare for chunk-sized
# text (a few hundred words).
VOCAB_SIZE = 2**18

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[_\-][a-z0-9]+)*")

# Stopwords are removed because they carry no lexical signal and would
# otherwise dominate term-frequency weighting in every chunk.
_STOPWORDS = frozenset(
    """
    a an the and or but if then else for of to in on at by with from as is
    are was were be been being this that these those it its it's i you he
    she we they them his her our your their not no do does did doing have
    has had having will would shall should can could may might must
    """.split()
)


@dataclass(frozen=True)
class SparseVector:
    """A Qdrant-compatible sparse vector: parallel index/value arrays."""

    indices: List[int]
    values: List[float]


def tokenize(text: str) -> List[str]:
    """Lowercase, split on non-alphanumeric boundaries, drop stopwords."""
    tokens = _TOKEN_RE.findall((text or "").lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 1]


def _token_index(token: str) -> int:
    """Stable hash of a token into [0, VOCAB_SIZE) — the hashing trick."""
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % VOCAB_SIZE


def encode_sparse(text: str) -> SparseVector:
    """Build a term-frequency sparse vector for one chunk of text.

    Log-scaled term frequency (1 + log(count)) keeps a token repeated 20
    times from dominating a token that appears twice, which matters for
    chunk-length text where a few words can otherwise saturate the vector.
    """
    tokens = tokenize(text)
    if not tokens:
        return SparseVector(indices=[], values=[])

    counts: Dict[int, int] = {}
    for token in tokens:
        idx = _token_index(token)
        counts[idx] = counts.get(idx, 0) + 1

    # Sorted indices: Qdrant expects (and some clients validate) sparse
    # vector indices in ascending order.
    sorted_indices = sorted(counts.keys())
    indices = list(sorted_indices)
    values = [round(1.0 + math.log(counts[idx]), 6) for idx in sorted_indices]
    return SparseVector(indices=indices, values=values)
