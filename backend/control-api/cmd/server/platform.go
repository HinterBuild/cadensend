package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	appmail "backend/control-api/internal/mail"
	"backend/control-api/internal/platform"
	"backend/control-api/internal/service"
)

func platformCatalogHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		kind := c.Query("kind")
		items, err := platform.ListByKind(kind)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": items, "total": len(items)})
	}
}

func platformSkillsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := platform.Skills()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": items})
	}
}

func platformConnectorsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := platform.Connectors()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		workspaceID := c.GetString("workspace_id")
		if workspaceID != "" {
			configs := loadConnectorConfigs(db, workspaceID)
			for i := range items {
				id, _ := items[i]["id"].(string)
				if cfg, ok := configs[id]; ok {
					items[i]["configured"] = true
					items[i]["workspace_config"] = cfg
				} else {
					items[i]["configured"] = false
				}
			}
		}
		c.JSON(http.StatusOK, gin.H{"data": items})
	}
}

func platformWorkflowsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := platform.Workflows()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": items})
	}
}

func platformInsightTypesHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		items, err := platform.ListByKind("insight")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		out := make([]map[string]interface{}, 0, len(items))
		for _, item := range items {
			out = append(out, map[string]interface{}{
				"id": item.ID, "name": item.Name, "description": item.Description, "category": item.Category,
			})
		}
		c.JSON(http.StatusOK, gin.H{"data": out})
	}
}

func platformProxyPOST(aiPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var payload map[string]interface{}
		if err := c.ShouldBindJSON(&payload); err != nil {
			payload = map[string]interface{}{}
		}
		status, body, err := aiEngineRequest(http.MethodPost, aiPath, payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable: " + err.Error()})
			return
		}
		c.Data(status, "application/json", body)
	}
}

func platformSandboxHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/sandbox")
}

func platformEvaluateHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/evaluate")
}

func platformWorkflowRunHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/workflows/run")
}

func platformPluginValidateHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/plugins/validate")
}

func platformStudioMetaHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		status, body, err := aiEngineRequest(http.MethodGet, "/v1/platform/studio/meta", nil)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ai engine unreachable: " + err.Error()})
			return
		}
		c.Data(status, "application/json", body)
	}
}

func platformStudioComposeHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/studio/compose")
}

func platformStudioSectionHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/studio/section")
}

func platformStudioAnalyzeHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/studio/analyze")
}

func platformStudioLinesHandler() gin.HandlerFunc {
	return platformProxyPOST("/v1/platform/studio/lines")
}

func loadConnectorConfigs(db *gorm.DB, workspaceID string) map[string]map[string]interface{} {
	type row struct {
		CatalogID string
		Config    string
		Enabled   bool
	}
	var rows []row
	_ = db.Raw(`
		SELECT catalog_id, config::text, enabled FROM workspace_platform_config
		WHERE workspace_id = ?::uuid
	`, workspaceID).Scan(&rows)
	out := make(map[string]map[string]interface{})
	for _, r := range rows {
		cfg := map[string]interface{}{"enabled": r.Enabled}
		_ = json.Unmarshal([]byte(r.Config), &cfg)
		out[r.CatalogID] = cfg
	}
	return out
}

func platformConnectorConfigHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		connectorID := c.Param("id")
		var req struct {
			Config  map[string]interface{} `json:"config"`
			Enabled *bool                  `json:"enabled"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		cfgJSON, _ := json.Marshal(req.Config)
		enabled := true
		if req.Enabled != nil {
			enabled = *req.Enabled
		}
		err := db.Exec(`
			INSERT INTO workspace_platform_config (workspace_id, catalog_id, enabled, config, updated_at)
			VALUES (?::uuid, ?, ?, ?::jsonb, NOW())
			ON CONFLICT (workspace_id, catalog_id)
			DO UPDATE SET config = EXCLUDED.config, enabled = EXCLUDED.enabled, updated_at = NOW()
		`, workspaceID, connectorID, enabled, string(cfgJSON)).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"connector_id": connectorID, "enabled": enabled}})
	}
}

func platformConnectorSyncHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		if workspaceID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		var req struct {
			ConnectorID string                 `json:"connector_id" binding:"required"`
			Config      map[string]interface{} `json:"config"`
			Since       string                 `json:"since"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "connector_id is required"})
			return
		}
		if req.Config == nil {
			configs := loadConnectorConfigs(db, workspaceID)
			if cfg, ok := configs[req.ConnectorID]; ok {
				req.Config = cfg
			} else {
				req.Config = map[string]interface{}{}
			}
		}
		runID := uuid.NewString()
		_ = db.Exec(`
			INSERT INTO connector_sync_runs (id, workspace_id, connector_id, status, started_at)
			VALUES (?::uuid, ?::uuid, ?, 'running', NOW())
		`, runID, workspaceID, req.ConnectorID)

		payload := map[string]interface{}{
			"workspace_id": workspaceID,
			"connector_id": req.ConnectorID,
			"config":       req.Config,
			"since":        req.Since,
		}
		status, body, err := aiEngineRequest(http.MethodPost, "/v1/platform/connectors/sync", payload)
		if err != nil {
			_ = db.Exec(`UPDATE connector_sync_runs SET status='failed', error=?, finished_at=NOW() WHERE id=?::uuid`, err.Error(), runID)
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		var syncResult map[string]interface{}
		_ = json.Unmarshal(body, &syncResult)
		itemsFetched := 0
		itemsIngested := 0
		if docs, ok := syncResult["documents"].([]interface{}); ok {
			itemsFetched = len(docs)
			itemsIngested = itemsFetched
		}
		_ = db.Exec(`
			UPDATE connector_sync_runs SET status='completed', items_fetched=?, items_ingested=?, finished_at=NOW()
			WHERE id=?::uuid
		`, itemsFetched, itemsIngested, runID)

		c.Data(status, "application/json", body)
	}
}

func platformInsightsComputeHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		if workspaceID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var series []service.Series
		if err := db.Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).Find(&series).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		seriesIDs := make([]string, 0, len(series))
		for _, s := range series {
			seriesIDs = append(seriesIDs, s.ID)
		}

		var issues []service.Issue
		if len(seriesIDs) > 0 {
			_ = db.Where("series_id IN ? AND deleted_at IS NULL", seriesIDs).Find(&issues)
		}
		var sources []service.Source
		_ = db.Where("workspace_id = ? AND deleted_at IS NULL", workspaceID).Find(&sources)

		var runs []service.GenerationRun
		if len(seriesIDs) > 0 || len(issues) > 0 {
			issueIDs := make([]string, 0, len(issues))
			for _, i := range issues {
				issueIDs = append(issueIDs, i.ID)
			}
			q := db.Model(&service.GenerationRun{})
			if len(issueIDs) > 0 {
				q = q.Where("(target_type = ? AND target_id IN ?) OR (target_type = ? AND target_id IN ?)",
					"issue", issueIDs, "series", seriesIDs)
			} else if len(seriesIDs) > 0 {
				q = q.Where("target_type = ? AND target_id IN ?", "series", seriesIDs)
			}
			_ = q.Order("created_at DESC").Limit(200).Find(&runs)
		}

		var deliveries []service.Delivery
		if len(issues) > 0 {
			issueIDs := make([]string, 0, len(issues))
			for _, i := range issues {
				issueIDs = append(issueIDs, i.ID)
			}
			_ = db.Where("issue_id IN ?", issueIDs).Order("created_at DESC").Limit(200).Find(&deliveries)
		}

		seriesData := make([]map[string]interface{}, 0, len(series))
		for _, s := range series {
			seriesData = append(seriesData, map[string]interface{}{
				"id": s.ID, "topic": s.Topic, "goal": s.Goal, "status": s.Status,
				"skill_id": s.SkillID, "plan_json": s.PlanJSON,
				"created_at": s.CreatedAt.UTC().Format(time.RFC3339),
			})
		}
		issueData := make([]map[string]interface{}, 0, len(issues))
		for _, i := range issues {
			issueData = append(issueData, map[string]interface{}{
				"id": i.ID, "series_id": i.SeriesID, "status": i.Status,
				"content_json": i.ContentJSON,
				"created_at":   i.CreatedAt.UTC().Format(time.RFC3339),
				"scheduled_at": formatTimePtr(i.ScheduledAt),
			})
		}
		sourceData := make([]map[string]interface{}, 0, len(sources))
		for _, s := range sources {
			sourceData = append(sourceData, map[string]interface{}{
				"id": s.ID, "status": s.Status,
				"created_at": s.CreatedAt.UTC().Format(time.RFC3339),
				"updated_at": s.UpdatedAt.UTC().Format(time.RFC3339),
			})
		}
		runData := make([]map[string]interface{}, 0, len(runs))
		for _, r := range runs {
			runData = append(runData, map[string]interface{}{
				"model": r.Model, "status": r.Status,
				"tokens_in": r.TokensIn, "tokens_out": r.TokensOut,
			})
		}
		deliveryData := make([]map[string]interface{}, 0, len(deliveries))
		for _, d := range deliveries {
			deliveryData = append(deliveryData, map[string]interface{}{
				"issue_id": d.IssueID, "status": d.Status,
			})
		}

		payload := map[string]interface{}{
			"workspace_data": map[string]interface{}{
				"series": seriesData, "issues": issueData, "sources": sourceData,
				"generation_runs": runData, "deliveries": deliveryData,
				"provider_events": []map[string]interface{}{},
			},
		}
		status, body, err := aiEngineRequest(http.MethodPost, "/v1/platform/insights/compute", payload)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.Data(status, "application/json", body)
	}
}

func updateSeriesPlatformHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seriesID := c.Param("id")
		series, ok := loadWorkspaceSeries(db, c, seriesID)
		if !ok {
			return
		}
		var req struct {
			SkillID      string `json:"skill_id"`
			WorkflowMode string `json:"workflow_mode"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		updates := map[string]interface{}{"updated_at": time.Now()}
		if req.SkillID != "" {
			updates["skill_id"] = req.SkillID
		}
		if req.WorkflowMode != "" {
			updates["workflow_mode"] = req.WorkflowMode
		}
		if err := db.Model(series).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"skill_id": req.SkillID, "workflow_mode": req.WorkflowMode}})
	}
}

func formatTimePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func editorialAssetsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		if workspaceID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		assetType := c.Query("type")
		if c.Request.Method == http.MethodGet {
			type row struct {
				ID        string          `json:"id"`
				AssetType string          `json:"asset_type"`
				Name      string          `json:"name"`
				Data      json.RawMessage `json:"data"`
			}
			var rows []row
			q := db.Table("editorial_assets").Where("workspace_id = ?", workspaceID)
			if assetType != "" {
				q = q.Where("asset_type = ?", assetType)
			}
			if err := q.Order("created_at DESC").Limit(100).Find(&rows).Error; err != nil {
				c.JSON(http.StatusOK, gin.H{"data": []interface{}{}})
				return
			}
			c.JSON(http.StatusOK, gin.H{"data": rows})
			return
		}
		var req struct {
			AssetType string                 `json:"asset_type" binding:"required"`
			Name      string                 `json:"name"`
			SeriesID  string                 `json:"series_id"`
			IssueID   string                 `json:"issue_id"`
			Data      map[string]interface{} `json:"data"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "asset_type is required"})
			return
		}
		userID := c.GetString("user_id")
		dataJSON, _ := json.Marshal(req.Data)
		id := uuid.NewString()
		if err := db.Exec(`
			INSERT INTO editorial_assets (id, workspace_id, series_id, issue_id, asset_type, name, data, created_by)
			VALUES (?::uuid, ?::uuid, NULLIF(?, '')::uuid, NULLIF(?, '')::uuid, ?, ?, ?::jsonb, NULLIF(?, '')::uuid)
		`, id, workspaceID, req.SeriesID, req.IssueID, req.AssetType, req.Name, string(dataJSON), userID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"data": gin.H{"id": id}})
	}
}

