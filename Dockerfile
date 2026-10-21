# Hosted Stellis Health: the account gateway and one workspace process per account, data on a Fly volume.
FROM python:3.12-slim

RUN pip install --no-cache-dir uv==0.11.32

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Dependencies first, so code changes reuse this layer.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-install-project

COPY LICENSE NOTICE ./
COPY src ./src
RUN uv sync --locked

ENV PATH=/app/.venv/bin:$PATH
EXPOSE 8080

# Speech models download to $STELLIS_DATA_DIR/models on first start (about 500 MB).
CMD ["stellis", "serve", "--port", "8080"]
