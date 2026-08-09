package auth

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"manga-hub/models"
)

// Service handles auth: register, login, JWT issuance, middleware.
type Service struct {
	db        *sql.DB
	jwtSecret []byte
}

func New(db *sql.DB, secret []byte) *Service {
	return &Service{db: db, jwtSecret: secret}
}

type Claims struct {
	UserID   string `json:"uid"`
	Username string `json:"usr"`
	Role     string `json:"rol"`
	jwt.RegisteredClaims
}

// MakeToken issues a 24h JWT.
func (s *Service) MakeToken(u *models.User) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   u.ID,
		Username: u.Username,
		Role:     u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			Issuer:    "mangahub",
			Subject:   u.ID,
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(s.jwtSecret)
}

func (s *Service) Parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.jwtSecret, nil
	})
	return claims, err
}

// RegisterRoutes wires auth endpoints on /api/auth.
func (s *Service) RegisterRoutes(g *echo.Group) {
	g.POST("/register", s.handleRegister)
	g.POST("/login", s.handleLogin)
	g.GET("/me", s.handleMe)
}

type registerReq struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Service) handleRegister(c echo.Context) error {
	var req registerReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	if len(req.Username) < 3 || len(req.Password) < 6 || req.Email == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "username (>=3 chars), email, and password (>=6 chars) required"})
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "hash failed"})
	}
	var u models.User
	err = s.db.QueryRowContext(c.Request().Context(), `
		INSERT INTO users (username, email, password_hash, role)
		VALUES ($1, $2, $3, 'user')
		RETURNING id, username, email, role, created_at`,
		req.Username, req.Email, string(hash)).Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return c.JSON(http.StatusConflict, echo.Map{"error": "username or email already taken"})
		}
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "db error"})
	}
	token, err := s.MakeToken(&u)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token failed"})
	}
	return c.JSON(http.StatusCreated, echo.Map{"token": token, "user": u})
}

type loginReq struct {
	UsernameOrEmail string `json:"username_or_email"`
	Password        string `json:"password"`
}

func (s *Service) handleLogin(c echo.Context) error {
	var req loginReq
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	req.UsernameOrEmail = strings.TrimSpace(req.UsernameOrEmail)
	if req.UsernameOrEmail == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "credentials required"})
	}
	var u models.User
	err := s.db.QueryRowContext(c.Request().Context(), `
		SELECT id, username, email, password_hash, role, created_at
		FROM users
		WHERE username = $1 OR email = $1`,
		req.UsernameOrEmail).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid credentials"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "db error"})
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)) != nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid credentials"})
	}
	token, err := s.MakeToken(&u)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token failed"})
	}
	return c.JSON(http.StatusOK, echo.Map{"token": token, "user": u})
}

func (s *Service) handleMe(c echo.Context) error {
	uid := c.Get("user_id").(string)
	var u models.User
	err := s.db.QueryRowContext(c.Request().Context(), `
		SELECT id, username, email, role, created_at, avatar_url
		FROM users WHERE id = $1`, uid).
		Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt, &u.AvatarURL)
	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "db error"})
	}
	return c.JSON(http.StatusOK, echo.Map{"user": u})
}

// Middleware verifies JWT and stores claims in context.
func (s *Service) Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(authHeader, "Bearer ") {
				return c.JSON(http.StatusUnauthorized, echo.Map{"error": "missing token"})
			}
			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := s.Parse(tokenStr)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid token"})
			}
			c.Set("user_id", claims.UserID)
			c.Set("user_role", claims.Role)
			c.Set("username", claims.Username)
			return next(c)
		}
	}
}

// RequireAdmin must be used AFTER Middleware().
func RequireAdmin() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			role, _ := c.Get("user_role").(string)
			if role != "admin" {
				return c.JSON(http.StatusForbidden, echo.Map{"error": "admin role required"})
			}
			return next(c)
		}
	}
}
