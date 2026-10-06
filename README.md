# MimiTales

A safe, multilingual, persistent interactive storytelling companion for children.

This repository is a pnpm monorepo. **Current status: Milestone 2 complete** (foundation,
parent authentication, child profiles). Voice, stories, payments and phone calls are not
built yet.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker Desktop, running

## Setup from zero

```bash
pnpm install
cp .env.example .env          # then set AUTH_SECRET (run: openssl rand -base64 32)
pnpm db:up                    # starts PostgreSQL and Redis
pnpm --filter @mimitales/database db:generate
pnpm --filter @mimitales/database db:deploy
```

`db:deploy` applies the existing migrations. Use `db:migrate --name <change>` only when you
are creating a new migration after editing `schema.prisma`.

## Run

Two terminals:

```bash
pnpm --filter @mimitales/api dev    # http://localhost:4000
pnpm --filter @mimitales/web dev    # http://localhost:3000
```

Open http://localhost:3000. Always use `localhost`, not `127.0.0.1`: the API checks the
request `Origin` against `WEB_ORIGIN` exactly.

## Commands

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm test`      | Run all tests                             |
| `pnpm typecheck` | Type-check every package                  |
| `pnpm lint`      | ESLint                                    |
| `pnpm build`     | Production build of the web app           |
| `pnpm db:up`     | Start PostgreSQL and Redis                |
| `pnpm db:down`   | Stop them (data is kept in a volume)      |

Database helpers (run from the repo root):

```bash
pnpm --filter @mimitales/database db:studio     # browse tables at http://localhost:5555
pnpm --filter @mimitales/database db:migrate --name <change>
pnpm --filter @mimitales/database db:generate
```

## Layout

| Path                    | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `apps/api`              | Fastify API: auth, children, health checks                   |
| `apps/web`              | Next.js parent dashboard                                     |
| `apps/voice-agent`      | Reserved for the voice milestone                             |
| `packages/shared`       | Language codes, age bands, money helpers (integer paise)     |
| `packages/config`       | Validated environment variables                              |
| `packages/database`     | Prisma schema, migrations and client                         |
| `packages/story-engine` | Reserved (Milestone 4)                                       |
| `packages/safety`       | Reserved (Milestone 7)                                       |
| `packages/language`     | Reserved (Milestone 6)                                       |
| `packages/providers`    | Reserved (LLM, speech-to-text, text-to-speech abstractions)  |
| `packages/billing`      | Reserved (Milestone 9)                                       |

## API

All JSON. Authenticated routes use the `mt_session` cookie. State-changing authenticated
routes also need an `x-csrf-token` header (the token is returned by register, login and
`/auth/me`).

| Method and path        | Auth        | Notes                                                |
| ---------------------- | ----------- | ---------------------------------------------------- |
| `GET /health`          | none        | Liveness                                             |
| `GET /ready`           | none        | Readiness: database and Redis                        |
| `POST /auth/register`  | none        | 10 per minute per IP                                 |
| `POST /auth/login`     | none        | 20 per minute per IP; account lockout after 10 failures in 15 minutes |
| `POST /auth/logout`    | session+CSRF | Ends the current session                            |
| `POST /auth/logout-all`| session+CSRF | Ends every session for the account                  |
| `GET /auth/me`         | session     | Current parent and CSRF token                        |
| `GET /children`        | session     | The parent's own children only                       |
| `POST /children`       | session+CSRF | Maximum 5 per parent                                |
| `PATCH /children/:id`  | session+CSRF | Partial update                                      |
| `DELETE /children/:id` | session+CSRF |                                                     |

Errors return `{ "error": "CODE" }`. Validation errors list field names only, never the
submitted values.

## Security model (current)

- **Passwords:** argon2id. Minimum 10 characters, maximum 128.
- **Sessions:** server-side in Redis, keyed by a SHA-256 hash of the cookie token, 7-day
  lifetime. The cookie is `HttpOnly` and `SameSite=Lax` (`Secure` in production). A new
  session is issued on every login.
- **CSRF:** per-session token required on state-changing authenticated routes, plus an
  `Origin` check on every state-changing request.
- **Authorization:** every child query is scoped by the logged-in parent's id. Another
  parent's child returns 404, the same as a child that does not exist.
- **Input:** strict schemas (unknown fields rejected), UUID validation on ids.
- **Logging:** structured logs with a server-generated request id. Audit rows record the
  action only: no child names, no passwords, no IP addresses.
- **Headers and limits:** helmet, global rate limit of 100 requests per minute, tighter
  limits on register and login.
- **Privacy defaults:** `DATA_MINIMIZATION=true`, `AUDIO_RETENTION=false`. Child data is
  minimal: a nickname, an age band and a language.

## Testing

```bash
pnpm test
```

API tests use in-memory fakes for the database and Redis, so they run without Docker. They
cover authentication, session handling, CSRF, lockout, cross-parent isolation, validation
and the child limit. The Prisma and Redis implementations are checked manually against the
real services (Docker). Integration tests against the real database are still to be added.

## Configuration

Copy `.env.example` to `.env`. Never commit `.env`. Key variables:

| Variable       | Purpose                                                      |
| -------------- | ------------------------------------------------------------ |
| `DATABASE_URL` | PostgreSQL connection string                                 |
| `REDIS_URL`    | Redis connection string (Docker maps Redis to host port 6380)|
| `AUTH_SECRET`  | At least 32 characters; generate with `openssl rand -base64 32` |
| `WEB_ORIGIN`   | Allowed browser origin, default `http://localhost:3000`      |
| `API_URL`      | Where the web app reaches the API, default `http://localhost:4000` |

