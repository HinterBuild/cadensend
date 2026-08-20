package urlcheck

import "testing"

func TestValidatePublicHTTPURL(t *testing.T) {
	if err := ValidatePublicHTTPURL("https://example.com/path"); err != nil {
		t.Fatalf("example.com should be allowed: %v", err)
	}
	blocked := []string{
		"ftp://example.com",
		"http://127.0.0.1/",
		"http://localhost:8080",
		"http://10.0.0.5/secret",
		"http://192.168.1.1",
		"http://169.254.169.254/latest/meta-data/",
		"http://0.0.0.0/",
	}
	for _, raw := range blocked {
		if err := ValidatePublicHTTPURL(raw); err == nil {
			t.Fatalf("expected block for %s", raw)
		}
	}
}
