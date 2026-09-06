// Package redisclient provides a shared Redis connection for the control API.
package redisclient

import (
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
)

var (
	once   sync.Once
	client *redis.Client
)

// Init creates the shared Redis client. Safe to call multiple times.
func Init(redisURL string) *redis.Client {
	once.Do(func() {
		addr, dbNum, password := parseRedisURL(redisURL)
		client = redis.NewClient(&redis.Options{
			Addr:         addr,
			Password:     password,
			DB:           dbNum,
			PoolSize:     50,
			MinIdleConns: 5,
			PoolTimeout:  4 * time.Second,
			ReadTimeout:  3 * time.Second,
			WriteTimeout: 3 * time.Second,
		})
	})
	return client
}

// Get returns the shared client, or nil if Init was never called.
func Get() *redis.Client {
	return client
}

// Close shuts down the shared client.
func Close() error {
	if client == nil {
		return nil
	}
	return client.Close()
}

// ParseRedisURL splits a redis:// URL into connection parts.
func ParseRedisURL(rawURL string) (addr string, dbNum int, password string) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL, 0, ""
	}
	addr = u.Host
	if u.User != nil {
		password, _ = u.User.Password()
	}
	if u.Path != "" && u.Path != "/" {
		path := strings.TrimPrefix(u.Path, "/")
		parts := strings.Split(path, "/")
		if len(parts) > 0 && parts[0] != "" {
			dbNum, _ = strconv.Atoi(parts[0])
		}
	}
	return addr, dbNum, password
}

func parseRedisURL(rawURL string) (addr string, dbNum int, password string) {
	return ParseRedisURL(rawURL)
}
