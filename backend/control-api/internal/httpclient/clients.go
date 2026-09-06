// Package httpclient provides shared outbound HTTP clients for the control API.
package httpclient

import (
	"net"
	"net/http"
	"sync"
	"time"
)

var (
	standardOnce   sync.Once
	streamingOnce  sync.Once
	standardClient *http.Client
	streamingClient *http.Client
)

// Standard is for short JSON service-to-service calls (AI engine proxy, brief extract).
func Standard() *http.Client {
	standardOnce.Do(func() {
		standardClient = &http.Client{
			Timeout: 90 * time.Second,
			Transport: &http.Transport{
				Proxy: http.ProxyFromEnvironment,
				DialContext: (&net.Dialer{
					Timeout:   5 * time.Second,
					KeepAlive: 30 * time.Second,
				}).DialContext,
				MaxIdleConns:        200,
				MaxIdleConnsPerHost: 50,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		}
	})
	return standardClient
}

// Streaming is for long-lived SSE upstreams (assistant chat). No overall timeout.
func Streaming() *http.Client {
	streamingOnce.Do(func() {
		streamingClient = &http.Client{
			Transport: &http.Transport{
				Proxy: http.ProxyFromEnvironment,
				DialContext: (&net.Dialer{
					Timeout:   5 * time.Second,
					KeepAlive: 30 * time.Second,
				}).DialContext,
				MaxIdleConns:        200,
				MaxIdleConnsPerHost: 50,
				IdleConnTimeout:     120 * time.Second,
				ResponseHeaderTimeout: 60 * time.Second,
				TLSHandshakeTimeout:   10 * time.Second,
			},
		}
	})
	return streamingClient
}
