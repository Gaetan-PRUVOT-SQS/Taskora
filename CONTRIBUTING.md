# Contributing to Taskora

Thank you for your interest in contributing to **Taskora** (SigmaQuantSystems).

## Code of conduct

Please read and follow [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Development setup

### Prerequisites

- Node.js 22+
- npm
- Docker (optional, for full stack)

### Install and run

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (another terminal)
cd frontend && npm install && npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  

### Tests

```bash
# From repository root
npm test
npm run test:unit
npm run test:functional
npm run test:non-functional
npm run test:e2e:dnd   # needs Playwright browsers
```

See [test/README.md](./test/README.md) for the test layout (unit / functional / non-functional / e2e).

## How to contribute

1. Fork the repository: https://github.com/Gaetan-PRUVOT-SQS/Taskora  
2. Create a branch from `main`: `git checkout -b feature/my-change`  
3. Make focused commits (one logical change per commit when possible)  
4. Run tests: `npm test`  
5. Open a Pull Request against `main`  

### Pull request checklist

- [ ] Tests pass locally  
- [ ] New behavior has tests when relevant  
- [ ] README / CHANGELOG updated if user-facing  
- [ ] No secrets or personal data in commits  

## Project structure

```
backend/     Fastify API + PostgreSQL + WebSocket
frontend/    React (Vite) UI
test/        Unit / functional / non-functional / E2E
docs/        Postgres notes + design specs
brand/       Brand assets
```

## Coding style

- Keep code **readable** and straightforward  
- Prefer clear names over clever abstractions  
- Match existing patterns in the area you edit  
- Comments in French or English are fine; keep them short  

## Reporting issues

- Bugs / features: https://github.com/Gaetan-PRUVOT-SQS/Taskora/issues  
- Security: see [SECURITY.md](./SECURITY.md)  

## License and rights

By contributing, you agree that your contributions:

1. Are licensed under the **Apache License 2.0**, same as the project.  
2. Do **not** introduce third-party trademarks or proprietary assets (see [TRADEMARKS.md](./TRADEMARKS.md)).  
3. Are your original work or properly licensed for inclusion.  

Copyright © 2026 SigmaQuantSystems  
