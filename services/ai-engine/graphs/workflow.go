// Package graphs handles LangGraph workflow definitions
// This package defines the flow and state machines for plan and issue generation
type PlanGenerationWorkflow struct {
    // Nodes in the plan generation workflow
    Nodes []GraphNode `json:"nodes"`
    
    // Edges connecting nodes
    Edges []GraphEdge `json:"edges"`
    
    // State machine definitions
    StateMachine StateMachineDefinition `json:"state_machine"`
}

// GraphNode represents a node in the LangGraph
type GraphNode struct {
    ID           string `json:"id" db:"id,pk"`
    Type         string `json:"type" db:"type,notnull"`
    Name         string `json:"name" db:"name,notnull"`
    Description  string `json:"description"`
    Parameters   JSON   `json:"parameters" db:"parameters"`
    FunctionName string `json:"function_name" db:"function_name"`
    Dependencies []string `json:"dependencies" db:"dependencies"`
    CreatedAt    time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt    time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// GraphEdge represents an edge between graph nodes
type GraphEdge struct {
    ID        string `json:"id" db:"id,pk"`
    Source    string `json:"source" db:"source,notnull"`
    Target    string `json:"target" db:"target,notnull"`
    Condition string `json:"condition" db:"condition"`
    CreatedAt time.Time `json:"created_at" db:"created_at,notnull"`
}

// StateMachineDefinition defines the state machine for workflows
type StateMachineDefinition struct {
    ID           string `json:"id" db:"id,pk"`
    Name         string `json:"name" db:"name,notnull"`
    Description  string `json:"description"`
    InitialState string `json:"initial_state" db:"initial_state,notnull"`
    States       []StateDefinition `json:"states" db:"states"`
    Transitions  []TransitionDefinition `json:"transitions" db:"transitions"`
}

// StateDefinition defines a state in the state machine
type StateDefinition struct {
    ID          string `json:"id" db:"id,pk"`
    Name        string `json:"name" db:"name,notnull"`
    Description string `json:"description"`
    Type        string `json:"type" db:"type,notnull"`
    Actions     []ActionDefinition `json:"actions" db:"actions"`
    CreatedAt   time.Time `json:"created_at" db:"created_at,notnull"`
}

// TransitionDefinition defines a transition between states
type TransitionDefinition struct {
    ID           string `json:"id" db:"id,pk"`
    FromState    string `json:"from_state" db:"from_state,notnull"`
    ToState      string `json:"to_state" db:"to_state,notnull"`
    Condition    string `json:"condition" db:"condition"`
    Actions      []ActionDefinition `json:"actions" db:"actions"`
    CreatedAt    time.Time `json:"created_at" db:"created_at,notnull"`
}

// ActionDefinition defines an action in a state or transition
type ActionDefinition struct {
    ID          string `json:"id" db:"id,pk"`
    Name        string `json:"name" db:"name,notnull"`
    Type        string `json:"type" db:"type,notnull"`
    Handler     string `json:"handler" db:"handler,notnull"`
    Parameters  JSON   `json:"parameters" db:"parameters"`
    Timeout     int    `json:"timeout" db:"timeout"`
    Retries     int    `json:"retries" db:"retries"`
    CreatedAt   time.Time `json:"created_at" db:"created_at,notnull"`
}

// WorkflowInstance represents a running instance of a workflow
type WorkflowInstance struct {
    ID          string `json:"id" db:"id,pk"`
    WorkflowID  string `json:"workflow_id" db:"workflow_id,notnull"`
    NodeID      string `json:"node_id" db:"node_id"`
    State       string `json:"state" db:"state,notnull"`
    Input       JSON   `json:"input" db:"input"`
    Output      JSON   `json:"output" db:"output"`
    Context     JSON   `json:"context" db:"context"`
    StartedAt   time.Time `json:"started_at" db:"started_at,notnull"`
    CompletedAt *time.Time `json:"completed_at,omitempty" db:"completed_at"`
    Error       string  `json:"error" db:"error"`
    CreatedBy   string `json:"created_by" db:"created_by,notnull"`
    CreatedAt   time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt   time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// WorkflowRepository handles database operations for workflow instances
// This repository provides methods for creating, reading, updating, and deleting workflow instances
type WorkflowRepository struct {
    db *gorm.DB
}

// NewWorkflowRepository creates a new workflow repository
func NewWorkflowRepository(db *gorm.DB) *WorkflowRepository {
    return &WorkflowRepository{db: db}
}

// Create creates a new workflow instance
func (r *WorkflowRepository) Create(workflow *WorkflowInstance) error {
    return r.db.Create(workflow).Error
}

// GetByID retrieves a workflow instance by ID
func (r *WorkflowRepository) GetByID(id string) (*WorkflowInstance, error) {
    var workflow WorkflowInstance
    if err := r.db.Where("id = ?", id).First(&workflow).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("workflow instance not found")
        }
        return nil, err
    }
    return &workflow, nil
}

