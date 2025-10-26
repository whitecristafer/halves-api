<div align="center">

# Halves API (Fastify + Prisma)

Бэкенд для приложения знакомств на TypeScript (ESM) с Fastify v5 и Prisma (PostgreSQL).

<img alt="Структура базы данных" src="./hLPVQnj747-_Jp7afLAGalIbb2Dnqb0AmRGuRGm5OuxLxKYtw6vNtTsphSI1j8Ns8OLy5LFgrf1Q_GgdRzJPM-IxhTnLeNcHPdypE_kR-UsVUs8iqxQkogGG7A52MoXk_C1OrAZiSe4cCNCX5qop2aeXqM6WDCNs72YjiCjlxB94q9XR9cSb9ec7uSwXGNq7c05dmAi4uAxWATIru71qi7.png" width="820" />

[Открыть API EXAMPLE →](./API-EXAMPLE.md)

</div>

## Обзор

Halves API реализует основные функции: авторизация (Access + Refresh), профиль и фото, настройки (возраст/пол/дистанция), лента с учётом блокировок и предпочтений, лайки/матчи, сообщения, блокировки и жалобы.

Стек:
- Node.js (TypeScript ESM)
- Fastify v5 (+ CORS, JWT, Multipart, Static)
- PostgreSQL (Prisma)
- Валидация: Zod (+ zod-validation-error)
- Логи: Pino (pretty в dev)

Английская версия: [README.md](./README.md)

## Быстрый старт

Требования:
- Node 18+ и npm
- Docker (локальный Postgres)

1) Запуск базы данных

```powershell
docker compose up -d
```

2) Переменные окружения

Создайте `.env` (или выставьте переменные) минимум со следующими значениями:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/halves?schema=public"
JWT_ACCESS_SECRET="dev-access-secret"
JWT_REFRESH_SECRET="dev-refresh-secret"
# Необязательно, есть значения по умолчанию:
# JWT_ACCESS_TTL=15m
# JWT_REFRESH_TTL=30d
# UPLOAD_DIR=./uploads
# CORS_ORIGIN=http://localhost:5173
```

3) Миграции, генерация, сидинг (опционально)

```powershell
npm run prisma:migrate
npm run prisma:generate
npm run db:seed
```

4) Запуск API (dev)

```powershell
npm run dev
```

Сервер: http://localhost:3000

## Документация API

Контракт и примеры: [API-EXAMPLE.md](./API-EXAMPLE.md)

Ключевые моменты:
- Все не-/auth маршруты требуют Bearer JWT
- Пагинация курсорами (Base64(JSON))
- Статика `/uploads/*` из `UPLOAD_DIR`
- Дедупликация ленты ~1 час: недавно показанные профили скрываются и помечаются как просмотренные

## Тестирование

Используется Vitest и Fastify `inject()` — реальный порт не требуется.

Команды:

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run test
# или
npm run test:watch
```

Советы:
- Можно использовать отдельную тестовую БД через `DATABASE_URL_TEST`. Тесты очищают данные (TRUNCATE) между кейсами.

## Структура проекта

```
src/
  app.ts            # buildApp() — создаёт инстанс Fastify
  index.ts          # вход — слушает порт
  env.ts            # Zod-валидация окружения
  plugins/prisma.ts # Prisma-клиент на Fastify
  routes/           # модули маршрутов
  utils/            # хелперы (auth guard, cursor, errors)
prisma/
  schema.prisma     # схема БД
  migrations/       # миграции
  seed.ts           # сидинг
tests/              # тесты vitest
uploads/            # загрузки (отдаются как /uploads/)
```

## Заметки

- Проект в ESM (`"type": "module"`), используйте ESM-импорты
- Директория `UPLOAD_DIR` должна существовать (создаётся при старте)
- Учитывайте `CORS_ORIGIN` в dev (по умолчанию http://localhost:5173)

## Лицензия

MIT
