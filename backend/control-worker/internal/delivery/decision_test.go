package delivery

import (
	"testing"
	"time"
)

func strPtr(s string) *string { return &s }

func TestDecideDeliverySendsReadyContent(t *testing.T) {
	issue := &issueRow{Status: "ready", ContentJSON: strPtr(`{"subject":"x"}`)}
	series := &seriesRow{Status: "active"}
	if got := decideDelivery(issue, series); got.action != actionSend {
		t.Fatalf("want send, got %+v", got)
	}
}

func TestDecideDeliveryDefersPausedSeries(t *testing.T) {
	issue := &issueRow{Status: "approved", ContentJSON: strPtr(`{"subject":"x"}`)}
	series := &seriesRow{Status: "paused"}
	got := decideDelivery(issue, series)
	if got.action != actionDefer || got.delay != pausedRecheckDelay {
		t.Fatalf("paused series must defer, got %+v", got)
	}
}

func TestDecideDeliveryCancelsDeletedRows(t *testing.T) {
	now := time.Now()
	ready := strPtr(`{"subject":"x"}`)
	cases := map[string]deliveryDecision{
		"missing issue":  decideDelivery(nil, &seriesRow{}),
		"deleted issue":  decideDelivery(&issueRow{DeletedAt: &now, ContentJSON: ready}, &seriesRow{}),
		"missing series": decideDelivery(&issueRow{ContentJSON: ready}, nil),
		"deleted series": decideDelivery(&issueRow{ContentJSON: ready}, &seriesRow{DeletedAt: &now}),
	}
	for name, got := range cases {
		if got.action != actionCancel {
			t.Errorf("%s: want cancel, got %+v", name, got)
		}
	}
}

func TestDecideDeliveryWaitsOnGenerationAndFailsWithoutContent(t *testing.T) {
	series := &seriesRow{Status: "active"}
	if got := decideDelivery(&issueRow{Status: "generating"}, series); got.action != actionDefer {
		t.Errorf("generating issue should defer, got %+v", got)
	}
	if got := decideDelivery(&issueRow{Status: "failed"}, series); got.action != actionFail {
		t.Errorf("failed generation should fail the send, got %+v", got)
	}
	if got := decideDelivery(&issueRow{Status: "ready"}, series); got.action != actionFail {
		t.Errorf("issue with no content should fail the send, got %+v", got)
	}
}

func TestRetryDelayBacksOffAndCaps(t *testing.T) {
	want := []time.Duration{time.Minute, 2 * time.Minute, 4 * time.Minute, 8 * time.Minute}
	for i, w := range want {
		if got := retryDelay(i + 1); got != w {
			t.Errorf("attempt %d: want %v, got %v", i+1, w, got)
		}
	}
	if got := retryDelay(50); got != time.Hour {
		t.Errorf("large attempt counts must cap at 1h, got %v", got)
	}
	if got := retryDelay(0); got != time.Minute {
		t.Errorf("attempt 0 should behave like 1, got %v", got)
	}
}
