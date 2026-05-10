# Contributing to InspectorPlus

Thank you for contributing! Please read the full guide at [CONTRIBUTING.md](../CONTRIBUTING.md) before submitting PRs or issues.

Quick links:
- [Development setup](../CONTRIBUTING.md#development-setup)
- [Commit message format](../CONTRIBUTING.md#commit-messages)
- [Pull request process](../CONTRIBUTING.md#pull-request-process)
- [Testing guidelines](../CONTRIBUTING.md#testing)
- [Code style](../CONTRIBUTING.md#code-style)

## Quick PR Checklist

- [ ] Tests pass (`uv run pytest` for backend, `npm test` for frontend)
- [ ] Frontend builds without errors (`npm run build`)
- [ ] Pre-commit hooks pass (`ruff format`, `ruff check`)
- [ ] Documentation updated if needed
- [ ] No new console.log or debug statements

## Branch Naming

- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation
- `refactor/` — code refactoring
- `test/` — adding tests
- `chore/` — maintenance

## Questions?

Open a [GitHub Discussion](https://github.com/azzamnizar/inspector_plus/discussions) for questions.
