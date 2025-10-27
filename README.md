# Waiter PWA

Минимальное PWA-приложение для официантов: выбор стола, офлайн-очередь, установка.

## Возможности
- Столы (1..12), быстрый выбор
- Форма заказа: блюдо, количество, примечание
- Офлайн-очередь в localStorage
- Кнопка синхронизации (демо: очищает очередь)
- PWA: манифест, Service Worker, установка (beforeinstallprompt)

## Запуск локально
PWA требует HTTPS или localhost.

```bash
# Python
python -m http.server 5173
# откройте http://localhost:5173

# Или Node
npx serve -p 5173
# откройте http://localhost:5173
```

## Файлы
- `index.html` — разметка
- `styles.css` — стили
- `app.js` — логика UI и офлайн-очереди
- `sw.js` — Service Worker (кэш статики)
- `manifest.webmanifest` — манифест PWA
- `icons/` — положите `icon-192.png` и `icon-512.png`

## Примечания
- Для реальной синхронизации замените `trySync()` в `app.js` на ваш API.
