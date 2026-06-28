from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from rezzy.models import RestaurantConfig
from rezzy.schemas import DailyEventsContext, VenueEvent, WeatherHour
from rezzy.services.hours_service import HoursValidationService


LOCAL_TZ = ZoneInfo("America/New_York")
GRACE_HOURS = 2
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
    config = db.query(RestaurantConfig).first()
    window = get_operating_window(db, target_date)
    errors: list[str] = []

    if window.is_closed:
        return DailyEventsContext(
            date=target_date,
            window_start=window.starts_at,
            window_end=window.ends_at,
            is_closed=True,
            weather_location=config.weather_location if config else None,
        )

    weather: list[WeatherHour] = []
    location = config.weather_location if config else None
    if location:
        try:
            weather = fetch_hourly_weather(location, target_date, window)
        except Exception:
            errors.append("Hourly weather is temporarily unavailable.")
    else:
        errors.append("Set a weather location in Settings to show hourly weather.")

    events: list[VenueEvent] = []
    for label, fetcher in (
        ("Enmarket Arena events are temporarily unavailable.", fetch_enmarket_events),
        ("Savannah Civic events are temporarily unavailable.", fetch_savannah_civic_events),
    ):
        try:
            events.extend(event for event in fetcher() if window.contains(event.starts_at))
        except Exception:
            errors.append(label)

    events.sort(key=lambda event: event.starts_at)

    return DailyEventsContext(
        date=target_date,
        window_start=window.starts_at,
        window_end=window.ends_at,
        is_closed=False,
        weather_location=location,
        weather=weather,
        events=events,
        errors=errors,
    )


def get_operating_window(db: Session, target_date: date) -> OperatingWindow:
    open_time, close_time, is_closed = HoursValidationService.get_hours_for_date(
        db, target_date
    )
    if is_closed or open_time is None or close_time is None:
        return OperatingWindow(None, None, True)

    starts_at = datetime.combine(target_date, open_time, tzinfo=LOCAL_TZ) - timedelta(
        hours=GRACE_HOURS
    )
    ends_at = datetime.combine(target_date, close_time, tzinfo=LOCAL_TZ) + timedelta(
        hours=GRACE_HOURS
    )

    day_start = datetime.combine(target_date, time.min, tzinfo=LOCAL_TZ)
    day_end = datetime.combine(target_date, time.max, tzinfo=LOCAL_TZ)
    return OperatingWindow(max(starts_at, day_start), min(ends_at, day_end), False)


def fetch_enmarket_events() -> list[VenueEvent]:
    return parse_enmarket_ical(fetch_text(ENMARKET_ICAL_URL))


def fetch_savannah_civic_events() -> list[VenueEvent]:
    return parse_savannah_civic_html(fetch_text(SAVANNAH_CIVIC_URL))


def fetch_hourly_weather(
    location: str, target_date: date, window: OperatingWindow
) -> list[WeatherHour]:
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
            "start_date": target_date.isoformat(),
            "end_date": target_date.isoformat(),
        }
    )
    forecast = fetch_json(f"{OPEN_METEO_FORECAST_URL}?{forecast_params}")
    hourly = forecast.get("hourly") or {}
    times = hourly.get("time") or []

    weather: list[WeatherHour] = []
    for index, raw_time in enumerate(times):
        timestamp = datetime.fromisoformat(raw_time).replace(tzinfo=LOCAL_TZ)
        if not window.contains(timestamp):
            continue
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
