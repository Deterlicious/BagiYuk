FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    PADDLE_MODEL_HOME=/opt/paddle-models \
    OCR_CPU_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/download_models.py ./scripts/download_models.py
RUN python ./scripts/download_models.py

COPY app ./app
COPY scripts/smoke_inference.py ./scripts/smoke_inference.py
RUN python ./scripts/smoke_inference.py

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /service \
    && chmod -R a-w /opt/paddle-models
USER appuser

ENV HOME=/home/appuser \
    PADDLE_PDX_CACHE_HOME=/tmp/.paddlex \
    OCR_INFERENCE_TIMEOUT_SECONDS=75 \
    PORT=8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-access-log --no-server-header"]
