package graphs

import (
    "context"
    "fmt"
    "log"
    "time"

    "github.com/hibiken/asynq"

    "cadensend/internal/database"
)

// IssueGenerationGraph handles the LangGraph for issue generation
// This graph coordinates the entire issue generation process
type IssueGenerationGraph struct {
    asynqClient *asynq.Client
    asynqInspector *asynq.Inspector
    db           *gorm.DB
}

// NewIssueGenerationGraph creates a new issue generation graph
func NewIssueGenerationGraph(asynqClient *asynq.Client, asynqInspector *asynq.Inspector) *IssueGenerationGraph {
    return &IssueGenerationGraph{
        asynqClient: asynqClient,
        asynqInspector: asynqInspector,
        db:           database.Get(),
    }
}

// GenerateIssue generates an email issue based on the input
func (g *IssueGenerationGraph) GenerateIssue(ctx context.Context, issueID string) (*IssueVersion, error) {
    // Get the issue input
    var issue Issue
    if err := g.db.Where("id = ? AND deleted_at IS NULL", issueID).First(&issue).Error; err != nil {
        return nil, fmt.Errorf("failed to get issue: %w", err)
    }

    // Get the plan
    var plan SeriesPlan
    if err := g.db.Where("series_id = ? AND deleted_at IS NULL", issue.SeriesID).
        Order("version DESC").
        First(&plan).Error; err != nil {
        return nil, fmt.Errorf("failed to get plan: %w", err)
    }

    // Check if RAG is required
    ragRequired, err := g.checkIfRAGRequired(ctx, issue)
    if err != nil {
        return nil, fmt.Errorf("failed to check if RAG required: %w", err)
    }

    var issueVersion *IssueVersion
    if ragRequired {
        // Retrieve grounded context
        groundedContext, err := g.retrieveGroundedContext(ctx, issue)
        if err != nil {
            return nil, fmt.Errorf("failed to retrieve grounded context: %w", err)
        }

        // Generate structured issue with grounded context
        issueVersion, err = g.writeStructuredIssue(ctx, &plan, issue, groundedContext)
        if err != nil {
            return nil, fmt.Errorf("failed to write structured issue: %w", err)
        }
    } else {
        // Generate structured issue without RAG
        issueVersion, err = g.writeStructuredIssue(ctx, &plan, issue, nil)
        if err != nil {
            return nil, fmt.Errorf("failed to write structured issue: %w", err)
        }
    }

    // Create visual specification
    visualSpec, err := g.createVisualSpecification(ctx, issueVersion)
    if err != nil {
        return nil, fmt.Errorf("failed to create visual specification: %w", err)
    }

    // Editorial critique
    critique, err := g.performEditorialCritique(ctx, issueVersion)
    if err != nil {
        return nil, fmt.Errorf("failed to perform editorial critique: %w", err)
    }

    // Quality gate
    if !critique.PassesQualityGate {
        // Revise
        return g.reviseIssue(ctx, issueVersion, critique.Feedback)
    }

    // Save issue version
    if err := g.db.Create(issueVersion).Error; err != nil {
        return nil, fmt.Errorf("failed to save issue version: %w", err)
    }

    // Update issue status
    issue.Status = "review"
    issue.UpdatedAt = time.Now()
    if err := g.db.Save(&issue).Error; err != nil {
        return nil, fmt.Errorf("failed to update issue: %w", err)
    }

    return issueVersion, nil
}

// checkIfRAGRequired checks if RAG is required for the issue
func (g *IssueGenerationGraph) checkIfRAGRequired(ctx context.Context, issue Issue) (bool, error) {
    // Check if the issue has sources associated
    var sourceCount int64
    if err := g.db.Model(&SourceChunk{}).
        Where("source_version_id IN (
            SELECT id FROM source_versions 
            WHERE source_id IN (
                SELECT source_id FROM source_members 
                WHERE series_id = ?
            ) AND deleted_at IS NULL
        ) AND deleted_at IS NULL", issue.SeriesID).
        Count(&sourceCount).Error; err != nil {
        return false, fmt.Errorf("failed to count sources: %w", err)
    }

    return sourceCount > 0, nil
}

