package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lib/pq"

	"manga-hub/models"
	"manga-hub/scraper"
)

// Service is the main API surface for manga/library/lists/admin/reader.
type Service struct {
	db      *sql.DB
	scraper *scraper.Scraper
}

func New(db *sql.DB, sc *scraper.Scraper) *Service {
	return &Service{db: db, scraper: sc}
}

// RegisterRoutes wires all non-auth routes onto the given echo instance.
// authMW is applied to /api/* authenticated groups; adminMW additionally requires admin.
func (s *Service) RegisterRoutes(
	e *echo.Echo,
	apiGroup *echo.Group,
	authMW, adminMW echo.MiddlewareFunc,
) {
	// Manga (public)
	manga := apiGroup.Group("/mangas")
	manga.GET("", s.listMangas)
	manga.GET("/:slug", s.getManga)
	manga.GET("/:slug/chapters/:num", s.getMangaChapter, authMW)

	// Reader (progress = auth; img handled by imageproxy package)
	reader := apiGroup.Group("/reader", authMW)
	reader.POST("/progress", s.saveProgress)
	reader.GET("/progress/:mangaSlug", s.getProgress)

	// Library (auth)
	lib := apiGroup.Group("/library", authMW)
	lib.GET("", s.listLibrary)
	lib.POST("", s.addLibrary)
	lib.PUT("/:mangaSlug", s.updateLibrary)
	lib.DELETE("/:mangaSlug", s.deleteLibrary)

	// Reading lists (mixed public/auth)
	lists := apiGroup.Group("/lists")
	lists.GET("", s.listLists)
	lists.GET("/:slug", s.getList)
	lists.POST("", s.createList, authMW)
	lists.POST("/:slug/items", s.addListItem, authMW)
	lists.DELETE("/:slug/items/:mangaSlug", s.deleteListItem, authMW)

	// Admin (admin role required)
	admin := apiGroup.Group("/admin", authMW, adminMW)
	admin.GET("/sources", s.listSources)
	admin.POST("/sources", s.createSource)
	admin.PUT("/sources/:id", s.updateSource)
	admin.DELETE("/sources/:id", s.deleteSource)
	admin.POST("/scrape/:sourceId", s.triggerScrape)

	_ = e
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

func parseIntDefault(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if max > 0 && n > max {
		return max
	}
	return n
}

func pgErr(c echo.Context, where string, err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "not found"})
	}
	log.Printf("[handlers] %s: %v", where, err)
	return c.JSON(http.StatusInternalServerError, echo.Map{"error": "internal error"})
}

