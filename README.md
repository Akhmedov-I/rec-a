# Rec-A — AI-Driven HR ERP Platform

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" alt="Next.js 15"/>
  <img src="https://img.shields.io/badge/Firebase-12-orange?style=for-the-badge&logo=firebase" alt="Firebase"/>
  <img src="https://img.shields.io/badge/Gemini_AI-1.5-blue?style=for-the-badge&logo=google" alt="Gemini AI"/>
  <img src="https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS"/>
</div>

<br/>

> **Rec-A (Recruiter Assistant)** — интеллектуальная ERP-система для автоматизации HR-процессов. Платформа полностью интегрирована с Google Gemini AI и охватывает весь цикл найма: от создания вакансии до подписания оффера.

🌐 **Live:** [rec-a-hr-erp-92837482.web.app](https://rec-a-hr-erp-92837482.web.app)

---

## 📋 Содержание

- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Стек технологий](#-стек-технологий)
- [Роли и доступ](#-роли-и-доступ)
- [Модули системы](#-модули-системы)
- [Структура базы данных](#-структура-базы-данных)
- [API Routes](#-api-routes)
- [Локальный запуск](#-локальный-запуск)
- [Деплой](#-деплой)
- [Переменные окружения](#-переменные-окружения)

---

## ✨ Возможности

| Модуль | Описание |
|--------|----------|
| 🧠 **AI Requisition** | Загрузите PDF/Word/текст — Gemini AI сгенерирует полноценную вакансию |
| 📄 **Resume Matching** | AI анализирует резюме и выдаёт рейтинг совпадения 0–100 + отчёт |
| 🧪 **Adaptive Testing** | Одноразовые тесты с таймером, anti-cheat защитой, генерацией вопросов AI |
| 📊 **Pipeline** | Kanban-воронка кандидатов с drag-and-drop по статусам |
| 📝 **Offer Generator** | AI генерирует официальный Job Offer + PDF экспорт |
| 👥 **Team Management** | Управление командой, инвайты сотрудников по email |
| 📅 **Schedule** | Планировщик собеседований с кандидатами |
| 🌍 **Bilingual** | Полная поддержка русского и узбекского языков (next-intl) |

---

## 🏗 Архитектура

```
rec-a/
├── src/
│   ├── app/
│   │   ├── [locale]/               # Локализованные страницы (ru, uz)
│   │   │   ├── auth/               # Login, Register
│   │   │   ├── dashboard/          # Основные модули
│   │   │   │   ├── page.tsx        # Главная — статистика
│   │   │   │   ├── candidates/     # База кандидатов
│   │   │   │   ├── requisitions/   # Управление вакансиями
│   │   │   │   ├── pipeline/       # Kanban воронка + оффер
│   │   │   │   ├── testing/        # Модуль тестирования
│   │   │   │   ├── schedule/       # Расписание
│   │   │   │   ├── users/          # Управление командой
│   │   │   │   └── settings/       # Настройки
│   │   │   └── test/[id]/          # Страница теста для кандидата
│   │   └── api/                    # Server-side API Routes
│   │       ├── candidates/
│   │       │   ├── analyze/        # AI анализ резюме
│   │       │   └── [id]/offer/     # AI генерация оффера
│   │       ├── requisition/        # AI генерация вакансии
│   │       ├── testing/            # Генерация/сабмит теста
│   │       └── invite/             # Отправка инвайтов
│   ├── components/                 # Переиспользуемые компоненты
│   ├── context/                    # AuthContext (RBAC)
│   ├── lib/                        # Firebase config (db, auth, storage)
│   └── middleware.ts               # next-intl routing
├── docs/                           # Техническая документация
├── messages/                       # i18n переводы (ru.json, uz.json)
├── firebase.json                   # Firebase Hosting config
└── firestore.rules                 # Firestore Security Rules
```

---

## 🛠 Стек технологий

| Категория | Технология | Версия |
|-----------|-----------|--------|
| Framework | Next.js (App Router) | 15 |
| Language | TypeScript | latest |
| Styling | Tailwind CSS | 3.4 |
| Icons | Lucide React | 0.577 |
| Auth & DB | Firebase (Auth, Firestore, Storage) | 12 |
| AI Engine | Google Gemini (`@google/generative-ai`) | 0.24 |
| i18n | next-intl | 4.8 |
| PDF Generation | jsPDF + jsPDF-AutoTable | 4.2 |
| PDF Parsing | pdf-parse | 2.4 |
| DOCX Parsing | mammoth | 1.11 |
| Notifications | react-hot-toast | 2.6 |
| Hosting | Firebase Hosting + Cloud Functions (Gen2) | — |

---

## 👥 Роли и доступ

### Корпоративный аккаунт (Компания)

| Роль | Права |
|------|-------|
| **Admin** | Полный доступ. Управление пользователями, инвайты сотрудников, настройки компании |
| **HRD** | Получает все новые заявки, распределяет на рекрутеров, все отчёты |
| **Manager** | Видит все отчёты и статусы, может создавать заявки |
| **Recruiter** | Принимает заявки, работает с кандидатами, проводит тестирования |
| **Requester** | Создаёт заявки. Видит только свои заявки и их статусы |

### Частный Рекрутер

Единая роль без иерархии — полный доступ ко всем функциям в рамках своего аккаунта.

---

## 📦 Модули системы

### 1. 📋 Управление заявками (Requisitions)

- Создание вакансии через загрузку файла (PDF, DOCX) или текстовое описание
- **AI (Gemini)** структурирует требования: образование, опыт, hard/soft skills, психотип, обязанности, условия
- Редактирование и дополнение сгенерированных данных
- Статусы: `open → in_progress → testing → interview → offer → hired/closed`

### 2. 👤 База кандидатов (Candidates)

- Прикрепление резюме к активной вакансии
- **AI анализ (Gemini):** глубокий матчинг резюме с требованиями вакансии
  - Рейтинг совпадения **0–100 баллов**
  - Сильные стороны, зоны риска, предполагаемый психотип, рекомендация
- Полная история взаимодействий (ERP для рекрутинга)
- Статусы кандидата: `new → testing → interview → offer → accepted/rejected`
- **Отчёт A4** — готов к печати, включает результаты теста (2 страницы PDF)

### 3. 🧪 Модуль тестирования (Adaptive Testing)

- Рекрутер выбирает кандидата и компетенции для проверки
- AI генерирует **уникальный одноразовый тест** (ссылка `/test/[token]`)
- **Структура теста (макс. 60 минут):**
  - Блок 1 (10 мин): Психологический портрет
  - Блок 2 (10 мин): Логика
  - Блоки 3–6 (опционально): Hard skills по выбору рекрутера
- **Anti-cheat:** Ситуативные вопросы, жёсткий таймер на блок
- Кандидат выбирает язык (рус/узб), вводит ФИО и дату рождения
- **Автоматический отчёт** с графиками и рекомендациями — мгновенно после завершения

### 4. 🔀 Воронка (Pipeline)

- Kanban-доска по статусам кандидатов
- Drag-and-drop перемещение по колонкам
- Встроенный конструктор оффера с AI (на рус/узб)
- Принятие оффера → автоматическое закрытие вакансии

### 5. 👥 Управление командой (Users)

- Список сотрудников компании с ролями
- Инвайт новых сотрудников по email:
  - Admin вводит email + роль
  - Firebase отправляет письмо-ссылку для входа (бесплатно)
  - Сотрудник кликает ссылку → роль назначается автоматически

---

## 🗄 Структура базы данных

### Коллекции Firestore

```
users/
  └── {uid}: { uid, email, displayName, role, companyId, createdAt }

companies/
  └── {companyId}: { name, ownerId, createdAt }

invites/
  └── {inviteId}: { email, role, companyId, createdAt }

requisitions/
  └── {reqId}: { title, companyId, creatorId, status, aiGenerated, requirements, ... }

candidates/
  └── {candidateId}: { name, email, requisitionId, companyId, resumeUrl, aiRating, aiAnalysis, status, ... }

tests/
  └── {testId}: { candidateId, token, blocks, status, results, completedAt }

offers/
  └── {offerId}: { candidateId, requisitionId, offerText, status, createdAt }
```

---

## 🔌 API Routes

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/requisition` | POST | AI генерация вакансии из текста/файла |
| `/api/candidates/analyze` | POST | AI анализ резюме (матчинг с вакансией) |
| `/api/candidates/[id]/offer` | POST | AI генерация Job Offer |
| `/api/testing/generate` | POST | Генерация теста (блоки вопросов) |
| `/api/testing/submit` | POST | Сабмит ответов, генерация итогового отчёта |
| `/api/testing/partial` | POST | Сохранение частичных результатов блока |
| `/api/invite` | POST | Создание инвайта (вспомогательный) |

**AI Provider:** Все AI-запросы используют Google Gemini 1.5 Pro/Flash с умным переключением между `v1` и `v1beta` эндпоинтами при недоступности.

---

## 🚀 Локальный запуск

### Требования

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud проект с включёнными API:
  - Firebase Authentication
  - Cloud Firestore
  - Cloud Storage
  - Gemini API

### Установка

```bash
# Клонировать репозиторий
git clone <repo-url>
cd rec-a

# Установить зависимости
npm install

# Создать .env.local (см. раздел ниже)
cp .env.local.example .env.local

# Запустить в dev-режиме
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) в браузере.

---

## 🌐 Деплой

Проект деплоится на **Firebase Hosting** с Next.js SSR через Cloud Functions Gen2.

```bash
# Авторизация (один раз)
firebase login

# Деплой
firebase deploy --only hosting
```

> ⚠️ **Первый деплой** занимает ~10–15 минут (загрузка зависимостей в Cloud Functions).  
> Последующие деплои быстрее (~5–7 минут).

---

## 🔐 Переменные окружения

Создайте файл `.env.local` в корне проекта:

```env
# Firebase Client SDK (публичные, safe for client)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...

# Gemini AI (server-side only)
GEMINI_API_KEY=...

# App URL (for invite links)
NEXT_PUBLIC_APP_URL=https://your-project.web.app
```

> 🔒 `.env.local` добавлен в `.gitignore`. Никогда не коммитьте реальные ключи в репозиторий.

---

## 📐 Firestore Security Rules

Текущие правила (`firestore.rules`) требуют аутентификации для всех коллекций, кроме `/tests` (доступ для кандидатов без входа).

Для production рекомендуется ужесточить правила с проверкой `companyId`:

```javascript
// Пример усиленного правила
match /requisitions/{reqId} {
  allow read, write: if isAuthenticated() 
    && resource.data.companyId == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId;
}
```

---

## 🌍 Локализация

Проект поддерживает **русский** (основной) и **узбекский** языки через `next-intl`.

- Переводы: `messages/ru.json`, `messages/uz.json`
- Маршрутизация: `/ru/dashboard`, `/uz/dashboard`
- `middleware.ts` автоматически определяет язык браузера

---

## 📁 Дополнительная документация

| Файл | Описание |
|------|----------|
| [`docs/architecture.md`](docs/architecture.md) | Детальная архитектура и техническое задание |
| [`docs/system-prompt.md`](docs/system-prompt.md) | Системный промпт для AI-движка |
| [`firestore.rules`](firestore.rules) | Правила безопасности Firestore |
| [`storage.rules`](storage.rules) | Правила безопасности Storage |

---

<div align="center">
  <sub>Built with ❤️ using Next.js, Firebase & Google Gemini AI</sub>
</div>
