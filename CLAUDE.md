# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal Telegram bot (NestJS + TypeORM + PostgreSQL) for tracking Jira tickets from the `WA` project. It syncs assigned Jira issues into a local `tasks` table and lets the user browse/report on them from Telegram; a `/report24` recent-activity digest is fetched live from Jira instead. The bot's user-facing text is in Russian — keep new bot copy in Russian to match. Everything is TypeScript — there is no other language runtime in this repo (an earlier Python script behind `/report24` was ported to TypeScript and removed).

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

1. **DB-backed path** (`JiraModule` → `TaskModule` → `ReportModule`): `JiraService.getTasks()` hits the Jira REST API v3 `/search/jql` endpoint (Basic auth, email:token base64) for issues assigned to the current user in project `WA`. `TaskService.syncTaskData()` upserts them into the `tasks` table (conflict on `externalId`) and soft-deletes any task no longer present in the Jira result. Everything that reads from the DB (`/report_auto`, `/report_auto_sprint`, plain-number lookups, comment updates, `/hidden`) uses this synced snapshot, not a live Jira call. Report formatting/grouping itself lives in `ReportBuilderService` (`src/modules/report/`), not in `TaskService` — `TaskService` is a pure data-access layer.
2. **Live path** (`JiraActivityReportService` in `JiraModule`): `/report24` calls Jira directly and bypasses the local DB entirely — three parallel JQL searches (created / updated-but-not-created / Ready to Merge, all scoped to `assignee = currentUser()`), then per-issue `changelog`+`comments` lookups and a dev-status API call per issue for linked GitHub PRs. Output goes back through `sendMarkdown`, not HTML (same Markdown-shaped text a human previously got from the old Python script).

Don't conflate the two: fixing a report-formatting bug for `/report_auto` means looking at `ReportBuilderService`/`TaskService`/`TaskEntity`; fixing `/report24` means looking at `JiraActivityReportService`.

### Telegram bot service (`src/modules/telegram-bot/`)

`TelegramBotService` is a thin dispatch layer: command routing is regex-based (`constants/regex/`), not a command framework — new commands need a regex added there plus a `bot.onText`/`bot.on('callback_query', ...)` branch that calls into the right handler. The actual command logic lives in `handlers/`, one class per domain service it depends on: `TaskBotHandlers`, `ManualEntryBotHandlers`, `CalendarBotHandlers`, `JiraReportBotHandlers`. `TelegramBotService` itself only keeps the flows that don't cleanly belong to one handler: `/reset`/`----` (touches both `TaskService` and `ManualEntryService`), private-chat broadcast, and `sendOwnerMessage`. `TelegramMessengerService` owns the single `node-telegram-bot-api` `TelegramBot` instance (constructed with `polling: true`) plus `sendHtml`/`sendMarkdown`/`splitMessage` — every handler class takes it as a constructor dependency rather than touching `TelegramBot` directly, except for direct `bot.sendMessage`/`answerCallbackQuery`/`editMessageReplyMarkup` calls for things that don't need HTML/Markdown formatting.

Other things that aren't obvious from a quick skim:
- `privateChatIds` is an in-memory set of chats seen so far, used only to broadcast a notice to other private chats when `/reset` (or the `----` separator) is triggered by one user — it resets on process restart.
- Outgoing messages use Telegram `parse_mode: 'HTML'` (`sendHtml`) for anything built from DB data, and `parse_mode: 'Markdown'` (`sendMarkdown`) for the live `/report24` digest, each with its own 4096-char chunk-splitting (`splitMessage`, prefers splitting on blank lines then newlines). User-entered text (e.g. task comments) is converted from Telegram's rich-text entities to HTML tags via `entitiesToHtml`/`escapeHtml` (`helpers/entities-to-markdown.helper.ts`) rather than escaped-and-dropped — this preserves bold/italic/links typed by the user. Any new outbound text path needs to pick the matching send method and escape user content accordingly to avoid breaking Telegram's HTML/Markdown parser.
- Never bootstrap the full `AppModule` (or anything pulling in `TelegramBotModule`) to test an unrelated module in isolation — `TelegramMessengerService`'s constructor eagerly starts live polling against the real bot token.

### Data model

Single `tasks` table (`TaskEntity` extends `BaseEntity`: uuid PK, `createdAt`/`updatedAt`/`deletedAt` soft-delete, all via TypeORM decorators). Notable columns beyond the obvious: `number` (the numeric suffix of the Jira key, e.g. `123` for `WA-123` — this is what users type, not the Jira key itself) and `isCommentDirty` (set when a user attaches a comment via `<number>: <text>`, cleared by `/reset`; drives which tasks land in the "main" bucket of `ReportBuilderService.generateAutoReport()` vs. the state-based sections in `task/constants/task.constants.ts`'s `TaskState` enum and `report/constants/report.constants.ts`'s `ReportHeader` enum).

### Config and DB wiring

Config modules follow the `@nestjs/config` `registerAs` pattern with typed interfaces in `*/interfaces/` (`src/config/*.config.ts`, `db/config/db-config.ts`). `tsconfig.json` sets `baseUrl: "./"`, so both `src/...` and `db/...` are valid absolute-style import roots from anywhere in the project (see `db-config.ts` imported as `db/config/db-config` in `app.module.ts`).

TypeORM uses a custom snake_case `NamingStrategy` (`db/config/db-naming.strategy.ts`) — entity fields stay camelCase in code but map to snake_case columns; migrations must match that convention. `synchronize` is always `false`; schema changes go through migrations in `db/migrations/`. `db-init.sh` (run by the `db` container on first boot) creates `bot_development` and `bot_test` databases with the `citext` and `uuid-ossp` extensions.

### Module layout convention

Each feature lives under `src/modules/<name>/` with its own `.module.ts`, and typically `constants/`, `interfaces/`, `helpers/`, `dto/` subfolders, each re-exported through an `index.ts` barrel. Follow this shape for new modules rather than putting logic directly in `app.module.ts`.

## Environment variables

See `.env.example` for the full list. Key ones: `TELEGRAM_BOT_ACCESS_KEY`, `JIRA_EMAIL` + `JIRA_API_TOKEN` (combined into Basic auth, exposed via `jira.authToken` config), `JIRA_BASE_URL` (site root, exposed as `jira.siteUrl` — used for the dev-status PR lookup; `jira.baseUrl` is hardcoded to the `/rest/api/3` root), `JIRA_USER_ACCOUNT_ID` (optional — enables reassignment detection in `/report24`, currently unset so that check is a no-op), `DATABASE_URL`/`PGUSER`/`PGPASSWORD`, `HEALTH_CHECK_URL`. `NODE_ENV` selects which `.env.<env>[.local]` file `ConfigModule` loads (falls back to `.env`).
