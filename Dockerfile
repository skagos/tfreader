# FROM python:3.12-slim
FROM python:3.12-slim-bookworm


# build arguments
ARG AZTFEXPORT_VERSION=0.19.0   # aztfexport version
ARG TARGETARCH                  # cpu architecture

# Python runtime settings
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# install azure cli
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        unzip \
        gnupg \
        lsb-release \
        tar \
    && mkdir -p /etc/apt/keyrings \
    && curl -sLS https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /etc/apt/keyrings/microsoft.gpg \
    && AZ_REPO="$(lsb_release -cs)" \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ ${AZ_REPO} main" \
        > /etc/apt/sources.list.d/azure-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends azure-cli \
    && rm -rf /var/lib/apt/lists/*


# install aztfexport
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
        amd64) ARTIFACT="aztfexport_v${AZTFEXPORT_VERSION}_linux_amd64.zip" ;; \
        arm64) ARTIFACT="aztfexport_v${AZTFEXPORT_VERSION}_linux_arm64.zip" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    URL="https://github.com/Azure/aztfexport/releases/download/v${AZTFEXPORT_VERSION}/${ARTIFACT}"; \
    echo "Downloading $URL"; \
    curl -fL "$URL" -o /tmp/aztfexport.zip; \
    unzip /tmp/aztfexport.zip -d /tmp/aztfexport; \
    mv /tmp/aztfexport/aztfexport /usr/local/bin/aztfexport; \
    chmod +x /usr/local/bin/aztfexport; \
    rm -rf /tmp/aztfexport /tmp/aztfexport.zip


# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app app
COPY frontend frontend
COPY README.md .

# Create exports directory
RUN mkdir -p /app/exports

EXPOSE 8000

# Start FastAPI app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
