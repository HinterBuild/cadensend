package telemetry

import (
	"context"

	"github.com/gin-gonic/gin"
)

func Init(serviceName string) context.CancelFunc {
	return func() {}
}

func Middleware(serviceName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}