func scanManga(row interface{ Scan(...interface{}) error }) (*models.Manga, error) {
	m := &models.Manga{Genres: []string{}}
	var sourceID sql.NullString
	var coverURL, description, author, artist sql.NullString
	var lastScraped sql.NullTime
	var genresArr []string
	err := row.Scan(
		&m.ID, &sourceID, &m.Title, &m.Slug, &coverURL, &description,
		&m.Status, &author, &artist, pq.Array(&genresArr), &lastScraped, &m.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if sourceID.Valid {
		sid := sourceID.String
		m.SourceID = &sid
	}
	m.CoverURL = models.NullToPtr(coverURL)
	m.Description = models.NullToPtr(description)
	m.Author = models.NullToPtr(author)
	m.Artist = models.NullToPtr(artist)
	if genresArr != nil {
		m.Genres = genresArr
	}
	if lastScraped.Valid {
		t := lastScraped.Time
		m.LastScrapedAt = &t
	}
	return m, nil
}

// ----------------------------------------------------------------------------
// Manga endpoints
// ----------------------------------------------------------------------------

func (s *Service) listMangas(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	genre := strings.TrimSpace(c.QueryParam("genre"))
	status := strings.TrimSpace(c.QueryParam("status"))
	page := parseIntDefault(c.QueryParam("page"), 1, 1, 0)
	limit := parseIntDefault(c.QueryParam("limit"), 20, 1, 100)
	offset := (page - 1) * limit

	var (
		where  = []string{"1=1"}
		args   []interface{}
		argIdx = 1
	)
	if q != "" {
		where = append(where, fmt.Sprintf("(m.title ILIKE $%d OR m.description ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+q+"%")
		argIdx++
	}
	if genre != "" {
		where = append(where, fmt.Sprintf("$%d = ANY(m.genres)", argIdx))
		args = append(args, genre)
		argIdx++
	}
	if status != "" {
		where = append(where, fmt.Sprintf("m.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}
	whereSQL := strings.Join(where, " AND ")

	// Count
	var total int
	countQ := "SELECT COUNT(*) FROM mangas m WHERE " + whereSQL
	if err := s.db.QueryRowContext(c.Request().Context(), countQ, args...).Scan(&total); err != nil {
		return pgErr(c, "listMangas count", err)
	}

	// Page
	listQ := `
		SELECT m.id, m.source_id, m.title, m.slug, m.cover_url, m.description,
		       m.status, m.author, m.artist, m.genres, m.last_scraped_at, m.created_at
		FROM mangas m
		WHERE ` + whereSQL + `
		ORDER BY m.created_at DESC, m.title ASC
		LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.db.QueryContext(c.Request().Context(), listQ, args...)
	if err != nil {
		return pgErr(c, "listMangas query", err)
	}
	defer rows.Close()

	mangas := []*models.Manga{}
	for rows.Next() {
		m, err := scanManga(rows)
		if err != nil {
			return pgErr(c, "listMangas scan", err)
		}
		mangas = append(mangas, m)
	}
	return c.JSON(http.StatusOK, echo.Map{
		"mangas": mangas,
		"total":  total,
		"page":   page,
		"limit":  limit,
	})
}

func (s *Service) getManga(c echo.Context) error {
	slug := c.Param("slug")
	m, err := scanManga(s.db.QueryRowContext(c.Request().Context(), `
		SELECT id, source_id, title, slug, cover_url, description,
		       status, author, artist, genres, last_scraped_at, created_at
		FROM mangas WHERE slug = $1`, slug))
	if err != nil {
		return pgErr(c, "getManga", err)
	}

	rows, err := s.db.QueryContext(c.Request().Context(), `
		SELECT id, manga_id, chapter_number, title, created_at
		FROM chapters WHERE manga_id = $1
		ORDER BY chapter_number DESC`, m.ID)
	if err != nil {
		return pgErr(c, "getManga chapters", err)
	}
	defer rows.Close()

	type chapterLite struct {
		ID            string  `json:"id"`
		MangaID       string  `json:"manga_id"`
		ChapterNumber float64 `json:"chapter_number"`
		Title         *string `json:"title,omitempty"`
		CreatedAt     string  `json:"created_at"`
	}
	chapters := []chapterLite{}
	for rows.Next() {
		var cl chapterLite
		var title sql.NullString
		var createdAt pqTime
		if err := rows.Scan(&cl.ID, &cl.MangaID, &cl.ChapterNumber, &title, &createdAt); err != nil {
			return pgErr(c, "getManga scan", err)
		}
		cl.Title = models.NullToPtr(title)
		cl.CreatedAt = createdAt.Time.Format("2006-01-02T15:04:05Z")
		chapters = append(chapters, cl)
	}
	return c.JSON(http.StatusOK, echo.Map{"manga": m, "chapters": chapters})
}

func (s *Service) getMangaChapter(c echo.Context) error {
	slug := c.Param("slug")
	numStr := c.Param("num")
	num, err := strconv.ParseFloat(numStr, 64)
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid chapter number"})
	}
	var (
		chID, mangaID string
		title         sql.NullString
		pagesJSON     []byte
	)
	err = s.db.QueryRowContext(c.Request().Context(), `
		SELECT c.id, c.manga_id, c.title, c.pages_json
		FROM chapters c
		JOIN mangas m ON m.id = c.manga_id
		WHERE m.slug = $1 AND c.chapter_number = $2`, slug, num).
		Scan(&chID, &mangaID, &title, &pagesJSON)
	if err != nil {
		return pgErr(c, "getMangaChapter", err)
	}
	var pages []string
	if err := json.Unmarshal(pagesJSON, &pages); err != nil {
		pages = []string{}
	}
	ch := echo.Map{
		"id":             chID,
		"manga_id":       mangaID,
		"chapter_number": num,
		"pages":          pages,
	}
	if title.Valid {
		ch["title"] = title.String
	}
	return c.JSON(http.StatusOK, echo.Map{"chapter": ch, "pages": pages})
}

// ----------------------------------------------------------------------------
// Reader progress
// ----------------------------------------------------------------------------

type progressReq struct {
	ChapterID string `json:"chapter_id"`
	PageIndex int    `json:"page_index"`
	ReadMode  string `json:"read_mode"`
}

func (s *Service) saveProgress(c echo.Context) error {
	var req progressReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	if req.ChapterID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "chapter_id required"})
	}
	if req.ReadMode == "" {
		req.ReadMode = "vertical"
	}
	uid := c.Get("user_id").(string)
	_, err := s.db.ExecContext(c.Request().Context(), `
		INSERT INTO reading_history (user_id, chapter_id, page_index, read_mode, updated_at)
		VALUES ($1, $2, $3, $4, now())
		ON CONFLICT (user_id, chapter_id) DO UPDATE
			SET page_index = EXCLUDED.page_index,
			    read_mode = EXCLUDED.read_mode,
			    updated_at = now()`,
		uid, req.ChapterID, req.PageIndex, req.ReadMode)
	if err != nil {
		return pgErr(c, "saveProgress", err)
	}

	// Also update library_entries.last_chapter_read if the user has this manga in library.
	_, _ = s.db.ExecContext(c.Request().Context(), `
		UPDATE library_entries le
		SET last_chapter_read = c.chapter_number
		FROM chapters c
		WHERE c.id = $2 AND le.manga_id = c.manga_id AND le.user_id = $1`,
		uid, req.ChapterID)

	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

func (s *Service) getProgress(c echo.Context) error {
	mangaSlug := c.Param("mangaSlug")
	uid := c.Get("user_id").(string)
	var (
		chapterNum float64
		pageIndex  int
		readMode   string
	)
	row := s.db.QueryRowContext(c.Request().Context(), `
		SELECT c.chapter_number, rh.page_index, rh.read_mode
		FROM reading_history rh
		JOIN chapters c ON c.id = rh.chapter_id
		JOIN mangas m ON m.id = c.manga_id
		WHERE rh.user_id = $1 AND m.slug = $2
		ORDER BY rh.updated_at DESC
		LIMIT 1`, uid, mangaSlug)
	err := row.Scan(&chapterNum, &pageIndex, &readMode)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return c.JSON(http.StatusOK, echo.Map{
				"chapter_num": nil,
				"page_index":  0,
				"read_mode":   "vertical",
			})
		}
		return pgErr(c, "getProgress", err)
	}
	return c.JSON(http.StatusOK, echo.Map{
		"chapter_num": chapterNum,
		"page_index":  pageIndex,
		"read_mode":   readMode,
	})
}

// ----------------------------------------------------------------------------
// Library
// ----------------------------------------------------------------------------

func (s *Service) listLibrary(c echo.Context) error {
	uid := c.Get("user_id").(string)
	rows, err := s.db.QueryContext(c.Request().Context(), `
		SELECT le.id, le.user_id, le.manga_id, le.status, le.last_chapter_read, le.created_at,
		       m.id, m.source_id, m.title, m.slug, m.cover_url, m.description,
		       m.status, m.author, m.artist, m.genres, m.last_scraped_at, m.created_at
		FROM library_entries le
		JOIN mangas m ON m.id = le.manga_id
		WHERE le.user_id = $1
		ORDER BY le.created_at DESC`, uid)
	if err != nil {
		return pgErr(c, "listLibrary", err)
	}
	defer rows.Close()

	entries := []*models.LibraryEntry{}
	for rows.Next() {
		var le models.LibraryEntry
		var lastCh sql.NullFloat64
		var m models.Manga
		var sourceID sql.NullString
		var coverURL, description, author, artist sql.NullString
		var lastScraped sql.NullTime
		var genresArr []string
		if err := rows.Scan(
			&le.ID, &le.UserID, &le.MangaID, &le.Status, &lastCh, &le.CreatedAt,
			&m.ID, &sourceID, &m.Title, &m.Slug, &coverURL, &description,
			&m.Status, &author, &artist, pq.Array(&genresArr), &lastScraped, &m.CreatedAt,
		); err != nil {
			return pgErr(c, "listLibrary scan", err)
		}
		if lastCh.Valid {
			v := lastCh.Float64
			le.LastChapterRead = &v
		}
		m.Genres = genresArr
		if m.Genres == nil {
			m.Genres = []string{}
		}
		m.CoverURL = models.NullToPtr(coverURL)
		m.Description = models.NullToPtr(description)
		m.Author = models.NullToPtr(author)
		m.Artist = models.NullToPtr(artist)
		if lastScraped.Valid {
			t := lastScraped.Time
			m.LastScrapedAt = &t
		}
		le.Manga = &m
		entries = append(entries, &le)
	}
	return c.JSON(http.StatusOK, echo.Map{"entries": entries})
}

type addLibraryReq struct {
	MangaSlug string `json:"manga_slug"`
	Status    string `json:"status"`
}

func (s *Service) addLibrary(c echo.Context) error {
	var req addLibraryReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	if req.MangaSlug == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "manga_slug required"})
	}
	if req.Status == "" {
		req.Status = "reading"
	}
	uid := c.Get("user_id").(string)
	var mangaID string
	err := s.db.QueryRowContext(c.Request().Context(), `SELECT id FROM mangas WHERE slug = $1`, req.MangaSlug).Scan(&mangaID)
	if err != nil {
		return pgErr(c, "addLibrary manga", err)
	}
	var entryID string
	err = s.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO library_entries (user_id, manga_id, status)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, manga_id) DO UPDATE SET status = EXCLUDED.status
		RETURNING id`, uid, mangaID, req.Status).Scan(&entryID)
	if err != nil {
		return pgErr(c, "addLibrary insert", err)
	}
	return c.JSON(http.StatusCreated, echo.Map{"id": entryID, "status": "ok"})
}

type updateLibraryReq struct {
	Status          *string  `json:"status,omitempty"`
	LastChapterRead *float64 `json:"last_chapter_read,omitempty"`
}

func (s *Service) updateLibrary(c echo.Context) error {
	mangaSlug := c.Param("mangaSlug")
	uid := c.Get("user_id").(string)
	var req updateLibraryReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	sets := []string{}
	args := []interface{}{uid, mangaSlug}
	idx := 3
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.LastChapterRead != nil {
		sets = append(sets, fmt.Sprintf("last_chapter_read = $%d", idx))
		args = append(args, *req.LastChapterRead)
		idx++
	}
	if len(sets) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "nothing to update"})
	}
	q := `UPDATE library_entries SET ` + strings.Join(sets, ", ") + `
		FROM mangas m
		WHERE library_entries.manga_id = m.id AND library_entries.user_id = $1 AND m.slug = $2`
	res, err := s.db.ExecContext(c.Request().Context(), q, args...)
	if err != nil {
		return pgErr(c, "updateLibrary", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "library entry not found"})
	}
	return c.JSON(http.StatusOK, echo.Map{"status": "ok"})
}

func (s *Service) deleteLibrary(c echo.Context) error {
	mangaSlug := c.Param("mangaSlug")
	uid := c.Get("user_id").(string)
	_, err := s.db.ExecContext(c.Request().Context(), `
		DELETE FROM library_entries
		USING mangas m
		WHERE library_entries.manga_id = m.id AND library_entries.user_id = $1 AND m.slug = $2`,
		uid, mangaSlug)
	if err != nil {
		return pgErr(c, "deleteLibrary", err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ----------------------------------------------------------------------------
// Reading Lists
// ----------------------------------------------------------------------------

func (s *Service) listLists(c echo.Context) error {
	page := parseIntDefault(c.QueryParam("page"), 1, 1, 0)
	limit := parseIntDefault(c.QueryParam("limit"), 20, 1, 100)
	offset := (page - 1) * limit
	rows, err := s.db.QueryContext(c.Request().Context(), `
		SELECT rl.id, rl.user_id, rl.name, rl.slug, rl.is_public, rl.description, rl.created_at,
		       u.username, COUNT(rli.id) AS item_count
		FROM reading_lists rl
		LEFT JOIN users u ON u.id = rl.user_id
		LEFT JOIN reading_list_items rli ON rli.list_id = rl.id
		WHERE rl.is_public = TRUE
		GROUP BY rl.id, u.username
		ORDER BY rl.created_at DESC
		LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return pgErr(c, "listLists", err)
	}
	defer rows.Close()
	lists := []*models.ReadingList{}
	for rows.Next() {
		var rl models.ReadingList
		var author, desc sql.NullString
		if err := rows.Scan(&rl.ID, &rl.UserID, &rl.Name, &rl.Slug, &rl.IsPublic, &desc, &rl.CreatedAt, &author, &rl.ItemCount); err != nil {
			return pgErr(c, "listLists scan", err)
		}
		rl.Description = models.NullToPtr(desc)
		rl.AuthorName = models.NullToPtr(author)
		lists = append(lists, &rl)
	}
	return c.JSON(http.StatusOK, echo.Map{"lists": lists, "page": page, "limit": limit})
}

func (s *Service) getList(c echo.Context) error {
	slug := c.Param("slug")
	uid, _ := c.Get("user_id").(string)
	var (
		rl      models.ReadingList
		author  sql.NullString
		desc    sql.NullString
		ownerID string
	)
	err := s.db.QueryRowContext(c.Request().Context(), `
		SELECT rl.id, rl.user_id, rl.name, rl.slug, rl.is_public, rl.description, rl.created_at, u.username
		FROM reading_lists rl
		LEFT JOIN users u ON u.id = rl.user_id
		WHERE rl.slug = $1`, slug).
		Scan(&rl.ID, &ownerID, &rl.Name, &rl.Slug, &rl.IsPublic, &desc, &rl.CreatedAt, &author)
	if err != nil {
		return pgErr(c, "getList", err)
	}
	rl.Description = models.NullToPtr(desc)
	rl.AuthorName = models.NullToPtr(author)
	// If not public, only owner can see.
	if !rl.IsPublic && uid != ownerID {
		// Even if not authenticated (uid==""), reject private lists.
		return c.JSON(http.StatusNotFound, echo.Map{"error": "list not found"})
	}

	rows, err := s.db.QueryContext(c.Request().Context(), `
		SELECT rli.id, rli.list_id, rli.manga_id, rli.added_at,
		       m.id, m.source_id, m.title, m.slug, m.cover_url, m.description,
		       m.status, m.author, m.artist, m.genres, m.last_scraped_at, m.created_at
		FROM reading_list_items rli
		JOIN mangas m ON m.id = rli.manga_id
		WHERE rli.list_id = $1
		ORDER BY rli.added_at DESC`, rl.ID)
	if err != nil {
		return pgErr(c, "getList items", err)
	}
	defer rows.Close()

	items := []*models.ReadingListItem{}
	for rows.Next() {
		var item models.ReadingListItem
		var m models.Manga
		var sourceID sql.NullString
		var coverURL, description, authorName, artist sql.NullString
		var lastScraped sql.NullTime
		var genresArr []string
		if err := rows.Scan(
			&item.ID, &item.ListID, &item.MangaID, &item.AddedAt,
			&m.ID, &sourceID, &m.Title, &m.Slug, &coverURL, &description,
			&m.Status, &authorName, &artist, pq.Array(&genresArr), &lastScraped, &m.CreatedAt,
		); err != nil {
			return pgErr(c, "getList items scan", err)
		}
		m.Genres = genresArr
		if m.Genres == nil {
			m.Genres = []string{}
		}
		m.CoverURL = models.NullToPtr(coverURL)
		m.Description = models.NullToPtr(description)
		m.Author = models.NullToPtr(authorName)
		m.Artist = models.NullToPtr(artist)
		if lastScraped.Valid {
			t := lastScraped.Time
			m.LastScrapedAt = &t
		}
		item.Manga = &m
		items = append(items, &item)
	}
	return c.JSON(http.StatusOK, echo.Map{"list": rl, "items": items})
}

type createListReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	IsPublic    bool   `json:"is_public"`
}

func (s *Service) createList(c echo.Context) error {
	var req createListReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "name required"})
	}
	uid := c.Get("user_id").(string)
	slug := slugify(req.Name) + "-" + randID(4)
	var desc *string
	if req.Description != "" {
		d := req.Description
		desc = &d
	}
	var rl models.ReadingList
	err := s.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO reading_lists (user_id, name, slug, is_public, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, name, slug, is_public, description, created_at`,
		uid, req.Name, slug, req.IsPublic, desc).Scan(
		&rl.ID, &rl.UserID, &rl.Name, &rl.Slug, &rl.IsPublic, &rl.Description, &rl.CreatedAt)
	if err != nil {
		return pgErr(c, "createList", err)
	}
	return c.JSON(http.StatusCreated, echo.Map{"list": rl})
}

type addListItemReq struct {
	MangaSlug string `json:"manga_slug"`
}

func (s *Service) addListItem(c echo.Context) error {
	slug := c.Param("slug")
	uid := c.Get("user_id").(string)
	var req addListItemReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	if req.MangaSlug == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "manga_slug required"})
	}
	var listID, ownerID string
	err := s.db.QueryRowContext(c.Request().Context(), `SELECT id, user_id FROM reading_lists WHERE slug = $1`, slug).
		Scan(&listID, &ownerID)
	if err != nil {
		return pgErr(c, "addListItem list", err)
	}
	if uid != ownerID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "not the list owner"})
	}
	var mangaID string
	err = s.db.QueryRowContext(c.Request().Context(), `SELECT id FROM mangas WHERE slug = $1`, req.MangaSlug).Scan(&mangaID)
	if err != nil {
		return pgErr(c, "addListItem manga", err)
	}
	_, err = s.db.ExecContext(c.Request().Context(), `
		INSERT INTO reading_list_items (list_id, manga_id) VALUES ($1, $2)
		ON CONFLICT (list_id, manga_id) DO NOTHING`, listID, mangaID)
	if err != nil {
		return pgErr(c, "addListItem insert", err)
	}
	return c.JSON(http.StatusCreated, echo.Map{"status": "ok"})
}

