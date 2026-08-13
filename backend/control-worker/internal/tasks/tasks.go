package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
)

type TaskPayload struct {
	IssueID    string `json:"issue_id"`
	ScheduleID string `json:"schedule_id"`
	Attempt    int    `json:"attempt"`
}

type DeliverFunc func(ctx context.Context, issueID, scheduleID string) error

var deliverScheduled DeliverFunc

func SetDeliverer(fn DeliverFunc) {
	deliverScheduled = fn
}

func GenerateIssueTask(ctx context.Context, t *asynq.Task) error {
	var payload TaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to parse task payload: %w", err)
	}
	log.Printf("Processing issue generation task for issue: %s", payload.IssueID)
	return nil
}

func DeliverIssueTask(ctx context.Context, t *asynq.Task) error {
	var payload TaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to parse task payload: %w", err)
	}
	if deliverScheduled == nil {
		return fmt.Errorf("delivery worker is not configured")
	}
	if payload.IssueID == "" {
		return fmt.Errorf("issue_id is required")
	}
	log.Printf("Delivering scheduled issue %s (schedule %s)", payload.IssueID, payload.ScheduleID)
	return deliverScheduled(ctx, payload.IssueID, payload.ScheduleID)
}

func IngestSourceTask(ctx context.Context, t *asynq.Task) error {
	var payload TaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to parse task payload: %w", err)
	}
	log.Printf("Processing source ingestion task")
	return nil
}

func ScheduleRunTask(ctx context.Context, t *asynq.Task) error {
	var payload TaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to parse task payload: %w", err)
	}
	log.Printf("Processing scheduled task for schedule: %s", payload.ScheduleID)
	return nil
}
