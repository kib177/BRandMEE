# 📦 Warehouse – Electronics Inventory Management System

A lightweight, self-hosted web application for managing electronic components inventory. Track parts, record write-offs, handle user roles, scan barcodes, and import/export data from Excel or CSV. Built with Node.js, Express, SQLite and vanilla JavaScript.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.1.0-green)

## ✨ Features

- **Inventory Management** – Add, edit, delete parts with metadata (code, name, model, type, equipment, location, unit, quantity, min. stock).
- **Write‑Off Requests** – Employees can submit write‑off requests; admins approve or reject them.
- **Role‑Based Access** – Three roles (`admin`, `moderator`, `viewer`) with different permissions.
- **Barcode Scanner** – Use the device camera to scan barcodes and instantly find items (mobile-friendly).
- **Import & Export** – Import data from Excel (.xlsx) or CSV files; export filtered inventory to Excel or CSV.
- **Bulk Editing** – Select multiple items and update type, equipment or location in one action.
- **Change History** – Every modification of an item is logged (old/new values, author, timestamp).
- **Low‑Stock Alerts** – Set minimum quantity per item; items below that threshold are highlighted and can be filtered.
- **Attachment Support** – Attach images to inventory items (e.g., photos of labels or storage locations).
- **Reports** – Visual analytics for write‑offs (charts by month, equipment, top items) and turnover statements.
- **Backup & Restore** – Download a database backup or upload a previously saved backup directly from the admin interface.
- **Responsive Design** – Fully usable on desktops, tablets and phones.

## 🛠️ Tech Stack

- **Backend:** Node.js, Express, SQLite (via `better-sqlite3`), JWT authentication, `multer` for file uploads.
- **Frontend:** Vanilla HTML, CSS (custom properties, grid/flexbox), JavaScript (modular, no framework).
- **Libraries:** SheetJS (xlsx) for Excel handling, `html5-qrcode` for barcode scanning, Chart.js for reports.
- **Security:** Content Security Policy (CSP), JWT with configurable expiration, HTTPS ready, input sanitisation.


## 📁 Структура проекта
``` text
warehouse-server/
├── public/ # Статические файлы фронтенда
│ ├── index.html # Главная страница (инвентарь)
│ ├── writeoff.html # Страница создания заявки на списание
│ ├── admin-writeoffs.html # Админ-панель управления списаниями
│ ├── admin.html # Управление справочниками (типы и оборудование)
│ ├── css/
│ │ ├── style.css # Основные стили
│ │ └── mobile.css # Адаптивные стили
│ └── js/
│ ├── utils.js # Вспомогательные функции ($, форматирование, toast)
│ ├── api.js # Взаимодействие с API инвентаря
│ ├── auth.js # Логин, логаут, таймер бездействия, обновление UI
│ ├── filters.js # Фильтрация и сортировка
│ ├── ui.js # Отрисовка таблицы, справочники, статистика
│ ├── import.js # Обработка импорта CSV/Excel
│ ├── export.js # Экспорт в Excel и CSV
│ └── app.js # Основная логика главной страницы
├── server/ # Серверная часть
│ ├── server.js # Точка входа, настройка Express
│ ├── db.js # Инициализация БД, миграции, начальные пользователи
│ ├── middleware/
│ │ └── auth.js # Middleware проверки JWT и ролей
│ └── routes/
│ ├── auth.js # Роуты аутентификации (/api/auth)
│ ├── inventory.js # CRUD инвентаря, импорт/экспорт
│ ├── writeoffs.js # Создание и управление списаниями, отчёты
│ └── directories.js # Управление справочниками (типы, оборудование)
├── package.json
└── README.md
```
