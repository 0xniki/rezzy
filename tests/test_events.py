from datetime import date, datetime
from zoneinfo import ZoneInfo

from rezzy.schemas import VenueEvent, WeatherHour
from rezzy.services import events_service


TZ = ZoneInfo("America/New_York")


def event_at(name: str, hour: int, minute: int = 0) -> VenueEvent:
    return VenueEvent(
        source="Test Venue",
        name=name,
        starts_at=datetime(2026, 7, 3, hour, minute, tzinfo=TZ),
    )


class TestDailyEventsContext:
    def test_operating_window_matches_operating_hours(self, client, full_setup):
        response = client.get("/events/daily-context?date=2026-07-03")

        assert response.status_code == 200
        data = response.json()
        assert data["window_start"] == "2026-07-03T11:00:00-04:00"
        assert data["window_end"] == "2026-07-03T22:00:00-04:00"

    def test_filters_events_to_operating_window(self, client, full_setup, monkeypatch):
        client.patch("/config", json={"weather_location": "Savannah, GA"})

        monkeypatch.setattr(events_service, "fetch_weather_range", lambda *_: [])
        monkeypatch.setattr(
            events_service,
            "fetch_enmarket_events",
            lambda: [
                event_at("Before open", 10, 59),
                event_at("At open", 11),
                event_at("At close", 22),
            ],
        )
        monkeypatch.setattr(
            events_service,
            "fetch_savannah_civic_events",
            lambda: [event_at("After close", 22, 1)],
        )

        response = client.get("/events/daily-context?date=2026-07-03")

        assert response.status_code == 200
        assert [event["name"] for event in response.json()["events"]] == [
            "At open",
            "At close",
        ]

    def test_weekly_context_filters_each_day(self, client, full_setup, monkeypatch):
        client.patch("/config", json={"weather_location": "Savannah, GA"})

        def fake_weather_range(location, start_date, end_date):
            return [
                WeatherHour(time=datetime(2026, 7, 3, 12, tzinfo=TZ)),
                WeatherHour(time=datetime(2026, 7, 4, 12, tzinfo=TZ)),
                WeatherHour(time=datetime(2026, 7, 4, 23, tzinfo=TZ)),  # past close
            ]

        fetch_calls = {"events": 0}

        def fake_enmarket():
            fetch_calls["events"] += 1
            return [
                event_at("Day one show", 19),
                VenueEvent(
                    source="Test Venue",
                    name="Day two show",
                    starts_at=datetime(2026, 7, 4, 20, tzinfo=TZ),
                ),
            ]

        monkeypatch.setattr(events_service, "fetch_weather_range", fake_weather_range)
        monkeypatch.setattr(events_service, "fetch_enmarket_events", fake_enmarket)
        monkeypatch.setattr(events_service, "fetch_savannah_civic_events", lambda: [])

        response = client.get("/events/weekly-context?start=2026-07-03&end=2026-07-04")

        assert response.status_code == 200
        days = response.json()
        assert [day["date"] for day in days] == ["2026-07-03", "2026-07-04"]
        assert [hour["time"] for hour in days[0]["weather"]] == [
            "2026-07-03T12:00:00-04:00"
        ]
        assert [hour["time"] for hour in days[1]["weather"]] == [
            "2026-07-04T12:00:00-04:00"
        ]
        assert [event["name"] for event in days[0]["events"]] == ["Day one show"]
        assert [event["name"] for event in days[1]["events"]] == ["Day two show"]
        # Events are fetched once for the whole range, not per day.
        assert fetch_calls["events"] == 1

    def test_closed_day_returns_empty_context(self, client, full_setup, monkeypatch):
        client.post(
            "/hours/special",
            json={"date": "2026-07-03", "is_closed": True},
        )
        monkeypatch.setattr(
            events_service,
            "fetch_enmarket_events",
            lambda: [event_at("Should not fetch", 12)],
        )

        response = client.get("/events/daily-context?date=2026-07-03")

        assert response.status_code == 200
        data = response.json()
        assert data["is_closed"] is True
        assert data["weather"] == []
        assert data["events"] == []

    def test_weather_location_handles_city_state_abbreviation(
        self, client, full_setup, monkeypatch
    ):
        client.patch("/config", json={"weather_location": "Savannah, GA"})

        def fake_geocode(location: str, count: int = 5):
            if location == "Savannah, GA":
                return []
            if location == "Savannah":
                return [
                    {
                        "name": "Savannah",
                        "country_code": "US",
                        "admin1": "Tennessee",
                        "latitude": 35.2248,
                        "longitude": -88.2492,
                    },
                    {
                        "name": "Savannah",
                        "country_code": "US",
                        "admin1": "Georgia",
                        "latitude": 32.08354,
                        "longitude": -81.09983,
                    },
                ]
            return []

        monkeypatch.setattr(events_service, "geocode_location", fake_geocode)
        monkeypatch.setattr(events_service, "fetch_json", lambda *_: {"hourly": {"time": []}})
        monkeypatch.setattr(events_service, "fetch_enmarket_events", lambda: [])
        monkeypatch.setattr(events_service, "fetch_savannah_civic_events", lambda: [])

        response = client.get("/events/daily-context?date=2026-07-03")

        assert response.status_code == 200
        assert "Hourly weather is temporarily unavailable." not in response.json()["errors"]


class TestEventParsing:
    def test_parse_enmarket_ical(self):
        content = """BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260703T190000
DTEND;TZID=America/New_York:20260703T210000
SUMMARY:Savannah Steel Vs. Greensboro Groove
URL:https://enmarketarena.com/event/test/
LOCATION:Enmarket Arena, Savannah, GA
END:VEVENT
END:VCALENDAR
"""

        events = events_service.parse_enmarket_ical(content)

        assert len(events) == 1
        assert events[0].name == "Savannah Steel Vs. Greensboro Groove"
        assert events[0].starts_at.isoformat() == "2026-07-03T19:00:00-04:00"
        assert events[0].venue == "Enmarket Arena"

    def test_parse_savannah_civic_wix_warmup_data(self):
        payload = {
            "nested": [
                {
                    "id": "abc",
                    "title": "The Princess Concert",
                    "slug": "the-princess-concert",
                    "location": {"name": "Johnny Mercer Theatre"},
                    "scheduling": {
                        "config": {
                            "startDate": "2026-07-09T19:30:00.000Z",
                            "endDate": "2026-07-09T23:30:00.000Z",
                            "timeZoneId": "America/New_York",
                        }
                    },
                }
            ]
        }
        html = (
            '<script type="application/json" id="wix-warmup-data">'
            f"{events_service.json.dumps(payload)}"
            "</script>"
        )

        events = events_service.parse_savannah_civic_html(html)

        assert len(events) == 1
        assert events[0].name == "The Princess Concert"
        assert events[0].starts_at.isoformat() == "2026-07-09T15:30:00-04:00"
        assert events[0].venue == "Johnny Mercer Theatre"

    def test_resolve_weather_location_prefers_state_abbreviation(self, monkeypatch):
        def fake_geocode(location: str, count: int = 5):
            if location == "Savannah, GA":
                return []
            return [
                {"name": "Savannah", "country_code": "US", "admin1": "Tennessee"},
                {"name": "Savannah", "country_code": "US", "admin1": "Georgia"},
            ]

        monkeypatch.setattr(events_service, "geocode_location", fake_geocode)

        assert events_service.resolve_weather_location("Savannah, GA")["admin1"] == "Georgia"
