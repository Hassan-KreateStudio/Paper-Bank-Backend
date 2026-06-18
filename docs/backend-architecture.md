# Backend Architecture

PaperBank uses a single Hono backend deployed on Cloudflare Workers.

Core principles:
- one backend, many institutions
- every institution-owned record carries `institution_id`
- D1 stores structured metadata
- R2 stores uploaded paper files
- Vectorize stores semantic search vectors
- Workers AI powers embeddings and later chat-style responses
