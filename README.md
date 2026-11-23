# tax-reform-saas (working name)

SaaS for Brazilian accounting offices built on Receita Federal's open-source CBS/IBS/IS calculation
engines: a current-vs-reform tax simulator for business owners, a dashboard for accountants, and
invoice-time calculation through a public API, SDK and browser extension.

## Documentation

- [01 - Vision and scope](docs/01-vision-and-scope.md)
- [02 - Requirements](docs/02-requirements.md)
- [03 - Open questions and decisions](docs/03-open-questions.md)
- [Development plan](docs/development-plan.md)
- [ADRs](docs/adr/)

## Status

Foundation (EST-01.2). Stack: [ADR 001](docs/adr/001-stack.md).

## License

Proprietary. All rights reserved. The official engines used at runtime are MIT-licensed by Receita
Federal and are not modified.

## Development

Requirements: Node 24 (`.nvmrc`) and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Everything is verified in CI on each pull request. Commits follow Conventional Commits
(checked by commitlint).

| Path                     | Content                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `apps/`                  | API, web app and browser extension (see its README)                                                             |
| `packages/engine-client` | Typed client of the official engines (`engines/`), the only way to reach them                                   |
| `packages/eslint-config` | Shared ESLint flat config                                                                                       |
| `packages/shared-types`  | Types shared by the API, the web app and the SDK                                                                |
| `packages/tax-legacy`    | Current-tax engine: decimal policy, versioned rule tables ([ADR 003](docs/adr/003-current-tax-engine-model.md)) |
