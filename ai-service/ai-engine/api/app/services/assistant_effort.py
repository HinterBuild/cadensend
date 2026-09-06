"""Effort profiles for Cadensend AI chat — depth, tool budget, and reasoning."""

from __future__ import annotations

from typing import Any, Dict, Optional

EFFORT_LEVELS = ("low", "high", "very_high", "max")

EFFORT_PROFILES: Dict[str, Dict[str, Any]] = {
    "low": {
        "label": "Low",
        "description": "Fast answers with minimal tool use",
        "max_tokens": 1024,
        "temperature": 0.45,
        "max_tool_rounds": 3,
        "max_history": 20,
        "reasoning_effort": None,
        "system_hint": (
            "Effort: LOW. Be brief and direct. Use tools only when essential. "
            "Prefer one clear answer over exhaustive research."
        ),
    },
    "high": {
        "label": "High",
        "description": "Balanced depth for most workspace tasks",
        "max_tokens": 2048,
        "temperature": 0.35,
        "max_tool_rounds": 8,
        "max_history": 40,
        "reasoning_effort": "medium",
        "system_hint": (
            "Effort: HIGH. Look up workspace state with tools when helpful. "
            "Give complete but focused answers."
        ),
    },
    "very_high": {
        "label": "Very high",
        "description": "Thorough research, reviews, and multi-step edits",
        "max_tokens": 4096,
        "temperature": 0.3,
        "max_tool_rounds": 12,
        "max_history": 40,
        "reasoning_effort": "high",
        "system_hint": (
            "Effort: VERY HIGH. Investigate thoroughly with read tools before proposing changes. "
            "For issues, run evaluate_issue/analyze_issue when reviewing. Cross-check sources with search_sources."
        ),
    },
    "max": {
        "label": "Max",
        "description": "Maximum reasoning depth and tool rounds",
        "max_tokens": 8192,
        "temperature": 0.25,
        "max_tool_rounds": 16,
        "max_history": 40,
        "reasoning_effort": "high",
        "system_hint": (
            "Effort: MAX. Take your time. Use all relevant tools, verify assumptions, "
            "and produce the most complete plan or edit possible. Do not skip review steps."
        ),
    },
}


def normalize_effort(effort: Optional[str]) -> str:
    key = (effort or "high").strip().lower().replace("-", "_")
    if key in EFFORT_PROFILES:
        return key
    return "high"


def get_effort_profile(effort: Optional[str]) -> Dict[str, Any]:
    return EFFORT_PROFILES[normalize_effort(effort)]


def effort_model_kwargs(effort: Optional[str]) -> Dict[str, Any]:
    """OpenRouter-compatible reasoning kwargs when supported by the model."""
    profile = get_effort_profile(effort)
    reasoning = profile.get("reasoning_effort")
    if not reasoning:
        return {}
    return {"reasoning": {"effort": reasoning}}
