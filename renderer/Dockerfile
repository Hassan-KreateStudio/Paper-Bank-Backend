FROM oven/bun:1

RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app/renderer

COPY renderer/package.json /app/renderer/package.json
RUN bun install
COPY renderer /app/renderer

ENV PORT=3010

CMD ["bun", "src/index.ts"]
