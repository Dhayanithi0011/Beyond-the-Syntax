# Beyond The Syntax — code-execution microservice (sandbox orchestrator)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY runners/ .

EXPOSE 8100

CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8100"]