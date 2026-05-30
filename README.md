# TraceLine

Compare text blocks line by line.

TraceLine is a stateless Angular + Go text comparison app. It compares text entered into Version A and Version B, aligns the results line by line, and highlights the changed words inside each changed line. Uploaded text-compatible files are read in memory only; no submitted text is stored.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | Angular 21, TypeScript, Angular Material, Reactive Forms, RxJS, Signals, CodeMirror, SCSS |
| Backend | Go 1.26, Chi, REST, standard `log/slog` |
| Testing | Vitest, Angular TestBed, HttpTestingController, Playwright, axe-core/playwright, Go `testing`, `httptest` |
| Delivery | Docker, Docker Compose, GitHub Actions |

## Features

- Empty first-run workspace with guided placeholders.
- Version A / Version B labels that work on desktop and mobile layouts.
- Side-by-side line comparison view.
- Word-level highlighting inside changed lines.
- Identical-text message in the result area.
- Drag-and-drop or button upload for text-compatible files up to 25 MB.
- Supported uploads include `.txt`, `.md`, `.json`, `.csv`, `.html`, `.xml`, `.yaml`, `.log`, common code files, and related text formats.
- One-click HTML export from the frontend that mirrors the current comparison page.
- Responsive layout, keyboard shortcuts, tooltips, toasts, accessible labels, and reduced-motion-friendly styling.

TraceLine does not include accounts, saved comparison history, share links, JSON-specific comparison tools, Markdown preview tools, or a database.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. |
| `POST` | `/api/compare` | Compare two text inputs. |
| `POST` | `/api/compare/files` | Compare two uploaded text files. |
| `POST` | `/api/export` | Build a HTML export from a comparison result. |

## Local Setup

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the Angular frontend:

```bash
npm start
```

Run the Go backend in another terminal:

```bash
cd backend
go run ./cmd/server
```

The Angular dev server runs on `http://localhost:4200`; the Go API runs on `http://localhost:8080`. The frontend dev server proxies `/api` requests to the backend.

## Tests

Frontend unit tests:

```bash
cd frontend
npm run test:ci
```

Playwright E2E tests:

```bash
cd frontend
npm run e2e -- --project=chromium
```

Go tests:

```bash
cd backend
go test ./... -cover
```

Coverage goals:

| Area | Target |
| --- | ---: |
| Go backend | 85%+ |
| Angular frontend | 80%+ |
| E2E | Core compare, upload, export, layout, and accessibility flows |

## Docker

```bash
docker compose up --build
```

The production container builds the Angular app, builds the Go binary, and serves the Angular static bundle from the Go service at `http://localhost:8080`.

## CI/CD

GitHub Actions is configured to run:

- Frontend dependency install.
- Angular unit tests with coverage.
- Angular production build.
- Playwright Chromium E2E tests.
- Go format check.
- Go vet.
- Go tests with coverage.
- Docker image build.

## Deployment

TraceLine can be deployed as a single Docker container to Render, Fly.io, Railway, or any container host. No database, cache, object storage, or background worker is required.
