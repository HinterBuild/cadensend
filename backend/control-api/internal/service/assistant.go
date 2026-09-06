package service

import "time"

// AssistantThread stores a persisted Cadensend AI conversation.
type AssistantThread struct {
	ID          string    `json:"id" gorm:"primarykey"`
	WorkspaceID string    `json:"workspace_id" gorm:"not null;index:idx_assistant_threads_workspace_user,priority:1"`
	UserID      string    `json:"user_id" gorm:"not null;index:idx_assistant_threads_workspace_user,priority:2"`
	Title       string    `json:"title" gorm:"not null;default:''"`
	Agent       string    `json:"agent" gorm:"not null;default:'operator'"`
	Model       string    `json:"model" gorm:"not null;default:''"`
	CreatedAt   time.Time `json:"created_at" gorm:"not null"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"not null;index:idx_assistant_threads_workspace_user,priority:3,sort:desc"`
}

func (AssistantThread) TableName() string { return "assistant_threads" }

// AssistantMessage stores one message in an assistant thread.
type AssistantMessage struct {
	ID        string    `json:"id" gorm:"primarykey"`
	ThreadID  string    `json:"thread_id" gorm:"not null;index:idx_assistant_messages_thread_seq,priority:1"`
	Role      string    `json:"role" gorm:"not null"`
	Content   string    `json:"content" gorm:"not null;default:''"`
	Metadata  string    `json:"metadata" gorm:"type:jsonb;not null;default:'{}'"`
	Sequence  int       `json:"sequence" gorm:"not null;index:idx_assistant_messages_thread_seq,priority:2"`
	CreatedAt time.Time `json:"created_at" gorm:"not null"`
}

func (AssistantMessage) TableName() string { return "assistant_messages" }
