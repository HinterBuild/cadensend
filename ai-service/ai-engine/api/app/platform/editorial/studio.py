"""Studio composition engine — full issue preview, sections, and editorial tooling."""

from __future__ import annotations

import html
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

WORD_RE = re.compile(r"\b[\w']+\b")
SENTENCE_RE = re.compile(r"[.!?]+")

PROMPT_BLOCKS: Dict[str, List[Dict[str, str]]] = {
    "intro": [
        {"id": "hook_question", "label": "Question hook", "template": "Have you noticed how {topic} is changing faster than last quarter?"},
        {"id": "hook_stat", "label": "Stat hook", "template": "Teams tracking {topic} report measurable shifts this month."},
        {"id": "hook_story", "label": "Story hook", "template": "Last week, a reader asked us the hardest question about {topic}."},
    ],
    "transition": [
        {"id": "bridge", "label": "Bridge", "template": "That context sets up three signals worth your attention."},
        {"id": "pivot", "label": "Pivot", "template": "With that backdrop, here is what changed."},
        {"id": "contrast", "label": "Contrast", "template": "The headline is clear — the nuance is where value lives."},
    ],
    "cta": [
        {"id": "soft_cta", "label": "Soft CTA", "template": "Reply with what you are testing — we read every note."},
        {"id": "direct_cta", "label": "Direct CTA", "template": "Book 15 minutes this week to walk through your {topic} plan."},
        {"id": "resource_cta", "label": "Resource CTA", "template": "Download the checklist and share it with your team."},
    ],
}

PERSONAS: List[Dict[str, str]] = [
    {"id": "executive", "label": "Executive", "hint": "Decisive, outcome-focused, minimal jargon."},
    {"id": "practitioner", "label": "Practitioner", "hint": "Tactical, example-rich, implementation-minded."},
    {"id": "analyst", "label": "Analyst", "hint": "Evidence-led, caveats, comparative framing."},
    {"id": "community", "label": "Community member", "hint": "Conversational, inclusive, question-driven."},
]

BRAND_VOICES: List[Dict[str, str]] = [
    {"id": "default", "label": "Balanced", "overlay": ""},
    {"id": "confident", "label": "Confident", "overlay": "Use assertive, concise sentences. Avoid hedging."},
    {"id": "warm", "label": "Warm", "overlay": "Write with empathy and encouragement. Use 'we' and 'you'."},
    {"id": "technical", "label": "Technical", "overlay": "Prefer precise terminology and concrete specifics."},
]

DEFAULT_BANNED = ["synergy", "leverage", "disrupt", "game-changer", "best-in-class"]
DEFAULT_PREFERRED = {"newsletter": "briefing", "users": "readers", "leverage": "use"}

EMOJI_PRESETS: Dict[str, str] = {
    "none": "",
    "minimal": "Use at most one emoji in the subject line.",
    "friendly": "Use light emoji in headings for warmth (max 3).",
    "expressive": "Emoji allowed in subject, headings, and CTA.",
}

COMPARE_MODELS = [
    "poolside/laguna-s-2.1:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
]


def _syllables(word: str) -> int:
    w = word.lower().strip(".,!?;:'\"")
    if len(w) <= 3:
        return 1
    w = re.sub(r"e$", "", w)
    groups = re.findall(r"[aeiouy]+", w)
    return max(1, len(groups))


def flesch_kincaid_grade(text: str) -> Dict[str, Any]:
    words = WORD_RE.findall(text)
    if not words:
        return {"grade": 0, "label": "N/A", "words": 0, "sentences": 0}
    sentences = max(1, len(SENTENCE_RE.findall(text)) or 1)
    syllables = sum(_syllables(w) for w in words)
    grade = 0.39 * (len(words) / sentences) + 11.8 * (syllables / len(words)) - 15.59
    grade = round(max(0, grade), 1)
    if grade <= 8:
        label = "General audience"
    elif grade <= 12:
        label = "Professional"
    else:
        label = "Advanced / academic"
    return {"grade": grade, "label": label, "words": len(words), "sentences": sentences}


