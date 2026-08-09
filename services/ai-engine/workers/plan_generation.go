package graphs

import (
    "context"
    "fmt"
    "time"

    "github.com/hibiken/asynq"
    "golang.org/x/sync/errgroup"

    "cadensend/internal/database"
)

// PlanGenerationWorker handles background plan generation tasks
// This worker processes plan generation jobs from the task queue
type PlanGenerationWorker struct {
    asynqClient *asynq.Client
    asynqInspector *asynq.Inspector
    planRepo *PlanGenerationGraph
    userRepo *repo.UserRepository
    workspaceRepo *repo.WorkspaceRepository
    db           *gorm.DB
}

// NewPlanGenerationWorker creates a new plan generation worker
func NewPlanGenerationWorker(asynqClient *asynq.Client, asynqInspector *asynq.Inspector) *PlanGenerationWorker {
    return &PlanGenerationWorker{
        asynqClient: asynqClient,
        asynqInspector: asynqInspector,
        planRepo: nil, // Will be set later
        userRepo: nil, // Will be set later
        workspaceRepo: nil, // Will be set later
        db:           database.Get(),
    }
}

// SetPlanGenerationGraph sets the plan generation graph
func (w *PlanGenerationWorker) SetPlanGenerationGraph(graph *PlanGenerationGraph) {
    w.planRepo = graph
}

// SetUserRepository sets the user repository
func (w *PlanGenerationWorker) SetUserRepository(repo *repo.UserRepository) {
    w.userRepo = repo
}

// SetWorkspaceRepository sets the workspace repository
func (w *PlanGenerationWorker) SetWorkspaceRepository(repo *repo.WorkspaceRepository) {
    w.workspaceRepo = repo
}

// HandleTask handles a plan generation task
// This function is called when a plan generation task is received
func (w *PlanGenerationWorker) HandleTask(ctx context.Context, t *asynq.Task) error {
    // Parse task payload
    var payload PlanGenerationTask
    if err := json.Unmarshal(t.Payload(), &payload); err != nil {
        return fmt.Errorf("failed to parse task payload: %w", err)
    }

    // Validate task
    if err := w.validateTask(&payload); err != nil {
        return fmt.Errorf("invalid task: %w", err)
    }

    // Start workflow instance
    workflowInstance := &WorkflowInstance{
        ID:         uuid.New().String(),
        WorkflowID: "plan-generation-v1",
        NodeID:     "brief-normalizer",
        State:      "pending",
        Input:      payload.Input,
        Context:    map[string]interface{}{
            "userID":     payload.UserID,
            "seriesID":   payload.SeriesID,
            "sourceID":   payload.SourceID,
            "timestamp":  time.Now().Unix(),
        },
        StartedAt:  time.Now(),
        CreatedBy:  payload.UserID,
        CreatedAt:  time.Now(),
        UpdatedAt:  time.Now(),
    }

    // Save workflow instance
    if err := w.planRepo.WorkflowRepository.Create(workflowInstance); err != nil {
        return fmt.Errorf("failed to create workflow instance: %w", err)
    }

    // Execute plan generation workflow
    if err := w.executePlanGenerationWorkflow(ctx, workflowInstance, &payload); err != nil {
        // Update workflow instance with error
        workflowInstance.State = "failed"
        workflowInstance.Error = err.Error()
        workflowInstance.UpdatedAt = time.Now()
        if err := w.planRepo.WorkflowRepository.Update(workflowInstance); err != nil {
            log.Printf("Failed to update workflow instance: %v", err)
        }
        return fmt.Errorf("failed to execute plan generation workflow: %w", err)
    }

    // Update workflow instance
    workflowInstance.State = "completed"
    workflowInstance.UpdatedAt = time.Now()
    if err := w.planRepo.WorkflowRepository.Update(workflowInstance); err != nil {
        return fmt.Errorf("failed to update workflow instance: %w", err)
    }

    return nil
}

