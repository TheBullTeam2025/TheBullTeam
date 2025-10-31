// Скрипт для проверки и исправления путей к иконкам
// Запустите в консоли браузера на GitHub Pages после загрузки файлов

(function() {
  const iconPaths = [
    './icons/TableBull.png',
    'icons/TableBull.png',
    '/icons/TableBull.png',
    '/TheBullTeam/icons/TableBull.png',
    'https://thebullteam2025.github.io/TheBullTeam/icons/TableBull.png'
  ];
  
  console.log('Проверка доступности иконок...');
  
  iconPaths.forEach((path, index) => {
    const img = new Image();
    img.onload = () => {
      console.log(`✓ Путь ${index + 1} работает: ${path}`);
    };
    img.onerror = () => {
      console.log(`✗ Путь ${index + 1} не работает: ${path}`);
    };
    img.src = path;
  });
})();