func (s *Service) deleteListItem(c echo.Context) error {
	slug := c.Param("slug")
	mangaSlug := c.Param("mangaSlug")
	uid := c.Get("user_id").(string)
	var listID, ownerID string
	err := s.db.QueryRowContext(c.Request().Context(), `SELECT id, user_id FROM reading_lists WHERE slug = $1`, slug).
		Scan(&listID, &ownerID)
	if err != nil {
		return pgErr(c, "deleteListItem list", err)
	}
	if uid != ownerID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "not the list owner"})
	}
	_, err = s.db.ExecContext(c.Request().Context(), `
		DELETE FROM reading_list_items
		USING mangas m
		WHERE reading_list_items.list_id = $1 AND reading_list_items.manga_id = m.id AND m.slug = $2`,
		listID, mangaSlug)
	if err != nil {
		return pgErr(c, "deleteListItem", err)
	}
	return c.NoContent(http.StatusNoContent)
}

// ----------------------------------------------------------------------------
// Admin: sources + scrape
// ----------------------------------------------------------------------------

func (s *Service) listSources(c echo.Context) error {
	rows, err := s.db.QueryContext(c.Request().Context(), `
		SELECT id, name, base_url, parser_type, is_active, created_at
		FROM sources ORDER BY created_at`)
	if err != nil {
		return pgErr(c, "listSources", err)
	}
	defer rows.Close()
	sources := []*models.Source{}
	for rows.Next() {
		var src models.Source
		if err := rows.Scan(&src.ID, &src.Name, &src.BaseURL, &src.ParserType, &src.IsActive, &src.CreatedAt); err != nil {
			return pgErr(c, "listSources scan", err)
		}
		sources = append(sources, &src)
	}
	return c.JSON(http.StatusOK, echo.Map{"sources": sources})
}

