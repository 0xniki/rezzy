FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /rezzy

COPY pyproject.toml .
RUN uv sync

COPY rezzy ./rezzy

CMD ["uv", "run", "app.main"]