# Shared Packages

This directory contains shared code and contracts used across services.

## Directory Overview

### `contracts/`

Go shared contracts (models, DTOs, errors) used by:
- `backend/control-api/`
- `backend/control-worker/`

Build with `go build ./...` and import via module path.

### `email-templates/`

Transactional email templates in MJML and HTML for:
- Subscription confirmations
- Password resets
- Unsubscribe links
- Delivery notices

Rendered through Brevo or SMTP providers.

### `visual-specs/`

TypeScript types for visual specification objects:
- `VisualSpec` - Layout and style configuration
- `TemplateSpec` - Email template configuration
- Shared with frontend for editing tools

## Usage

Import contracts in Go:

```go
import "github.com/HinterBuild/cadensend/packages/contracts"
```

Import visual specs in TypeScript:

```typescript
import { VisualSpec, TemplateSpec } from "@cadensend/visual-specs";
```