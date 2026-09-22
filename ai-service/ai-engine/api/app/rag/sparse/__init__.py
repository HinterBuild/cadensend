"""Sparse (lexical) vector encoding for hybrid dense+sparse retrieval."""

from app.rag.sparse.encoder import SparseVector, encode_sparse, tokenize

__all__ = ["SparseVector", "encode_sparse", "tokenize"]
