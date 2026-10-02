FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Version du code embarqué, lue par GET /health (champs build_sha / build_date).
# Constaté le 2026-10-01 : on ne pouvait pas savoir quel code tournait en ligne.
# Poser au build :  BUILD_SHA=$(git rev-parse --short HEAD) BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
#                   docker compose -f docker-compose.prod.yml build
# Placés APRÈS l'installation des dépendances : changer de commit ne relance pas
# le `pip install` (cache Docker conservé).
ARG BUILD_SHA=inconnue
ARG BUILD_DATE=inconnue
ENV BUILD_SHA=${BUILD_SHA} \
    BUILD_DATE=${BUILD_DATE}

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
