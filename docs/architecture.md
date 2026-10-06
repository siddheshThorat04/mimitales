# Architecture

Status: Milestone 2 complete (foundation, parent authentication, child profiles).
Voice, stories, safety, wallet and phone calls are planned and not yet built.

## 1. Principles

- **Simple monorepo, no premature microservices.** One API, one web app, shared packages.
- **Deterministic code owns business logic.** The LLM (later) will never touch wallets,
  parental controls, account deletion or arbitrary data. All such actions go through
  validated backend functions.
- **Provider abstractions** for LLM, speech-to-text, text-to-speech and payments, so
  vendors can be replaced. (Interfaces arrive with the voice milestones.)
- **Privacy first.** Minimal child data (nickname, age band, language). No audio retention
  by default. Call records will hold metadata only.
- **Safe failure.** Provider and dependency errors are logged server-side and never
  returned to clients.

## 2. System overview

```text
Browser
   │  (only ever talks to /api/* on the web origin)
   ▼
apps/web  Next.js :3000 ── rewrite /api/* ──► apps/api  Fastify :4000
   │                                             ├──► PostgreSQL 16 (Prisma)
   └─ server components call the API             └──► Redis 7 (ioredis)
      directly, forwarding the session cookie
```

- The browser only talks to the web origin. Next.js rewrites `/api/:path*` to the Fastify
  API. Cookies therefore stay on one origin and no CORS configuration is needed.
- Server-rendered pages (dashboard, login, register) call the API directly and forward the
  `mt_session` cookie.
- PostgreSQL holds durable data. Redis holds sessions and login-throttle counters.

## 3. Repository layout

| Path                    | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `apps/api`              | Fastify API (auth, children, health)                     |
| `apps/web`              | Next.js parent dashboard                                 |
| `apps/voice-agent`      | Reserved                                                 |
| `packages/shared`       | Language codes, age bands, integer-paise money helpers   |
| `packages/config`       | zod-validated environment variables                      |
| `packages/database`     | Prisma schema, migrations, client                        |
| `packages/story-engine` | Reserved                                                 |
| `packages/safety`       | Reserved                                                 |
| `packages/language`     | Reserved                                                 |
| `packages/providers`    | Reserved                                                 |
| `packages/billing`      | Reserved                                                 |

Boundary rule: packages never import from apps. Apps depend on packages through
`workspace:*` dependencies.

## 4. API structure

```text
apps/api/src/
├── app.ts            builds the Fastify instance from injected dependencies
├── server.ts         the only place that creates Prisma and Redis clients
├── auth/
│   ├── routes.ts     register, login, logout, logout-all, me; exports the guards
│   ├── password.ts   argon2id hashing
│   ├── sessions.ts   Redis session store
│   ├── throttle.ts   per-email login lockout
│   ├── repo.ts       AuthRepo interface
│   ├── prisma-repo.ts
│   └── testing.ts    in-memory fakes for tests
└── children/
    ├── routes.ts     list, create, update, delete
    ├── schemas.ts    zod request schemas
    ├── repo.ts       ChildRepo interface
    ├── prisma-repo.ts
    └── testing.ts
```

### Dependency injection

`buildApp()` receives its dependencies as arguments: health checks, the auth dependencies
(repository, session store, login throttle, allowed origin) and the child repository.
`server.ts` passes in the Prisma and Redis implementations. Tests pass in-memory fakes.
Only `server.ts` and the `prisma-repo.ts` files import the database package, so tests run
without Postgres or Redis.

### Endpoints

| Method and path         | Auth          | Notes                                           |
| ----------------------- | ------------- | ----------------------------------------------- |
| `GET /health`           | none          | Liveness                                        |
| `GET /ready`            | none          | Readiness: database and Redis                   |
| `POST /auth/register`   | none          | 10 per minute per IP                            |
| `POST /auth/login`      | none          | 20 per minute per IP, plus account lockout      |
| `POST /auth/logout`     | session+CSRF  | Ends the current session                        |
| `POST /auth/logout-all` | session+CSRF  | Ends all sessions for the account               |
| `GET /auth/me`          | session       | Current parent and CSRF token                   |
| `GET /children`         | session       | Own children only                               |
| `POST /children`        | session+CSRF  | Maximum 5 per parent                            |
| `PATCH /children/:id`   | session+CSRF  | Partial update, strict schema                   |
| `DELETE /children/:id`  | session+CSRF  |                                                 |

