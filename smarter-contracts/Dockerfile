FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    curl iputils-ping jq git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY orchestrator.py /app/
COPY dashboard.html /app/
COPY static /app/static

RUN pip install --no-cache-dir fastapi uvicorn requests

EXPOSE 8043

CMD ["python", "orchestrator.py"]
