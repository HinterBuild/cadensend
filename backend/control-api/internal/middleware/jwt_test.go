package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

func signTestToken(secret string, claims Claims) (string, error) {
	claims.RegisteredClaims = jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func TestJWTMiddlewareRejectsMissingHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(JWTMiddleware("test-secret", nil))
	router.GET("/protected", func(c *gin.Context) { c.Status(http.StatusOK) })

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/protected", nil))

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTMiddlewareRejectsInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(JWTMiddleware("test-secret", nil))
	router.GET("/protected", func(c *gin.Context) { c.Status(http.StatusOK) })

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer not-a-valid-jwt")
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestJWTMiddlewareAcceptsValidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := "test-secret"
	token, err := signTestToken(secret, Claims{
		UserID:       "user-1",
		WorkspaceID:  "ws-1",
		Email:        "a@example.com",
		Role:         "owner",
		TokenVersion: 1,
	})
	assert.NoError(t, err)

	var gotUser, gotWorkspace string
	router := gin.New()
	router.Use(JWTMiddleware(secret, nil))
	router.GET("/protected", func(c *gin.Context) {
		gotUser = c.GetString("user_id")
		gotWorkspace = c.GetString("workspace_id")
		c.Status(http.StatusOK)
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "user-1", gotUser)
	assert.Equal(t, "ws-1", gotWorkspace)
}

func TestJWTMiddlewareRejectsEmptyUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := "test-secret"
	token, err := signTestToken(secret, Claims{WorkspaceID: "ws-1", TokenVersion: 1})
	assert.NoError(t, err)

	router := gin.New()
	router.Use(JWTMiddleware(secret, nil))
	router.GET("/protected", func(c *gin.Context) { c.Status(http.StatusOK) })

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}
