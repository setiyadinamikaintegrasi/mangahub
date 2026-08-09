package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"strings"
	"time"

	"github.com/gocolly/colly/v2"
)

// MockManga describes one manga the mock scraper will produce.
type MockManga struct {
	Title       string
	Slug        string
	Description string
	Status      string
	Author      string
	Artist      string
	Genres      []string
	CoverText   string // text rendered on placeholder cover
	Chapters    []MockChapter
}

type MockChapter struct {
	Number float64
	Title  string
	Pages  int
}

// Scraper holds colly infrastructure (rate-limited) and the mock dataset.
type Scraper struct{}

func New() *Scraper {
	return &Scraper{}
}

// Engine returns a configured colly.Collector demonstrating rate limiting +
// async support per DESIGN (1 req/sec). The mock scraper doesn't actually
// crawl, but this proves the infrastructure is wired.
func (s *Scraper) Engine(baseURL string) *colly.Collector {
	c := colly.NewCollector(
		colly.AllowURLRevisit(),
	)
	// 1 request per second, async
	c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: 1,
		Delay:       1 * time.Second,
	})
	c.Async = true
	_ = baseURL
	return c
}

// RunMockScrape inserts mock manga into the DB using the provided Storer.
// It sleeps briefly between items to emulate the colly rate limit.
func (s *Scraper) RunMockScrape(ctx context.Context, sourceID string, store Storer) error {
	mangas := buildMockDataset()
	engine := s.Engine("mock://local")
	_ = engine

	for i, m := range mangas {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		// Emulate 1 req/sec rate limit between manga.
		time.Sleep(time.Second)

		// Build cover URL (placeholder service).
		coverURL := fmt.Sprintf("https://placehold.co/600x900/1e293b/e2e8f0?text=%s",
			url.QueryEscape(m.CoverText))

		// Build chapters with placeholder page URLs.
		chapters := make([]ChapterInput, len(m.Chapters))
		for j, ch := range m.Chapters {
			pages := make([]string, ch.Pages)
			for p := 0; p < ch.Pages; p++ {
				pages[p] = fmt.Sprintf("https://placehold.co/800x1200/0f172a/e2e8f0?text=%s+Ch%.0f+P%d",
					url.QueryEscape(m.Title), ch.Number, p+1)
			}
			chapters[j] = ChapterInput{
				Number: ch.Number,
				Title:  ch.Title,
				Pages:  pages,
			}
		}

		if err := store.UpsertMangaWithChapters(ctx, sourceID, MangaInput{
			Title:       m.Title,
			Slug:        m.Slug,
			Description: m.Description,
			Status:      m.Status,
			Author:      m.Author,
			Artist:      m.Artist,
			Genres:      m.Genres,
			CoverURL:    coverURL,
		}, chapters); err != nil {
			log.Printf("[scraper] error upserting %s: %v", m.Slug, err)
			continue
		}
		log.Printf("[scraper] (%d/%d) upserted %s with %d chapters", i+1, len(mangas), m.Slug, len(chapters))
	}
	log.Printf("[scraper] mock scrape complete: %d manga", len(mangas))
	return nil
}

// MangaInput / ChapterInput decouple the scraper from the DB layer.
type MangaInput struct {
	Title       string
	Slug        string
	Description string
	Status      string
	Author      string
	Artist      string
	Genres      []string
	CoverURL    string
}

type ChapterInput struct {
	Number float64
	Title  string
	Pages  []string
}

// Storer is implemented by the DB layer; the scraper depends on this interface.
type Storer interface {
	UpsertMangaWithChapters(ctx context.Context, sourceID string, m MangaInput, chapters []ChapterInput) error
}