type createSourceReq struct {
	Name       string `json:"name"`
	BaseURL    string `json:"base_url"`
	ParserType string `json:"parser_type"`
}

func (s *Service) createSource(c echo.Context) error {
	var req createSourceReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || req.BaseURL == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "name and base_url required"})
	}
	if req.ParserType == "" {
		req.ParserType = "generic"
	}
	var src models.Source
	err := s.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO sources (name, base_url, parser_type, is_active)
		VALUES ($1, $2, $3, TRUE)
		RETURNING id, name, base_url, parser_type, is_active, created_at`,
		req.Name, req.BaseURL, req.ParserType).Scan(
		&src.ID, &src.Name, &src.BaseURL, &src.ParserType, &src.IsActive, &src.CreatedAt)
	if err != nil {
		return pgErr(c, "createSource", err)
	}
	return c.JSON(http.StatusCreated, echo.Map{"source": src})
}

type updateSourceReq struct {
	Name       *string `json:"name,omitempty"`
	BaseURL    *string `json:"base_url,omitempty"`
	ParserType *string `json:"parser_type,omitempty"`
	IsActive   *bool   `json:"is_active,omitempty"`
}

func (s *Service) updateSource(c echo.Context) error {
	id := c.Param("id")
	var req updateSourceReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	sets := []string{}
	args := []interface{}{id}
	idx := 2
	if req.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", idx))
		args = append(args, *req.Name)
		idx++
	}
	if req.BaseURL != nil {
		sets = append(sets, fmt.Sprintf("base_url = $%d", idx))
		args = append(args, *req.BaseURL)
		idx++
	}
	if req.ParserType != nil {
		sets = append(sets, fmt.Sprintf("parser_type = $%d", idx))
		args = append(args, *req.ParserType)
		idx++
	}
	if req.IsActive != nil {
		sets = append(sets, fmt.Sprintf("is_active = $%d", idx))
		args = append(args, *req.IsActive)
		idx++
	}
	if len(sets) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "nothing to update"})
	}
	q := `UPDATE sources SET ` + strings.Join(sets, ", ") + ` WHERE id = $1`
	res, err := s.db.ExecContext(c.Request().Context(), q, args...)
	if err != nil {
		return pgErr(c, "updateSource", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "source not found"})
	}
	return c.JSON(http.StatusOK, echo.Map{"status": "ok"})
}

func (s *Service) deleteSource(c echo.Context) error {
	id := c.Param("id")
	_, err := s.db.ExecContext(c.Request().Context(), `DELETE FROM sources WHERE id = $1`, id)
	if err != nil {
		return pgErr(c, "deleteSource", err)
	}
	return c.NoContent(http.StatusNoContent)
}

func (s *Service) triggerScrape(c echo.Context) error {
	sourceID := c.Param("sourceId")

	// Verify source exists.
	var name string
	err := s.db.QueryRowContext(c.Request().Context(), `SELECT name FROM sources WHERE id = $1`, sourceID).Scan(&name)
	if err != nil {
		return pgErr(c, "triggerScrape source", err)
	}

	// Kick off background scrape.
	store := &dbStore{db: s.db}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		if err := s.scraper.RunMockScrape(ctx, sourceID, store); err != nil {
			log.Printf("[admin] scrape %s (%s) failed: %v", sourceID, name, err)
		}
	}()

	return c.JSON(http.StatusAccepted, echo.Map{"message": "scraping started", "source": name})
}

// ----------------------------------------------------------------------------
// DB store implementing scraper.Storer
// ----------------------------------------------------------------------------

type dbStore struct {
	db *sql.DB
}

func (d *dbStore) UpsertMangaWithChapters(ctx context.Context, sourceID string, m scraper.MangaInput, chapters []scraper.ChapterInput) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var mangaID string
	err = tx.QueryRowContext(ctx, `
		INSERT INTO mangas (source_id, title, slug, cover_url, description, status, author, artist, genres, last_scraped_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
		ON CONFLICT (slug) DO UPDATE SET
			title = EXCLUDED.title,
			cover_url = EXCLUDED.cover_url,
			description = EXCLUDED.description,
			status = EXCLUDED.status,
			author = EXCLUDED.author,
			artist = EXCLUDED.artist,
			genres = EXCLUDED.genres,
			last_scraped_at = now()
		RETURNING id`,
		asNullUUID(sourceID), m.Title, m.Slug, m.CoverURL, m.Description, m.Status, m.Author, m.Artist,
		pq.Array(m.Genres)).Scan(&mangaID)
	if err != nil {
		return fmt.Errorf("upsert manga: %w", err)
	}

	for _, ch := range chapters {
		pagesJSON, _ := json.Marshal(ch.Pages)
		_, err = tx.ExecContext(ctx, `
			INSERT INTO chapters (manga_id, chapter_number, title, pages_json)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (manga_id, chapter_number) DO UPDATE SET
				title = EXCLUDED.title,
				pages_json = EXCLUDED.pages_json`,
			mangaID, ch.Number, ch.Title, string(pagesJSON))
		if err != nil {
			return fmt.Errorf("upsert chapter %.0f: %w", ch.Number, err)
		}
	}
	return tx.Commit()
}

func asNullUUID(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// pqTime wraps time.Time for scanning a TIMESTAMPTZ into a plain time.Time.
type pqTime struct{ Time time.Time }

func (p *pqTime) Scan(v interface{}) error {
	switch t := v.(type) {
	case time.Time:
		p.Time = t
		return nil
	}
	return nil
}

// slugify produces a URL-friendly slug.
func slugify(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "_", "-")
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "list"
	}
	return out
}

func randID(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
