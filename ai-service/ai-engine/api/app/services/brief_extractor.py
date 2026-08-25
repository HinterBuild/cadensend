"""Extract a structured newsletter brief from messy creator input."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

from app.services.model_service import ModelService

logger = logging.getLogger(__name__)

_LEVELS = {"beginner", "intermediate", "advanced"}
_TONES = {"instructor", "newsletter", "briefing"}
_LENGTHS = {"5 min", "10 min", "15 min"}
_CADENCES = {"daily", "weekly", "biweekly", "monthly"}


class BriefExtractor:
    """Turn raw notes or transcripts into an editable Cadensend series brief."""

    def __init__(self, model_service: Optional[ModelService] = None):
        self.model_service = model_service or ModelService()

    async def extract(
        self,
        raw_text: str,
        source_type: str = "notes",
        preferred_level: Optional[str] = None,
        preferred_tone: Optional[str] = None,
        preferred_length: Optional[str] = None,
        preferred_cadence: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        text = (raw_text or "").strip()
        if len(text) < 20:
            raise ValueError("raw_text must be at least 20 characters")

        schema = {
            "topic": "string",
            "goal": "string",
            "level": "beginner|intermediate|advanced",
            "tone": "instructor|newsletter|briefing",
            "length": "5 min|10 min|15 min",
            "cadence": "daily|weekly|biweekly|monthly",
            "key_points": ["string"],
            "must_include": ["string"],
            "must_avoid": ["string"],
            "suggested_titles": ["string"],
            "suggested_series_outcome": "string",
            "ambiguities": ["string"],
            "confidence": 0.0,
        }
        messages = [
            {
                "role": "system",
                "content": (
                    "You extract a structured JSON newsletter brief from messy creator input. "
                    "Return only JSON. Do not invent specific facts, audience, schedule, or tone. "
                    "If something is unclear, put it in ambiguities instead of guessing. "
                    "Keep topic and goal concise and editorially useful."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Source type: {source_type or 'notes'}\n"
                    f"Preferred level: {preferred_level or 'unspecified'}\n"
                    f"Preferred tone: {preferred_tone or 'unspecified'}\n"
                    f"Preferred length: {preferred_length or 'unspecified'}\n"
                    f"Preferred cadence: {preferred_cadence or 'unspecified'}\n\n"
                    "Extract a clean newsletter brief from this input:\n"
                    f"{text}"
                ),
            },
        ]

        parsed = await self.model_service.generate_structured_output(
            messages,
            schema,
            model=model,
            max_retries=1,
            temperature=0.1,
            max_tokens=1600,
        )
        return self._normalize(parsed, text, preferred_level, preferred_tone, preferred_length, preferred_cadence)

    def _normalize(
        self,
        parsed: Dict[str, Any],
        raw_text: str,
        preferred_level: Optional[str],
        preferred_tone: Optional[str],
        preferred_length: Optional[str],
        preferred_cadence: Optional[str],
    ) -> Dict[str, Any]:
        topic = self._clean_text(parsed.get("topic"), 120)
        goal = self._clean_text(parsed.get("goal"), 500)

        level = self._normalize_choice(parsed.get("level"), _LEVELS, preferred_level or "beginner")
        tone = self._normalize_choice(parsed.get("tone"), _TONES, preferred_tone or "instructor")
        length = self._normalize_choice(parsed.get("length"), _LENGTHS, preferred_length or "10 min")
        cadence = self._normalize_choice(parsed.get("cadence"), _CADENCES, preferred_cadence or "weekly")

        key_points = self._clean_list(parsed.get("key_points"), 8, 180)
        must_include = self._clean_list(parsed.get("must_include"), 8, 180)
        must_avoid = self._clean_list(parsed.get("must_avoid"), 8, 180)
        suggested_titles = self._clean_list(parsed.get("suggested_titles"), 5, 120)
        ambiguities = self._clean_list(parsed.get("ambiguities"), 8, 180)
        suggested_series_outcome = self._clean_text(parsed.get("suggested_series_outcome"), 300)

        if not topic:
            topic = self._fallback_topic(raw_text)
            ambiguities.insert(0, "Topic was unclear; please confirm the extracted topic.")
        if not goal:
            goal = "Teach this topic clearly through a short email series."
            ambiguities.insert(0, "Goal was unclear; please refine the series outcome.")

        confidence = self._normalize_confidence(parsed.get("confidence"))
        if not parsed.get("level"):
            confidence = min(confidence, 0.72)
        if not parsed.get("goal"):
            confidence = min(confidence, 0.55)

        return {
            "topic": topic,
            "goal": goal,
            "level": level,
            "tone": tone,
            "length": length,
            "cadence": cadence,
            "key_points": key_points,
            "must_include": must_include,
            "must_avoid": must_avoid,
            "suggested_titles": suggested_titles,
            "suggested_series_outcome": suggested_series_outcome,
            "ambiguities": self._dedupe(ambiguities),
            "confidence": confidence,
            "source_type": (parsed.get("source_type") or "").strip() or "notes",
        }

    @staticmethod
    def _clean_text(value: Any, limit: int) -> str:
        if not isinstance(value, str):
            return ""
        return " ".join(value.split())[:limit].strip()

    @classmethod
    def _clean_list(cls, values: Any, limit: int, item_limit: int) -> List[str]:
        if not isinstance(values, list):
            return []
        out: List[str] = []
        for value in values:
            cleaned = cls._clean_text(value, item_limit)
            if cleaned:
                out.append(cleaned)
            if len(out) >= limit:
                break
        return cls._dedupe(out)

    @staticmethod
    def _dedupe(values: List[str]) -> List[str]:
        seen = set()
        out: List[str] = []
        for value in values:
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(value)
        return out

    @staticmethod
    def _normalize_choice(value: Any, allowed: set[str], fallback: str) -> str:
        if isinstance(value, str):
            normalized = " ".join(value.lower().replace("-", " ").split())
            for option in allowed:
                if normalized == option.lower():
                    return option
        return fallback

    @staticmethod
    def _normalize_confidence(value: Any) -> float:
        try:
            score = float(value)
        except (TypeError, ValueError):
            return 0.6
        return round(max(0.0, min(score, 1.0)), 2)

    @staticmethod
    def _fallback_topic(raw_text: str) -> str:
        head = " ".join(raw_text.split())[:80].strip(" -,:;.")
        return head or "Untitled newsletter topic"
