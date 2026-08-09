# DESIGN.md

**Status:** Approved baseline.

## System overview

MangaHub adalah aplikasi web multi-user dengan backend Go yang menangani scraping
sumber manga, caching gambar via proxy, autentikasi JWT, dan REST API. Frontend
React SPA menyajikan UI discovery, library, dan reader modern.

## Architecture

```text
┌──────────────────────────────────────────────┐
│                  Frontend                     │
│  React + Vite + Tailwind (port 5175 dev)     │
│  Discover │ Library │ Reader │ Auth │ Profile │
└──────────────────┬───────────────────────────┘
                   │ REST API (/api/*)
                   ▼
┌──────────────────────────────────────────────┐
│                  Backend                      │
│  Go + Echo (port 8200)                        │
│                                               │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐ │
│  │  Auth    │ │ Scraper  │ │ Image Proxy   │ │
│  │  (JWT)   │ │ Engine   │ │ (disk cache)  │ │
│  └─────────┘ └──────────┘ └───────────────┘ │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ Manga   │ │ Library  │ │ Reading       │ │
│  │ CRUD    │ │ + Lists  │ │ History       │ │
│  └─────────┘ └──────────┘ └───────────────┘ │
└──────┬──────────────┬────────────────────────┘
       │              │
       ▼              ▼
┌────────────┐  ┌──────────────────┐
│ PostgreSQL │  │ Disk Cache       │
│ (port 5434)│  │ ./cache/images/  │
└────────────┘  └──────────────────┘
```

## Data model

### `users`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| username | VARCHAR(50) UNIQUE | |
| email | VARCHAR(255) UNIQUE | |
| password_hash | TEXT | bcrypt |
| role | VARCHAR(20) | 'user' \| 'admin' |
| avatar_url | TEXT nullable | |
| created_at | TIMESTAMPTZ | |

### `sources`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(100) | e.g. "MangaKita" |
| base_url | TEXT | Root URL untuk scrape |
| parser_type | VARCHAR(50) | 'mangakita' \| 'generic' |
| is_active | BOOLEAN | Admin toggle |
| created_at | TIMESTAMPTZ | |

### `mangas`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| source_id | UUID FK → sources | |
| title | TEXT | |
| slug | TEXT | URL-friendly identifier |
| cover_url | TEXT | Proxied via /api/proxy/img |
| description | TEXT nullable | |
| status | VARCHAR(20) | 'ongoing' \| 'completed' |
| author | TEXT nullable | |
| artist | TEXT nullable | |
| genres | TEXT[] | Array of genre tags |
| last_scraped_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### `chapters`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| manga_id | UUID FK → mangas | |
| chapter_number | REAL | |
| title | TEXT nullable | |
| pages_json | JSONB | Array of image URLs (source URLs) |
| created_at | TIMESTAMPTZ | |

### `library_entries`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| manga_id | UUID FK → mangas | |
| status | VARCHAR(20) | 'reading' \| 'completed' \| 'plan_to_read' \| 'dropped' |
| last_chapter_read | REAL nullable | |
| UNIQUE(user_id, manga_id) | | |

### `reading_history`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| chapter_id | UUID FK → chapters | |
| page_index | INTEGER | Last page read (0-indexed) |
| read_mode | VARCHAR(10) | 'vertical' \| 'paged' |
| updated_at | TIMESTAMPTZ | |
| UNIQUE(user_id, chapter_id) | | |

### `reading_lists`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | |
| name | VARCHAR(100) | |
| slug | TEXT | |
| is_public | BOOLEAN | |
| description | TEXT nullable | |
| created_at | TIMESTAMPTZ | |

### `reading_list_items`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| list_id | UUID FK → reading_lists | |
| manga_id | UUID FK → mangas | |
| added_at | TIMESTAMPTZ | |

## REST API endpoints

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | Public | Register user baru |
| POST | /api/auth/login | Public | Login, return JWT |
| GET | /api/auth/me | JWT | Get current user profile |

### Manga

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/mangas | Public | Browse/search manga (?q=&genre=&status=&page=&limit=) |
| GET | /api/mangas/:slug | Public | Manga detail + chapters list |
| GET | /api/mangas/:slug/chapters/:num | JWT | Chapter pages (triggers history tracking) |

### Reader

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/proxy/img | Public | Image proxy — ?url= → cached/streamed image |
| POST | /api/reader/progress | JWT | Save reading progress |
| GET | /api/reader/progress/:mangaSlug | JWT | Get last reading position |

### Library

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/library | JWT | User's library |
| POST | /api/library | JWT | Add manga to library |
| PUT | /api/library/:mangaSlug | JWT | Update status / last chapter |
| DELETE | /api/library/:mangaSlug | JWT | Remove from library |

### Reading Lists

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/lists | Public | Browse public lists |
| GET | /api/lists/:slug | Public | View a public list |
| POST | /api/lists | JWT | Create reading list |
| POST | /api/lists/:slug/items | JWT | Add manga to list |
| DELETE | /api/lists/:slug/items/:mangaSlug | JWT | Remove from list |

### Admin (admin role only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/admin/sources | Admin | List all sources |
| POST | /api/admin/sources | Admin | Add source |
| PUT | /api/admin/sources/:id | Admin | Update source |
| DELETE | /api/admin/sources/:id | Admin | Deactivate source |
| POST | /api/admin/scrape/:sourceId | Admin | Trigger manual scrape |

## Scraper engine

Menggunakan `gocolly/colly` (Go scraping framework):
- Setiap source memiliki `parser_type` yang menentukan CSS selectors
- Scraper berjalan async (background goroutine), tidak block API
- Rate limiting: 1 request/second per source, respectful crawling
- Images tidak di-download saat scrape — hanya URL yang disimpan, di-proxy on-demand

## Image proxy

- Endpoint `/api/proxy/img?url=<encoded-source-url>`
- Cek disk cache → jika ada, serve dari cache
- Cache miss → fetch dari source, stream to client, save to disk cache
- Cache key: SHA256(source_url) → file path `./cache/images/ab/cd/<hash>.webp`
- Cache tidak di-invalidasi otomatis (manual admin purge)

## Acceptance criteria

1. User dapat register dan login, mendapat JWT token
2. Admin dapat menambah source manga (URL + parser type)
3. Admin dapat trigger scrape → manga + chapters tersimpan di DB
4. User dapat browse katalog manga di halaman Discover
5. User dapat search manga berdasarkan judul
6. User dapat melihat detail manga + daftar chapter
7. Reader menampilkan halaman chapter dengan vertical scroll yang smooth
8. Reader dapat toggle ke page-by-page mode
9. Image proxy melayani gambar dari cache atau source asli
10. User dapat menambahkan manga ke library
11. User dapat track progres baca (chapter terakhir + halaman terakhir)
12. User dapat membuat reading list publik
13. Reading list publik dapat dilihat oleh user lain
14. Mobile-responsive di semua halaman
15. Admin-only endpoints ditolak untuk user biasa (403)

## Security considerations

- JWT dengan expiry 24 jam, refresh via re-login
- Password di-hash dengan bcrypt (cost 10)
- Image proxy hanya menerima URL dari sources yang terdaftar (no SSRF)
- Scraper memiliki rate limiting per source
- CORS di-enable untuk development only
- SQL injection prevention via parameterized queries
