package repo

import (
    "errors"
    "time"

    "gorm.io/gorm"

    "cadensend/services/control-api/internal/auth"
)

// UserRepository handles database operations for users
type UserRepository struct {
    db *gorm.DB
}

// NewUserRepository creates a new user repository
func NewUserRepository(db *gorm.DB) *UserRepository {
    return &UserRepository{db: db}
}

// Create creates a new user
func (r *UserRepository) Create(user *auth.User) error {
    return r.db.Create(user).Error
}

// GetByID retrieves a user by ID
func (r *UserRepository) GetByID(id string) (*auth.User, error) {
    var user auth.User
    if err := r.db.Where("id = ? AND deleted_at IS NULL", id).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("user not found")
        }
        return nil, err
    }
    return &user, nil
}

// GetByEmail retrieves a user by email
func (r *UserRepository) GetByEmail(email string) (*auth.User, error) {
    var user auth.User
    if err := r.db.Where("email = ? AND deleted_at IS NULL", email).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("user not found")
        }
        return nil, err
    }
    return &user, nil
}

// Update updates a user
func (r *UserRepository) Update(user *auth.User) error {
    return r.db.Save(user).Error
}

// Delete soft deletes a user
func (r *UserRepository) Delete(id string) error {
    now := time.Now()
    result := r.db.Model(&auth.User{}).Where("id = ?", id).Update("deleted_at", now)
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errors.New("user not found")
    }
    return nil
}

// List retrieves users with pagination
func (r *UserRepository) List(limit, offset int) ([]auth.User, error) {
    var users []auth.User
    if err := r.db.Where("deleted_at IS NULL").Limit(limit).Offset(offset).Find(&users).Error; err != nil {
        return nil, err
    }
    return users, nil
}

// Count returns the total number of users
func (r *UserRepository) Count() (int64, error) {
    var count int64
    if err := r.db.Model(&auth.User{}).Where("deleted_at IS NULL").Count(&count).Error; err != nil {
        return 0, err
    }
    return count, nil
}

// MagicLinkTokenRepository handles database operations for magic link tokens
type MagicLinkTokenRepository struct {
    db *gorm.DB
}

// NewMagicLinkTokenRepository creates a new magic link token repository
func NewMagicLinkTokenRepository(db *gorm.DB) *MagicLinkTokenRepository {
    return &MagicLinkTokenRepository{db: db}
}

// Create creates a new magic link token
func (r *MagicLinkTokenRepository) Create(token *auth.MagicLinkToken) error {
    return r.db.Create(token).Error
}

// GetByToken retrieves a magic link token by token value
func (r *MagicLinkTokenRepository) GetByToken(token string) (*auth.MagicLinkToken, error) {
    var magicLink auth.MagicLinkToken
    if err := r.db.Where("token = ?", token).First(&magicLink).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, errors.New("token not found")
        }
        return nil, err
    }
    return &magicLink, nil
}

// Delete deletes a magic link token
func (r *MagicLinkTokenRepository) Delete(token string) error {
    result := r.db.Where("token = ?", token).Delete(&auth.MagicLinkToken{})
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errors.New("token not found")
    }
    return nil
}

// CleanupExpiredTokens deletes expired magic link tokens
func (r *MagicLinkTokenRepository) CleanupExpiredTokens() error {
    now := time.Now()
    return r.db.Where("expires_at < ?", now).Delete(&auth.MagicLinkToken{}).Error
}