// Redis-backed fixed-window rate limiting for horizontally scaled API replicas.
package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

func redisAllow(ctx context.Context, client *redis.Client, key string, limit int, window time.Duration) bool {
	if client == nil || limit <= 0 {
		return true
	}
	bucket := time.Now().Unix() / int64(window.Seconds())
	rk := fmt.Sprintf("cadensend:rl:%s:%d", key, bucket)
	pipe := client.Pipeline()
	incr := pipe.Incr(ctx, rk)
	pipe.Expire(ctx, rk, window+time.Second)
	if _, err := pipe.Exec(ctx); err != nil {
		return true
	}
	count, err := incr.Result()
	if err != nil {
		return true
	}
	return count <= int64(limit)
}