### Cross-cutting behavior

- **Request IDs:** the server generates a UUID per request and returns it as
  `x-request-id`. Client-supplied IDs are ignored.
- **Security headers:** helmet. Global rate limit of 100 requests per minute per client.
- **Errors:** `{ "error": "CODE" }`. Validation errors list field names only, never the
  submitted values.
- **Readiness checks** run with a 2-second timeout. Failures are logged server-side and the
  client sees only `ok` or `down`.
- **Audit log:** each security-relevant action writes an `audit_logs` row (action, parent
  id, request id). Audit failures are logged and never break the request.

## 5. Authentication and sessions

### Registration and login

1. The input is validated (email normalized to lowercase, password 10 to 128 characters).
2. Passwords are hashed with **argon2id** (19 MiB memory, 2 iterations, 1 lane).
3. Registration creates the parent, its default controls and an empty wallet in a single
   database transaction.
4. Login runs the password check even for unknown emails (against a dummy hash), so
   response time does not reveal whether an account exists.
5. A wrong password and an unknown email return the identical response.

### Sessions

```text
login ─► random 256-bit token ─► cookie  mt_session=<token>
                  │
                  └─► Redis  sess:<sha256(token)> → { parentId, csrfToken, createdAt }
                      TTL 7 days. Also tracked in user_sessions:<parentId>.
```

- Only the **hash** of the token is stored, so a leaked Redis dump cannot be replayed as
  live sessions.
