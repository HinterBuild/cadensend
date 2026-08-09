package delivery

import (
    "context"
    "fmt"
    "time"

    "github.com/sendgrid/sendgrid-go"
    "github.com/sendgrid/sendgrid-go/helpers/mail"

    "cadensend/internal/database"
    "github.com/google/uuid"
)

type EmailProvider interface {
    SendEmail(ctx context.Context, req EmailRequest) (*EmailResponse, error)
}

type EmailRequest struct {
    To          string
    From        string
    Subject     string
    HTMLContent string
    TextContent string
}

type EmailResponse struct {
    MessageID string
    Status    string
}

type SendGridProvider struct {
    client *sendgrid.Client
    from   string
}

func NewSendGridProvider(apiKey, from string) *SendGridProvider {
    return &SendGridProvider{
        client: sendgrid.NewSendClient(apiKey),
        from:   from,
    }
}

func (p *SendGridProvider) SendEmail(ctx context.Context, req EmailRequest) (*EmailResponse, error) {
    from := mail.From{}
    from.SetEmail(p.from)

    to := mail.To{}
    to.SetEmail(req.To)

    message := mail.NewSingleEmail(from, req.Subject, to, req.TextContent, req.HTMLContent)

    response, err := p.client.Send(message)
    if err != nil {
        return nil, fmt.Errorf("failed to send email: %w", err)
    }

    return &EmailResponse{
        MessageID: uuid.New().String(),
        Status:    fmt.Sprintf("%d", response.StatusCode),
    }, nil
}

type DeliveryWorker struct {
    db       *gorm.DB
    provider EmailProvider
}

func NewDeliveryWorker(provider EmailProvider) *DeliveryWorker {
    return &DeliveryWorker{
        db:       database.Get(),
        provider: provider,
    }
}

func (w *DeliveryWorker) DeliverIssue(ctx context.Context, issueID string) error {
    // Get the issue to deliver
    var issue Issue
    if err := w.db.Where("id = ?", issueID).First(&issue).Error; err != nil {
        return fmt.Errorf("failed to get issue: %w", err)
    }

    // Get the latest approved version
    var issueVersion IssueVersion
    if err := w.db.Where("issue_id = ? AND status = 'approved'", issueID).
        Order("version DESC").
        First(&issueVersion).Error; err != nil {
        return fmt.Errorf("failed to get approved issue version: %w", err)
    }

    // Get recipients (in MVP, this is the user's verified address)
    var recipients []Recipient
    if err := w.db.Where("workspace_id = ?", issue.SeriesID).
        Join("JOIN series ON series.workspace_id = recipients.workspace_id").
        Find(&recipients).Error; err != nil {
        return fmt.Errorf("failed to get recipients: %w", err)
    }

    // Send to each recipient with idempotency
    for _, recipient := range recipients {
        // Check if delivery already exists for this version
        var existingDelivery Delivery
        idempotencyKey := fmt.Sprintf("%s:%s:%d", issueID, recipient.ID, issueVersion.Version)
        
        result := w.db.Where("idempotency_key = ?", idempotencyKey).First(&existingDelivery)
        if result.Error == nil {
            log.Printf("Delivery already exists for recipient %s, skipping", recipient.Email)
            continue
        } else if !errors.Is(result.Error, gorm.ErrRecordNotFound) {
            return fmt.Errorf("failed to check existing delivery: %w", result.Error)
        }

        // Create delivery record before sending
        delivery := &Delivery{
            ID:              uuid.New().String(),
            IssueID:         issueID,
            RecipientID:     recipient.ID,
            ProviderID:      "sendgrid",
            Status:          "pending",
            IdempotencyKey:  idempotencyKey,
            CreatedBy:       issue.CreatedBy,
            CreatedAt:       time.Now(),
            UpdatedAt:       time.Now(),
        }

        if err := w.db.Create(delivery).Error; err != nil {
            return fmt.Errorf("failed to create delivery record: %w", err)
        }

        // Send email
        req := EmailRequest{
            To:          recipient.Email,
            From:        "no-reply@cadensend.app",
            Subject:     issueVersion.Subject,
            HTMLContent: issueVersion.ContentJSON,
            TextContent: "Preview: This is a test email from Cadensend",
        }

        resp, err := w.provider.SendEmail(ctx, req)
        if err != nil {
            delivery.Status = "failed"
            delivery.ErrorCode = "SEND_FAILED"
            delivery.ErrorMsg = err.Error()
            if err := w.db.Save(delivery).Error; err != nil {
                log.Printf("Failed to update delivery status: %v", err)
            }
            continue
        }

        // Update delivery record
        delivery.Status = "submitted"
        delivery.ExternalEventID = resp.MessageID
        delivery.UpdatedAt = time.Now()

        if err := w.db.Save(delivery).Error; err != nil {
            return fmt.Errorf("failed to update delivery: %w", err)
        }

        // Create audit log
        auditLog := &AuditLog{
            ID:          uuid.New().String(),
            ActorID:     issue.CreatedBy,
            Action:      "delivery_sent",
            TargetType:  "delivery",
            TargetID:    delivery.ID,
            MetadataJSON: fmt.Sprintf(`{"issue_id": "%s", "recipient_id": "%s"}`, issueID, recipient.ID),
            Timestamp:   time.Now(),
            SessionID:   "",
            IPAddress:   "",
        }
        w.db.Create(auditLog)
    }

    // Update issue status
    issue.Status = "sent"
    issue.UpdatedAt = time.Now()
    if err := w.db.Save(&issue).Error; err != nil {
        return fmt.Errorf("failed to update issue status: %w", err)
    }

    return nil
}

