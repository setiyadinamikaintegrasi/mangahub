package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
)

//go:embed schema.sql
var schemaFS embed.FS

// Connect opens a DB connection and waits up to 60s for Postgres.
// If it can't connect, returns (nil, err) — caller decides whether to continue.
func Connect(dsn string) (*sql.DB, error) {
	var db *sql.DB
	var err error
	for i := 0; i < 30; i++ {
		db, err = sql.Open("postgres", dsn)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		err = db.PingContext(ctx)
		cancel()
		if err == nil {
			break
		}
		db.Close()
		db = nil
		time.Sleep(2 * time.Second)
	}
	if db == nil {
		return nil, fmt.Errorf("could not connect to postgres after retries: %w", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	return db, nil
}

// Migrate applies the schema.sql file (idempotent).
func Migrate(db *sql.DB) error {
	data, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return fmt.Errorf("read embedded schema: %w", err)
	}
	if _, err := db.Exec(string(data)); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	log.Println("[db] schema migrated")
	return nil
}
