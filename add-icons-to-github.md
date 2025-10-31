# Инструкция: Как добавить папку icons/ на GitHub

## Проблема
GitHub не показывает пустые папки и иногда не загружает папки с файлами через веб-интерфейс.

## Решение 1: Загрузка через веб-интерфейс GitHub

1. Зайдите на GitHub в ваш репозиторий
2. Нажмите "Add file" → "Upload files"
3. **ВАЖНО:** Перетащите ВСЕ файлы из папки `icons/` одновременно:
   - `TableBull.png`
   - `The Bull-128.png`
   - `The Bull-512.png`
4. В поле "Commit changes" укажите путь: `icons/` (введите это вручную)
5. Нажмите "Commit changes"

## Решение 2: Создать папку и загрузить файлы

1. На GitHub нажмите "Add file" → "Create new file"
2. В поле имени файла введите: `icons/TableBull.png`
3. GitHub автоматически создаст папку `icons/`
4. Нажмите "Upload file" и выберите `TableBull.png`
5. Повторите для остальных файлов:
   - `icons/The Bull-128.png`
   - `icons/The Bull-512.png`

## Решение 3: Использовать Git (если установлен)

Выполните в терминале:

```bash
cd путь/к/вашему/проекту
git init
git add icons/
git commit -m "Add icons folder"
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

## Проверка

После загрузки проверьте, что файлы доступны по адресу:
- `https://thebullteam2025.github.io/TheBullTeam/icons/TableBull.png`

