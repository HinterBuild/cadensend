package scheduler

import (
    "context"
    "errors"
    "time"

    "github.com/hibiken/asynq"
    "golang.org/x/sync/semaphore"

    "cadensend/internal/database"
)

type SchedulerConfig struct {
    IntervalSeconds int
    BatchSize      int
    MaxAttempts    int
}

type Scheduler struct {
    config     *SchedulerConfig
    db         *gorm.DB
    sem        *semaphore.Weighted
    asynqClient *asynq.Client
}

func NewScheduler(config *SchedulerConfig, client *asynq.Client) *Scheduler {
    return &Scheduler{
        config:     config,
        db:         database.Get(),
        asynqClient: client,
        sem:        semaphore.NewWeighted(int64(config.BatchSize)),
    }
}

func (s *Scheduler) Start(ctx context.Context) {
    ticker := time.NewTicker(time.Duration(s.config.IntervalSeconds) * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            if err := s.processDueJobs(ctx); err != nil {
                log.Printf("Scheduler error: %v", err)
            }
        case <-ctx.Done():
            return
        }
    }
}

func (s *Scheduler) processDueJobs(ctx context.Context) error {
    now := time.Now().UTC()

    // Claim a bounded due-job batch with FOR UPDATE SKIP LOCKED
    tx := s.db.Begin()
    defer func() {
        if r := recover(); r != nil {
            tx.Rollback()
        }
    }()

    var schedules []Schedule
    if err := tx.WithContext(ctx).
        Set("gorm:query_option", "FOR UPDATE SKIP LOCKED").
        Where("status = ? AND run_at <= ? AND attempts < ?", "pending", now, s.config.MaxAttempts).
        Order("run_at ASC").
        Limit(s.config.BatchSize).
        Find(&schedules).Error; err != nil {
        tx.Rollback()
        return fmt.Errorf("failed to query schedules: %w", err)
    }

    for i := range schedules {
        schedules[i].Status = "claimed"
        schedules[i].ClaimedAt = &now
        if err := tx.Save(&schedules[i]).Error; err != nil {
            tx.Rollback()
            return fmt.Errorf("failed to claim schedule: %w", err)
        }
    }

    if err := tx.Commit(); err != nil {
        return fmt.Errorf("failed to commit schedule claim: %w", err)
    }

    // Process jobs outside the transaction
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
        return s.enqueueGenerationJob(ctx, schedule)
    case "delivery":
        return s.enqueueDeliveryJob(ctx, schedule)
    case "ingestion":
        return s.enqueueIngestionJob(ctx, schedule)
    default:
        return errors.New("unknown job type: " + schedule.JobType)
    }
}

func (s *Scheduler) enqueueGenerationJob(ctx context.Context, schedule *Schedule) error {
    if err := s.sem.Acquire(ctx, 1); err != nil {
        return fmt.Errorf("failed to acquire semaphore: %w", err)
    }
    defer s.sem.Release(1)

    issueID := schedule.IssueID
    if issueID == "" {
        return errors.New("issue ID is required for generation jobs")
    }

    task := asynq.NewTask("issue:generate", map[string]interface{}{
        "issue_id":     issueID,
        "schedule_id":  schedule.ID,
        "attempt":      schedule.Attempts + 1,
    })

    _, err := s.asynqClient.Enqueue(task,
        asynq.Queue("default"),
        asynq.MaxRetry(3),
        asynq.Timeout(300),
    )

    return err
}

func (s *Scheduler) enqueueDeliveryJob(ctx context.Context, schedule *Schedule) error {
    if err := s.sem.Acquire(ctx, 1); err != nil {
        return fmt.Errorf("failed to acquire semaphore: %w", err)
    }
    defer s.sem.Release(1)

    issueID := schedule.IssueID
    if issueID == "" {
        return errors.New("issue ID is required for delivery jobs")
    }

    task := asynq.NewTask("issue:deliver", map[string]interface{}{
        "issue_id":     issueID,
        "schedule_id":  schedule.ID,
        "attempt":      schedule.Attempts + 1,
    })

    _, err := s.asynqClient.Enqueue(task,
        asynq.Queue("default"),
        asynq.MaxRetry(3),
        asynq.Timeout(120),
    )

    return err
}

func (s *Scheduler) enqueueIngestionJob(ctx context.Context, schedule *Schedule) error {
    if err := s.sem.Acquire(ctx, 1); err != nil {
        return fmt.Errorf("failed to acquire semaphore: %w", err)
    }
    defer s.sem.Release(1)

    sourceID := schedule.IssueID
    if sourceID == "" {
        return errors.New("source ID is required for ingestion jobs")
    }

    task := asynq.NewTask("source:ingest", map[string]interface{}{
        "source_id":    sourceID,
        "schedule_id":  schedule.ID,
        "attempt":      schedule.Attempts + 1,
    })

    _, err := s.asynqClient.Enqueue(task,
        asynq.Queue("default"),
        asynq.MaxRetry(3),
        asynq.Timeout(600),
    )

    return err
}