# Contributing

## Welcome

Thank you for your interest in contributing to Cadensend! We welcome contributions from everyone to help make the project better.

## Quick overview

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Create a pull request

## Before you start

- Read our [Code of Conduct](CODE_OF_CONDUCT.md)
- Check the [issue tracker](https://github.com/HinterBuild/cadensend/issues) for existing issues
- If you want to implement a new feature, please create an issue first to discuss it

## Branch convention

We use trunk-based development with:

- `main` - Production-ready code
- `dev` - Integration branch (all PRs target this)
- Feature branches - Work in progress

### Feature branch naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring

Branches should be named: `feature/your-username-short-description`

## Pull request process

1. Ensure your changes follow the project's coding style
2. Update documentation if needed
3. Test your changes thoroughly
4. Check for any linting or type checking errors
5. Push your changes
6. Create a pull request

## Pull request reviews

- All pull requests are reviewed by at least one maintainer
- Review feedback is expected to be addressed
- Changes may be requested or rejected if they don't align with the project's direction

## Testing

### Local testing

Our testing pyramid includes:

- **Unit tests**: Fast, isolated tests for specific functions or components
- **Integration tests**: Tests that verify interactions between components
- **End-to-end tests**: Full workflow scenarios
- **Failure tests**: Tests for error handling and edge cases

To run tests locally:

1. Ensure all dependencies are installed
2. Run the test suite for your specific changes
3. Verify the overall test suite passes

### AI evaluation

Cadensend includes AI-specific evaluation:

- **Retrieval evaluation**: Recall@10, NDCG@10, citation precision
- **Generation evaluation**: Schema validation, faithfulness, cost/latency
- **Model comparison**: Automatic A/B testing of different model versions

When making changes that affect AI generation or retrieval:

- Run the AI evaluation suite
- Ensure no regression in key metrics
- Document any performance changes

## Development environment

### Prerequisites

- Go 1.22+
- Python 3.11+
- Node.js 18+
- Docker and Docker Compose

### Local setup

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your environment
3. Run `docker compose up -d` to start all services
4. Configure your IDE to work with the monorepo structure

## Code style and conventions

### Go

- Use `gofmt` for formatting
- Use `golint` for static analysis
- Follow the project's dependency management approach

### Python

- Use black for code formatting
- Use isort for import sorting
- Use mypy for type checking
- Follow the project's test structure

### TypeScript/JavaScript

- Use Prettier for formatting
- Use ESLint for linting
- Use TypeScript for type safety

## Security

- Never commit secrets or API keys to the repository
- Use environment variables for sensitive data
- Review dependencies regularly for vulnerabilities
- Follow secure coding practices

## Communication

- For questions, use GitHub Discussions
- For bug reports, create issues
- For real-time discussions, join our Discord server
- Be respectful and constructive in all interactions

## Thank you!

Contributing to Cadensend is a collaborative effort. We appreciate your time, energy, and expertise. Together, we can build a great platform for learning through email!
