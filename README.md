# lab9-backend

Fastify + TypeScript + PostgreSQL (Drizzle)

## Запуск

1. Скопируйте `.env.example` → `.env` и задайте `POSTGRES_PASSWORD`
2. Поднимите стек:

```bash
docker compose up --build
```

API: `http://localhost:8000`. Health: `GET /api/health` → `{ "ok": true }`  
Postgres: `localhost:5432` (образ `postgres:17`)

Исходники смонтированы в контейнер; `nodemon --legacy-watch` + `tsx` перезапускают процесс при правках (polling нужен для bind-mount на Docker Desktop). После смены зависимостей пересоздайте контейнер API (`docker compose up --build -d --force-recreate api`), чтобы обновился анонимный volume `node_modules`

## Миграции

Схема: `src/db/schema.ts`. После изменений:

```bash
docker compose exec api npm run db:generate
```

SQL в `drizzle/` коммитится. На старте API вызывает `migrate()`
