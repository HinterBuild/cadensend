"""Skill registry and prompt overlay for content-generation skills."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.platform.catalog import SKILLS, CatalogItem, get_catalog_item


class SkillRegistry:
    """Registry for all 20 content-generation skills."""

    def __init__(self) -> None:
        self._skills: Dict[str, CatalogItem] = {s.id: s for s in SKILLS}

    def list_skills(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "category": s.category,
                "sections": s.metadata.get("sections", []),
                "cadence": s.metadata.get("cadence"),
                "multi_issue": s.metadata.get("multi_issue", False),
            }
            for s in self._skills.values()
        ]

    def get(self, skill_id: str) -> Optional[CatalogItem]:
        return self._skills.get(skill_id) or get_catalog_item(skill_id)

    def build_prompt_overlay(self, skill_id: str, brief: Dict[str, Any] | None = None) -> str:
        """Return system-prompt overlay for the given skill."""
        skill = self.get(skill_id)
        if not skill:
            return ""
        brief = brief or {}
        sections = skill.metadata.get("sections", [])
        section_hint = ", ".join(sections) if sections else "standard sections"
        base_prompt = skill.metadata.get("prompt", skill.description)
        tone = skill.metadata.get("tone", brief.get("tone", "professional"))
        return f"""
SKILL MODE: {skill.name}
{base_prompt}
Required section flow: {section_hint}
Tone: {tone}
Format output as content_blocks matching the skill's section structure.
Each section should be a separate content_block with an appropriate title.
"""

    def apply_to_brief(self, skill_id: str, brief: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich a generation brief with skill metadata."""
        skill = self.get(skill_id)
        if not skill:
            return brief
        enriched = dict(brief)
        enriched["skill_id"] = skill_id
        enriched["skill_name"] = skill.name
        enriched["skill_sections"] = skill.metadata.get("sections", [])
        if skill.metadata.get("refresh_mode"):
            enriched["refresh_mode"] = "stale_content_refresh"
        return enriched


_registry: SkillRegistry | None = None


def get_skill_registry() -> SkillRegistry:
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
    return _registry
