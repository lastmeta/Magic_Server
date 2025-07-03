FROM oven/bun:latest

RUN apt-get update && apt-get install -y \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
    
WORKDIR /app/rvn_service

COPY package*.json ./
RUN bun install

COPY . .
RUN bun run build
RUN apt-get update && apt-get install -y curl

ENV NODE_TLS_REJECT_UNAUTHORIZED=0

EXPOSE 3437

CMD ["bun", "run", "start:prod"]