- The cookie is `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production.
- Every login issues a new session and destroys any session presented with the request
  (no session fixation).
- `logout` destroys one session. `logout-all` destroys every session for the account, using
  the per-parent key set.
- Responses under `/auth/` carry `Cache-Control: no-store`.

### CSRF and origin protection

- Every session has a CSRF token. State-changing authenticated routes require it in an
  `x-csrf-token` header, compared in constant time.
- Every state-changing request that carries an `Origin` header must match `WEB_ORIGIN`
  exactly, otherwise it gets 403. Requests without `Origin` (non-browser clients) pass this
  check but still need the session cookie and CSRF token where applicable.
- `SameSite=Lax` is a third layer.

### Brute-force defenses

- Per-IP rate limits on register and login.
- Per-email lockout: after 10 failed logins within 15 minutes, further attempts return
  429 until the window expires, even with the correct password. Failures are counted for
  unknown emails too, so the lockout does not reveal which accounts exist. The counter key
  is a hash of the email.

## 6. Authorization

Child endpoints use one pattern throughout:

- The parent id comes **only** from the server-side session, never from the request.
- Every repository method takes the parent id and scopes by it. There is deliberately no
  "find a child by id alone" method.
- Updates use `where: { id, parentId }` so ownership is part of the same atomic query.
- Another parent's child returns **404**, identical to a child that does not exist, so
  probing cannot reveal existence. Malformed ids also return 404.
- Request bodies use strict schemas. Unknown fields (for example `parentId`) get 400,
  which prevents mass assignment.
- The 5-child limit is enforced inside a transaction that locks the parent row
  (`SELECT ... FOR UPDATE`), so concurrent requests cannot both pass the check.

## 7. Web application

- **Server components** (`/dashboard`, `/login`, `/register`) validate the session by
  calling `GET /auth/me` on every request. Route protection checks the session in Redis,
  not just the presence of a cookie.
- **Client components** (`AuthForm`, `LogoutButton`, `ChildrenManager`) call `/api/*`
  through the rewrite. The CSRF token reaches them as a prop from the server component,
  so it never lives in a cookie or `localStorage`.
- If loading the children list fails, the page shows an error rather than an empty list, so
  a failure is never mistaken for "no children yet".
- Delete requires an explicit confirmation that mentions stories will be removed too.
- The child form asks for a nickname only and tells parents not to enter surnames, schools
  or addresses.

## 8. Data model

Defined in `packages/database/prisma/schema.prisma`. Applied migrations: `init`,
`add_audit_logs`.

| Table                | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `parent_accounts`    | Email, argon2id hash. Parents only. Children never have logins |
| `child_profiles`     | Nickname, age band, preferred language                        |
| `parent_controls`    | Daily limit, max call length, allowed languages, voice pause  |
| `characters`         | Configuration-driven original characters (JSON config)        |
| `story_worlds`       | Configuration-driven worlds (JSON config)                     |
| `stories`            | One per child, character and world                            |
| `story_memory`       | Structured story state (JSON) with a version                  |
| `story_episodes`     | Episode summaries and recorded choices                        |
| `call_sessions`      | Call metadata only: no audio, no transcripts                  |
| `wallets`            | Balance as `BIGINT` paise                                     |
| `wallet_transactions`| Ledger entries with a unique idempotency key                  |
| `call_charges`       | Reserved, charged and refunded paise per call                 |
| `language_configs`   | Per-language capability flags and an `enabled` switch         |
| `audit_logs`         | Action, parent id, request id. No relation, so it outlives deleted accounts |

Conventions:

- UUID primary keys, so ids are not predictable.
- Money is always integer paise (`BIGINT`), never floats. A database-level
  `CHECK (balance_paise >= 0)` on `wallets` is planned for Milestone 9.
- Deleting a parent cascades to their children, stories, controls and wallet.
  Deleting a child cascades to their stories and call sessions.
- Table names are snake_case, column names stay camelCase (quote them in raw SQL).
- Child data stays minimal. Age is stored as a band (`3-4`, `5-6`, `7-8`, `9-10`), never a
  birthdate.

### Languages

Only `en-IN`, `hi-IN` and `mr-IN` can be selected. The registry holds twelve codes, but a
language stays disabled until it passes real voice testing.

## 9. Configuration

`packages/config` validates the environment with zod at startup. Error messages name the
failing fields and never print values.

| Variable                      | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`   | Service connections                                      |
| `AUTH_SECRET`                 | At least 32 characters                                   |
| `API_PORT`                    | Default 4000                                             |
| `WEB_ORIGIN`                  | Allowed browser origin, default `http://localhost:3000`  |
| `DATA_MINIMIZATION`, `AUDIO_RETENTION` | Product principles, defaulting to `true` and `false` |

`API_URL` (where the web app reaches the API) is read directly by the web app and is not
yet part of the validated config.

## 10. Testing strategy

- **Unit and route tests** (vitest, Fastify `inject`) run against in-memory fakes. They need
  no Docker and cover authentication, sessions, CSRF, lockout, session fixation,
  cross-origin rejection, cross-parent isolation, validation (including unknown fields and
  Indian-script names) and the child limit.
- **Manual verification** against the real Postgres and Redis covers the Prisma and Redis
  implementations: transaction behavior, stored rows, hashed session keys.
- **Gap:** automated integration tests against real Postgres and Redis are not written yet.
  The row-lock limit check and the Prisma repositories are the first candidates.
- Web UI tests do not exist yet.

## 11. Decisions and trade-offs

| Decision | Reason | Trade-off |
| -------- | ------ | --------- |
| Server-side sessions in Redis, not JWTs | Instant revocation, nothing sensitive in the browser | Redis is required for every authenticated request |
| Hash the session token before storing | A Redis leak cannot be replayed | None meaningful |
| Single-origin `/api` proxy | No CORS, cookies stay simple | One more hop in front of the API |
| Repository interfaces plus in-memory fakes | Fast tests, no infrastructure needed | The real implementations need separate integration tests |
| 404 for other parents' children | Does not reveal what exists | Slightly harder to debug |
| Duplicate registration returns 409 | Clear feedback for users | Reveals that an email is registered; proper fix needs email verification |
| Audit rows without a relation | Records outlive account deletion | Orphaned rows must be handled by a retention policy |

## 12. Known gaps

- Email verification and password reset (need an email provider).
- Behind a proxy or load balancer, rate limiting needs `trustProxy` configured, and the web
  proxy must forward the client address. Without this, all users share one IP bucket.
- No audit-log retention policy or parent-facing activity view yet.
- Session management UI (list and revoke devices) is not built, although the API supports
  `logout-all`.
- Production deployment, backups and monitoring are Milestone 12.
- Legal and compliance review for India (and any other target country) is required before
  any real child testing or launch. The design supports parental consent, data
  minimization, deletion, retention policies and auditability, but technical readiness is
  not legal compliance.

## 13. What comes next

- **Milestone 3:** original characters and two story worlds, loaded from configuration and
  seeded into the database.
- **Milestone 4:** the story engine. Structured story memory, scenes, choices, summaries
  and continuation. The LLM only reads and proposes. Validated backend code writes the state.
- **Milestones 5 and 6:** browser voice and multilingual support behind provider
  interfaces.
- **Milestone 7:** the safety package, as a first-class layer separate from character
  prompts.