// retrieveGroundedContext retrieves grounded context for the issue
func (g *IssueGenerationGraph) retrieveGroundedContext(ctx context.Context, issue Issue) (*GroundedContext, error) {
    // Create retrieval run
    retrievalRun := &RetrievalRun{
        ID:           uuid.New().String(),
        GenerationRunID: "", // Will be set when generation run is created
        Query:        issue.Objective,
        FilterJSON:   fmt.Sprintf(`{"series_id": "%s"}`, issue.SeriesID),
        Status:       "running",
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
    }

    if err := g.db.Create(retrievalRun).Error; err != nil {
        return nil, fmt.Errorf("failed to create retrieval run: %w", err)
    }

    // Perform dense search
    var chunks []SourceChunk
    if err := g.db.Where("source_version_id IN (
        SELECT id FROM source_versions 
        WHERE source_id IN (
            SELECT source_id FROM source_members 
            WHERE series_id = ?
        ) AND deleted_at IS NULL
    ) AND deleted_at IS NULL", issue.SeriesID).
        Find(&chunks).Error; err != nil {
        return nil, fmt.Errorf("failed to search chunks: %w", err)
    }

    // TODO: Apply ranking and selection logic here
    // For now, return all chunks

    // Update retrieval run
    retrievalRun.Status = "completed"
    retrievalRun.ResultIDs = g.extractChunkIDs(chunks)
    retrievalRun.UpdatedAt = time.Now()
    if err := g.db.Save(retrievalRun).Error; err != nil {
        log.Printf("Failed to save retrieval run: %v", err)
    }

    // Create grounded context
    groundedContext := &GroundedContext{
        Chunks:   chunks,
        SourceIDs: g.extractUniqueSourceIDs(chunks),
        CreatedAt: time.Now(),
    }

    return groundedContext, nil
}

// writeStructuredIssue writes a structured issue with grounded context
func (g *IssueGenerationGraph) writeStructuredIssue(ctx context.Context, plan *SeriesPlan, issue Issue, groundedContext *GroundedContext) (*IssueVersion, error) {
    // This would integrate with the actual LangGraph implementation
    // For now, we'll create a simple issue version

    // Create content blocks
    contentBlocks := []ContentBlock{
        {
            ID:    uuid.New().String(),
            Type:  "introduction",
            Title: "Introduction",
            Text:  "This is the introduction to the issue.",
            Citations: []Citation{},
        },
        {
            ID:    uuid.New().String(),
            Type:  "body",
            Title: "Main Content",
            Text:  "This is the main content of the issue.",
            Citations: []Citation{},
        },
    }

    // Add citations from grounded context if available
    if groundedContext != nil {
        for _, chunk := range groundedContext.Chunks {
            contentBlocks[1].Citations = append(contentBlocks[1].Citations, Citation{
                BlockID:   contentBlocks[1].ID,
                SourceID:  chunk.SourceVersionID,
                ChunkID:   chunk.ID,
                Locator:   fmt.Sprintf("Chunk %d", chunk.Index),
            })
        }
    }

    // Create visual specs
    visualSpecs := []VisualSpec{
        {
            ID:       uuid.New().String(),
            Type:     "mermaid",
            Content:  "graph TD\n    A[Topic] --> B[Subtopic]\n",
            AltText:  "A simple diagram showing the topic hierarchy",
            Width:    800,
            Height:   600,
            Format:   "svg",
            CreatedAt: time.Now(),
            StorageKey: uuid.New().String(),
        },
    }

    // Create citations
    citations := []Citation{}

    // Create issue version
    issueVersion := &IssueVersion{
        ID:          uuid.New().String(),
        IssueID:    issue.ID,
        Version:    1,
        ContentJSON: fmt.Sprintf("{\"subject\": \"%s\", \"preheader\": \"Preview\", \"content_blocks\": %s, \"visual_specs\": %s, \"citations\": %s}",
            issue.Objective,
            g.marshalContentBlocks(contentBlocks),
            g.marshalVisualSpecs(visualSpecs),
            g.marshalCitations(citations)),
        Subject:    issue.Objective,
        Preheader:  "Preview",
        Checksum:   "",
        CreatedBy:  issue.CreatedBy,
        CreatedAt:  time.Now(),
        UpdatedAt:  time.Now(),
    }

    return issueVersion, nil
}

