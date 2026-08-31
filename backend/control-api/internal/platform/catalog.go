package platform

import (
	_ "embed"
	"encoding/json"
	"net/url"
)

//go:embed catalog.json
var catalogJSON []byte

type CatalogItem struct {
	ID          string                 `json:"id"`
	Kind        string                 `json:"kind"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Category    string                 `json:"category"`
	Metadata    map[string]interface{} `json:"metadata"`
}

func AllCatalog() ([]CatalogItem, error) {
	var items []CatalogItem
	if err := json.Unmarshal(catalogJSON, &items); err != nil {
		return nil, err
	}
	return items, nil
}

func ListByKind(kind string) ([]CatalogItem, error) {
	all, err := AllCatalog()
	if err != nil {
		return nil, err
	}
	if kind == "" {
		return all, nil
	}
	out := make([]CatalogItem, 0)
	for _, item := range all {
		if item.Kind == kind {
			out = append(out, item)
		}
	}
	return out, nil
}

func Skills() ([]map[string]interface{}, error) {
	items, err := ListByKind("skill")
	if err != nil {
		return nil, err
	}
	return skillList(items), nil
}

func Connectors() ([]map[string]interface{}, error) {
	items, err := ListByKind("connector")
	if err != nil {
		return nil, err
	}
	return connectorList(items), nil
}

func Workflows() ([]map[string]interface{}, error) {
	items, err := ListByKind("workflow")
	if err != nil {
		return nil, err
	}
	return workflowList(items), nil
}

func skillList(items []CatalogItem) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(items))
	for _, s := range items {
		row := map[string]interface{}{
			"id":          s.ID,
			"name":        s.Name,
			"description": s.Description,
			"category":    s.Category,
		}
		if sections, ok := s.Metadata["sections"].([]interface{}); ok {
			row["sections"] = sections
		}
		if cadence, ok := s.Metadata["cadence"].(string); ok {
			row["cadence"] = cadence
		}
		if multi, ok := s.Metadata["multi_issue"].(bool); ok {
			row["multi_issue"] = multi
		}
		out = append(out, row)
	}
	return out
}

func connectorList(items []CatalogItem) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(items))
	for _, c := range items {
		auth := "oauth"
		if v, ok := c.Metadata["auth"].(string); ok {
			auth = v
		}
		sync := ""
		if v, ok := c.Metadata["sync"].(string); ok {
			sync = v
		}
		domain := ""
		if v, ok := c.Metadata["domain"].(string); ok {
			domain = v
		}
		row := map[string]interface{}{
			"id":          c.ID,
			"name":        c.Name,
			"description": c.Description,
			"category":    c.Category,
			"auth":        auth,
			"sync":        sync,
		}
		if domain != "" {
			row["domain"] = domain
			row["logo_url"] = faviconURL(domain)
		}
		out = append(out, row)
	}
	return out
}

func faviconURL(domain string) string {
	if domain == "" {
		return ""
	}
	return "https://www.google.com/s2/favicons?domain=" + url.QueryEscape(domain) + "&sz=64"
}

func workflowList(items []CatalogItem) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(items))
	for _, w := range items {
		out = append(out, map[string]interface{}{
			"id":          w.ID,
			"name":        w.Name,
			"description": w.Description,
			"category":    w.Category,
			"metadata":    w.Metadata,
		})
	}
	return out
}
