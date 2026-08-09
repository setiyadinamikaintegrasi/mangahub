# ARCHITECTURE.md

**Status:** Approved baseline — MangaHub.

## System boundaries

MangaHub is a multi-user manga aggregator + reader. Backend (Go + Echo) serves
REST API, scraper engine, and image proxy. Frontend (React SPA) provides
discovery, library, and reader UX. PostgreSQL stores metadata; disk cache
stores proxied images.

## Components

| Component | Technology | Port | Responsibility |
|---|---|---|---|
| Backend API | Go + Echo | 8200 | REST API, JWT auth, image proxy |
| Scraper Engine | gocolly/colly | — (background) | Crawl manga sources, parse metadata |
| Frontend SPA | React + Vite + Tailwind | 5175 (dev) | UI: discover, library, reader |
| Database | PostgreSQL | 5434 | Users, mangas, chapters, library |
| Image Cache | Local disk | — | ./cache/images/ |

## Key design decisions

See `docs/adr/0008-adopt-go-echo-pg-react-colly-for-mangahub.md` for rationale.

## Topology

```text
User Browser ──→ Frontend (React SPA)
                      │
                      ▼
               Backend (Go :8200)
                ├── Auth (JWT)
                ├── Manga CRUD
                ├── Scraper (colly)
                ├── Image Proxy (disk cache)
                └── Library / Lists
                      │
                      ├── PostgreSQL (:5434)
                      └── Disk Cache (./cache/)
```

## Security boundaries

- JWT auth for user-specific endpoints
- Admin role for source management
- Image proxy rejects URLs not from registered sources (SSRF prevention)
- Scraper rate-limited per source (1 req/sec)