// createVisualSpecification creates a visual specification for the issue
func (g *IssueGenerationGraph) createVisualSpecification(ctx context.Context, issueVersion *IssueVersion) (*VisualSpec, error) {
    // This would integrate with the actual visual generation logic
    // For now, we'll create a simple visual spec

    visualSpec := &VisualSpec{
        ID:        uuid.New().String(),
        Type:      "mermaid",
        Content:   "graph TD\n    A[Topic] --> B[Subtopic]\n",
        AltText:   "A simple diagram showing the topic hierarchy",
        Width:     800,
        Height:    600,
        Format:    "svg",
        CreatedAt: time.Now(),
        StorageKey: uuid.New().String(),
    }

    // Save visual spec
    if err := g.db.Create(visualSpec).Error; err != nil {
        return nil, fmt.Errorf("failed to create visual spec: %w", err)
    }

    return visualSpec, nil
}

// performEditorialCritique performs editorial critique on the issue
func (g *IssueGenerationGraph) performEditorialCritique(ctx context.Context, issueVersion *IssueVersion) (*EditorialCritique, error) {
    // This would integrate with the actual LangGraph critique logic
    // For now, we'll create a simple critique

    critique := &EditorialCritique{
        PassesQualityGate: true,
        Feedback:         "Issue looks good!",
        Suggestions:      []string{"Consider adding more examples"},
        CreatedAt:        time.Now(),
    }

    return critique, nil
}

// reviseIssue revises an issue based on feedback
func (g *IssueGenerationGraph) reviseIssue(ctx context.Context, issueVersion *IssueVersion, feedback string) (*IssueVersion, error) {
    // This would integrate with the actual LangGraph revision logic
    // For now, we'll just update the issue version

    // Increment version
    issueVersion.Version++
    issueVersion.UpdatedAt = time.Now()

    // Update content (simplified)
    issueVersion.ContentJSON = fmt.Sprintf("{\"version\": %d, \"original\": %s}", issueVersion.Version, issueVersion.ContentJSON)

    // Save updated issue version
    if err := g.db.Save(issueVersion).Error; err != nil {
        return nil, fmt.Errorf("failed to save revised issue: %w", err)
    }

    return issueVersion, nil
}

// Helper functions

func (g *IssueGenerationGraph) extractChunkIDs(chunks []SourceChunk) []string {
    ids := []string{}
    for _, chunk := range chunks {
        ids = append(ids, chunk.ID)
    }
    return ids
}

func (g *IssueGenerationGraph) extractUniqueSourceIDs(chunks []SourceChunk) []string {
    seen := make(map[string]bool)
    ids := []string{}
    for _, chunk := range chunks {
        if !seen[chunk.SourceVersionID] {
            seen[chunk.SourceVersionID] = true
            ids = append(ids, chunk.SourceVersionID)
        }
    }
    return ids
}

func (g *IssueGenerationGraph) marshalContentBlocks(blocks []ContentBlock) string {
    jsonBytes, err := json.Marshal(blocks)
    if err != nil {
        return "[]"
    }
    return string(jsonBytes)
}

func (g *IssueGenerationGraph) marshalVisualSpecs(specs []VisualSpec) string {
    jsonBytes, err := json.Marshal(specs)
    if err != nil {
        return "[]"
    }
    return string(jsonBytes)
}

func (g *IssueGenerationGraph) marshalCitations(citations []Citation) string {
    jsonBytes, err := json.Marshal(citations)
    if err != nil {
        return "[]"
    }
    return string(jsonBytes)
}