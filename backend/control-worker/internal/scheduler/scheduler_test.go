package scheduler

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseRedisURLBasic(t *testing.T) {
	addr, db, pass := parseRedisURL("redis://localhost:6379/0")
	assert.Equal(t, "localhost:6379", addr)
	assert.Equal(t, 0, db)
	assert.Empty(t, pass)
}

func TestParseRedisURLWithPasswordAndDB(t *testing.T) {
	addr, db, pass := parseRedisURL("redis://:s3cret@redis:6379/2")
	assert.Equal(t, "redis:6379", addr)
	assert.Equal(t, 2, db)
	assert.Equal(t, "s3cret", pass)
}

func TestParseRedisURLInvalidFallsBack(t *testing.T) {
	addr, db, pass := parseRedisURL("not-a-valid-url")
	// url.Parse treats bare strings as path-only; host may be empty.
	assert.Equal(t, 0, db)
	assert.Empty(t, pass)
	assert.NotPanics(t, func() { _ = addr })
}
