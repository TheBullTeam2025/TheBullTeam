# Руководство по установке PWA на Android

## Что такое PWA?

Progressive Web App (PWA) — это веб-приложение, которое работает как нативное мобильное приложение. Оно может быть установлено на домашний экран, работать офлайн и отправлять push-уведомления.

## Установка PWA на Android

### Способ 1: Через браузер Chrome (Рекомендуется)

1. **Откройте приложение**:
   - Запустите Chrome на Android
   - Перейдите по ссылке на ваше PWA приложение
   - Дождитесь полной загрузки страницы

2. **Установка**:
   - В адресной строке появится иконка "Установить" (⬇️) или "Добавить на главный экран"
   - Нажмите на неё
   - Подтвердите установку в появившемся диалоге
   - Приложение появится на домашнем экране

3. **Альтернативный способ**:
   - Откройте меню Chrome (три точки)
   - Выберите "Добавить на главный экран"
   - Подтвердите установку

### Способ 2: Через браузер Samsung Internet

1. **Откройте приложение** в Samsung Internet
2. **Установка**:
   - Нажмите на меню (три полоски)
   - Выберите "Добавить на главный экран"
   - Подтвердите установку

### Способ 3: Через браузер Firefox

1. **Откройте приложение** в Firefox
2. **Установка**:
   - Нажмите на меню (три точки)
   - Выберите "Установить"
   - Подтвердите установку

## Требования для установки PWA

### Минимальные требования:
- **Android**: версия 5.0 (API 21) или выше
- **Chrome**: версия 68 или выше
- **Samsung Internet**: версия 7.2 или выше
- **Firefox**: версия 58 или выше

### Обязательные компоненты PWA:
1. **Manifest файл** (`manifest.webmanifest`)
2. **Service Worker** (`sw.js`)
3. **HTTPS соединение**
4. **Responsive дизайн**

## Проверка готовности PWA

### Chrome DevTools:
1. Откройте приложение в Chrome на компьютере
2. Нажмите F12 для открытия DevTools
3. Перейдите на вкладку "Lighthouse"
4. Выберите "Progressive Web App"
5. Нажмите "Generate report"
6. Проверьте все пункты в разделе "PWA"

### Онлайн проверка:
- **PWA Builder**: https://www.pwabuilder.com
- **Lighthouse CI**: https://lighthouse-ci.com

## Настройка манифеста для Android

### Основные параметры в `manifest.webmanifest`:

```json
{
  "name": "BullTeam",
  "short_name": "BullTeam",
  "description": "PWA приложение для официантов",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "orientation": "portrait",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Важные параметры для Android:

- **`display: "standalone"`** - приложение открывается без адресной строки
- **`orientation: "portrait"`** - принудительная портретная ориентация
- **`purpose: "maskable"`** - иконки адаптируются под разные формы

## Создание иконок для Android

### Размеры иконок:
- **192x192px** - минимальный размер
- **512x512px** - рекомендуемый размер
- **144x144px** - для старых версий Android

### Требования к иконкам:
- **Формат**: PNG
- **Фон**: Прозрачный или однотонный
- **Стиль**: Простой, узнаваемый
- **Адаптивность**: Должны хорошо выглядеть в круге и квадрате

### Генерация иконок:
1. **PWA Builder**: https://www.pwabuilder.com/imageGenerator
2. **Favicon.io**: https://favicon.io
3. **RealFaviconGenerator**: https://realfavicongenerator.net

## Настройка Service Worker

### Базовый Service Worker (`sw.js`):

```javascript
const CACHE_NAME = 'bullteam-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/dishes-data.js',
  '/bar_drinks-data.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Установка Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// Активация Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Обработка запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
```

## Регистрация Service Worker

### В `app.js`:

```javascript
// Регистрация Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW зарегистрирован:', registration);
      })
      .catch(registrationError => {
        console.log('Ошибка регистрации SW:', registrationError);
      });
  });
}
```

## Тестирование PWA на Android

### 1. Локальное тестирование:
```bash
# Запуск локального сервера с HTTPS
npx http-server -S -C cert.pem -K key.pem -p 8080
```

### 2. Тестирование на устройстве:
- Подключите Android устройство к той же Wi-Fi сети
- Откройте Chrome на устройстве
- Перейдите по адресу `https://IP_АДРЕС:8080`

### 3. Проверка установки:
- Убедитесь, что появляется кнопка "Установить"
- Проверьте работу офлайн режима
- Протестируйте все функции приложения

## Устранение проблем

### PWA не устанавливается:

1. **Проверьте HTTPS**:
   - PWA работает только по HTTPS
   - Используйте Let's Encrypt для получения сертификата

2. **Проверьте манифест**:
   - Убедитесь, что `manifest.webmanifest` доступен
   - Проверьте JSON синтаксис

3. **Проверьте Service Worker**:
   - Убедитесь, что `sw.js` зарегистрирован
   - Проверьте консоль на ошибки

### Приложение не работает офлайн:

1. **Проверьте кэширование**:
   - Убедитесь, что все файлы добавлены в `urlsToCache`
   - Проверьте работу Service Worker

2. **Проверьте стратегию кэширования**:
   - Используйте "Cache First" для статических файлов
   - Используйте "Network First" для API запросов

### Иконки не отображаются:

1. **Проверьте пути к иконкам**:
   - Убедитесь, что файлы иконок существуют
   - Проверьте правильность путей в манифесте

2. **Проверьте размеры иконок**:
   - Используйте рекомендуемые размеры
   - Убедитесь, что иконки не повреждены

## Продвинутые возможности

### Push-уведомления:

```javascript
// Запрос разрешения на уведомления
if ('Notification' in window) {
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      // Настройка push-уведомлений
    }
  });
}
```

### Синхронизация в фоне:

```javascript
// Регистрация фоновой синхронизации
if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
  navigator.serviceWorker.ready.then(registration => {
    return registration.sync.register('background-sync');
  });
}
```

### Обновление приложения:

```javascript
// Проверка обновлений
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();
});
```

## Рекомендации

1. **Тестируйте на реальных устройствах** - эмуляторы могут не поддерживать все функции PWA
2. **Используйте HTTPS** - обязательно для работы PWA
3. **Оптимизируйте производительность** - PWA должны загружаться быстро
4. **Создавайте качественные иконки** - они влияют на восприятие приложения
5. **Тестируйте офлайн режим** - основное преимущество PWA

## Полезные ресурсы

- **PWA Checklist**: https://web.dev/pwa-checklist/
- **PWA Builder**: https://www.pwabuilder.com
- **Service Worker Cookbook**: https://serviceworke.rs
- **Web App Manifest**: https://developer.mozilla.org/en-US/docs/Web/Manifest
