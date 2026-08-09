// Retrieval handler for API endpoints
// Handles HTTP requests for RAG retrieval

package handler

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

// RetrievalHandler handles HTTP requests for RAG retrieval
type RetrievalHandler struct {
    db *gorm.DB
}

// NewRetrievalHandler creates a new retrieval handler
func NewRetrievalHandler(db *gorm.DB) *RetrievalHandler {
    return &RetrievalHandler{db: db}
}

// RegisterRoutes registers retrieval routes
func (h *RetrievalHandler) RegisterRoutes(router gin.IRouter, authMiddleware gin.HandlerFunc) {
    retrieval := router.Group("/retrieval")
    retrieval.Use(authMiddleware)
    {
        retrieval.POST("/preview/:series_id", h.RetrievalPreview)
    }
}

// RetrievalPreview returns a preview of retrieval results
func (h *RetrievalHandler) RetrievalPreview(c *gin.Context) {
    seriesID := c.Param("series_id")

    var req struct {
        Query  string `json:"query" binding:"required"`
        TopK   int    `json:"top_k"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
      	return
    }

    if req.TopK == 0 {
        req.TopK = 10
    }

    // In a real implementation, this would call the AI engine's retrieval API
    c.JSON(http.StatusOK, gin.H{
        "results": []interface{}{},
        "query":   req.Query,
        "series_id": seriesID,
    })
}