def _tone_instruction(tone: float) -> str:
    if tone < 0.33:
        return "formal and authoritative"
    if tone > 0.66:
        return "conversational and approachable"
    return "balanced and professional"


def _section_body(
    section_id: str,
    title: str,
    topic: str,
    goal: str,
    tone: float,
    word_target: int,
    persona: str,
    block_snippet: str = "",
) -> str:
    tone_word = _tone_instruction(tone)
    persona_hint = next((p["hint"] for p in PERSONAS if p["id"] == persona), "")
    lead = block_snippet.strip() or f"Here is the latest on {topic}."
    body = (
        f"{lead}\n\n"
        f"This section covers **{title.replace('_', ' ')}** for readers who want to {goal.lower()}. "
        f"Write in a {tone_word} voice. {persona_hint} "
        f"Target roughly {word_target} words with one concrete example and one actionable takeaway."
    )
    return body.strip()


def _apply_brand_voice(text: str, voice_id: str) -> str:
    voice = next((v for v in BRAND_VOICES if v["id"] == voice_id), None)
    if not voice or not voice.get("overlay"):
        return text
    return f"{text}\n\n<!-- brand voice: {voice['overlay']} -->"


def _markdown_to_html(md: str) -> str:
    out = html.escape(md)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"\*(.+?)\*", r"<em>\1</em>", out)
    out = re.sub(r"^### (.+)$", r"<h3>\1</h3>", out, flags=re.M)
    out = re.sub(r"^## (.+)$", r"<h2>\1</h2>", out, flags=re.M)
    out = re.sub(r"^# (.+)$", r"<h1>\1</h1>", out, flags=re.M)
    paragraphs = [f"<p>{p.strip()}</p>" for p in out.split("\n\n") if p.strip()]
    return "\n".join(paragraphs)


def _analyze_editorial(
    text: str,
    banned: List[str],
    preferred: Dict[str, str],
) -> Dict[str, Any]:
    lower = text.lower()
    hits = [p for p in banned if p.lower() in lower]
    suggestions = [
        {"from": k, "to": v}
        for k, v in preferred.items()
        if k.lower() in lower and k.lower() != v.lower()
    ]
    return {
        "banned_phrases": hits,
        "terminology_suggestions": suggestions,
        "reading_level": flesch_kincaid_grade(text),
    }


