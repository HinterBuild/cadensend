"""Content flow checks for generated and saved newsletter issues."""

from __future__ import annotations

import re
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

FenceMatch = re.compile(r"```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```", re.MULTILINE)
SegmentKind = Literal["prose", "code", "diagram", "table"]
Severity = Literal["error", "warning", "info"]


@dataclass(frozen=True)
class ContentCheck:
    id: str
    severity: Severity
    message: str
    suggestion: str = ""
    block_index: Optional[int] = None

    def as_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "id": self.id,
            "severity": self.severity,
            "message": self.message,
        }
        if self.suggestion:
            payload["suggestion"] = self.suggestion
        if self.block_index is not None:
            payload["block_index"] = self.block_index
        return payload


def _classify_fence(lang: str) -> SegmentKind:
    normalized = (lang or "").strip().lower()
    if normalized in {"mermaid", "d2"}:
        return "diagram"
    return "code"


def _is_table_block(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    return all(line.startswith("|") and "|" in line[1:] for line in lines)


def _parse_block_segments(text: str, block_index: int) -> List[Dict[str, Any]]:
    source = (text or "").replace("\r\n", "\n")
    if not source.strip():
        return []

    segments: List[Dict[str, Any]] = []
    last_index = 0
    for match in FenceMatch.finditer(source):
        prose = source[last_index : match.start()].strip()
        if prose:
            segments.append(
                {
                    "kind": "table" if _is_table_block(prose) else "prose",
                    "lang": "",
                    "prose_chars": len(prose),
                    "block_index": block_index,
                }
            )
        lang = match.group(1) or ""
        segments.append(
            {
                "kind": _classify_fence(lang),
                "lang": lang,
                "prose_chars": 0,
                "block_index": block_index,
            }
        )
        last_index = match.end()

    tail = source[last_index:].strip()
    if tail:
        segments.append(
            {
                "kind": "table" if _is_table_block(tail) else "prose",
                "lang": "",
                "prose_chars": len(tail),
                "block_index": block_index,
            }
        )
    if not segments and source.strip():
        segments.append(
            {"kind": "prose", "lang": "", "prose_chars": len(source.strip()), "block_index": block_index}
        )
    return segments


def _is_technical(kind: SegmentKind) -> bool:
    return kind in {"code", "diagram"}


def _push(checks: List[ContentCheck], seen: set[str], check: ContentCheck) -> None:
    key = f"{check.id}:{check.block_index if check.block_index is not None else 'all'}"
    if key in seen:
        return
    seen.add(key)
    checks.append(check)


def analyze_content_structure(issue: Dict[str, Any]) -> List[ContentCheck]:
    blocks = [block for block in (issue.get("content_blocks") or []) if isinstance(block, dict)]
    visuals = [
        spec
        for spec in (issue.get("visual_specs") or [])
        if isinstance(spec, dict) and str(spec.get("content") or "").strip()
    ]
    checks: List[ContentCheck] = []
    seen: set[str] = set()
    all_segments: List[Dict[str, Any]] = []

    for block_index, block in enumerate(blocks):
        segments = _parse_block_segments(str(block.get("text") or ""), block_index)
        all_segments.extend(segments)
        if not segments:
            continue

        first = segments[0]
        last = segments[-1]
        if _is_technical(first["kind"]):
            label = "diagram" if first["kind"] == "diagram" else "code block"
            _push(
                checks,
                seen,
                ContentCheck(
                    id="block_opens_with_technical",
                    severity="warning",
                    message=f"Block {block_index + 1} opens with a {label}.",
                    suggestion="Add a short intro sentence before diagrams and code so readers know why they matter.",
                    block_index=block_index,
                ),
            )
        if len(segments) > 1 and _is_technical(last["kind"]):
            label = "diagram" if last["kind"] == "diagram" else "code block"
            _push(
                checks,
                seen,
                ContentCheck(
                    id="block_ends_with_technical",
                    severity="warning",
                    message=f"Block {block_index + 1} ends with a {label}.",
                    suggestion="Follow technical sections with a takeaway sentence or transition.",
                    block_index=block_index,
                ),
            )

        for index in range(len(segments) - 1):
            current = segments[index]
            nxt = segments[index + 1]
            if current["kind"] == "diagram" and nxt["kind"] == "diagram":
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="consecutive_diagrams_in_block",
                        severity="error",
                        message=f"Block {block_index + 1} places two diagrams back-to-back.",
                        suggestion="Separate diagrams with prose that explains each step before showing the next one.",
                        block_index=block_index,
                    ),
                )
            if current["kind"] == "code" and nxt["kind"] == "code":
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="consecutive_code_in_block",
                        severity="warning",
                        message=f"Block {block_index + 1} stacks code blocks without explanation between them.",
                        suggestion="Explain what the first snippet does before showing another one.",
                        block_index=block_index,
                    ),
                )
            if nxt["kind"] == "diagram" and current["kind"] == "prose" and current["prose_chars"] < 48:
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="thin_context_before_diagram",
                        severity="warning",
                        message=f"Block {block_index + 1} has very little setup before a diagram.",
                        suggestion="Add a sentence or two describing what the reader should look for in the diagram.",
                        block_index=block_index,
                    ),
                )

        for segment in segments:
            if segment["kind"] == "code" and not str(segment.get("lang") or "").strip():
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="code_missing_language",
                        severity="info",
                        message=f"Block {block_index + 1} has a code fence without a language tag.",
                        suggestion="Use ```bash, ```python, ```yaml, etc. so email clients render it cleanly.",
                        block_index=block_index,
                    ),
                )

    if all_segments:
        if _is_technical(all_segments[0]["kind"]):
            _push(
                checks,
                seen,
                ContentCheck(
                    id="email_opens_with_technical",
                    severity="error",
                    message="The email opens with a diagram or code block before any introduction.",
                    suggestion="Start with a hook paragraph, then introduce visuals and snippets.",
                ),
            )
        if _is_technical(all_segments[-1]["kind"]):
            _push(
                checks,
                seen,
                ContentCheck(
                    id="email_ends_with_technical",
                    severity="warning",
                    message="The email ends on a diagram or code block.",
                    suggestion="Close with a summary, next step, or call to action after the last technical element.",
                ),
            )

        diagram_streak = 0
        code_streak = 0
        for segment in all_segments:
            kind = segment["kind"]
            if kind == "diagram":
                diagram_streak += 1
                code_streak = 0
            elif kind == "code":
                code_streak += 1
                diagram_streak = 0
            else:
                diagram_streak = 0
                code_streak = 0
            if diagram_streak >= 2:
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="consecutive_diagrams",
                        severity="error",
                        message="Multiple diagrams appear in a row across the email.",
                        suggestion="Alternate diagrams with explanatory prose so each one lands clearly.",
                        block_index=segment["block_index"],
                    ),
                )
                diagram_streak = 0
            if code_streak >= 3:
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="consecutive_code_blocks",
                        severity="warning",
                        message="Three or more code blocks appear back-to-back.",
                        suggestion="Break up long code sequences with commentary or partial snippets.",
                        block_index=segment["block_index"],
                    ),
                )
                code_streak = 0

    if len(blocks) > 1:
        for block_index, block in enumerate(blocks):
            text = str(block.get("text") or "")
            if "```" in text and not str(block.get("title") or "").strip():
                _push(
                    checks,
                    seen,
                    ContentCheck(
                        id="missing_block_title",
                        severity="info",
                        message=f"Block {block_index + 1} includes code or diagrams but has no title.",
                        suggestion="Add a block title so readers know what each section covers.",
                        block_index=block_index,
                    ),
                )

    inline_diagrams = any(segment["kind"] == "diagram" for segment in all_segments)
    if visuals and inline_diagrams:
        _push(
            checks,
            seen,
            ContentCheck(
                id="mixed_diagram_placement",
                severity="info",
                message="This issue uses both inline diagrams and detached visuals.",
                suggestion="Keep inline diagrams near the text they explain; reserve detached visuals for summary figures at the end.",
            ),
        )

    if visuals and blocks:
        last_index = len(blocks) - 1
        last_segments = _parse_block_segments(str(blocks[last_index].get("text") or ""), last_index)
        if last_segments and _is_technical(last_segments[-1]["kind"]):
            _push(
                checks,
                seen,
                ContentCheck(
                    id="detached_visual_after_technical_end",
                    severity="warning",
                    message="Detached visuals will render after a body that already ends on code or a diagram.",
                    suggestion="Add a short closing paragraph before detached visuals, or move the diagram inline.",
                    block_index=last_index,
                ),
            )

    return checks


def structure_issue_errors(checks: List[ContentCheck]) -> List[ContentCheck]:
    return [check for check in checks if check.severity == "error"]


def normalize_issue_content_order(issue: Dict[str, Any]) -> Dict[str, Any]:
    """Apply safe ordering fixes before persisting generated content."""
    normalized = deepcopy(issue)
    blocks = normalized.get("content_blocks") or []
    updated_blocks = []
    for block in blocks:
        if not isinstance(block, dict):
            updated_blocks.append(block)
            continue
        text = str(block.get("text") or "").lstrip()
        title = str(block.get("title") or "").strip()
        if title and text.startswith("```") and not text.startswith(f"## {title}"):
            text = f"## {title}\n\n{text}"
        updated_blocks.append({**block, "text": text})
    normalized["content_blocks"] = updated_blocks
    return normalized


def structure_feedback(checks: List[ContentCheck]) -> str:
    if not checks:
        return ""
    lines = ["Fix content flow issues before finalizing:"]
    for check in checks[:6]:
        lines.append(f"- {check.message} {check.suggestion}".strip())
    return "\n".join(lines)
