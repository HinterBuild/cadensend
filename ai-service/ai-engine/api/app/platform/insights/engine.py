"""Insight engine — computes all 20 insight types."""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.platform.catalog import INSIGHTS

FENCE_RE = re.compile(r"```[\s\S]*?```")
WORD_RE = re.compile(r"\b\w+\b")


def _words(text: str) -> int:
    return len(WORD_RE.findall(text or ""))


def _flesch_kincaid(text: str) -> float:
    sentences = max(1, len(re.findall(r"[.!?]+", text or "")))
    words = _words(text)
    syllables = max(words, sum(max(1, len(re.sub(r"[^aeiouy]", "", w.lower())) // 2) for w in WORD_RE.findall(text or "")))
    if words == 0:
        return 0.0
    return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)


class InsightEngine:
    """Computes workspace-level and series-level insights."""

    def list_types(self) -> List[Dict[str, Any]]:
        return [
            {"id": i.id, "name": i.name, "description": i.description, "category": i.category}
            for i in INSIGHTS
        ]

    def compute_all(self, workspace_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Run all 20 insight calculators against workspace snapshot data."""
        calculators = [
            self._topic_saturation,
            self._source_diversity,
            self._citation_reliability,
            self._freshness,
            self._tone_drift,
            self._readability,
            self._novelty,
            self._coverage_gap,
            self._audience_fatigue,
            self._cta_strength,
            self._engagement_delta,
            self._approval_bottleneck,
            self._generation_cost,
            self._model_quality,
            self._cadence_health,
            self._section_balance,
            self._narrative_flow,
            self._claim_risk,
            self._subscriber_signal,
            self._series_progress,
        ]
        results: List[Dict[str, Any]] = []
        for calc in calculators:
            try:
                item = calc(workspace_data)
                if item:
                    results.append(item)
            except Exception as exc:
                results.append({
                    "insight_type": calc.__name__.lstrip("_"),
                    "severity": "warning",
                    "title": "Computation error",
                    "detail": str(exc),
                    "score": None,
                    "payload": {},
                })
        return results

    def _topic_saturation(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        topics = [s.get("topic", "") for s in data.get("series", []) if s.get("topic")]
        if not topics:
            return None
        counts = Counter(topics)
        top, freq = counts.most_common(1)[0]
        ratio = freq / len(topics)
        severity = "warning" if ratio > 0.3 else "info"
        return {
            "insight_type": "topic_saturation",
            "severity": severity,
            "title": "Topic saturation",
            "detail": f"'{top}' appears in {freq} of {len(topics)} series ({ratio:.0%}).",
            "score": round(1 - ratio, 2),
            "payload": {"top_topic": top, "frequency": freq},
        }

    def _source_diversity(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        if not issues:
            return None
        diversities = []
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            source_ids = set()
            for block in content.get("content_blocks", []):
                for cite in block.get("citations", []):
                    if cite.get("source_id"):
                        source_ids.add(cite["source_id"])
            diversities.append(len(source_ids))
        avg = sum(diversities) / len(diversities) if diversities else 0
        severity = "warning" if avg < 2 else "info"
        return {
            "insight_type": "source_diversity",
            "severity": severity,
            "title": "Source diversity",
            "detail": f"Average {avg:.1f} unique sources per issue.",
            "score": min(1.0, avg / 5),
            "payload": {"avg_sources": round(avg, 2)},
        }

    def _citation_reliability(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        total_blocks = 0
        cited_blocks = 0
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            for block in content.get("content_blocks", []):
                total_blocks += 1
                if block.get("citations"):
                    cited_blocks += 1
        if total_blocks == 0:
            return None
        ratio = cited_blocks / total_blocks
        return {
            "insight_type": "citation_reliability",
            "severity": "warning" if ratio < 0.5 else "info",
            "title": "Citation reliability",
            "detail": f"{cited_blocks}/{total_blocks} sections have citations ({ratio:.0%}).",
            "score": round(ratio, 2),
            "payload": {"cited_blocks": cited_blocks, "total_blocks": total_blocks},
        }

    def _freshness(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        sources = data.get("sources", [])
        if not sources:
            return None
        now = datetime.now(timezone.utc)
        ages = []
        for src in sources:
            updated = src.get("updated_at") or src.get("created_at")
            if isinstance(updated, str):
                try:
                    dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                    ages.append((now - dt).days)
                except ValueError:
                    pass
        if not ages:
            return None
        avg_age = sum(ages) / len(ages)
        severity = "warning" if avg_age > 30 else "info"
        return {
            "insight_type": "freshness",
            "severity": severity,
            "title": "Source freshness",
            "detail": f"Average source age is {avg_age:.0f} days.",
            "score": max(0, 1 - avg_age / 90),
            "payload": {"avg_age_days": round(avg_age, 1)},
        }

    def _tone_drift(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = sorted(data.get("issues", []), key=lambda i: i.get("created_at", ""))
        if len(issues) < 3:
            return None
        recent = issues[-3:]
        lengths = []
        for issue in recent:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            text = " ".join(b.get("text", "") for b in content.get("content_blocks", []))
            lengths.append(_words(text))
        variance = max(lengths) - min(lengths) if lengths else 0
        return {
            "insight_type": "tone_drift",
            "severity": "info",
            "title": "Tone consistency",
            "detail": f"Recent issue length variance: {variance} words (proxy for voice drift).",
            "score": max(0, 1 - variance / 1000),
            "payload": {"length_variance": variance},
        }

    def _readability(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        scores = []
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            text = " ".join(b.get("text", "") for b in content.get("content_blocks", []))
            if text:
                scores.append(_flesch_kincaid(text))
        if not scores:
            return None
        avg = sum(scores) / len(scores)
        return {
            "insight_type": "readability",
            "severity": "info",
            "title": "Readability",
            "detail": f"Average Flesch-Kincaid score: {avg:.1f}.",
            "score": min(1.0, avg / 100),
            "payload": {"flesch_kincaid": round(avg, 1)},
        }

    def _novelty(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        if len(issues) < 2:
            return None
        texts = []
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            texts.append(" ".join(b.get("text", "")[:200] for b in content.get("content_blocks", [])))
        overlap = 0
        if len(texts) >= 2 and texts[-1] and texts[-2]:
            words_a = set(WORD_RE.findall(texts[-1].lower()))
            words_b = set(WORD_RE.findall(texts[-2].lower()))
            if words_a:
                overlap = len(words_a & words_b) / len(words_a)
        severity = "warning" if overlap > 0.4 else "info"
        return {
            "insight_type": "novelty",
            "severity": severity,
            "title": "Content novelty",
            "detail": f"Latest issue shares {overlap:.0%} vocabulary with the previous one.",
            "score": round(1 - overlap, 2),
            "payload": {"vocab_overlap": round(overlap, 2)},
        }

    def _coverage_gap(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        series_list = data.get("series", [])
        gaps = []
        for s in series_list:
            plan = s.get("plan_json") or {}
            if isinstance(plan, str):
                try:
                    plan = json.loads(plan)
                except json.JSONDecodeError:
                    plan = {}
            planned = len(plan.get("modules", []) or plan.get("outline", []))
            issued = sum(1 for i in data.get("issues", []) if i.get("series_id") == s.get("id") and i.get("status") == "sent")
            if planned > issued:
                gaps.append({"series_id": s.get("id"), "topic": s.get("topic"), "remaining": planned - issued})
        if not gaps:
            return {
                "insight_type": "coverage_gap",
                "severity": "info",
                "title": "Coverage gap",
                "detail": "All planned modules have been issued.",
                "score": 1.0,
                "payload": {"gaps": []},
            }
        return {
            "insight_type": "coverage_gap",
            "severity": "warning",
            "title": "Coverage gap",
            "detail": f"{len(gaps)} series have unissued modules.",
            "score": max(0, 1 - len(gaps) / max(1, len(series_list))),
            "payload": {"gaps": gaps[:5]},
        }

    def _audience_fatigue(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        long_issues = 0
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            text = " ".join(b.get("text", "") for b in content.get("content_blocks", []))
            if _words(text) > 1500:
                long_issues += 1
        severity = "warning" if long_issues > len(issues) * 0.3 else "info"
        return {
            "insight_type": "audience_fatigue",
            "severity": severity,
            "title": "Audience fatigue risk",
            "detail": f"{long_issues} issues exceed 1500 words.",
            "score": max(0, 1 - long_issues / max(1, len(issues))),
            "payload": {"long_issues": long_issues},
        }

    def _cta_strength(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        cta_patterns = re.compile(r"\b(click|sign up|register|try|learn more|get started|reply|book)\b", re.I)
        issues = data.get("issues", [])
        with_cta = 0
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            text = " ".join(b.get("text", "") for b in content.get("content_blocks", []))
            if cta_patterns.search(text):
                with_cta += 1
        ratio = with_cta / len(issues) if issues else 0
        return {
            "insight_type": "cta_strength",
            "severity": "warning" if ratio < 0.5 else "info",
            "title": "CTA strength",
            "detail": f"{with_cta}/{len(issues)} issues contain a clear call-to-action.",
            "score": round(ratio, 2),
            "payload": {"with_cta": with_cta},
        }

    def _engagement_delta(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        deliveries = data.get("deliveries", [])
        if len(deliveries) < 2:
            return None
        by_issue: Dict[str, int] = {}
        for d in deliveries:
            if d.get("status") == "delivered":
                by_issue[d.get("issue_id", "")] = by_issue.get(d.get("issue_id", ""), 0) + 1
        if len(by_issue) < 2:
            return None
        counts = sorted(by_issue.values())
        delta = counts[-1] - counts[0]
        return {
            "insight_type": "engagement_delta",
            "severity": "info",
            "title": "Engagement delta",
            "detail": f"Delivery spread between best and worst issue: {delta} recipients.",
            "score": None,
            "payload": {"delta": delta, "best": counts[-1], "worst": counts[0]},
        }

    def _approval_bottleneck(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        pending = sum(1 for i in issues if i.get("status") in ("generated", "pending_approval"))
        if not issues:
            return None
        ratio = pending / len(issues)
        severity = "warning" if ratio > 0.2 else "info"
        return {
            "insight_type": "approval_bottleneck",
            "severity": severity,
            "title": "Approval bottleneck",
            "detail": f"{pending} issues awaiting approval ({ratio:.0%} of total).",
            "score": round(1 - ratio, 2),
            "payload": {"pending": pending},
        }

    def _generation_cost(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        runs = data.get("generation_runs", [])
        if not runs:
            return None
        total_tokens = sum(
            (r.get("tokens_in") or 0) + (r.get("tokens_out") or 0) for r in runs
        )
        by_model: Dict[str, int] = {}
        for r in runs:
            model = r.get("model", "unknown")
            by_model[model] = by_model.get(model, 0) + (r.get("tokens_in") or 0) + (r.get("tokens_out") or 0)
        top_model = max(by_model, key=by_model.get) if by_model else "unknown"
        return {
            "insight_type": "generation_cost",
            "severity": "info",
            "title": "Generation cost",
            "detail": f"Total tokens: {total_tokens:,}. Highest: {top_model}.",
            "score": None,
            "payload": {"total_tokens": total_tokens, "by_model": by_model},
        }

    def _model_quality(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        runs = data.get("generation_runs", [])
        if not runs:
            return None
        by_model: Dict[str, List[str]] = {}
        for r in runs:
            model = r.get("model", "unknown")
            by_model.setdefault(model, []).append(r.get("status", ""))
        rates = {m: sum(1 for s in ss if s == "complete") / len(ss) for m, ss in by_model.items()}
        best = max(rates, key=rates.get) if rates else "unknown"
        return {
            "insight_type": "model_quality",
            "severity": "info",
            "title": "Model quality",
            "detail": f"Best success rate: {best} at {rates.get(best, 0):.0%}.",
            "score": rates.get(best, 0),
            "payload": {"success_rates": rates},
        }

    def _cadence_health(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        series_list = data.get("series", [])
        overdue = sum(1 for s in series_list if s.get("status") == "active")
        issues = data.get("issues", [])
        overdue_issues = sum(1 for i in issues if i.get("status") == "scheduled" and i.get("scheduled_at"))
        severity = "warning" if overdue_issues > 0 else "info"
        return {
            "insight_type": "cadence_health",
            "severity": severity,
            "title": "Cadence health",
            "detail": f"{overdue} active series, {overdue_issues} scheduled issues pending.",
            "score": max(0, 1 - overdue_issues / max(1, len(issues))),
            "payload": {"active_series": overdue, "scheduled_pending": overdue_issues},
        }

    def _section_balance(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        imbalanced = 0
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            blocks = content.get("content_blocks", [])
            if len(blocks) < 2:
                continue
            word_counts = [_words(b.get("text", "")) for b in blocks]
            if word_counts and max(word_counts) > 3 * (sum(word_counts) / len(word_counts)):
                imbalanced += 1
        severity = "warning" if imbalanced else "info"
        return {
            "insight_type": "section_balance",
            "severity": severity,
            "title": "Section balance",
            "detail": f"{imbalanced} issues have one bloated section.",
            "score": max(0, 1 - imbalanced / max(1, len(issues))),
            "payload": {"imbalanced_issues": imbalanced},
        }

    def _narrative_flow(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        issues = data.get("issues", [])
        weak_intros = 0
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            blocks = content.get("content_blocks", [])
            if blocks and _words(blocks[0].get("text", "")) < 30:
                weak_intros += 1
        severity = "warning" if weak_intros > len(issues) * 0.3 else "info"
        return {
            "insight_type": "narrative_flow",
            "severity": severity,
            "title": "Narrative flow",
            "detail": f"{weak_intros} issues have very short intros (<30 words).",
            "score": max(0, 1 - weak_intros / max(1, len(issues))),
            "payload": {"weak_intros": weak_intros},
        }

    def _claim_risk(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        risky_patterns = re.compile(r"\b(always|never|guaranteed|100%|best ever|revolutionary)\b", re.I)
        issues = data.get("issues", [])
        flagged = 0
        for issue in issues:
            content = issue.get("content_json") or {}
            if isinstance(content, str):
                try:
                    content = json.loads(content)
                except json.JSONDecodeError:
                    content = {}
            text = " ".join(b.get("text", "") for b in content.get("content_blocks", []))
            has_risky = bool(risky_patterns.search(text))
            has_citations = any(b.get("citations") for b in content.get("content_blocks", []))
            if has_risky and not has_citations:
                flagged += 1
        severity = "warning" if flagged else "info"
        return {
            "insight_type": "claim_risk",
            "severity": severity,
            "title": "Claim risk",
            "detail": f"{flagged} issues have strong claims without citations.",
            "score": max(0, 1 - flagged / max(1, len(issues))),
            "payload": {"flagged_issues": flagged},
        }

    def _subscriber_signal(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        events = data.get("provider_events", [])
        if not events:
            return {
                "insight_type": "subscriber_signal",
                "severity": "info",
                "title": "Subscriber signals",
                "detail": "No delivery events yet to analyze.",
                "score": None,
                "payload": {"themes": []},
            }
        themes = Counter(e.get("event_type", "unknown") for e in events)
        top = themes.most_common(3)
        return {
            "insight_type": "subscriber_signal",
            "severity": "info",
            "title": "Subscriber signals",
            "detail": f"Top events: {', '.join(f'{t} ({c})' for t, c in top)}.",
            "score": None,
            "payload": {"themes": dict(top)},
        }

    def _series_progress(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        series_list = data.get("series", [])
        multi = [s for s in series_list if s.get("skill_id") == "learning_course" or "course" in (s.get("goal") or "").lower()]
        if not multi:
            multi = series_list
        progress_items = []
        for s in multi:
            plan = s.get("plan_json") or {}
            if isinstance(plan, str):
                try:
                    plan = json.loads(plan)
                except json.JSONDecodeError:
                    plan = {}
            planned = len(plan.get("modules", []) or [])
            issued = sum(1 for i in data.get("issues", []) if i.get("series_id") == s.get("id"))
            if planned:
                progress_items.append({
                    "series_id": s.get("id"),
                    "topic": s.get("topic"),
                    "percent": round(issued / planned * 100, 1),
                })
        if not progress_items:
            return None
        avg = sum(p["percent"] for p in progress_items) / len(progress_items)
        return {
            "insight_type": "series_progress",
            "severity": "info",
            "title": "Series progress",
            "detail": f"Average curriculum completion: {avg:.0f}%.",
            "score": avg / 100,
            "payload": {"progress": progress_items[:5]},
        }


_engine: InsightEngine | None = None


def get_insight_engine() -> InsightEngine:
    global _engine
    if _engine is None:
        _engine = InsightEngine()
    return _engine
