# PRODUCT.md

**Status:** Approved baseline.

## Product vision

Satu tempat untuk membaca manga dari berbagai sumber. Aggregator yang crawling
konten dari situs manga publik, caching gambar di proxy server, dan menyajikan
pengalaman membaca modern (vertical scroll + page-by-page) dalam UI yang bersih
dan mobile-friendly.

## Problem statement

Pembaca manga tersebar di banyak situs dengan kualitas UI/UX yang bervariasi.
Sebagian besar penuh iklan, reader tidak nyaman di mobile, dan tidak ada cara
untuk melacak progres baca lintas sumber. MangaHub menyatukan semuanya dalam satu
interface yang konsisten dan modern.

## Target users

1. **Casual reader** — baca manga populer, tidak mau repot buka banyak situs
2. **Power user** — follow banyak judul dari berbagai sumber, tracking progress

## Core features (MVP)

| # | Feature | Detail |
|---|---|---|
| 1 | **Multi-user auth** | Register, login (JWT), profil user |
| 2 | **Source discovery** | Browse katalog manga dari multiple sources yang di-scrape |
| 3 | **Manga detail** | Judul, cover, deskripsi, daftar chapter |
| 4 | **Reader modern** | Vertical scroll (webtoon style) + toggle ke page-by-page mode |
| 5 | **Image proxy** | Cache gambar chapter di server, load dari source asli bila cache miss |
| 6 | **Library** | Bookmark manga, track progres baca (chapter terakhir dibaca) |
| 7 | **Search** | Cari manga berdasarkan judul |
| 8 | **Reading history** | Riwayat chapter yang sudah dibaca, resume dari halaman terakhir |
| 9 | **Public reading lists** | User bisa membuat dan membagikan reading list publik |
| 10 | **Admin source management** | CRUD manga sources (URL, parser config) — admin only |

## Out of scope (MVP)

- Download untuk offline reading
- Push notifications
- Komentar / diskusi per chapter
- Translation / OCR
- Manga upload (user-generated content)
- Dark mode toggle di reader (only global dark mode)

## Success metrics

- Reader load time < 2 detik per chapter (gambar ter-cache)
- Scrape freshness < 24 jam untuk manga populer
- Reader support: vertical scroll smooth di mobile, no layout shift

## Assumptions

- Situs manga publik yang di-scrape tidak memiliki API resmi
- Rate limiting diperlukan untuk tidak overload source server
- Image proxy menggunakan caching disk (file system) untuk efisiensi
- Multi-user: autentikasi JWT, tidak ada OAuth/SSO untuk MVP
