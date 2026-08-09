// Series types for the control API

package service

import (
    "time"
)

// SeriesPlan represents a version of a series curriculum plan
type SeriesPlan struct {
    ID           string    `json:"id" db:"id,pk"`
    SeriesID     string    `json:"series_id" db:"series_id,notnull"`
    Version      int       `json:"version" db:"version,notnull"`
    Curriculum   Curriculum `json:"curriculum" db:"curriculum"`
    Status       string    `json:"status" db:"status,notnull"`
    CreatedBy    string    `json:"created_by" db:"created_by,notnull"`
    CreatedAt    time.Time `json:"created_at" db:"created_at,notnull"`
    UpdatedAt    time.Time `json:"updated_at" db:"updated_at,notnull"`
}

// Curriculum represents the structured plan content
type Curriculum struct {
    Objective         string   `json:"objective" db:"objective"`
    Outline           []string `json:"outline" db:"outline"`
    Prerequisites     []string `json:"prerequisites" db:"prerequisites"`
    TotalModules      int      `json:"total_modules" db:"total_modules"`
    RevisionCount     int      `json:"revision_count" db:"revision_count"`
    PromptVersion     string   `json:"prompt_version" db:"prompt_version"`
}
