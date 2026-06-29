from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from rezzy.models import RestaurantConfig
from rezzy.schemas import DailyEventsContext, VenueEvent, WeatherHour
from rezzy.services.hours_service import HoursValidationService


LOCAL_TZ = ZoneInfo("America/New_York")
ENMARKET_ICAL_URL = "https://enmarketarena.com/events/list/?ical=1"
SAVANNAH_CIVIC_URL = "https://www.savannahcivic.com/events-1"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
US_STATE_NAMES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
}


@dataclass(frozen=True)
class OperatingWindow:
    starts_at: datetime | None
    ends_at: datetime | None
    is_closed: bool

    def contains(self, value: datetime) -> bool:
        if self.starts_at is None or self.ends_at is None:
            return False
        local_value = value.astimezone(LOCAL_TZ)
        return self.starts_at <= local_value <= self.ends_at


def get_daily_events_context(db: Session, target_date: date) -> DailyEventsContext:
    return get_weekly_events_context(db, target_date, target_date)[0]


def get_weekly_events_context(
    db: Session, start_date: date, end_date: date
) -> list[DailyEventsContext]:
    """Build daily contexts for an inclusive date range.

    Weather and venue events are fetched once for the whole range and then
    filtered per day, so loading a week costs the same external calls as a
    single day.
    """
    config = db.query(RestaurantConfig).first()
    location = config.weather_location if config else None

    all_events, event_errors = fetch_all_events()

    weather_hours: list[WeatherHour] = []
    weather_error: str | None = None
    if location:
        try:
            weather_hours = fetch_weather_range(location, start_date, end_date)
        except Exception:
            weather_error = "Hourly weather is temporarily unavailable."
    else:
        weather_error = "Set a weather location in Settings to show hourly weather."

    contexts: list[DailyEventsContext] = []
    day = start_date
    while day <= end_date:
        window = get_operating_window(db, day)
        if window.is_closed:
            contexts.append(
                DailyEventsContext(
                    date=day,
                    window_start=window.starts_at,
                    window_end=window.ends_at,
                    is_closed=True,
                    weather_location=location,
                )
            )
            day += timedelta(days=1)
            continue

        weather = [hour for hour in weather_hours if window.contains(hour.time)]
        events = sorted(
            (event for event in all_events if window.contains(event.starts_at)),
            key=lambda event: event.starts_at,
        )
        errors = list(event_errors)
        if weather_error:
            errors.append(weather_error)

        contexts.append(
            DailyEventsContext(
                date=day,
                window_start=window.starts_at,
                window_end=window.ends_at,
                is_closed=False,
                weather_location=location,
                weather=weather,
                events=events,
                errors=errors,
            )
        )
        day += timedelta(days=1)

    return contexts


def fetch_all_events() -> tuple[list[VenueEvent], list[str]]:
    events: list[VenueEvent] = []
    errors: list[str] = []
    for label, fetcher in (
        ("Enmarket Arena events are temporarily unavailable.", fetch_enmarket_events),
        ("Savannah Civic events are temporarily unavailable.", fetch_savannah_civic_events),
    ):
        try:
            events.extend(fetcher())
        except Exception:
            errors.append(label)
    return events, errors


def get_operating_window(db: Session, target_date: date) -> OperatingWindow:
    open_time, close_time, is_closed = HoursValidationService.get_hours_for_date(
        db, target_date
    )
    if is_closed or open_time is None or close_time is None:
        return OperatingWindow(None, None, True)

    starts_at = datetime.combine(target_date, open_time, tzinfo=LOCAL_TZ)
    ends_at = datetime.combine(target_date, close_time, tzinfo=LOCAL_TZ)
    return OperatingWindow(starts_at, ends_at, False)


def fetch_enmarket_events() -> list[VenueEvent]:
    return parse_enmarket_ical(fetch_text(ENMARKET_ICAL_URL))


def fetch_savannah_civic_events() -> list[VenueEvent]:
    return parse_savannah_civic_html(fetch_text(SAVANNAH_CIVIC_URL))


def fetch_weather_range(
    location: str, start_date: date, end_date: date
) -> list[WeatherHour]:
    """Fetch every hourly forecast entry across an inclusive date range."""
    place = resolve_weather_location(location)
    forecast_params = urlencode(
        {
            "latitude": place["latitude"],
            "longitude": place["longitude"],
            "hourly": ",".join(
                [
                    "temperature_2m",
                    "precipitation_probability",
                    "weather_code",
                    "wind_speed_10m",
                ]
            ),
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "timezone": "America/New_York",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }
    )
    forecast = fetch_json(f"{OPEN_METEO_FORECAST_URL}?{forecast_params}")
    hourly = forecast.get("hourly") or {}
    times = hourly.get("time") or []

    weather: list[WeatherHour] = []
    for index, raw_time in enumerate(times):
        timestamp = datetime.fromisoformat(raw_time).replace(tzinfo=LOCAL_TZ)
        code = get_index(hourly.get("weather_code"), index)
        weather.append(
            WeatherHour(
                time=timestamp,
                temperature_f=get_index(hourly.get("temperature_2m"), index),
                precipitation_probability=get_index(
                    hourly.get("precipitation_probability"), index
                ),
                wind_speed_mph=get_index(hourly.get("wind_speed_10m"), index),
                condition=weather_code_label(code),
            )
        )
    return weather


