// Handler package for API endpoints
// Contains HTTP-specific logic and route handlers

package handler

import (
    "net/http"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"

    "cadensend/services/control-api/internal/service"
    "cadensend/services/control-api/internal/auth"
)

// UserHandler handles HTTP requests for users
type UserHandler struct {
    userService *service.UserService
    jwtSecret   string
}

// NewUserHandler creates a new user handler
func NewUserHandler(userService *service.UserService, jwtSecret string) *UserHandler {
    return &UserHandler{
        userService: userService,
        jwtSecret:   jwtSecret,
    }
}

// RegisterRoutes registers user routes (no auth required)
func (h *UserHandler) RegisterRoutes(router *gin.RouterGroup) {
    users := router.Group("/users")
    {
        users.POST("", h.CreateUser)
        users.POST("/login", h.Login)
        users.POST("/magic-link", h.GenerateMagicLink)
        users.GET("/:id", h.GetUser)
        users.PATCH("/:id/verify-email", h.VerifyEmail)
        users.DELETE("/:id", h.DeleteUser)
    }
}

func (h *UserHandler) CreateUser(c *gin.Context) {
    var req struct {
        Email       string `json:"email" binding:"required,email"`
        Password    string `json:"password" binding:"required,min=8"`
        Name        string `json:"name" binding:"required"`
        Timezone    string `json:"timezone" binding:"required"`
        WorkspaceID string `json:"workspace_id" binding:"required"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
       	return
    }

    user, err := h.userService.CreateUser(req.Email, req.Password, req.Name, req.Timezone, req.WorkspaceID)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
       	return
    }

    c.JSON(http.StatusCreated, gin.H{"data": user})
}

func (h *UserHandler) Login(c *gin.Context) {
    var req struct {
        Email    string `json:"email" binding:"required,email"`
        Password string `json:"password" binding:"required"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
      	return
    }

    user, token, err := h.userService.AuthenticateUser(req.Email, req.Password)
    if err != nil {
       	c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
      	return
    }

    c.JSON(http.StatusOK, gin.H{
        "user":  user,
        "token": token,
    })
}

func (h *UserHandler) GenerateMagicLink(c *gin.Context) {
    var req struct {
        Email string `json:"email" binding:"required,email"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
      	return
    }

    token, err := h.userService.GenerateMagicLink(req.Email)
    if err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
      	return
    }

    c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *UserHandler) GetUser(c *gin.Context) {
    userID := c.Param("id")

    user, err := h.userService.GetUser(userID)
    if err != nil {
       	c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
      	return
    }

    c.JSON(http.StatusOK, gin.H{"data": user})
}

func (h *UserHandler) VerifyEmail(c *gin.Context) {
    token := c.Query("token")
    if token == "" {
       	c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
      	return
    }

    userID, err := h.userService.ValidateMagicLink(token)
    if err != nil {
       	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
      	return
    }

    if err := h.userService.UpdateUserEmailVerified(userID); err != nil {
       	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
      	return
    }

    c.JSON(http.StatusOK, gin.H{"message": "email verified"})
}

func (h *UserHandler) DeleteUser(c *gin.Context) {
    userID := c.Param("id")

    if err := h.userService.DeleteUser(userID); err != nil {
       	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
      	return
    }

    c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}

// helper function for string checks
func hasPrefix(s, prefix string) bool {
    return strings.HasPrefix(s, prefix)
}

// Helper to get DB from UserService - for handlers that need it
func getDB(userService *service.UserService) *gorm.DB {
    // Access the db field through reflection or pass it explicitly
    // For simplicity, we'll pass db directly in handler constructors
    return nil
}
