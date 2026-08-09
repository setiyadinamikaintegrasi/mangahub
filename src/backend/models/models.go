package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	AvatarURL    *string   `json:"avatar_url,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type Source struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	BaseURL    string    `json:"base_url"`
	ParserType string    `json:"parser_type"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
}

type Manga struct {
	ID            string     `json:"id"`
	SourceID      *string    `json:"source_id,omitempty"`
	Title         string     `json:"title"`
	Slug          string     `json:"slug"`
	CoverURL      *string    `json:"cover_url,omitempty"`
	Description   *string    `json:"description,omitempty"`
	Status        string     `json:"status"`
	Author        *string    `json:"author,omitempty"`
	Artist        *string    `json:"artist,omitempty"`
	Genres        []string   `json:"genres"`
	LastScrapedAt *time.Time `json:"last_scraped_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type Chapter struct {
	ID            string    `json:"id"`
	MangaID       string    `json:"manga_id"`
	ChapterNumber float64   `json:"chapter_number"`
	Title         *string   `json:"title,omitempty"`
	Pages         []string  `json:"pages"`
	CreatedAt     time.Time `json:"created_at"`
}

// ScanPages parses pages_json (JSONB) into []string.
func (c *Chapter) ScanPages(raw interface{}) error {
	var b []byte
	switch v := raw.(type) {
	case []byte:
		b = v
	case string:
		b = []byte(v)
	case nil:
		c.Pages = []string{}
		return nil
	default:
		c.Pages = []string{}
		return nil
	}
	return json.Unmarshal(b, &c.Pages)
}

type LibraryEntry struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	MangaID         string    `json:"manga_id"`
	Status          string    `json:"status"`
	LastChapterRead *float64  `json:"last_chapter_read,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	// Joined fields
	Manga *Manga `json:"manga,omitempty"`
}

type ReadingHistory struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	ChapterID string    `json:"chapter_id"`
	PageIndex int       `json:"page_index"`
	ReadMode  string    `json:"read_mode"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ReadingList struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	IsPublic    bool      `json:"is_public"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	// Joined fields
	AuthorName *string `json:"author_name,omitempty"`
	ItemCount  int     `json:"item_count,omitempty"`
}

type ReadingListItem struct {
	ID      string    `json:"id"`
	ListID  string    `json:"list_id"`
	MangaID string    `json:"manga_id"`
	AddedAt time.Time `json:"added_at"`
	Manga   *Manga    `json:"manga,omitempty"`
}

// NullToPtr converts sql.NullString to *string
func NullToPtr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	v := n.String
	return &v
}
