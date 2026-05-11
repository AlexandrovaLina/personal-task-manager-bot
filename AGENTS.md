# Personal Task Manager Bot

## Overview

Telegram-бот для персонального управления задачами из Jira-проекта (WA). Приложение синхронизирует задачи из Jira в локальную PostgreSQL-базу, позволяет просматривать, обновлять комментарии и формировать отчёты прямо из Telegram. Часть команд делегируется Python-скриптам, которые обращаются к Jira REST API напрямую.

## Tech Stack

| Слой              | Технология                          |
|-------------------|-------------------------------------|
| Runtime           | Node.js >= 20.10, TypeScript 5      |
| Framework         | NestJS 10                            |
| ORM / DB          | TypeORM 0.3 + PostgreSQL (postgis/postgis:11-3.1-alpine) |
| Telegram          | node-telegram-bot-api (polling)      |
| HTTP              | @nestjs/axios (Jira REST API)        |
| Scheduler         | @nestjs/schedule (cron)              |
| Jira Scripts      | Python 3 (stdlib: urllib, json)      |
| Containerisation  | Docker, Docker Compose               |
| CI/CD             | GitHub Actions → SSH deploy          |

## Project Structure

```
├── src/
│   ├── main.ts                          # Bootstrap: создаёт NestJS app, инициализирует бота
│   ├── app.module.ts                    # Root module: config, TypeORM, Schedule, HTTP, модули
│   ├── app.service.ts                   # Cron-задачи: health-check (3 мин), sync tasks (ежедневно 10:00)
│   ├── config/
│   │   ├── app.config.ts                # healthUrl
│   │   ├── telegram.config.ts           # telegram-bot.token
│   │   ├── jira.config.ts              # jira.baseUrl, authToken (Base64), projectKey = "WA"
│   │   └── interfaces/                  # Типы конфигов: AppConfig, TelegramConfig, JiraConfig
│   ├── common/
│   │   ├── base.entity.ts               # BaseEntity: id (uuid), createdAt, updatedAt, deletedAt
│   │   ├── helpers/
│   │   │   ├── for-each-promise.helper.ts
│   │   │   └── with-transaction.helper.ts
│   │   └── types/optional.type.ts
│   └── modules/
│       ├── health/
│       │   └── health.controller.ts     # GET /health → "I am healthy"
│       ├── jira/
│       │   ├── jira.module.ts
│       │   ├── jira.service.ts          # getTasks() — JQL: assignee=currentUser(), maxResults=100
│       │   └── jira.controller.ts       # GET /jira/tasks (REST эндпоинт)
│       ├── task/
│       │   ├── task.module.ts
│       │   ├── task.entity.ts           # TaskEntity: externalId, title, url, state, number, comments
│       │   ├── task.service.ts          # CRUD, bulkUpsert, syncTaskData, buildTaskReport
│       │   ├── dto/create-task.dto.ts   # Валидация через class-validator
│       │   ├── constants/               # TASK_PAGE_SIZE = 5
│       │   ├── helpers/                 # taskTitleFormatter — экранирует Markdown-символы
│       │   └── interfaces/              # CreateTaskPayloadData
│       ├── telegram-bot/
│       │   ├── telegram-bot.module.ts
│       │   ├── telegram-bot.service.ts  # Инициализация бота, обработчики команд
│       │   └── constants/regex/         # Regex команд и текстовых паттернов
│       └── script-runner/
│           ├── script-runner.module.ts
│           └── script-runner.service.ts # Запуск Python-скриптов через child_process.execFile
├── scripts/                             # Python-скрипты для Jira
│   ├── report_24h.py                    # Отчёт за последние 24 ч (72 ч по понедельникам)
│   ├── fetch_issue.py                   # Детали конкретной задачи
│   ├── get_comments.py                  # Комментарии к задаче
│   ├── get_subtasks.py                  # Подзадачи
│   └── fetch_epic_children.py           # Дети эпика
├── db/
│   ├── config/
│   │   ├── db-config.ts                 # DataSourceOptions из env
│   │   ├── db-naming.strategy.ts        # snake_case naming strategy
│   │   └── ormconfig.ts                 # DataSource для CLI миграций
│   ├── helpers/                         # Переиспользуемые колонки для миграций (id, timestamps)
│   └── migrations/                      # TypeORM миграции
├── docker-compose.yml                   # Сервисы: app (Node), db (PostgreSQL)
├── Dockerfile                           # node:20-alpine + python3 + @nestjs/cli
├── Makefile                             # provision, app, migrate, migration-*, down, etc.
├── .github/workflows/ci-cd.yml          # CI: npm ci; CD: SSH → git pull + make provision + make app
└── .env.example                         # Шаблон переменных окружения
```

## Modules & Key Responsibilities

### AppModule (`src/app.module.ts`)
Root module. Загружает конфигурацию (`.env` → ConfigModule), подключает TypeORM, Schedule, HTTP и все feature-модули.

### TelegramBotModule
Центральный модуль взаимодействия с пользователем. Бот работает в режиме **polling**. Инициализируется в `main.ts` после старта HTTP-сервера.

