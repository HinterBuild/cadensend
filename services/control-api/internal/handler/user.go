package handler

import (
    "net/http"

    "github.com/gin-gonic/gin"

    "cadensend/services/control-api/internal/service"
)

// UserHandler handles HTTP requests for users
// This layer contains the HTTP-specific logic and routes
type UserHandler struct {
    userService *service.UserService
}

// NewUserHandler creates a new user handler
func NewUserHandler(userService *service.UserService) *UserHandler {
    return &UserHandler{userService: userService}
}

// RegisterRoutes registers user routes
func (h *UserHandler) RegisterRoutes(router gin.IRouter) {
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

// CreateUser handles user creation
func (h *UserHandler) CreateUser(c *gin.Context) {
    var req struct {
        Email     string `json:"email" binding:"required"`
        Password  string `json:"password" binding:"required"`
        Name      string `json:"name" binding:"required"`
        Timezone  string `json:"timezone" binding:"required"`
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

    c.JSON(http.StatusCreated, user)
}

// Login handles user login
func (h *UserHandler) Login(c *gin.Context) {
    var req struct {
        Email    string `json:"email" binding:"required"`
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

// GenerateMagicLink handles magic link generation
func (h *UserHandler) GenerateMagicLink(c *gin.Context) {
    var req struct {
        Email string `json:"email" binding:"required"`
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

// GetUser handles getting a user by ID
func (h *UserHandler) GetUser(c *gin.Context) {
    userID := c.Param("id")

    user, err := h.userService.GetUser(userID)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, user)
}

// VerifyEmail handles email verification via magic link
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

    // Delete the used token
    if err := h.userService.(*service.UserService).magicLinkRepo.Delete(token); err != nil {
        // Log but don't fail the verification
    }

    c.JSON(http.StatusOK, gin.H{"message": "email verified"})
}

// DeleteUser handles user deletion
func (h *UserHandler) DeleteUser(c *gin.Context) {
    userID := c.Param("id")

    if err := h.userService.DeleteUser(userID); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}