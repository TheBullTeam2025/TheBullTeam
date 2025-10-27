# Развертывание на GitHub Pages

## Шаги:

1. **Создайте репозиторий на GitHub**
   - Перейдите на github.com
   - Создайте новый репозиторий (например, "BullTeamPWA")
   - Инициализируйте с README

2. **Загрузите файлы**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/BullTeamPWA.git
   git push -u origin main
   ```

3. **Включите GitHub Pages**
   - Перейдите в Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)

4. **Ваше приложение будет доступно по адресу:**
   `https://YOUR_USERNAME.github.io/BullTeamPWA/`

## Преимущества:
- ✅ Бесплатно
- ✅ Автоматическое HTTPS
- ✅ Простота настройки
- ✅ Хорошая производительность

## Недостатки:
- ❌ Публичный репозиторий (если не используете GitHub Pro)
- ❌ Ограничения по трафику
