"""Compute send times for auto-created issues from series cadence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo


def issue_send_times(
    start_date: str,
    send_time: str,
    tz_name: str,
    cadence: str,
    count: int,
    now: Optional[datetime] = None,
) -> List[datetime]:
    if count <= 0:
        return []
    tz = _zone(tz_name)
    first = _first_send(start_date, send_time, tz, now or datetime.now(tz))
    step = _cadence_step(cadence)
    return [first + step * index for index in range(count)]


def _cadence_step(cadence: str) -> timedelta:
    label = (cadence or "").lower()
    if "month" in label:
        return timedelta(days=30)
    if "biweek" in label or "bi-week" in label:
        return timedelta(days=14)
    if "week" in label:
        return timedelta(days=7)
    return timedelta(days=1)


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo((name or "UTC").strip() or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _first_send(start_date: str, send_time: str, tz: ZoneInfo, now: datetime) -> datetime:
    hour, minute = _parse_clock(send_time)
    day = _parse_day(start_date, now.astimezone(tz).date())
    first = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
    current = now.astimezone(tz)
    if first <= current:
        first += timedelta(days=1)
        first = first.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return first.astimezone(timezone.utc)


def _parse_clock(raw: str) -> tuple[int, int]:
    text = (raw or "09:00").strip()
    parts = text.replace(".", ":").split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return 9, 0
    return max(0, min(hour, 23)), max(0, min(minute, 59))


def _parse_day(start_date: str, fallback):
    text = (start_date or "").strip()[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return fallback