**Команды бота:**
| Команда      | Описание                                        | Обработка         |
|--------------|------------------------------------------------|--------------------|
| `/start`     | Главное меню с inline-кнопкой Help              | Локально            |
| `/list`      | Пагинированный список задач (по 5 шт.)         | DB (TaskService)    |
| `/sync`      | Синхронизация задач из Jira в БД                | Jira API → DB       |
| `/report`    | Генерация отчёта по выбранным номерам задач     | DB (TaskService)    |
| `/report24`  | Отчёт из Jira за 24 ч (72 ч по пн)             | Python script       |
| `/issue`     | Детали задачи по ключу (WA-123)                 | Python script       |
| `/comments`  | Комментарии к задаче                            | Python script       |
| `/subtasks`  | Подзадачи                                       | Python script       |
| `/epic`      | Дети эпика                                      | Python script       |
| `<число>`    | Получить информацию о задаче по номеру          | DB (TaskService)    |
| `<число>: текст` | Обновить комментарий к задаче              | DB (TaskService)    |

### JiraModule
HTTP-клиент для Jira REST API v3. Авторизация — Basic Auth (email:token → Base64). Используется для синхронизации задач (`assignee=currentUser()`, проект `WA`).

### TaskModule
CRUD-операции над таблицей `tasks`. Ключевые методы:
- `syncTaskData()` — получает задачи из Jira, upsert по `externalId`
- `getTasks(page)` — пагинация, сортировка по `number DESC`
- `buildTaskReport(task)` — формирует Markdown-отчёт по задаче

### ScriptRunnerModule
Запускает Python-скрипты из директории `scripts/` через `child_process.execFile`. Передаёт Jira-креды через env. Таймаут — 30 сек. Обрезает ответ до 4096 символов (лимит Telegram).

### HealthModule
`GET /health` — простой health check, возвращает `"I am healthy"`.

## Database

**PostgreSQL** с расширениями `citext` и `uuid-ossp`. Инициализация через `db-init.sh` (создаёт БД `bot_development` и `bot_test`).

### Таблица `tasks`

| Колонка       | Тип          | Описание                              |
|---------------|-------------|---------------------------------------|
| id            | uuid (PK)   | Генерируется автоматически            |
| external_id   | text UNIQUE | ID задачи в Jira                      |
| title         | text         | Название задачи                       |
| url           | text         | Ссылка на задачу в Jira               |
| state         | text         | Статус задачи (default: "not specified") |
| number        | int          | Числовой номер (из ключа WA-xxx)      |
| comments      | text NULL    | Пользовательские комментарии          |
| created_at    | timestamptz  | Дата создания записи                  |
| updated_at    | timestamptz  | Дата обновления                       |
| deleted_at    | timestamptz  | Soft delete                           |

### Миграции
Используется TypeORM CLI. Файлы в `db/migrations/`. Naming strategy — snake_case.

## Cron Jobs (`AppService`)

1. **Health check** — каждые 3 минуты. GET-запрос на `HEALTH_CHECK_URL` и вспомогательный сервис для поддержания активности (Render free tier).
2. **Task sync** — ежедневно в 10:00. Синхронизирует задачи из Jira в локальную БД.

## Environment Variables

| Переменная                | Описание                                  |
|---------------------------|-------------------------------------------|
| `TELEGRAM_BOT_ACCESS_KEY` | Токен Telegram-бота                       |
| `JIRA_EMAIL`              | Email для авторизации в Jira              |
| `JIRA_API_TOKEN`          | API-токен Jira                            |
| `JIRA_BASE_URL`           | Базовый URL Jira (по умолчанию workaxle)  |
| `JIRA_USER_ACCOUNT_ID`    | Account ID пользователя (для скриптов)    |
| `DATABASE_URL`             | PostgreSQL connection string              |
| `PGUSER`                  | Пользователь БД                           |
| `PGPASSWORD`              | Пароль БД                                 |
| `DATABASE_LOGGING_ENABLED`| Логирование SQL-запросов                  |
| `APP_PORT`                | Порт приложения (default: 3000)           |
| `HEALTH_CHECK_URL`        | URL для периодического health check       |

## Running Locally

```bash
# 1. Скопировать и настроить переменные окружения
cp .env.example .env

# 2. Поднять Docker, установить зависимости, выполнить миграции
make provision

# 3. Запустить приложение
make app
```

### Make-команды

| Команда               | Описание                                   |
|-----------------------|--------------------------------------------|
| `make provision`      | rebuild-docker + install + build + migrate |
| `make app`            | Запуск приложения                          |
| `make sh`             | Shell в контейнере                         |
| `make install`        | npm install                                |
| `make migrate`        | Выполнить миграции                         |
| `make migration-create name=...` | Создать пустую миграцию           |
| `make migration-generate name=...` | Сгенерировать миграцию из diff  |
| `make migration-up`   | Применить миграции                         |
| `make migration-down` | Откатить миграцию                          |
| `make down`           | Остановить контейнеры                      |
| `make down-v`         | Остановить и удалить volumes               |

## CI/CD

GitHub Actions (`.github/workflows/ci-cd.yml`):
- **CI** — `npm ci` на push в `dev`
- **CD** — SSH-подключение к серверу → `git pull` → `make provision` → `make app`

## Coding Conventions

- **Язык интерфейса бота**: русский
- **Архитектура**: модульная (NestJS modules), каждый модуль — отдельная директория в `src/modules/`
- **Entity**: наследуются от `BaseEntity` (uuid PK, timestamps, soft delete)
- **Конфигурация**: `@nestjs/config` с `registerAs` и типизированными интерфейсами
- **Миграции**: ручные через TypeORM CLI, snake_case naming strategy
- **Валидация DTO**: `class-validator` + `class-transformer`
- **Formatter**: Prettier (singleQuote: true, trailingComma: all)
- **Linter**: ESLint с prettier plugin
- **Python-скрипты**: используют только stdlib (urllib, json, base64), без внешних зависимостей
