# AI Financial Advisor: Secure Cloudflare Worker Proxy

Edge-прокси на базе **Cloudflare Workers** для безопасной интеграции OpenAI API и фронтенд-приложения в соответствии со спецификацией **Deploying Your AI App 01 — Security and API Integration** (Coursera / Scrimba).

---

## 📌 Архитектура проекта

```text
[ Browser / Frontend Client ]
           │
           │  HTTPS POST (JSON body: messages, model)
           ▼
[ Cloudflare Worker Edge Proxy (src/worker.js) ]
     ├─ 1. CORS Preflight (OPTIONS -> 204 No Content)
     ├─ 2. Input Validation (JSON & messages schema)
     ├─ 3. Injects Secrets (env.OPENAI_API_KEY from Vault)
     ├─ 4. Cloudflare AI Gateway (caching & rate-limits)
     ├─ 5. Error Sanitization (no leaked stack traces)
           │
           ▼
[ OpenAI API: https://api.openai.com/v1/chat/completions ]
```

---

## 📋 Соответствие требованиям Coursera (Deploying Your AI App 01)

| Требование Coursera | Реализация в проекте | Файл |
| :--- | :--- | :--- |
| **Secure Deployment Strategy** | Полная изоляция API-ключей от браузера через бессерверный Edge-прокси | `src/worker.js` |
| **Cloudflare Worker Setup** | Точка входа ES Modules с обработчиком `fetch(request, env, ctx)` | `src/worker.js`, `wrangler.toml` |
| **Connect Worker to OpenAI** | Инициализация SDK с передачей `env.OPENAI_API_KEY` из зашифрованных секретов | `src/worker.js` |
| **Update Client Fetching** | Использование нативного браузерного `fetch()` без зависимостей от OpenAI в бандле | `public/index.js` |
| **Handle CORS & Preflight** | Ответ на `OPTIONS` с кодом 204 и заголовками `Access-Control-Allow-*` | `src/worker.js` |
| **Requests & Responses** | Валидация входного JSON, вызов `chat.completions.create` и отдача чистого ответа | `src/worker.js` |
| **AI Gateway Integration** | Поддержка `env.AI_GATEWAY_URL` через переопределение `baseURL` | `src/worker.js`, `wrangler.toml` |
| **Error Handling** | Перехват через `try/catch`, возврат HTTP 400/405/500 без утечки учетных данных | `src/worker.js` |

---

## 🚀 Быстрый запуск и верификация

### 1. Установка зависимостей
```bash
npm install
```

### 2. Запуск автоматизированного тестового набора
```bash
npm test
```
Тестовый набор выполняет 10 проверок:
1. Обработка CORS Preflight (`OPTIONS` -> 204).
2. Работоспособность эндпоинта `/health` (GET -> 200).
3. Блокировка недопустимых методов (PUT, DELETE -> 405).
4. Защита корневого GET эндпоинта (405).
5. Обработка отсутствия секрета `OPENAI_API_KEY` (500).
6. Валидация некорректного JSON (400).
7. Валидация структуры массива `messages` (400).
8. Аудит исходного кода на отсутствие хардкода API-ключей.
9. Проверка контракта фронтенда (отсутствие импортов `openai`).
10. Валидация конфигурации `wrangler.toml`.

### 3. Локальный запуск через Wrangler
```bash
# Привязка секретного ключа в локальной среде Wrangler
npx wrangler secret put OPENAI_API_KEY

# Запуск локального эмулятора Edge Worker на порту 8787
npm run dev
```

### 4. Деплой в Cloudflare Edge Network
```bash
npm run deploy
```
После деплоя вставьте полученный URL в переменную `WORKER_PROXY_URL` файла `public/index.js`.
