# Delta-K Terminal — execution engine.
#
# The engine holds long-lived state: a SmartStream WebSocket, an in-memory tick
# store, and two always-on asyncio loops (risk guards + snapshot broadcast).
# It must run as a persistent process — a single container, not a serverless
# function.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Cache directory for the scrip master so restarts skip the 40 MB download.
RUN mkdir -p /app/.cache

# Railway (and most PaaS) inject the listen port at runtime; fall back to 8000
# for local `docker run`.
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import os,urllib.request,sys; p=os.environ.get('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{p}/api/health', timeout=4).status==200 else 1)"

# One worker only: the tick store, ledger and RRG state are per-process, so a
# second worker would run a second, divergent copy of the strategy. Scaling
# replicas would likewise run N divergent strategies — keep this at one.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
