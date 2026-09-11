"""Editorial tools: evaluation harness, sandbox, plugins."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Sequence

from app.platform.editorial.studio import DEFAULT_BANNED

WORD_RE = re.compile(r"\b\w+\b")
CTA_RE = re.compile(r"\b(click|sign up|register|try|learn more|get started)\b", re.I)
RISKY_RE = re.compile(r"\b(always|never|guaranteed|100%)\b", re.I)


class EvaluationHarness:
    """Auto-check grounding, repetition, structure, and tone."""

    def evaluate(
        self,
        issue: Dict[str, Any],
        prior_issues: Optional[Sequence[Dict[str, Any]]] = None,
        banned_phrases: Optional[Sequence[str]] = None,
        require_grounding: bool = False,
    ) -> Dict[str, Any]:
        prior_issues = list(prior_issues or [])
        blocks = issue.get("content_blocks", [])
        text = " ".join(b.get("text", "") for b in blocks if isinstance(b, dict))
        words = len(WORD_RE.findall(text))
        lower = text.lower()

        cited_blocks = sum(1 for b in blocks if isinstance(b, dict) and b.get("citations"))
        grounding = cited_blocks / len(blocks) if blocks else 0.0

        overlap = 0.0
        if prior_issues and text:
            prior_text = " ".join(
                " ".join(b.get("text", "") for b in p.get("content_blocks", []) if isinstance(b, dict))
                for p in prior_issues[-2:]
            )
            words_a = set(WORD_RE.findall(lower))
            words_b = set(WORD_RE.findall(prior_text.lower()))
            if words_a:
                overlap = len(words_a & words_b) / len(words_a)

        banned = list(banned_phrases or DEFAULT_BANNED)
        banned_hits = sorted({phrase for phrase in banned if phrase and phrase.lower() in lower})

        has_structure = len(blocks) >= 2 and bool(str(issue.get("subject") or "").strip())
        has_cta = bool(CTA_RE.search(text))
        risky = bool(RISKY_RE.search(text)) and grounding < 0.3

        scores = {
            "grounding": round(grounding, 2),
            "novelty": round(1 - overlap, 2),
            "structure": 1.0 if has_structure else 0.0,
            "cta": 1.0 if has_cta else 0.0,
            "tone_safety": 0.0 if risky else 1.0,
            "editorial": 0.0 if banned_hits else 1.0,
        }
        overall = sum(scores.values()) / len(scores)
        grounding_ok = grounding >= 0.25 if require_grounding else True
        passed = overall >= 0.6 and not risky and not banned_hits and grounding_ok
        return {
            "passed": passed,
            "overall_score": round(overall, 2),
            "scores": scores,
            "word_count": words,
            "section_count": len(blocks),
            "banned_hits": banned_hits,
        }


class NewsletterSandbox:
    """Test prompts and tools without persisting."""

    def dry_run(self, skill_id: str, brief: Dict[str, Any], prompt: str = "") -> Dict[str, Any]:
        from app.platform.skills.registry import get_skill_registry

        registry = get_skill_registry()
        overlay = registry.build_prompt_overlay(skill_id, brief)
        return {
            "skill_id": skill_id,
            "brief": brief,
            "system_overlay": overlay,
            "user_prompt": prompt or f"Preview generation for: {brief.get('topic', 'untitled')}",
            "status": "preview",
        }


class PluginPackaging:
    """Plugin manifest validation for community modules."""

    REQUIRED_FIELDS = {"name", "version", "kind", "entry"}

    def validate_manifest(self, manifest: Dict[str, Any]) -> Dict[str, Any]:
        missing = self.REQUIRED_FIELDS - set(manifest.keys())
        if missing:
            return {"valid": False, "errors": [f"Missing fields: {', '.join(sorted(missing))}"]}
        kind = manifest.get("kind")
        if kind not in ("skill", "connector", "workflow", "insight"):
            return {"valid": False, "errors": [f"Invalid kind: {kind}"]}
        return {"valid": True, "manifest": manifest}


_harness: EvaluationHarness | None = None
_sandbox: NewsletterSandbox | None = None
_plugins: PluginPackaging | None = None


def get_evaluation_harness() -> EvaluationHarness:
    global _harness
    if _harness is None:
        _harness = EvaluationHarness()
    return _harness


def get_sandbox() -> NewsletterSandbox:
    global _sandbox
    if _sandbox is None:
        _sandbox = NewsletterSandbox()
    return _sandbox


def get_plugin_packaging() -> PluginPackaging:
    global _plugins
    if _plugins is None:
        _plugins = PluginPackaging()
    return _plugins
