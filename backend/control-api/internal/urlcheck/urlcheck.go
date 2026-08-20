package urlcheck

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

func ValidatePublicHTTPURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return fmt.Errorf("invalid url")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("only http and https urls are allowed")
	}
	host := parsed.Hostname()
	if host == "localhost" || strings.HasSuffix(strings.ToLower(host), ".localhost") {
		return fmt.Errorf("url host is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if blockedIP(ip) {
			return fmt.Errorf("url host is not allowed")
		}
		return nil
	}
	addrs, err := net.LookupIP(host)
	if err != nil || len(addrs) == 0 {
		return fmt.Errorf("url host could not be resolved")
	}
	for _, ip := range addrs {
		if blockedIP(ip) {
			return fmt.Errorf("url host is not allowed")
		}
	}
	return nil
}

func blockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
	}
	return false
}