class StudioComposeEngine:
    """Compose newsletter previews without persisting."""

    def list_prompt_blocks(self) -> Dict[str, List[Dict[str, str]]]:
        return PROMPT_BLOCKS

    def list_personas(self) -> List[Dict[str, str]]:
        return PERSONAS

    def list_brand_voices(self) -> List[Dict[str, str]]:
        return BRAND_VOICES

    async def _llm_snippet(self, prompt: str, model: Optional[str] = None, temperature: float = 0.7) -> Optional[str]:
        try:
            from app.services.model_service import ModelService

            if ModelService.__module__:
                svc = ModelService(model=model)
                return await svc.generate_response(
                    [{"role": "user", "content": prompt}],
                    model=model,
                    temperature=temperature,
                    max_tokens=800,
                )
        except Exception as exc:
            logger.info("Studio LLM fallback: %s", exc)
        return None

    async def compose(self, req: Dict[str, Any]) -> Dict[str, Any]:
        skill_id = req.get("skill_id", "daily_brief")
        topic = req.get("topic", "Industry update")
        goal = req.get("goal", "Inform readers")
        tone = float(req.get("tone", 0.5))
        persona = req.get("persona", "practitioner")
        brand_voice = req.get("brand_voice", "default")
        emoji_preset = req.get("emoji_preset", "minimal")
        word_target = int(req.get("word_target_per_section", 120))
        banned = req.get("banned_phrases") or DEFAULT_BANNED
        preferred = req.get("preferred_terms") or DEFAULT_PREFERRED
        outline: List[Dict[str, Any]] = req.get("outline") or []
        models: List[str] = req.get("compare_models") or COMPARE_MODELS[:2]
        use_llm = bool(req.get("use_llm", True))

        from app.platform.skills.registry import get_skill_registry

        skill = get_skill_registry().get(skill_id)
        sections_meta = (skill.metadata.get("sections") if skill else None) or [
            "intro",
            "body",
            "wrap",
        ]

        if not outline:
            outline = [{"id": s, "title": s, "order": i} for i, s in enumerate(sections_meta)]

        outline = sorted(outline, key=lambda x: x.get("order", 0))
        blocks: List[Dict[str, Any]] = []

        for item in outline:
            sid = item.get("id", "section")
            title = item.get("title", sid)
            snippet = ""
            if use_llm:
                prompt = (
                    f"Write one newsletter section ({word_target} words max). "
                    f"Topic: {topic}. Goal: {goal}. Section: {title}. "
                    f"Tone: {_tone_instruction(tone)}. Persona: {persona}. "
                    f"Return markdown only."
                )
                snippet = await self._llm_snippet(prompt) or ""
            text = _section_body(sid, title, topic, goal, tone, word_target, persona, snippet)
            text = _apply_brand_voice(text, brand_voice)
            blocks.append({"id": sid, "title": title, "type": "markdown", "text": text})

        full_markdown = "\n\n".join(f"## {b['title']}\n\n{b['text']}" for b in blocks)
        subject_data = await self.subject_lines(
            {"topic": topic, "goal": goal, "tone": tone, "emoji_preset": emoji_preset, "use_llm": use_llm}
        )
        preheader = await self.preheader({"topic": topic, "subject": subject_data["variants"][0]["text"]})
        hook = await self.hook_panel({"topic": topic, "goal": goal, "tone": tone, "use_llm": use_llm})
        closer = await self.closer_panel({"topic": topic, "goal": goal, "tone": tone, "use_llm": use_llm})
        comparisons = await self.compare_models(
            {"topic": topic, "goal": goal, "models": models, "use_llm": use_llm}
        )

        issue = {
            "subject": subject_data["variants"][0]["text"],
            "preheader": preheader["text"],
            "content_blocks": blocks,
            "skill_id": skill_id,
            "markdown": full_markdown,
        }
        analysis = _analyze_editorial(full_markdown, banned, preferred)

        return {
            "issue": issue,
            "subject_variants": subject_data["variants"],
            "preheader": preheader,
            "hook": hook,
            "closer": closer,
            "model_comparisons": comparisons,
            "prompt_blocks": PROMPT_BLOCKS,
            "analysis": analysis,
            "html": _markdown_to_html(full_markdown),
            "plain_text": re.sub(r"[#*>`]", "", full_markdown),
            "emoji_preset": emoji_preset,
            "system_overlay": get_skill_registry().build_prompt_overlay(
                skill_id, {"topic": topic, "goal": goal, "tone": tone, "persona": persona}
            ),
        }

    async def generate_section(self, req: Dict[str, Any]) -> Dict[str, Any]:
        section_id = req.get("section_id", "section")
        title = req.get("title", section_id)
        topic = req.get("topic", "")
        goal = req.get("goal", "")
        tone = float(req.get("tone", 0.5))
        persona = req.get("persona", "practitioner")
        word_target = int(req.get("word_target", 120))
        block_id = req.get("prompt_block_id")
        block_type = req.get("prompt_block_type", "intro")
        use_llm = bool(req.get("use_llm", True))

        snippet = ""
        if block_id:
            for block in PROMPT_BLOCKS.get(block_type, []):
                if block["id"] == block_id:
                    snippet = block["template"].format(topic=topic)
                    break

        if use_llm and not snippet:
            prompt = (
                f"Write a newsletter section '{title}' about {topic}. Goal: {goal}. "
                f"~{word_target} words. Tone: {_tone_instruction(tone)}."
            )
            llm = await self._llm_snippet(prompt)
            if llm:
                snippet = llm

        text = _section_body(section_id, title, topic, goal, tone, word_target, persona, snippet)
        return {
            "section_id": section_id,
            "title": title,
            "text": text,
            "analysis": _analyze_editorial(text, DEFAULT_BANNED, DEFAULT_PREFERRED),
        }

    async def subject_lines(self, req: Dict[str, Any]) -> Dict[str, Any]:
        topic = req.get("topic", "Update")
        tone = float(req.get("tone", 0.5))
        emoji = EMOJI_PRESETS.get(req.get("emoji_preset", "minimal"), "")
        prefix = "📬 " if "emoji" in emoji.lower() and "one" in emoji.lower() else ""
        variants = [
            {"id": "a", "label": "Direct", "text": f"{prefix}{topic}: what changed this week"},
            {"id": "b", "label": "Curiosity", "text": f"{prefix}The {topic} signal most teams miss"},
            {"id": "c", "label": "Benefit", "text": f"{prefix}Save time on {topic} — 5-minute read"},
        ]
        if req.get("use_llm"):
            llm = await self._llm_snippet(
                f"Write 3 email subject lines for '{topic}'. Tone: {_tone_instruction(tone)}. "
                "Return one per line, no numbering."
            )
            if llm:
                lines = [ln.strip("-• ").strip() for ln in llm.splitlines() if ln.strip()][:3]
                for i, line in enumerate(lines):
                    if i < len(variants):
                        variants[i]["text"] = line
        return {"variants": variants}

    async def preheader(self, req: Dict[str, Any]) -> Dict[str, Any]:
        topic = req.get("topic", "")
        subject = req.get("subject", "")
        text = f"A quick briefing on {topic} — complements: {subject}"[:140]
        return {"text": text, "length": len(text)}

    async def hook_panel(self, req: Dict[str, Any]) -> Dict[str, Any]:
        topic = req.get("topic", "")
        goal = req.get("goal", "")
        text = (
            f"**Opening hook:** Readers care about {topic} because it affects how they {goal.lower()}. "
            "Start with one sharp observation, then promise three takeaways."
        )
        if req.get("use_llm"):
            llm = await self._llm_snippet(f"Write a 2-sentence email opening hook about {topic}. Goal: {goal}.")
            if llm:
                text = llm
        return {"text": text, "panel": "hook"}

    async def closer_panel(self, req: Dict[str, Any]) -> Dict[str, Any]:
        topic = req.get("topic", "")
        text = (
            f"**Closer:** If {topic} is on your roadmap, pick one action for this week and reply "
            "with what you chose — we feature reader implementations."
        )
        if req.get("use_llm"):
            llm = await self._llm_snippet(f"Write a closing paragraph with CTA for newsletter about {topic}.")
            if llm:
                text = llm
        return {"text": text, "panel": "closer"}

    async def compare_models(self, req: Dict[str, Any]) -> List[Dict[str, Any]]:
        topic = req.get("topic", "")
        goal = req.get("goal", "")
        models = req.get("models") or COMPARE_MODELS[:2]
        use_llm = bool(req.get("use_llm", True))
        results = []
        prompt = f"In 2 sentences, summarize a newsletter angle on {topic} for goal: {goal}."
        for model in models:
            draft = None
            if use_llm:
                draft = await self._llm_snippet(prompt, model=model, temperature=0.6)
            if not draft:
                draft = (
                    f"[{model.split('/')[0]}] {topic}: focus on practical next steps aligned with {goal}."
                )
            results.append({"model": model, "draft": draft})
        return results

    def analyze(self, req: Dict[str, Any]) -> Dict[str, Any]:
        text = req.get("text", "")
        banned = req.get("banned_phrases") or DEFAULT_BANNED
        preferred = req.get("preferred_terms") or DEFAULT_PREFERRED
        return _analyze_editorial(text, banned, preferred)


_engine: StudioComposeEngine | None = None


def get_studio_engine() -> StudioComposeEngine:
    global _engine
    if _engine is None:
        _engine = StudioComposeEngine()
    return _engine