// buildMockDataset returns 5 manga with 3-5 chapters each, 5-10 pages each.
func buildMockDataset() []MockManga {
	pick := func(n int) int { return 5 + rand.Intn(6) } // 5..10 pages
	_ = pick
	return []MockManga{
		{
			Title:       "Shadow Monarch Chronicles",
			Slug:        "shadow-monarch-chronicles",
			Description: "When the gate opened in Seoul, Sung Jinwoo was the weakest hunter. Now he commands an army of shadows in this action-fantasy epic.",
			Status:      "ongoing",
			Author:      "Chugong",
			Artist:      "Dubu",
			Genres:      []string{"Action", "Fantasy", "Adventure"},
			CoverText:   "Shadow+Monarch",
			Chapters: []MockChapter{
				{Number: 1, Title: "The Weakest Hunter", Pages: 5 + rand.Intn(6)},
				{Number: 2, Title: "Daily Quest", Pages: 5 + rand.Intn(6)},
				{Number: 3, Title: "Double Dungeon", Pages: 5 + rand.Intn(6)},
				{Number: 4, Title: "Arise", Pages: 5 + rand.Intn(6)},
			},
		},
		{
			Title:       "Celestial Blade",
			Slug:        "celestial-blade",
			Description: "A wandering swordswoman seeks the seven celestial swords to prevent the resurrection of the demon king.",
			Status:      "ongoing",
			Author:      "Hanako Yamada",
			Artist:      "Hanako Yamada",
			Genres:      []string{"Action", "Martial Arts", "Historical"},
			CoverText:   "Celestial+Blade",
			Chapters: []MockChapter{
				{Number: 1, Title: "Wandering Sword", Pages: 5 + rand.Intn(6)},
				{Number: 2, Title: "First Sword", Pages: 5 + rand.Intn(6)},
				{Number: 3, Title: "Mountain Trial", Pages: 5 + rand.Intn(6)},
				{Number: 4, Title: "Demon Encounter", Pages: 5 + rand.Intn(6)},
				{Number: 5, Title: "Allies and Enemies", Pages: 5 + rand.Intn(6)},
			},
		},
		{
			Title:       "NEON Tokyo 2099",
			Slug:        "neon-tokyo-2099",
			Description: "In a neon-soaked megacity, a hacker discovers a conspiracy that reaches the highest levels of the corporate government.",
			Status:      "ongoing",
			Author:      "Kenji Sato",
			Artist:      "Mika Tanaka",
			Genres:      []string{"Sci-Fi", "Cyberpunk", "Thriller"},
			CoverText:   "NEON+Tokyo",
			Chapters: []MockChapter{
				{Number: 1, Title: "System Breach", Pages: 5 + rand.Intn(6)},
				{Number: 2, Title: "Ghost Protocol", Pages: 5 + rand.Intn(6)},
				{Number: 3, Title: "Black ICE", Pages: 5 + rand.Intn(6)},
			},
		},
		{
			Title:       "Whispers of the Forest",
			Slug:        "whispers-of-the-forest",
			Description: "A gentle slice-of-life story about a spirit who befriends a lonely villager in an enchanted forest.",
			Status:      "completed",
			Author:      "Aoi Hana",
			Artist:      "Aoi Hana",
			Genres:      []string{"Slice of Life", "Supernatural", "Romance"},
			CoverText:   "Forest+Whispers",
			Chapters: []MockChapter{
				{Number: 1, Title: "The Meeting", Pages: 5 + rand.Intn(6)},
				{Number: 2, Title: "Seasons Change", Pages: 5 + rand.Intn(6)},
				{Number: 3, Title: "Festival Night", Pages: 5 + rand.Intn(6)},
				{Number: 4, Title: "Goodbye Forest", Pages: 5 + rand.Intn(6)},
			},
		},
		{
			Title:       "Mecha Academy",
			Slug:        "mecha-academy",
			Description: "At an elite academy for mecha pilots, rivals must team up when alien invaders threaten Earth.",
			Status:      "ongoing",
			Author:      "Ryo Tanaka",
			Artist:      "Studio Phoenix",
			Genres:      []string{"Mecha", "Action", "School", "Sci-Fi"},
			CoverText:   "Mecha+Academy",
			Chapters: []MockChapter{
				{Number: 1, Title: "Entrance Exam", Pages: 5 + rand.Intn(6)},
				{Number: 2, Title: "First Sortie", Pages: 5 + rand.Intn(6)},
				{Number: 3, Title: "Rivalry", Pages: 5 + rand.Intn(6)},
			},
		},
	}
}

// helper to marshal pages (kept here so the scraper package is self-contained).
func marshalPages(pages []string) string {
	b, _ := json.Marshal(pages)
	return string(b)
}

var _ = marshalPages
var _ = strings.TrimSpace
