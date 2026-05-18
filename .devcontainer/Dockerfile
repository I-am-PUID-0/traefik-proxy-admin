FROM node:22-bookworm

ARG TRAEFIK_VERSION=3.1.2

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    postgresql \
    postgresql-contrib \
    procps \
  && rm -rf /var/lib/apt/lists/*

RUN set -e; \
  arch="${TARGETARCH:-}"; \
  if [ -z "${arch}" ]; then \
    case "$(dpkg --print-architecture)" in \
      arm64) arch="arm64" ;; \
      amd64) arch="amd64" ;; \
      *) echo "Unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
  fi; \
  curl -fsSL "https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_${arch}.tar.gz" -o /tmp/traefik.tgz; \
  tar -xzf /tmp/traefik.tgz -C /usr/local/bin traefik; \
  rm /tmp/traefik.tgz

COPY start-services.sh /usr/local/bin/start-services.sh
RUN chmod +x /usr/local/bin/start-services.sh
