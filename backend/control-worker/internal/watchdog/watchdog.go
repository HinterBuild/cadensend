// Package watchdog reaps stuck jobs so a crashed worker cannot leave
// entities permanently locked in an in-progress state.
package watchdog

import (
	"context"
	"log"
	"time"

	"gorm.io/gorm"

	"backend/control-worker/internal/config"
	"backend/control-worker/internal/database"
)

const (
	stuckScheduleAge = 15 * time.Minute
	stuckIssueAge    = 45 * time.Minute
	stuckPlanAge     = 45 * time.Minute
)

// Start launches the watchdog loop; it returns immediately.
func Start(cfg *config.Config) {
	go run(cfg)
}

func run(cfg *config.Config) {
	db := database.Get()
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()
	log.Println("Watchdog started")

	for range ticker.C {
		sweep(db)
	}
}

func sweep(db *gorm.DB) {
	ctx := context.Background()
	now := time.Now().UTC()

	// 1. Delivery schedules claimed but never finished (worker crash).
	result := db.WithContext(ctx).
		Exec(`UPDATE schedules SET status = 'pending', claimed_at = NULL,
		      error_msg = 'reclaimed by watchdog after being stuck', updated_at = ?
		      WHERE status IN ('claimed','running')
		        AND COALESCE(started_at, claimed_at, updated_at) < ?`,
			now, now.Add(-stuckScheduleAge))
	if result.Error != nil {
		log.Printf("watchdog schedule sweep failed: %v", result.Error)
	} else if result.RowsAffected > 0 {
		log.Printf("watchdog reclaimed %d stuck schedule(s)", result.RowsAffected)
	}

	// 2. Issues whose generation never completed.
	result = db.WithContext(ctx).
		Exec(`UPDATE issues SET status = 'failed',
		      generate_error = 'generation timed out; the worker stopped responding. Retry from the issue editor.',
		      updated_at = ?
		      WHERE status = 'generating' AND updated_at < ? AND deleted_at IS NULL`,
			now, now.Add(-stuckIssueAge))
	if result.Error != nil {
		log.Printf("watchdog issue sweep failed: %v", result.Error)
	} else if result.RowsAffected > 0 {
		log.Printf("watchdog failed %d stalled issue generation(s)", result.RowsAffected)
	}

	// 3. Series plans stuck generating.
	result = db.WithContext(ctx).
		Exec(`UPDATE series SET plan_status = 'failed',
		      plan_error = 'plan generation timed out; the worker stopped responding. Regenerate from the series page.',
		      updated_at = ?
		      WHERE plan_status = 'generating' AND updated_at < ? AND deleted_at IS NULL`,
			now, now.Add(-stuckPlanAge))
	if result.Error != nil {
		log.Printf("watchdog plan sweep failed: %v", result.Error)
	} else if result.RowsAffected > 0 {
		log.Printf("watchdog failed %d stalled plan generation(s)", result.RowsAffected)
	}
}
