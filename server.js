const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Отключаем кэширование
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Раздаем статические файлы
app.use(express.static('.', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// Все запросы ведем на index.html (для SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📱 Для доступа с iPhone используйте IP адрес вашего компьютера`);
  console.log(`🔗 Например: http://192.168.1.100:${PORT}`);
});