def resolve_weather_location(location: str) -> dict[str, Any]:
    candidates = geocode_location(location)
    preferred_state = state_name_from_location(location)
    if preferred_state:
        for candidate in candidates:
            if (
                candidate.get("country_code") == "US"
                and candidate.get("admin1") == preferred_state
            ):
                return candidate
    if candidates:
        return candidates[0]

    city = location.split(",", 1)[0].strip()
    if city and city != location.strip():
        candidates = geocode_location(city)
        if preferred_state:
            for candidate in candidates:
                if (
                    candidate.get("country_code") == "US"
                    and candidate.get("admin1") == preferred_state
                ):
                    return candidate
        if candidates:
            return candidates[0]

    raise ValueError("weather location not found")


def geocode_location(location: str, count: int = 5) -> list[dict[str, Any]]:
    params = urlencode(
        {"name": location, "count": count, "language": "en", "format": "json"}
    )
    geocode = fetch_json(f"{OPEN_METEO_GEOCODE_URL}?{params}")
    results = geocode.get("results") or []
    return results if isinstance(results, list) else []


def state_name_from_location(location: str) -> str | None:
    parts = [part.strip() for part in location.split(",")]
    if len(parts) < 2:
        return None
    state = re.sub(r"[^A-Za-z]", "", parts[1]).upper()
    return US_STATE_NAMES.get(state)


def parse_enmarket_ical(content: str) -> list[VenueEvent]:
    events: list[VenueEvent] = []
    for block in unfold_ical(content).split("BEGIN:VEVENT"):
        if "END:VEVENT" not in block:
            continue
        fields = parse_ical_block(block)
        start = parse_ical_datetime(fields.get("DTSTART"))
        if start is None:
            continue
        name = fields.get("SUMMARY")
        if not name:
            continue
        events.append(
            VenueEvent(
                source="Enmarket Arena",
                name=name,
                starts_at=start,
                ends_at=parse_ical_datetime(fields.get("DTEND")),
                venue=(fields.get("LOCATION") or "").split(",", 1)[0] or None,
                url=fields.get("URL"),
            )
        )
    return events


def parse_savannah_civic_html(content: str) -> list[VenueEvent]:
    match = re.search(
        r'<script[^>]+id="wix-warmup-data"[^>]*>(.*?)</script>',
        content,
        flags=re.DOTALL,
    )
    if not match:
        return []

    data = json.loads(html.unescape(match.group(1)))
    events: list[VenueEvent] = []
    seen: set[str] = set()
    for item in iter_dicts(data):
        scheduling = item.get("scheduling")
        config = scheduling.get("config") if isinstance(scheduling, dict) else None
        if not isinstance(config, dict):
            continue
        event_id = item.get("id")
        title = item.get("title")
        raw_start = config.get("startDate")
        if not isinstance(event_id, str) or not isinstance(title, str) or not raw_start:
            continue
        if event_id in seen:
            continue
        seen.add(event_id)

        tz = ZoneInfo(config.get("timeZoneId") or "America/New_York")
        starts_at = parse_iso_datetime(str(raw_start)).astimezone(tz)
        raw_end = config.get("endDate")
        ends_at = parse_iso_datetime(str(raw_end)).astimezone(tz) if raw_end else None
        location = item.get("location") if isinstance(item.get("location"), dict) else {}
        slug = item.get("slug")
        events.append(
            VenueEvent(
                source="Savannah Civic",
                name=title.strip(),
                starts_at=starts_at,
                ends_at=ends_at,
                venue=location.get("name") if isinstance(location, dict) else None,
                url=(
                    f"https://www.savannahcivic.com/event-details/{slug}"
                    if isinstance(slug, str)
                    else None
                ),
            )
        )
    return events


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Rezzy/0.1"})
    with urlopen(request, timeout=8) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_json(url: str) -> dict[str, Any]:
    return json.loads(fetch_text(url))


def unfold_ical(content: str) -> str:
    return re.sub(r"\r?\n[ \t]", "", content)


def parse_ical_block(block: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.split(";", 1)[0]
        fields[key] = unescape_ical(value)
    return fields


def parse_ical_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    tz = timezone.utc if raw.endswith("Z") else LOCAL_TZ
    raw = raw.rstrip("Z")
    date_format = "%Y%m%dT%H%M%S" if len(raw) == 15 else "%Y%m%dT%H%M"
    return datetime.strptime(raw, date_format).replace(tzinfo=tz).astimezone(LOCAL_TZ)


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def unescape_ical(value: str) -> str:
    return (
        value.replace(r"\n", "\n")
        .replace(r"\,", ",")
        .replace(r"\;", ";")
        .replace(r"\\", "\\")
        .strip()
    )


def iter_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from iter_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_dicts(child)


def get_index(values: Any, index: int):
    if not isinstance(values, list) or index >= len(values):
        return None
    return values[index]


def weather_code_label(code: Any) -> str | None:
    if code is None:
        return None
    labels = {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Rain showers",
        82: "Heavy showers",
        95: "Thunderstorm",
    }
    return labels.get(int(code), "Weather")
