# Cloudflare Setup

Initial deployment goal:
- deploy the Worker without depending on D1, R2, Vectorize, or Hyperdrive yet
- verify `/ping` and `/health` publicly

Recommended next commands:
- `bun run dev`
- `bunx wrangler deploy`

After deploy, verify:
- `GET /ping`
- `GET /health`
- `GET /health/live`
- `GET /health/ready`

Add bindings later when the resources exist:
- `D1Database` for metadata
- `R2Bucket` for documents
- `VectorizeIndex` for semantic search
- `Hyperdrive` only if we move to external Postgres
