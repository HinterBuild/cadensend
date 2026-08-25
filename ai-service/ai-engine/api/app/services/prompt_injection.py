"""Prompt-injection scanner for ingested source content.

Sources arrive from the open internet (URLs, RSS, uploaded files). Anything
in them can end up inside an LLM's context window during issue generation,
so a malicious page could try to hijack the writer model ("ignore previous
instructions", "tell readers to visit ...", hidden zero-width instructions).

This module provides a dependency-free scanner used at ingestion time:

- ``scan_source_text`` classifies text into clean / low / medium / high
  severity with redacted findings.
- ``sanitize_source_text`` neutralizes what was found (strips invisible
  characters and HTML comments, blanks matched instruction spans) so that
  only cleaned prose is ever chunked, embedded, or retrieved.

High-severity sources (multiple/combined signals) are blocked outright by
the ingestion worker; lower severities are sanitized and flagged for display
in the UI. A single lone pattern lands in the flagged tier on purpose:
articles *about* prompt injection are legitimate content, so blocking needs
more than one hit — while sanitization still removes the payload either way.

The patterns are deliberately conservative: near-miss phrasing ("pretend you
are a beginner", "your subject line works like a system prompt") must NOT
trip the scanner, because false positives poison trust in the warning.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# Pattern catalog
# ---------------------------------------------------------------------------

# (pattern_id, category, compiled regex, weight per occurrence)
_PATTERNS: List[Tuple[str, str, re.Pattern, int]] = []


def _register(pattern_id: str, category: str, weight: int, expr: str, flags: int = re.IGNORECASE):
    _PATTERNS.append((pattern_id, category, re.compile(expr, flags), weight))


# --- instruction override ---------------------------------------------------
_register(
    "ignore_previous",
    "instruction_override",
    3,
    r"\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+|your\s+)?"
    r"(?:previous|prior|above|earlier|past)\s+"
    r"(?:instructions?|prompts?|rules?|guidelines?|directions?|constraints?|training)\b",
)
_register(
    "new_instructions",
    "instruction_override",
    3,
    r"\b(?:new|updated|revised|real)\s+(?:system\s+)?(?:instructions?|directives?)\s*:",
)
_register(
    "fake_delimiters",
    "structural_fake",
    3,
    r"<\|?(?:im_start|im_end|endoftext|system)\|?>|\[/?INST\]|<</SYS>>|<<SYS>>",
    flags=re.IGNORECASE,
)
_register(
    "end_of_system",
    "structural_fake",
    3,
    r"\bend\s+of\s+(?:the\s+)?(?:system|developer|initial)\s+(?:prompt|message)\b",
)

# --- role hijack (kept narrow to avoid benign teaching metaphors) ------------
_register(
    "role_hijack",
    "role_hijack",
    2,
    r"\byou\s+are\s+now\s+(?:a|an)\s+(?:different|new|unrestricted|uncensored|unfiltered|dan)\b"
    r"|\bfrom\s+now\s+on[,\s]+you\s+(?:are|will|must|should|have\s+to)\b"
    r"|\bpretend\s+(?:that\s+)?(?:you\s+have\s+no|your)\s+(?:restrictions?|instructions?|filters?|guardrails?)\b",
)

# --- context/prompt exfiltration --------------------------------------------
_register(
    "prompt_extraction",
    "exfiltration",
    3,
    r"\b(?:repeat|print|output|reveal|show|display|leak)\s+(?:everything|all|the|your)\s+"
    r"(?:text\s+)?(?:above|before\s+this|initial|system|hidden|secret)"
    r"|\bwhat(?:'s|\s+is)\s+your\s+(?:system\s+prompt|initial\s+(?:prompt|instructions?)|hidden\s+rules?)\b",
)
_register(
    "system_prompt_echo",
    "exfiltration",
    2,
    r"\byour\s+(?:system\s+prompt|secret\s+instructions?|original\s+instructions?)\s+(?:is|are|was|reads?)\b",
)

# --- output manipulation aimed at the generated email ------------------------
_register(
    "reader_cta",
    "content_manipulation",
    2,
    r"\b(?:tell|ask|urge|encourage|instruct)\s+(?:the\s+)?(?:reader|user|subscriber|learner)s?\s+to\b",
)
_register(
    "promo_injection",
    "content_manipulation",
    2,
    r"\b(?:always|never|be\s+sure\s+to|remember\s+to)\s+"
    r"(?:mention|recommend|promote|link\s+to|include\s+a?\s*(?:link|reference)\s+to)\s+"
    r"(?:https?://|www\.|this\s+(?:coupon|offer|promo|sponsor|product))",
)
_register(
    "insert_directive",
    "content_manipulation",
    2,
    r"\b(?:add|insert|append)\s+(?:this|the\s+following)\s+"
    r"(?:link|note|message|disclaimer|sentence|paragraph|banner)\s+(?:to|at|in(to)?)\s+"
    r"(?:the\s+)?(?:top|bottom|beginning|end|start)",
)

# --- fake structural markers inside content ----------------------------------
_register(
    "fake_role_header",
    "structural_fake",
    4,
    r"^\s*(?:#{1,6}\s*)?(?:system|assistant|developer)\s*:\s*$",
    flags=re.IGNORECASE | re.MULTILINE,
)
_register(
    "fake_instruction_block",
    "structural_fake",
    2,
    r"^\s*(?:###\s*)+instruction\b|^\s*#{1,6}\s*(?:system\s+)?instructions?\s*$",
    flags=re.IGNORECASE | re.MULTILINE,
)

# --- smuggling channels -------------------------------------------------------
_INVISIBLE_RE = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff]")
_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL | re.IGNORECASE)
_COMMENT_SMUGGLE_WORD = re.compile(r"(?:ignore|disregard|instruction|system|assistant|override)", re.IGNORECASE)

SEVERITY_ORDER = ("clean", "low", "medium", "high")
BLOCK_THRESHOLD = 6   # score at/above this → source is refused
FLAG_THRESHOLD = 1    # above clean → sanitize + flag


@dataclass
class ScanResult:
    severity: str
    score: int
    findings: List[Dict] = field(default_factory=list)

    def summary(self) -> str:
        """Human-readable one-liner for error messages, e.g.
        'instruction override ×2, structural fake ×1'."""
        if not self.findings:
            return "no injection patterns detected"
        parts = []
        by_category: Dict[str, int] = {}
        for finding in self.findings:
            by_category[finding["category"]] = by_category.get(finding["category"], 0) + finding["count"]
        labels = {
            "instruction_override": "instruction override",
            "role_hijack": "role hijack",
            "exfiltration": "prompt extraction",
            "content_manipulation": "output manipulation",
            "structural_fake": "fake system markers",
            "invisible_chars": "hidden characters",
            "comment_smuggling": "smuggled HTML comments",
        }
        for category, count in sorted(by_category.items(), key=lambda kv: -kv[1]):
            label = labels.get(category, category.replace("_", " "))
            parts.append(f"{label} ×{count}")
        return ", ".join(parts)


def _redact_context(text: str, start: int, end: int, radius: int = 40) -> str:
    """Snippet around a match with the match itself replaced, so raw payload
    from a poisoned source is never persisted verbatim in findings."""
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    prefix = ("…" if left > 0 else "") + re.sub(r"\s+", " ", text[left:start]).strip()
    suffix = re.sub(r"\s+", " ", text[end:right]).strip() + ("…" if right < len(text) else "")
    snippet = f"{prefix}[filtered]{suffix}".strip()
    return snippet[:140]


def scan_source_text(text: str) -> ScanResult:
    """Scan parsed source text for prompt-injection patterns.

    Returns a ScanResult whose findings carry redacted snippets; safe to
    store as-is for UI display.
    """
    if not text:
        return ScanResult(severity="clean", score=0)

    score = 0
    findings: List[Dict] = []

    for pattern_id, category, regex, weight in _PATTERNS:
        matches = list(regex.finditer(text))[:5]  # cap: repetition shouldn't explode the score
        if not matches:
            continue
        score += weight * len(matches)
        findings.append({
            "pattern_id": pattern_id,
            "category": category,
            "count": len(matches),
            "snippet": _redact_context(text, matches[0].start(), matches[0].end()),
        })

    invisible_hits = len(_INVISIBLE_RE.findall(text))
    if invisible_hits:
        # Invisible characters are high-signal on their own: legitimate prose
        # essentially never contains them, but they're a classic way to hide
        # instructions from human review.
        score += 2 + min(invisible_hits, 10)
        findings.append({
            "pattern_id": "zero_width_chars",
            "category": "invisible_chars",
            "count": invisible_hits,
            "snippet": "[filtered]",
        })

    smuggle_comments = [
        m for m in _HTML_COMMENT_RE.finditer(text)
        if _COMMENT_SMUGGLE_WORD.search(m.group(0))
    ]
    if smuggle_comments:
        score += 3 * min(len(smuggle_comments), 3)
        findings.append({
            "pattern_id": "html_comment_smuggling",
            "category": "comment_smuggling",
            "count": len(smuggle_comments),
            "snippet": _redact_context(text, smuggle_comments[0].start(), smuggle_comments[0].end()),
        })

    if score >= BLOCK_THRESHOLD:
        severity = "high"
    elif score >= 3:
        severity = "medium"
    elif score >= FLAG_THRESHOLD:
        severity = "low"
    else:
        severity = "clean"

    return ScanResult(severity=severity, score=score, findings=findings)


def sanitize_source_text(text: str) -> Tuple[str, int]:
    """Neutralize injection vectors while preserving legitimate prose.

    Always applied before chunking/embedding for any non-clean scan result:

    - strips zero-width/invisible characters entirely,
    - drops HTML comments (never meant to render; classic smuggling channel),
    - blanks spans matched by the pattern catalog with ``[filtered]``.

    Returns ``(cleaned_text, removal_count)``.
    """
    if not text:
        return text, 0

    removals = 0

    def _blank(match: re.Match) -> str:
        nonlocal removals
        removals += 1
        return " [filtered] "

    removals += len(_INVISIBLE_RE.findall(text))
    cleaned = _INVISIBLE_RE.sub("", text)

    comment_matches = list(_HTML_COMMENT_RE.finditer(cleaned))
    if comment_matches:
        removals += len(comment_matches)
        cleaned = _HTML_COMMENT_RE.sub("", cleaned)

    for _pid, _category, regex, _weight in _PATTERNS:
        cleaned = regex.sub(_blank, cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)

    return cleaned.strip(), removals


def ui_finding_categories(findings_json: List[Dict]) -> List[str]:
    """Distinct category labels for badges in the frontend/API consumers."""
    seen: List[str] = []
    for finding in findings_json or []:
        category = str(finding.get("category", ""))
        if category and category not in seen:
            seen.append(category)
    return seen


def escape_snippet_for_html(snippet: str) -> str:
    """Findings are rendered in HTML tooltips/pages; escape defensively."""
    return html.escape(snippet or "")
