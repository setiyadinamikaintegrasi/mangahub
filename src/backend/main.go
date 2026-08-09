package main

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"manga-hub/auth"
	"manga-hub/db"
	"manga-hub/handlers"
	"manga-hub/imageproxy"
	"manga-hub/scraper"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://manga:manga@localhost:5434/mangahub?sslmode=disable"
	}

	database, err := db.Connect(dsn)
	if err != nil {
		log.Printf("[warn] DB unavailable: %v — starting without persistence", err)
	}

	if database != nil {
		if err := db.Migrate(database); err != nil {
			log.Fatalf("[fatal] migration failed: %v", err)
		}
		seedAdmin(database)
	}

	jwtSecret := []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) == 0 {
		jwtSecret = []byte("mangahub-dev-secret-change-in-production")
	}

	e := echo.New()
	e.HideBanner = true

	// CORS for development
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Header().Set("Access-Control-Allow-Origin", "*")
			c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Response().Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			if c.Request().Method == "OPTIONS" {
				return c.NoContent(204)
			}
			return next(c)
		}
	})

	// --- Wire services ---
	authSvc := auth.New(database, jwtSecret)
	scr := scraper.New()
	handlerSvc := handlers.New(database, scr)
	imgProxy := imageproxy.New(filepath.Join(".", "cache", "images"))

	// --- API group ---
	api := e.Group("/api")

	// Auth routes (public)
	authGroup := api.Group("/auth")
	authSvc.RegisterRoutes(authGroup)

	// Middleware for authenticated routes
	authMW := authSvc.Middleware()
	adminMW := auth.RequireAdmin()

	// All other routes
	handlerSvc.RegisterRoutes(e, api, authMW, adminMW)

	// Image proxy (public)
	imgGroup := api.Group("/proxy")
	imgProxy.RegisterRoutes(imgGroup)

	// --- Static serving (lesson from EV Charge Tracker) ---
	distDir := filepath.Join("..", "frontend", "dist")
	if _, err := os.Stat(distDir); err == nil {
		e.Static("/assets", filepath.Join(distDir, "assets"))
		e.GET("/*", func(c echo.Context) error {
			return c.File(filepath.Join(distDir, "index.html"))
		})
		log.Printf("[main] serving frontend from %s", distDir)
	} else {
		log.Printf("[main] frontend dist not found at %s — API-only mode", distDir)
	}

	addr := ":8200"
	log.Printf("[main] MangaHub starting on %s", addr)
	e.Logger.Fatal(e.Start(addr))
}

func seedAdmin(db *sql.DB) {
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), 10)
	if err != nil {
		log.Printf("[warn] seed admin hash failed: %v", err)
		return
	}
	_, err = db.Exec(`
		INSERT INTO users (username, email, password_hash, role)
		VALUES ('admin', 'admin@mangahub.local', $1, 'admin')
		ON CONFLICT (username) DO NOTHING
	`, string(hash))
	if err != nil {
		log.Printf("[warn] seed admin insert: %v", err)
		return
	}

	_, err = db.Exec(`
		INSERT INTO sources (name, base_url, parser_type)
		VALUES ('MangaKita', 'https://example.com/manga', 'mangakita')
		ON CONFLICT DO NOTHING
	`)
	if err == nil {
		log.Println("[main] admin user + default source seeded")
	}
}