func (w *DeliveryWorker) HandleWebhook(ctx context.Context, provider string, payload []byte, signature string) error {
    // Verify webhook signature
    if err := w.verifyWebhookSignature(provider, payload, signature); err != nil {
        return fmt.Errorf("failed to verify webhook signature: %w", err)
    }

    // Parse payload
    var event WebhookPayload
    if err := json.Unmarshal(payload, &event); err != nil {
        return fmt.Errorf("failed to parse webhook payload: %w", err)
    }

    // Check if event already processed
    var existingEvent ProviderEvent
    result := w.db.Where("provider = ? AND external_event_id = ?", provider, event.EventID).First(&existingEvent)
    if result.Error == nil {
        log.Printf("Webhook event already processed: %s", event.EventID)
        return nil
    }

    // Store event
    providerEvent := &ProviderEvent{
        ID:              uuid.New().String(),
        Provider:        provider,
        ExternalEventID: event.EventID,
        Type:            event.Type,
        PayloadJSON:     string(payload),
        ReceivedAt:      time.Now(),
    }

    if err := w.db.Create(providerEvent).Error; err != nil {
        return fmt.Errorf("failed to store provider event: %w", err)
    }

    // Update delivery status based on event type
    if err := w.updateDeliveryStatus(ctx, &event); err != nil {
        log.Printf("Failed to update delivery status: %v", err)
    }

    return nil
}

func (w *DeliveryWorker) verifyWebhookSignature(provider string, payload []byte, signature string) error {
    // This would implement actual signature verification
    // For MVP, we'll just check that the signature is present
    if signature == "" {
        return errors.New("webhook signature is required")
    }

    // In production, implement proper signature verification using:
    // - SendGrid's webhook signature verification
    // - AWS SES's SNS signature verification
    // - SMTP provider's webhook verification

    return nil
}

func (w *DeliveryWorker) updateDeliveryStatus(ctx context.Context, event *WebhookPayload) error {
    var delivery Delivery
    if err := w.db.Where("external_event_id = ?", event.EventID).First(&delivery).Error; err != nil {
        return fmt.Errorf("failed to find delivery: %w", err)
    }

    switch event.Type {
    case "delivered":
        delivery.Status = "delivered"
        delivery.DeliveredAt = &event.Timestamp
    case "deferred":
        delivery.Status = "deferred"
    case "bounce":
        delivery.Status = "bounced"
        delivery.ErrorCode = "BOUNCE"
    case "complaint":
        delivery.Status = "complained"
        delivery.ErrorCode = "COMPLAINT"
    }

    delivery.UpdatedAt = time.Now()

    if err := w.db.Save(&delivery).Error; err != nil {
        return fmt.Errorf("failed to update delivery status: %w", err)
    }

    return nil
}

type WebhookPayload struct {
    EventID   string    `json:"event_id"`
    Type      string    `json:"type"`
    Timestamp time.Time `json:"timestamp"`
    Email     string    `json:"email"`
    Reason    string    `json:"reason,omitempty"`
}