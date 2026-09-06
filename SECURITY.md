# Security Policy

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Email the maintainers or use GitHub's private vulnerability reporting (if enabled on this repository).

## Secrets and credentials

- **Never** commit API keys, tokens, or passwords to this repository.
- Use `.env` locally (gitignored). Copy from `.env.example` and fill in your own values.
- In Docker Compose, secrets must use environment interpolation, e.g. `OPENROUTER_API_KEY: "${OPENROUTER_API_KEY:-}"` — never hardcode keys in YAML.

If you accidentally commit a secret:

1. **Revoke/rotate** the credential immediately at the provider (OpenRouter, Brevo, etc.).
2. Remove it from the codebase and scrub git history before pushing again.
3. Run `./scripts/check-secrets.sh` to verify tracked files are clean.

## Development defaults

Docker Compose and `.env.example` use obvious dev-only defaults (`cadensend` DB password, `minioadmin123`, etc.). Change all of these before any shared or production deployment.
