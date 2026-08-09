package imageproxy

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// Service implements GET /api/proxy/img with a disk cache.
type Service struct {
	cacheDir string
	client   *http.Client
}

func New(cacheDir string) *Service {
	_ = os.MkdirAll(cacheDir, 0o755)
	return &Service{
		cacheDir: cacheDir,
		client: &http.Client{
			Timeout: 20 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("stopped after 5 redirects")
				}
				return nil
			},
		},
	}
}

// RegisterRoutes wires the proxy under /api/proxy.
func (s *Service) RegisterRoutes(g *echo.Group) {
	g.GET("/img", s.handleImg)
}

func hashURL(u string) string {
	h := sha256.Sum256([]byte(u))
	return hex.EncodeToString(h[:])
}

// cachePath returns ./cache/images/ab/cd/<hash> (with file extension preserved).
func (s *Service) cachePath(u string) string {
	full := hashURL(u)
	dir := filepath.Join(s.cacheDir, full[:2], full[2:4])
	return filepath.Join(dir, full)
}

func contentTypeForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	default:
		return "image/jpeg"
	}
}

func sniffContentType(data []byte) string {
	ct := http.DetectContentType(data)
	// DetectContentType returns "text/plain..." for non-image; default to jpeg.
	if !strings.HasPrefix(ct, "image/") {
		return "image/jpeg"
	}
	return ct
}

func (s *Service) handleImg(c echo.Context) error {
	rawURL := c.QueryParam("url")
	if rawURL == "" {
		return s.servePlaceholder(c, "no url")
	}
	// Parse + validate URL scheme (SSRF guard: http/https only).
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return s.servePlaceholder(c, "invalid url")
	}

	cacheFile := s.cachePath(rawURL)
	if data, err := os.ReadFile(cacheFile); err == nil {
		ct := sniffContentType(data)
		c.Response().Header().Set(echo.HeaderContentType, ct)
		c.Response().Header().Set("Cache-Control", "public, max-age=604800, immutable")
		return c.Blob(http.StatusOK, ct, data)
	}

	// Cache miss → fetch from source.
	data, ct, err := s.fetch(c.Request().Context(), rawURL)
	if err != nil {
		return s.servePlaceholder(c, err.Error())
	}
	// Persist to cache (best-effort, don't block response on failure).
	go func(d []byte) {
		if err := os.MkdirAll(filepath.Dir(cacheFile), 0o755); err == nil {
			_ = os.WriteFile(cacheFile, d, 0o644)
		}
	}(data)

	c.Response().Header().Set(echo.HeaderContentType, ct)
	c.Response().Header().Set("Cache-Control", "public, max-age=604800, immutable")
	return c.Blob(http.StatusOK, ct, data)
}

func (s *Service) fetch(ctx context.Context, imgURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imgURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; MangaHub/1.0)")
	req.Header.Set("Accept", "image/*,*/*;q=0.8")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("source returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 25<<20)) // 25 MB cap
	if err != nil {
		return nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" || !strings.HasPrefix(ct, "image/") {
		ct = sniffContentType(data)
	}
	return data, ct, nil
}

// servePlaceholder returns a tiny placeholder PNG-ish blob when fetch fails.
// Uses a 1x1 transparent PNG (always works, never a 500).
var placeholderPNG = []byte{
	0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
	0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
	0x42, 0x60, 0x82,
}

func (s *Service) servePlaceholder(c echo.Context, reason string) error {
	log.Printf("[proxy] placeholder served for %q: %s", c.QueryParam("url"), reason)
	return c.Blob(http.StatusOK, "image/png", placeholderPNG)
}