The browser only talks to `/api/*` on the web app, which Next.js forwards to the API. This
keeps everything on one origin, so no CORS configuration is needed.

## Troubleshooting (Windows)

- **`pnpm: command not found`:** run `corepack enable`, then reopen the terminal.
- **Docker error mentioning `dockerDesktopLinuxEngine`:** Docker Desktop is not running.
  Start it and wait for "Engine running".
- **`EPERM ... query_engine-windows.dll.node` during a Prisma command:** a running process
  (the API dev server or Prisma Studio) has the engine loaded. Stop them, then run
  `pnpm --filter @mimitales/database db:generate`.
- **Redis or Postgres checks pass but behave oddly:** check for another program listening
  on the same port with `netstat -ano | grep -E ':(5432|6380) '`.
- **Cannot find name `process` or red underlines that typecheck does not show:** in VS Code
  run "TypeScript: Restart TS Server".
- **SQL column names:** Prisma keeps table names in snake_case but columns in camelCase, so
  quote them: `select "createdAt" from audit_logs;`.

## Roadmap

| Milestone | Scope                                   | Status      |
| --------- | --------------------------------------- | ----------- |
| 0         | Monorepo, database, API, web foundation | Done        |
| 1         | Parent authentication                   | Done        |
| 2         | Child profiles                          | Done        |
| 3         | Characters and story worlds             | Next        |
| 4         | Story engine and persistent memory      |             |
| 5         | Browser voice                           |             |
| 6         | Multilingual (English, Hindi, Marathi)  |             |
| 7         | Safety                                  |             |
| 8         | Parent dashboard features               |             |
| 9         | Wallet                                  |             |
| 10        | Phone calls                             |             |
| 11        | Birthdays                               |             |
| 12        | Production hardening                    |             |

## Known gaps

- Email verification and password reset are not built (they need an email provider).
- Registration returns 409 for an existing email, which reveals that the email is registered.
- Behind a proxy or load balancer, rate limiting needs `trustProxy` configured (Milestone 12).
- No web UI tests yet.
- Before any real child testing or launch, legal and compliance review for India (and any
  other target country) is required. The technical design supports parental consent, data
  minimization, deletion, retention policies and auditability, but being technically
  prepared is not the same as being legally compliant.