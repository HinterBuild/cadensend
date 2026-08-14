"""Tests for auto-issue send times."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.issue_schedule import issue_send_times


def test_daily_cadence_spaces_issues_one_day():
    now = datetime(2026, 8, 14, 8, 0, tzinfo=ZoneInfo("UTC"))
    times = issue_send_times("2026-08-15", "14:00", "UTC", "daily", 3, now=now)
    assert len(times) == 3
    assert (times[1] - times[0]).days == 1
    assert times[0].hour == 14


def test_weekly_cadence_spaces_issues_seven_days():
    now = datetime(2026, 8, 14, 8, 0, tzinfo=ZoneInfo("UTC"))
    times = issue_send_times("2026-08-15", "09:00", "UTC", "weekly", 2, now=now)
    assert (times[1] - times[0]).days == 7


def test_past_start_rolls_to_next_day():
    now = datetime(2026, 8, 15, 16, 0, tzinfo=ZoneInfo("UTC"))
    times = issue_send_times("2026-08-15", "14:00", "UTC", "daily", 1, now=now)
    assert times[0].day == 16
