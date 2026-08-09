# ADR-0008: Adopt Go + Echo + PostgreSQL + React + Colly for MangaHub

**Date:** 2026-08-09
**Status:** Accepted

## Context

MangaHub needs multi-user auth, web scraping (HTML parsing from multiple manga
sites), image proxying with disk cache, and a modern reader frontend.

## Decision

- **Backend:** Go + Echo (consistent with Tugure/Setiya stack, strong concurrency
  for scraper goroutines and image streaming)
- **Scraper:** gocolly/colly (mature Go scraping framework, rate limiting built-in)
- **Database:** PostgreSQL (relational integrity for users→manga→chapters→library,
  JSONB for chapter page URLs)
- **Frontend:** React 19 + Vite + Tailwind CSS v4 (fast dev, mobile-first)
- **Image cache:** Local filesystem (simple, no external dependency)

## Alternatives considered

- **Node.js + Puppeteer** — heavier, browser overhead for scraping
- **Python + Scrapy** — excellent for scraping, but Go is preferred for backend
  consistency across projects
- **MongoDB** — less suitable for relational user/library model

## Consequences

- Single Go binary serves API + image proxy + static frontend
- Scraper runs as background goroutine, triggered via admin API
- PostgreSQL required (vs SQLite in EV Charge Tracker)