// GetByWorkflowID retrieves workflow instances for a workflow
func (r *WorkflowRepository) GetByWorkflowID(workflowID string, limit, offset int) ([]WorkflowInstance, error) {
    var workflows []WorkflowInstance
    if err := r.db.Where("workflow_id = ?", workflowID).
        Order("created_at DESC").
        Limit(limit).
        Offset(offset).
        Find(&workflows).Error; err != nil {
        return nil, err
    }
    return workflows, nil
}

// Update updates a workflow instance
func (r *WorkflowRepository) Update(workflow *WorkflowInstance) error {
    return r.db.Save(workflow).Error
}

// Delete deletes a workflow instance
func (r *WorkflowRepository) Delete(id string) error {
    result := r.db.Where("id = ?", id).Delete(&WorkflowInstance{})
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errors.New("workflow instance not found")
    }
    return nil
}

// WorkflowNodeRepository handles database operations for workflow nodes
// This repository provides methods for creating, reading, updating, and deleting workflow nodes
type WorkflowNodeRepository struct {
    db *gorm.DB
}

// NewWorkflowNodeRepository creates a new workflow node repository
func NewWorkflowNodeRepository(db *gorm.DB) *WorkflowNodeRepository {
    return &WorkflowNodeRepository{db: db}
}

// Create creates a new workflow node
func (r *WorkflowNodeRepository) Create(node *GraphNode) error {
    return r.db.Create(node).Error
}

// GetByID retrieves a workflow node by ID
func (r *WorkflowNodeRepository) GetByID(id string) (*GraphNode, error) {
    var node GraphNode
    if err := r.db.Where("id = ?", id).First(&node).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("workflow node not found")
        }
        return nil, err
    }
    return &node, nil
}

// GetByWorkflowID retrieves workflow nodes for a workflow
func (r *WorkflowNodeRepository) GetByWorkflowID(workflowID string, limit, offset int) ([]GraphNode, error) {
    var nodes []GraphNode
    if err := r.db.Where("workflow_id = ?", workflowID).
        Order("created_at DESC").
        Limit(limit).
        Offset(offset).
        Find(&nodes).Error; err != nil {
        return nil, err
    }
    return nodes, nil
}

// Update updates a workflow node
func (r *WorkflowNodeRepository) Update(node *GraphNode) error {
    return r.db.Save(node).Error
}

// Delete deletes a workflow node
func (r *WorkflowNodeRepository) Delete(id string) error {
    result := r.db.Where("id = ?", id).Delete(&GraphNode{})
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errors.New("workflow node not found")
    }
    return nil
}

// WorkflowEdgeRepository handles database operations for workflow edges
// This repository provides methods for creating, reading, updating, and deleting workflow edges
type WorkflowEdgeRepository struct {
    db *gorm.DB
}

// NewWorkflowEdgeRepository creates a new workflow edge repository
func NewWorkflowEdgeRepository(db *gorm.DB) *WorkflowEdgeRepository {
    return &WorkflowEdgeRepository{db: db}
}

// Create creates a new workflow edge
func (r *WorkflowEdgeRepository) Create(edge *GraphEdge) error {
    return r.db.Create(edge).Error
}

// GetByID retrieves a workflow edge by ID
func (r *WorkflowEdgeRepository) GetByID(id string) (*GraphEdge, error) {
    var edge GraphEdge
    if err := r.db.Where("id = ?", id).First(&edge).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("workflow edge not found")
        }
        return nil, err
    }
    return &edge, nil
}

// GetByWorkflowID retrieves workflow edges for a workflow
func (r *WorkflowEdgeRepository) GetByWorkflowID(workflowID string, limit, offset int) ([]GraphEdge, error) {
    var edges []GraphEdge
    if err := r.db.Where("workflow_id = ?", workflowID).
        Order("created_at DESC").
        Limit(limit).
        Offset(offset).
        Find(&edges).Error; err != nil {
        return nil, err
    }
    return edges, nil
}

// Update updates a workflow edge
func (r *WorkflowEdgeRepository) Update(edge *GraphEdge) error {
    return r.db.Save(edge).Error
}

// Delete deletes a workflow edge
func (r *WorkflowEdgeRepository) Delete(id string) error {
    result := r.db.Where("id = ?", id).Delete(&GraphEdge{})
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errors.New("workflow edge not found")
    }
    return nil
}