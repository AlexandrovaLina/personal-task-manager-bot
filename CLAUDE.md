# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal Telegram bot (NestJS + TypeORM + PostgreSQL) for tracking Jira tickets from the `WA` project. It syncs assigned Jira issues into a local `tasks` table and lets the user browse/report on them from Telegram, while a handful of other Jira lookups are delegated to standalone Python scripts that hit the Jira REST API directly. The bot's user-facing text is in Russian — keep new bot copy in Russian to match.

A more detailed (but occasionally stale — verify against source) architecture doc lives at `AGENTS.md`; this file focuses on what's needed to work productively.

## Commands

Local dev runs inside Docker via `make`; npm scripts below also work directly if you have Postgres reachable via `DATABASE_URL`.

```bash
make provision              # rebuild-docker + install + build + migrate (first-time setup)
make app                     # run the app (docker compose, --service-ports)
make sh                      # shell into the app container
make down / make down-v      # stop containers (keep / wipe db volume)
make dump-schema              # pg_dump the dev DB schema (no data) into db/schema.sql

npm run start:dev            # nest start --watch, NODE_ENV=development
npm run build                # nest build
npm run lint                 # eslint --fix over src/apps/libs/test
npm run format                # prettier --write

npm test                     # jest, unit specs (*.spec.ts under src/)
npm test -- task.service     # run specs matching a name pattern
npm run test:watch
npm run test:cov
npm run test:e2e             # jest --config ./test/jest-e2e.json (test/app.e2e-spec.ts)
```

Note: there are currently no `*.spec.ts` files under `src/` — only the e2e smoke test in `test/`.

Migrations (TypeORM CLI, via `db/config/ormconfig.ts`):

```bash
make migration-create name=create-users     # empty migration
make migration-generate name=create-users   # generate from entity diff
make migration-up                            # run pending migrations
make migration-down                          # revert last migration
```

These map to `npm run migration:*` scripts (see `package.json`) if you're outside Docker.

## Architecture

### Bootstrap and cron

`src/main.ts` creates the Nest app, wires up pino logging, starts the HTTP server, then explicitly calls `telegramService.initBot()` — the Telegram bot is not started as part of module construction, it's started after HTTP listen. `AppService` (`src/app.service.ts`) runs two cron jobs:
- every 3 minutes: pings `app.healthUrl` and a hardcoded Render keep-alive URL (`tmpServiceURL`) — this exists to stop the free-tier host from sleeping, not for real monitoring.
- daily at 10:00: calls `TaskService.syncTaskData()` to pull fresh issues from Jira.

### Two independent paths to Jira data

1. **DB-backed path** (`JiraModule` → `TaskModule`): `JiraService.getTasks()` hits the Jira REST API v3 `/search/jql` endpoint (Basic auth, email:token base64) for issues assigned to the current user in project `WA`. `TaskService.syncTaskData()` upserts them into the `tasks` table (conflict on `externalId`) and soft-deletes any task no longer present in the Jira result. Everything that reads from the DB (`/list`, `/report`, `/report_auto`, plain-number lookups, comment updates) uses this synced snapshot, not a live Jira call.
2. **Script-backed path** (`ScriptRunnerModule`): the `/jira` menu (`report24`, `issue`, `comments`, `subtasks`, `epic`) shells out to Python scripts in `scripts/` via `child_process.execFile('python3', ...)` with a 30s timeout, passing Jira credentials through `env`. These scripts talk to Jira directly and bypass the local DB entirely — they use only the Python stdlib (no dependencies to install). Output goes back through `sendMarkdown`, not HTML.

Don't conflate the two: fixing a `/list` bug means looking at `TaskService`/`TaskEntity`; fixing `/jira → report24` means looking at `scripts/report_24h.py` and `ScriptRunnerService`.

### Telegram bot service (`src/modules/telegram-bot/telegram-bot.service.ts`)

Single service, polling mode, handles all commands and callback queries. Things that aren't obvious from a quick skim:
- Command routing is regex-based (`constants/regex/`), not a command framework — new commands need a regex added there plus a `bot.onText`/`bot.on('callback_query', ...)` branch.
- Multi-step flows use in-memory state, not Telegram's own state: `pendingJiraAction: Map<chatId, scriptName>` tracks "waiting for a Jira key" after a `/jira` submenu pick, and the `/report` flow attaches a one-shot `onText` listener (removed in a `finally`) to capture the follow-up message with task numbers.
- `privateChatIds` is an in-memory set of chats seen so far, used only to broadcast a notice to other private chats when `/reset` (or the `----` separator) is triggered by one user — it resets on process restart.
- Outgoing messages use Telegram `parse_mode: 'HTML'` (`sendHtml`) for anything built from DB data, and `parse_mode: 'Markdown'` (`sendMarkdown`) for raw Python script output, each with its own 4096-char chunk-splitting (`splitMessage`, prefers splitting on blank lines then newlines). User-entered text (e.g. task comments) is converted from Telegram's rich-text entities to HTML tags via `entitiesToHtml`/`escapeHtml` (`helpers/entities-to-markdown.helper.ts`) rather than escaped-and-dropped — this preserves bold/italic/links typed by the user. Any new outbound text path needs to pick the matching send method and escape user content accordingly to avoid breaking Telegram's HTML/Markdown parser.

### Data model

Single `tasks` table (`TaskEntity` extends `BaseEntity`: uuid PK, `createdAt`/`updatedAt`/`deletedAt` soft-delete, all via TypeORM decorators). Notable columns beyond the obvious: `number` (the numeric suffix of the Jira key, e.g. `123` for `WA-123` — this is what users type, not the Jira key itself) and `isCommentDirty` (set when a user attaches a comment via `<number>: <text>`, cleared by `/reset`; drives which tasks land in the "main" bucket of `generateAutoReport()` vs. the state-based sections in `task.contants.ts`'s `TaskState`/`ReportHeader` enums).

### Config and DB wiring

Config modules follow the `@nestjs/config` `registerAs` pattern with typed interfaces in `*/interfaces/` (`src/config/*.config.ts`, `db/config/db-config.ts`). `tsconfig.json` sets `baseUrl: "./"`, so both `src/...` and `db/...` are valid absolute-style import roots from anywhere in the project (see `db-config.ts` imported as `db/config/db-config` in `app.module.ts`).

TypeORM uses a custom snake_case `NamingStrategy` (`db/config/db-naming.strategy.ts`) — entity fields stay camelCase in code but map to snake_case columns; migrations must match that convention. `synchronize` is always `false`; schema changes go through migrations in `db/migrations/`. `db-init.sh` (run by the `db` container on first boot) creates `bot_development` and `bot_test` databases with the `citext` and `uuid-ossp` extensions.

### Module layout convention

Each feature lives under `src/modules/<name>/` with its own `.module.ts`, and typically `constants/`, `interfaces/`, `helpers/`, `dto/` subfolders, each re-exported through an `index.ts` barrel. Follow this shape for new modules rather than putting logic directly in `app.module.ts`.

## Environment variables

See `.env.example` for the full list. Key ones: `TELEGRAM_BOT_ACCESS_KEY`, `JIRA_EMAIL` + `JIRA_API_TOKEN` (combined into Basic auth for the JS Jira client and passed as-is to the Python scripts), `JIRA_BASE_URL`, `DATABASE_URL`/`PGUSER`/`PGPASSWORD`, `HEALTH_CHECK_URL`. `NODE_ENV` selects which `.env.<env>[.local]` file `ConfigModule` loads (falls back to `.env`).
