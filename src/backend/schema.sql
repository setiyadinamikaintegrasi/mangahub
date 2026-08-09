-- MangaHub schema — idempotent
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'user',
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    base_url    TEXT NOT NULL,
    parser_type VARCHAR(50) NOT NULL DEFAULT 'generic',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mangas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    cover_url       TEXT,
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'ongoing',
    author          TEXT,
    artist          TEXT,
    genres          TEXT[] NOT NULL DEFAULT '{}',
    last_scraped_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mangas_title ON mangas(title);
CREATE INDEX IF NOT EXISTS idx_mangas_slug ON mangas(slug);
CREATE INDEX IF NOT EXISTS idx_mangas_status ON mangas(status);
CREATE INDEX IF NOT EXISTS idx_mangas_genres ON mangas USING gin(genres);

CREATE TABLE IF NOT EXISTS chapters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manga_id      UUID NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
    chapter_number REAL NOT NULL,
    title         TEXT,
    pages_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(manga_id, chapter_number)
);
CREATE INDEX IF NOT EXISTS idx_chapters_manga ON chapters(manga_id);

CREATE TABLE IF NOT EXISTS library_entries (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    manga_id          UUID NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
    status            VARCHAR(20) NOT NULL DEFAULT 'reading',
    last_chapter_read REAL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, manga_id)
);

CREATE TABLE IF NOT EXISTS reading_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chapter_id  UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_index  INTEGER NOT NULL DEFAULT 0,
    read_mode   VARCHAR(10) NOT NULL DEFAULT 'vertical',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS reading_lists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    is_public   BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_list_items (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id   UUID NOT NULL REFERENCES reading_lists(id) ON DELETE CASCADE,
    manga_id  UUID NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
    added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(list_id, manga_id)
);
