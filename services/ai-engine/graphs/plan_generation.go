package graphs

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/hibiken/asynq"
    "golang.org/x/sync/errgroup"

    "cadensend/internal/database"
)

// PlanGenerationGraph handles the LangGraph for plan generation
// This graph coordinates the entire plan generation process
type PlanGenerationGraph struct {
    asynqClient *asynq.Client
    asynqInspector *asynq.Inspector
    db           *gorm.DB
}

// NewPlanGenerationGraph creates a new plan generation graph
func NewPlanGenerationGraph(asynqClient *asynq.Client, asynqInspector *asynq.Inspector) *PlanGenerationGraph {
    return &PlanGenerationGraph{
        asynqClient: asynqClient,
        asynqInspector: asynqInspector,
        db:           database.Get(),
    }
}

// GeneratePlan generates a curriculum plan based on a series brief
func (g *PlanGenerationGraph) GeneratePlan(ctx context.Context, seriesID string) (*SeriesPlan, error) {
    // Get the series brief
    var seriesVersion contracts.SeriesVersion
    if err := g.db.Where("series_id = ? AND deleted_at IS NULL", seriesID).
        Order("version DESC").
        First(&seriesVersion).Error; err != nil {
        return nil, fmt.Errorf("failed to get series brief: %w", err)
    }

    // Unmarshal brief JSON
    var brief contracts.SeriesBrief
    if err := json.Unmarshal([]byte(seriesVersion.BriefJSON), &brief); err != nil {
        return nil, fmt.Errorf("failed to unmarshal brief: %w", err)
    }

    // Normalize the brief
    normalizedBrief, err := g.normalizeBrief(&brief)
    if err != nil {
        return nil, fmt.Errorf("failed to normalize brief: %w", err)
    }

    // Create curriculum
    curriculum, err := g.createCurriculum(ctx, normalizedBrief)
    if err != nil {
        return nil, fmt.Errorf("failed to create curriculum: %w", err)
    }

    // Check coverage and prerequisites
    if err := g.checkCoverageAndPrerequisites(ctx, curriculum); err != nil {
        return nil, fmt.Errorf("failed to check coverage and prerequisites: %w", err)
    }

    // Validate plan
    if err := g.validatePlan(ctx, curriculum); err != nil {
        return nil, fmt.Errorf("failed to validate plan: %w", err)
    }

    // Return typed plan
    plan := &SeriesPlan{
        SeriesID:     seriesID,
        Version:      seriesVersion.Version + 1,
        Curriculum:   curriculum,
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
        CreatedBy:    seriesVersion.CreatedBy,
        Status:       "valid",
    }

    if err := g.db.Create(plan).Error; err != nil {
        return nil, fmt.Errorf("failed to save plan: %w", err)
    }

    return plan, nil
}

// CreateSeriesWizard creates a new series wizard for user input
func (g *PlanGenerationGraph) CreateSeriesWizard(ctx context.Context, userID string, brief *contracts.SeriesBrief) (*Series, error) {
    // Create series
    series := &Series{
        ID:           uuid.New().String(),
        WorkspaceID:  brief.WorkspaceID,
        Slug:         generateSeriesSlug(brief.Topic),
        Topic:        brief.Topic,
        Goal:         brief.Goal,
        Level:        brief.Level,
        Timezone:     brief.Timezone,
        Status:       "draft",
        CreatedBy:    userID,
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
    }

    if err := g.db.Create(series).Error; err != nil {
        return nil, fmt.Errorf("failed to create series: %w", err)
    }

    // Create first series version with the brief
    briefJSON, err := json.Marshal(brief)
    if err != nil {
        return nil, fmt.Errorf("failed to marshal brief: %w", err)
    }

    seriesVersion := &SeriesVersion{
        ID:          uuid.New().String(),
        SeriesID:    series.ID,
        Version:     1,
        BriefJSON:   string(briefJSON),
        PromptVersion: "v1",
        CreatedBy:   userID,
        CreatedAt:   time.Now(),
        UpdatedAt:   time.Now(),
    }

    if err := g.db.Create(seriesVersion).Error; err != nil {
        return nil, fmt.Errorf("failed to create series version: %w", err)
    }

    return series, nil
}

