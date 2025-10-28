# Исправление для GitHub Pages

## ✅ Что было исправлено:

### 1. **manifest.webmanifest** - изменены пути на относительные
- `"start_url": "./"` вместо `"/"`
- `"scope": "./"` вместо `"/"`
- `"./icons/icon-192.png"` вместо `"/icons/icon-192.png"`

### 2. **sw.js** - Service Worker использует относительные пути
- Все пути изменены с `/` на `./`
- Обновлена версия кэша до `v6`

### 3. **index.html** - ссылки на манифест и иконки
- Все ссылки стали относительными `./`

### 4. **Создан файл .nojekyll**
- Этот файл нужен для GitHub Pages, чтобы не игнорировать файлы, начинающиеся с `_`

## 🎨 Создание иконок PNG

У вас есть SVG иконка в `icons/icon.svg`. Теперь нужно создать PNG версии:

### Вариант 1: Онлайн конвертер (самый простой)
1. Откройте https://cloudconvert.com/svg-to-png
2. Загрузите `icons/icon.svg`
3. Конвертируйте в:
   - 192x192 px → сохраните как `icon-192.png`
   - 512x512 px → сохраните как `icon-512.png`
4. Поместите оба файла в папку `icons/`

### Вариант 2: Используя браузер
1. Откройте файл `icons/generate-icons.html` в браузере
2. Нажмите кнопки для скачивания иконок

### Вариант 3: ImageMagick (если установлен)
```bash
magick icons/icon.svg -resize 192x192 icons/icon-192.png
magick icons/icon.svg -resize 512x512 icons/icon-512.png
```

## 📤 Деплой на GitHub Pages

После создания иконок:

```bash
git add .
git commit -m "Fix: относительные пути для GitHub Pages + иконки"
git push origin main
```

Подождите 1-2 минуты, пока GitHub Pages обновится.

## 🧪 Проверка

После деплоя:
1. Очистите кэш браузера (Ctrl+Shift+Delete)
2. Откройте приложение: `https://YOUR_USERNAME.github.io/REPO_NAME/`
3. В Safari нажмите "Поделиться" → "На экран «Домой»"

## ⚠️ Важно

Если вы всё ещё видите 404:
- Убедитесь, что в Settings → Pages включен деплой из ветки `main`
- Проверьте, что все файлы загружены в репозиторий
- Очистите кэш Service Worker:
  - Откройте DevTools (F12)
  - Application → Service Workers → Unregister
  - Перезагрузите страницу