// executePlanGenerationWorkflow executes the plan generation workflow
func (w *PlanGenerationWorker) executePlanGenerationWorkflow(ctx context.Context, workflowInstance *WorkflowInstance, payload *PlanGenerationTask) error {
    // This is a simplified implementation - in reality, you would need to handle
    // the complex workflow logic with proper error handling, retries, and state management

    // Step 1: Normalize brief
    normalizedBrief, err := w.normalizeBrief(payload.Brief)
    if err != nil {
        return fmt.Errorf("failed to normalize brief: %w", err)
    }

    // Step 2: Create curriculum
    curriculum, err := w.createCurriculum(ctx, normalizedBrief)
    if err != nil {
        return fmt.Errorf("failed to create curriculum: %w", err)
    }

    // Step 3: Check coverage and prerequisites
    if err := w.checkCoverageAndPrerequisites(ctx, curriculum); err != nil {
        return fmt.Errorf("failed to check coverage and prerequisites: %w", err)
    }

    // Step 4: Validate plan
    if err := w.validatePlan(ctx, curriculum); err != nil {
        return fmt.Errorf("failed to validate plan: %w", err)
    }

    // Step 5: Save plan to database
    plan := &SeriesPlan{
        ID:           uuid.New().String(),
        SeriesID:     payload.SeriesID,
        Version:      payload.Version,
        Curriculum:   curriculum,
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
        CreatedBy:    payload.UserID,
        Status:       "valid",
    }

    if err := w.db.Create(plan).Error; err != nil {
        return fmt.Errorf("failed to save plan: %w", err)
    }

    // Update workflow instance with output
    workflowInstance.Output = map[string]interface{}{
        "planID": plan.ID,
        "version": plan.Version,
        "status": "valid",
    }

    return nil
}

// validateTask validates a plan generation task
func (w *PlanGenerationWorker) validateTask(payload *PlanGenerationTask) error {
    if payload.SeriesID == "" {
        return errors.New("series ID is required")
    }
    if payload.UserID == "" {
        return errors.New("user ID is required")
    }
    if payload.Brief == nil {
        return errors.New("brief is required")
    }
    return nil
}

// normalizeBrief normalizes a series brief
func (w *PlanGenerationWorker) normalizeBrief(brief *SeriesBrief) (*SeriesBrief, error) {
    // Create normalized copy
    normalized := &SeriesBrief{}
    *normalized = *brief

    // Trim whitespace
    normalized.Topic = strings.TrimSpace(normalized.Topic)
    normalized.Goal = strings.TrimSpace(normalized.Goal)
    normalized.Level = strings.TrimSpace(normalized.Level)
    normalized.Timezone = strings.TrimSpace(normalized.Timezone)

    return normalized, nil
}

// createCurriculum creates a curriculum from a normalized brief
func (w *PlanGenerationWorker) createCurriculum(ctx context.Context, brief *SeriesBrief) (*Curriculum, error) {
    // This would integrate with the actual LangGraph curriculum planner
    // For now, we'll create a simple curriculum

    // Generate modules based on duration
    modules := w.generateModules(brief.Duration, brief.Goal)

    curriculum := &Curriculum{
        Objective:     brief.Goal,
        Outline:       modules,
        Prerequisites: []string{},
        TotalModules:  len(modules),
        CreatedAt:     time.Now(),
        UpdatedAt:     time.Now(),
    }

    return curriculum, nil
}

// checkCoverageAndPrerequisites checks curriculum coverage and prerequisites
func (w *PlanGenerationWorker) checkCoverageAndPrerequisites(ctx context.Context, curriculum *Curriculum) error {
    // Check if curriculum covers all required topics
    if len(curriculum.Outline) == 0 {
        return errors.New("curriculum cannot be empty")
    }

    // Check for duplicate topics
    seen := make(map[string]bool)
    for _, topic := range curriculum.Outline {
        if seen[topic] {
            return fmt.Errorf("duplicate topic in outline: %s", topic)
        }
        seen[topic] = true
    }

    return nil
}

// validatePlan validates a curriculum
func (w *PlanGenerationWorker) validatePlan(ctx context.Context, curriculum *Curriculum) error {
    // Validate curriculum structure
    if curriculum.Objective == "" {
        return errors.New("curriculum objective cannot be empty")
    }

    if len(curriculum.Outline) < 2 {
        return errors.New("curriculum must have at least 2 modules")
    }

    if curriculum.TotalModules < 1 {
        return errors.New("curriculum must have at least 1 module")
    }

    return nil
}

// generateModules generates curriculum modules based on duration and goal
func (w *PlanGenerationWorker) generateModules(duration, goal string) []string {
    // This is a simplified implementation - in reality, you would use AI to generate
    // meaningful curriculum modules based on the goal and duration

    baseModules := []string{"Introduction", "Core Concepts", "Practical Applications"}

    // Add additional modules based on goal
    if strings.Contains(strings.ToLower(goal), "advanced") {
        baseModules = append(baseModules, "Advanced Topics", "Expert Applications")
    }

    if strings.Contains(strings.ToLower(goal), "beginner") {
        baseModules = append(baseModules, "Fundamentals", "Basic Applications")
    }

    // Add modules based on duration
    switch duration {
    case "1 day":
        return baseModules[:2]
    case "1 week":
        return baseModules[:3]
    case "1 month":
        return append(baseModules, "Deep Dive", "Project Work")
    case "3 months":
        return append(baseModules, "Deep Dive", "Project Work", "Capstone")
    default:
        return baseModules
    }
}