// UpdatePlanStudio updates a plan in the plan studio
func (g *PlanGenerationGraph) UpdatePlanStudio(ctx context.Context, seriesID string, userID string, updates *SeriesPlanUpdates) error {
    // Get the current plan
    var plan SeriesPlan
    if err := g.db.Where("series_id = ? AND deleted_at IS NULL", seriesID).
        Order("version DESC").
        First(&plan).Error; err != nil {
        return fmt.Errorf("failed to get current plan: %w", err)
    }

    // Check if user has permission to update
    if plan.CreatedBy != userID {
        return errors.New("user does not have permission to update plan")
    }

    // Apply updates
    if updates.Title != nil {
        plan.Title = *updates.Title
    }
    if updates.Objective != nil {
        plan.Objective = *updates.Objective
    }
    if updates.Outline != nil {
        plan.Outline = *updates.Outline
    }
    if updates.MoveDates != nil {
        plan.MoveDates = updates.MoveDates
    }
    if updates.InsertDeleteIssues != nil {
        // Handle issue insertions and deletions
        plan.Issues = g.applyIssueUpdates(plan.Issues, updates.InsertDeleteIssues)
    }
    if updates.LockApprovedIssues != nil {
        plan.LockedIssues = *updates.LockApprovedIssues
    }
    if updates.RegenerateModule != nil {
        // Regenerate specific module
        if err := g.regenerateModule(ctx, plan, *updates.RegenerateModule); err != nil {
            return fmt.Errorf("failed to regenerate module: %w", err)
        }
    }

    plan.UpdatedAt = time.Now()
    plan.Status = "editing"

    if err := g.db.Save(&plan).Error; err != nil {
        return fmt.Errorf("failed to update plan: %w", err)
    }

    return nil
}

// Helper functions

func (g *PlanGenerationGraph) normalizeBrief(brief *contracts.SeriesBrief) (*contracts.SeriesBrief, error) {
    // Create normalized copy
    normalized := &contracts.SeriesBrief{}
    *normalized = *brief

    // Trim whitespace
    normalized.Topic = strings.TrimSpace(normalized.Topic)
    normalized.Goal = strings.TrimSpace(normalized.Goal)
    normalized.Level = strings.TrimSpace(normalized.Level)
    normalized.Timezone = strings.TrimSpace(normalized.Timezone)

    return normalized, nil
}

func (g *PlanGenerationGraph) createCurriculum(ctx context.Context, brief *contracts.SeriesBrief) (*Curriculum, error) {
    // This would integrate with the actual LangGraph implementation
    // For now, we'll create a simple curriculum
    curriculum := &Curriculum{
        Objective:  brief.Goal,
        Outline:    []string{"Introduction", "Core Concepts", "Practical Applications", "Advanced Topics", "Conclusion"},
        Prerequisites: []string{},
        TotalModules: 5,
        CreatedAt:  time.Now(),
        UpdatedAt:  time.Now(),
    }

    return curriculum, nil
}

func (g *PlanGenerationGraph) checkCoverageAndPrerequisites(ctx context.Context, curriculum *Curriculum) error {
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

func (g *PlanGenerationGraph) validatePlan(ctx context.Context, curriculum *Curriculum) error {
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

func (g *PlanGenerationGraph) applyIssueUpdates(issues []*Issue, updates []*IssueUpdate) []*Issue {
    // Apply issue updates (insert, delete, move)
    for _, update := range updates {
        switch update.Action {
        case "insert":
            if update.Issue != nil {
                issues = append(issues, update.Issue)
            }
        case "delete":
            if update.Index != nil {
                idx := *update.Index
                if idx >= 0 && idx < len(issues) {
                    issues = append(issues[:idx], issues[idx+1:]...)
                }
            }
        case "move":
            if update.From != nil && update.To != nil {
                fromIdx := *update.From
                toIdx := *update.To
                if fromIdx >= 0 && fromIdx < len(issues) && toIdx >= 0 && toIdx < len(issues) {
                    issue := issues[fromIdx]
                    issues = append(issues[:fromIdx], issues[fromIdx+1:]...)
                    if toIdx > len(issues) {
                        toIdx = len(issues)
                    }
                    issues = append(issues[:toIdx], append([]*Issue{issue}, issues[toIdx:]...)...)
                }
            }
        }
    }

    return issues
}

func (g *PlanGenerationGraph) regenerateModule(ctx context.Context, plan *SeriesPlan, moduleIndex int) error {
    if moduleIndex < 0 || moduleIndex >= len(plan.Issues) {
        return errors.New("invalid module index")
    }

    // Generate new content for the module
    issue := plan.Issues[moduleIndex]

    // This would integrate with the actual LangGraph generation
    // For now, we'll just update the objective
    issue.Objective = fmt.Sprintf("Updated objective for module %d", moduleIndex+1)
    issue.UpdatedAt = time.Now()

    // Save the issue
    if err := g.db.Save(issue).Error; err != nil {
        return fmt.Errorf("failed to save updated issue: %w", err)
    }

    return nil
}

func generateSeriesSlug(topic string) string {
    // Generate a URL-friendly slug from the topic
    slug := strings.ToLower(topic)
    slug = strings.ReplaceAll(slug, " ", "-")
    slug = strings.ReplaceAll(slug, "_", "-")
    slug = strings.ReplaceAll(slug, "&", "-and-")
    slug = strings.ReplaceAll(slug, "/", "-")

    // Remove any non-alphanumeric characters except hyphens
    re := regexp.MustCompile("[^a-z0-9-]")
    slug = re.ReplaceAllString(slug, "")

    return slug
}