// Package scheduler provides job scheduling for the control worker
package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"golang.org/x/sync/semaphore"

	"backend/control-worker/internal/config"
	"backend/control-worker/internal/database"
	"backend/control-worker/internal/tasks"
	"gorm.io/gorm"
)

// Schedule represents a scheduled job
type Schedule struct {
	ID          string     `gorm:"primarykey"`
	IssueID     *string    `json:"issue_id"`
	JobType     string     `json:"job_type"`
	RunAt       time.Time  `json:"run_at"`
	Status      string     `json:"status"`
	Attempts    int        `json:"attempts"`
	MaxAttempts int        `json:"max_attempts"`
	ClaimedAt   *time.Time `json:"claimed_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
	ErrorCode   string     `json:"error_code"`
	ErrorMsg    string     `json:"error_msg"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// TableName overrides the default table name
func (Schedule) TableName() string {
	return "schedules"
}

func StartScheduler(cfg *config.Config) {
	db := database.Get()

	addr, dbNum, password := parseRedisURL(cfg.RedisURL)

	asynqClient := asynq.NewClient(asynq.RedisClientOpt{Addr: addr, Password: password, DB: dbNum})
	defer asynqClient.Close()

	// Create scheduler
	s := &Scheduler{
		config:      cfg,
		db:          db,
		asynqClient: asynqClient,
		sem:         semaphore.NewWeighted(10),
	}

	// Start scheduler loop
	ctx := context.Background()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	log.Println("Scheduler started")

	// Register task handlers with Asynq mux
	mux := asynq.NewServeMux()
	mux.HandleFunc("issue:generate", tasks.GenerateIssueTask)
	mux.HandleFunc("issue:deliver", tasks.DeliverIssueTask)
	mux.HandleFunc("source:ingest", tasks.IngestSourceTask)
	mux.HandleFunc("schedule:run", tasks.ScheduleRunTask)

	server := asynq.NewServer(
		asynq.RedisClientOpt{Addr: addr, Password: password, DB: dbNum},
		asynq.Config{Concurrency: 10},
	)

	go func() {
		if err := server.Run(mux); err != nil {
			log.Fatalf("Asynq server error: %v", err)
		}
	}()

	for {
		select {
		case <-ticker.C:
			if err := s.processDueJobs(ctx); err != nil {
				log.Printf("Scheduler error: %v", err)
			}
		}
	}
}

type Scheduler struct {
	config      *config.Config
	db          *gorm.DB
	asynqClient *asynq.Client
	sem         *semaphore.Weighted
}

func (s *Scheduler) processDueJobs(ctx context.Context) error {
	now := time.Now().UTC()

	tx := s.db.Begin()

	var schedules []Schedule
	if err := tx.WithContext(ctx).
		Where("status = ? AND run_at <= ? AND attempts < ?", "pending", now, s.config.MaxAttempts).
		Order("run_at ASC").
		Limit(50).
		Find(&schedules).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to query schedules: %w", err)
	}

	for i := range schedules {
		schedules[i].Status = "claimed"
		schedules[i].ClaimedAt = &now
		tx.Save(&schedules[i])
	}

	tx.Commit()

	for i := range schedules {
		if err := s.processSchedule(ctx, &schedules[i]); err != nil {
			log.Printf("Failed to process schedule %s: %v", schedules[i].ID, err)
		}
	}

	return nil
}

func (s *Scheduler) processSchedule(ctx context.Context, schedule *Schedule) error {
	switch schedule.JobType {
	case "generation":
		return s.enqueueTask(ctx, "issue:generate", schedule)
	case "delivery":
		return s.enqueueTask(ctx, "issue:deliver", schedule)
	case "ingestion":
		return s.enqueueTask(ctx, "source:ingest", schedule)
	default:
		log.Printf("Unknown job type: %s", schedule.JobType)
		return nil
	}
}

func (s *Scheduler) enqueueTask(ctx context.Context, taskType string, schedule *Schedule) error {
	if err := s.sem.Acquire(ctx, 1); err != nil {
		return fmt.Errorf("failed to acquire semaphore: %w", err)
	}
	defer s.sem.Release(1)

	payload := map[string]interface{}{
		"schedule_id": schedule.ID,
		"attempt":     schedule.Attempts + 1,
	}

	if schedule.IssueID != nil {
		payload["issue_id"] = *schedule.IssueID
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal task payload: %w", err)
	}

	task := asynq.NewTask(taskType, body)

	_, err = s.asynqClient.Enqueue(task,
		asynq.Queue("default"),
		asynq.MaxRetry(3),
		asynq.Timeout(300*time.Second),
	)
	if err != nil {
		s.db.WithContext(ctx).Model(schedule).Updates(map[string]any{
			"status":     "pending",
			"claimed_at": nil,
			"error_msg":  err.Error(),
			"updated_at": time.Now().UTC(),
		})
	}
	return err
}

func parseRedisURL(rawURL string) (addr string, dbNum int, password string) {
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