// Email provider settings — users pick their own send inbox/provider.

var supportedEmailProviders = []map[string]string{
	{"id": "brevo", "name": "Brevo", "description": "Transactional email via Brevo API"},
	{"id": "smtp", "name": "SMTP", "description": "Any SMTP server (Gmail app password, Outlook, custom)"},
	{"id": "sendgrid", "name": "SendGrid", "description": "SendGrid HTTP API"},
	{"id": "gmail", "name": "Gmail", "description": "Gmail via SMTP with app password"},
	{"id": "mailgun", "name": "Mailgun", "description": "Mailgun HTTP API"},
}

func listEmailProvidersHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"data": supportedEmailProviders})
	}
}

func getEmailProviderHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		type row struct {
			Provider  string
			FromEmail string
			FromName  string
			Config    string
			Verified  bool
			IsActive  bool
		}
		var r row
		err := db.Raw(`
			SELECT provider, from_email, from_name, config::text, verified, is_active
			FROM workspace_email_config WHERE workspace_id = ?::uuid
		`, workspaceID).Scan(&r).Error
		if err != nil || r.Provider == "" {
			c.JSON(http.StatusOK, gin.H{"data": gin.H{
				"provider":   strings.TrimSpace(cfg.EmailProvider),
				"from_email": cfg.SMTPFrom,
				"from_name":  cfg.SMTPFromName,
				"verified":   false,
				"is_active":  false,
				"using_env":  true,
			}})
			return
		}
		cfgMap := map[string]interface{}{}
		_ = json.Unmarshal([]byte(r.Config), &cfgMap)
		c.JSON(http.StatusOK, gin.H{"data": gin.H{
			"provider":   r.Provider,
			"from_email": r.FromEmail,
			"from_name":  r.FromName,
			"config":     redactSecrets(cfgMap),
			"verified":   r.Verified,
			"is_active":  r.IsActive,
			"using_env":  false,
		}})
	}
}

func updateEmailProviderHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		var req struct {
			Provider  string                 `json:"provider" binding:"required"`
			FromEmail string                 `json:"from_email" binding:"required,email"`
			FromName  string                 `json:"from_name"`
			Config    map[string]interface{} `json:"config"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "provider and from_email are required"})
			return
		}
		provider := strings.ToLower(strings.TrimSpace(req.Provider))
		valid := false
		for _, p := range supportedEmailProviders {
			if p["id"] == provider {
				valid = true
				break
			}
		}
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported email provider"})
			return
		}
		cfgJSON, _ := json.Marshal(req.Config)
		err := db.Exec(`
			INSERT INTO workspace_email_config (workspace_id, provider, from_email, from_name, config, verified, is_active, updated_at)
			VALUES (?::uuid, ?, ?, ?, ?::jsonb, false, true, NOW())
			ON CONFLICT (workspace_id)
			DO UPDATE SET provider=EXCLUDED.provider, from_email=EXCLUDED.from_email,
				from_name=EXCLUDED.from_name, config=EXCLUDED.config, verified=false, is_active=true, updated_at=NOW()
		`, workspaceID, provider, strings.TrimSpace(req.FromEmail), strings.TrimSpace(req.FromName), string(cfgJSON)).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"provider": provider, "from_email": req.FromEmail, "message": "Email provider saved. Send a test email to verify."}})
	}
}

func testEmailProviderHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		workspaceID := c.GetString("workspace_id")
		userEmail := c.GetString("user_email")
		if userEmail == "" {
			var email string
			_ = db.Raw(`SELECT email FROM users WHERE id = ?::uuid`, c.GetString("user_id")).Scan(&email)
			userEmail = email
		}
		mailCfg, provider, err := loadWorkspaceMailConfig(db, workspaceID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		html := "<p>This is a test email from Cadensend. Your email provider is configured correctly.</p>"
		if err := sendMailWithProvider(mailCfg, provider, userEmail, "Cadensend — test email", html); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		_ = db.Exec(`UPDATE workspace_email_config SET verified=true, updated_at=NOW() WHERE workspace_id=?::uuid`, workspaceID)
		c.JSON(http.StatusOK, gin.H{"message": "Test email sent to " + userEmail})
	}
}

func redactSecrets(cfg map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range cfg {
		lk := strings.ToLower(k)
		if strings.Contains(lk, "key") || strings.Contains(lk, "password") || strings.Contains(lk, "secret") {
			out[k] = "••••••••"
		} else {
			out[k] = v
		}
	}
	return out
}

type mailProviderConfig struct {
	APIURL   string
	APIKey   string
	From     string
	FromName string
	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
}

func loadWorkspaceMailConfig(db *gorm.DB, workspaceID string) (mailProviderConfig, string, error) {
	type row struct {
		Provider  string
		FromEmail string
		FromName  string
		Config    string
	}
	var r row
	err := db.Raw(`
		SELECT provider, from_email, from_name, config::text
		FROM workspace_email_config WHERE workspace_id = ?::uuid AND is_active = true
	`, workspaceID).Scan(&r).Error
	if err != nil || r.Provider == "" {
		return mailProviderConfig{
			APIURL: cfg.BrevoAPIURL, APIKey: cfg.BrevoAPIKey,
			From: cfg.SMTPFrom, FromName: cfg.SMTPFromName,
		}, cfg.EmailProvider, nil
	}
	cfgMap := map[string]interface{}{}
	_ = json.Unmarshal([]byte(r.Config), &cfgMap)
	mc := mailProviderConfig{
		From: r.FromEmail, FromName: r.FromName,
		APIKey: strVal(cfgMap, "api_key"),
		APIURL: strVal(cfgMap, "api_url"),
		SMTPHost: strVal(cfgMap, "smtp_host"),
		SMTPPort: strVal(cfgMap, "smtp_port"),
		SMTPUser: strVal(cfgMap, "smtp_user"),
		SMTPPass: strVal(cfgMap, "smtp_password"),
	}
	if mc.APIURL == "" && r.Provider == "brevo" {
		mc.APIURL = cfg.BrevoAPIURL
	}
	if mc.APIURL == "" && r.Provider == "sendgrid" {
		mc.APIURL = "https://api.sendgrid.com/v3/mail/send"
	}
	if mc.APIURL == "" && r.Provider == "mailgun" {
		domain := strVal(cfgMap, "domain")
		if domain != "" {
			mc.APIURL = "https://api.mailgun.net/v3/" + domain + "/messages"
		}
	}
	if r.Provider == "gmail" && mc.SMTPHost == "" {
		mc.SMTPHost = "smtp.gmail.com"
		mc.SMTPPort = "587"
		mc.SMTPUser = r.FromEmail
	}
	return mc, r.Provider, nil
}

func strVal(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func sendMailWithProvider(mc mailProviderConfig, provider, to, subject, html string) error {
	return appmail.SendWithProvider(appmail.ProviderConfig{
		Provider: provider,
		APIURL:   mc.APIURL,
		APIKey:   mc.APIKey,
		From:     mc.From,
		FromName: mc.FromName,
		SMTPHost: mc.SMTPHost,
		SMTPPort: mc.SMTPPort,
		SMTPUser: mc.SMTPUser,
		SMTPPass: mc.SMTPPass,
	}, appmail.Message{To: to, Subject: subject, HTML: html})
}
