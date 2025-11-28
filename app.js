/* Waiter PWA SPA */
(function () {
  const STORAGE_KEYS = {
    tableOrders: 'waiter.tableOrders',
    tables: 'waiter.tables',
    tableMode: 'waiter.tableMode',
    tableNames: 'waiter.tableNames',
    orderHistory: 'waiter.orderHistory',
    meta: 'waiter.meta',
    activePage: 'waiter.activePage',
    profile: 'waiter.profile',
    searchFilters: 'waiter.searchFilters',
    learnProgress: 'waiter.learnProgress',
    categoryGrouping: 'waiter.categoryGrouping',
    learningProgress: 'waiter.learningProgress',
    learningLevel: 'waiter.learningLevel',
    learningXP: 'waiter.learningXP',
    shifts: 'waiter.shifts',
    darkMode: 'waiter.darkMode'
  };


  /** @type {Object<number, Array<{id:string, itemName:string, quantity:number, notes?:string, createdAt:number, status?:'rkeeper'|'served', addedAt:number}>>} */
  let tableOrders = {};
  /** @type {Array<number>} */
  let activeTables = [];
  /** @type {Object<number, string>} */
  let tableNames = {};
  /** @type {Array<any>} */
  let orderHistory = [];
  /** @type {{ lastPurgeMonth?: string } } */
  let meta = {};
  /** @type {{ name?: string, surname?: string, role?: string, grade?: string, location?: string }} */
  let profile = {};
  /** @type {Object<string, number>} - shifts: { "2025-06-05": 1, "2025-06-13": 0.5 } */
  let shifts = {};
  /** @type {{dishes:any[]} | null} */
  let db = null;
  const CATEGORY_CONFIG = {
    1: { key: 'drinks', label: 'Напитки' },
    2: { key: 'cold', label: 'Холодные блюда и закуски' },
    3: { key: 'hot', label: 'Горячие блюда' },
    4: { key: 'dessert', label: 'Десерты' }
  };
  const CATEGORY_KEYS = Object.fromEntries(Object.entries(CATEGORY_CONFIG).map(([id, cfg]) => [cfg.key, Number(id)]));
  /** @type {{drinks:boolean,cold:boolean,hot:boolean,dessert:boolean}} */
  let categoryGrouping = {
    drinks: true,
    cold: true,
    hot: true,
    dessert: true
  };
  
  // Learning system state
  let learningProgress = {}; // { sectionId: { topicId: boolean, flashcardId: { attempts, correct }, testId: { attempts, correct } } }
  let learningLevel = 1;
  let learningXP = 0;
  
  /** @type {'search' | 'todo'} */
  let tableMode = 'todo';

  const root = document.getElementById('app');
  const installBtn = document.getElementById('btn-install');
  let deferredPrompt = null;
  let currentPage = 'tables';

  function loadState() {
    try { tableOrders = JSON.parse(localStorage.getItem(STORAGE_KEYS.tableOrders) || '{}'); } catch { tableOrders = {}; }
    try { activeTables = JSON.parse(localStorage.getItem(STORAGE_KEYS.tables) || '[]'); } catch { activeTables = []; }
    try { tableMode = localStorage.getItem(STORAGE_KEYS.tableMode) || 'todo'; } catch { tableMode = 'todo'; }
    try { tableNames = JSON.parse(localStorage.getItem(STORAGE_KEYS.tableNames) || '{}'); } catch { tableNames = {}; }
    try { orderHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.orderHistory) || '[]'); } catch { orderHistory = []; }
    try { meta = JSON.parse(localStorage.getItem(STORAGE_KEYS.meta) || '{}'); } catch { meta = {}; }
    try { currentPage = localStorage.getItem(STORAGE_KEYS.activePage) || 'tables'; } catch { currentPage = 'tables'; }
    try { profile = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) || '{}'); } catch { profile = {}; }
    try { shifts = JSON.parse(localStorage.getItem(STORAGE_KEYS.shifts) || '{}'); } catch { shifts = {}; }
    try {
      const storedGrouping = JSON.parse(localStorage.getItem(STORAGE_KEYS.categoryGrouping) || 'null');
      if (storedGrouping && typeof storedGrouping === 'object') {
        categoryGrouping = { ...categoryGrouping, ...storedGrouping };
      }
    } catch { /* ignore */ }
    normalizeCategoryGrouping();
    
    // Load learning system data
    try { learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}'); } catch { learningProgress = {}; }
    try { learningLevel = parseInt(localStorage.getItem(STORAGE_KEYS.learningLevel) || '1') || 1; } catch { learningLevel = 1; }
    try { learningXP = parseInt(localStorage.getItem(STORAGE_KEYS.learningXP) || '0') || 0; } catch { learningXP = 0; }
    
    // Load dark mode
    try {
      const darkMode = localStorage.getItem(STORAGE_KEYS.darkMode) === 'true';
      if (darkMode) {
        document.documentElement.classList.add('dark');
      }
    } catch {}
  }

  function saveTableOrders() { localStorage.setItem(STORAGE_KEYS.tableOrders, JSON.stringify(tableOrders)); }
  function saveTables() { localStorage.setItem(STORAGE_KEYS.tables, JSON.stringify(activeTables)); }
  function saveTableMode() { localStorage.setItem(STORAGE_KEYS.tableMode, tableMode); }
  function saveTableNames() { localStorage.setItem(STORAGE_KEYS.tableNames, JSON.stringify(tableNames)); }
  function saveOrderHistory() { localStorage.setItem(STORAGE_KEYS.orderHistory, JSON.stringify(orderHistory)); }
  function saveMeta() { localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify(meta)); }
  function saveProfile() { localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile)); }
  function saveShifts() { localStorage.setItem(STORAGE_KEYS.shifts, JSON.stringify(shifts)); }
  function saveCategoryGrouping() { localStorage.setItem(STORAGE_KEYS.categoryGrouping, JSON.stringify(categoryGrouping)); }
  function saveLearningProgress() { localStorage.setItem(STORAGE_KEYS.learningProgress, JSON.stringify(learningProgress)); }
  function saveLearningLevel() { localStorage.setItem(STORAGE_KEYS.learningLevel, learningLevel.toString()); }
  function saveLearningXP() { localStorage.setItem(STORAGE_KEYS.learningXP, learningXP.toString()); }
  function saveDarkMode(enabled) { localStorage.setItem(STORAGE_KEYS.darkMode, enabled ? 'true' : 'false'); }

  function normalizeCategoryGrouping() {
    Object.keys(CATEGORY_KEYS).forEach((key) => {
      if (typeof categoryGrouping[key] !== 'boolean') {
        categoryGrouping[key] = true;
      }
    });
  }
  
  // Learning system helpers
  function calculateOverallProgress() {
    if (!window.TRAINING_DATA) return 0;
    let total = 0;
    let completed = 0;
    
    window.TRAINING_DATA.sections.forEach(section => {
      section.topics.forEach(topic => {
        total++;
        if (learningProgress[section.id]?.[topic.id]) completed++;
      });
    });
    
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }
  
  function addXP(amount) {
    learningXP += amount;
    
    // Level up system: level 1-10, each level requires more XP
    const xpForNextLevel = learningLevel * 100;
    if (learningXP >= xpForNextLevel && learningLevel < 10) {
      learningLevel++;
      learningXP = learningXP - xpForNextLevel;
      saveLearningLevel();
    }
    
    saveLearningXP();
    return { leveledUp: learningXP >= xpForNextLevel, newLevel: learningLevel };
  }
  
  function getLevelInfo() {
    const xpForNext = learningLevel * 100;
    const progress = learningLevel >= 10 ? 100 : Math.round((learningXP / xpForNext) * 100);
    const titles = ['', 'Стажёр', 'Новичок', 'Практикант', 'Официант', 'Профессионал', 'Эксперт', 'Мастер', 'Гуру', 'Легенда', 'Супер-звезда'];
    const achievementTitles = ['', 'Trainee', 'Waiter', 'Senior Waiter', 'Junior Sommelier', 'Sommelier', 'Senior Sommelier', 'Master', 'Expert', 'Legend', 'Superstar'];
    return {
      level: learningLevel,
      xp: learningXP,
      xpForNext,
      progress,
      title: titles[learningLevel] || 'Официант',
      achievementTitle: achievementTitles[learningLevel] || 'Waiter'
    };
  }

  // Helper function for gamification - get stars based on progress
  function getStars(progress) {
    const stars = Math.floor(progress / 20);
    return '⭐'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  function calculateCategoryProgress(categoryId) {
    if (!window.TRAINING_DATA) return 0;
    
    if (categoryId === 'menu') {
      // Calculate menu progress based on flashcards learned
      try {
        const progress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learnProgress) || '{"correct":0,"wrong":0}');
        // Estimate progress based on correct answers (simplified)
        return Math.min(67, Math.round((progress.correct / 225) * 100)); // 115 dishes + 110 drinks
      } catch {
        return 0;
      }
    }
    
    if (categoryId === 'bar') {
      // Calculate bar progress based on bar drinks flashcards learned
      try {
        let learningProgress = {};
        try {
          learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
        } catch {}
        
        // Count bar drinks studied
        let studied = 0;
        for (let key in learningProgress) {
          if (key.startsWith('bar_')) studied++;
        }
        
        // Get total bar drinks count
        if (db && db.dishes) {
          const barDrinks = db.dishes.filter(d => d.source === 'bar');
          const total = barDrinks.length;
          return total > 0 ? Math.round((studied / total) * 100) : 0;
        }
        
        // Fallback: try to get count from loaded data
        return 0;
      } catch {
        return 0;
      }
    }
    
    if (categoryId === 'theory') {
      // Overall theory progress (meat + bar + competencies)
      let total = 0;
      let completed = 0;
      ['meat', 'bar', 'competencies'].forEach(sectionId => {
        const section = window.TRAINING_DATA.sections.find(s => s.id === sectionId);
        if (section) {
          section.topics.forEach(topic => {
            total++;
            if (learningProgress[sectionId]?.[topic.id]) completed++;
          });
        }
      });
      return total > 0 ? Math.round((completed / total) * 100) : 0;
    }
    
    if (categoryId === 'steps') {
      // 6 steps of service progress - check if any steps were studied
      const steps = window.TRAINING_DATA.serviceSteps || [];
      if (steps.length === 0) return 50; // Default 50% if no data
      // For now, return a default progress or calculate based on actual study
      // You can track steps completion in learningProgress['steps']
      let completed = 0;
      steps.forEach(step => {
        if (learningProgress['steps']?.[step.id]) completed++;
      });
      // If none studied, return default 50%
      return steps.length > 0 ? Math.round((completed / steps.length) * 100) : 50;
    }
    
    return 0;
  }

  function calculateModuleProgress(moduleId) {
    // Calculate progress for each module card
    if (moduleId === 'dishes') {
      return calculateCategoryProgress('menu');
    }
    if (moduleId === 'bar-study') {
      return calculateCategoryProgress('bar');
    }
    if (moduleId === 'theory') {
      return calculateCategoryProgress('theory');
    }
    if (moduleId === 'service-steps') {
      return calculateCategoryProgress('steps');
    }
    return 0;
  }

  // Purge history monthly to avoid storage bloat
  function ensureMonthlyPurge(daysToKeep = 31) {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (meta.lastPurgeMonth === monthKey) return;

    const cutoff = now.getTime() - daysToKeep * 24 * 60 * 60 * 1000;
    orderHistory = (orderHistory || []).filter(h => {
      const closedAt = typeof h?.closedAt === 'number' ? h.closedAt : 0;
      return closedAt >= cutoff;
    });
    meta.lastPurgeMonth = monthKey;
    saveOrderHistory();
    saveMeta();
  }

  // Compute monthly metrics for profile
  function computeMonthlyMetrics(targetDate = new Date()) {
    const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
    const isSameMonth = (ts) => {
      const d = new Date(ts);
      return d.getFullYear() === targetDate.getFullYear() && d.getMonth() === targetDate.getMonth();
    };
    const monthOrders = (orderHistory || []).filter(h => h.closedAt ? isSameMonth(h.closedAt) : isSameMonth(h.createdAt));
    const numTables = monthOrders.length;
    const revenue = monthOrders.reduce((sum, h) => sum + (h.total || 0), 0);
    const averageCheck = numTables ? Math.round(revenue / numTables) : 0;
    const dishSales = new Map();
    for (const h of monthOrders) {
      for (const item of (h.items || [])) {
        const key = item.itemName || item.name || item.id || 'unknown';
        dishSales.set(key, (dishSales.get(key) || 0) + (item.quantity || 1));
      }
    }
    const top3 = Array.from(dishSales.entries()).sort((a,b) => b[1]-a[1]).slice(0,3).map(([name, qty]) => ({ name, qty }));
    return { monthKey, numTables, revenue, averageCheck, top3 };
  }

  // Function to get current app version with timestamp
  function getAppVersion() {
    const baseVersion = '0.5.0';
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    return `${baseVersion}.${timestamp}`;
  }


  
  function getTableDisplayName(tableNumber) {
    return tableNames[tableNumber] || `Стол ${tableNumber}`;
  }
  
  function showRenameTableModal(tableNumber) {
    const modal = document.createElement('div');
    modal.className = 'rename-modal';
    modal.innerHTML = `
      <div class="rename-content">
        <div class="rename-title">Переименовать стол</div>
        <input type="text" class="rename-input" id="rename-input" value="${getTableDisplayName(tableNumber)}" placeholder="Введите название стола">
        <div class="rename-actions">
          <button class="btn secondary" id="rename-cancel">Отмена</button>
          <button class="btn primary" id="rename-save">Сохранить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#rename-input');
    const cancelBtn = modal.querySelector('#rename-cancel');
    const saveBtn = modal.querySelector('#rename-save');
    
    // Focus and select text
    input.focus();
    input.select();
    
    // Event handlers
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    saveBtn.addEventListener('click', () => {
      const newName = input.value.trim();
      if (newName) {
        tableNames[tableNumber] = newName;
        saveTableNames();
        render(); // Re-render to update all table names
      }
      document.body.removeChild(modal);
    });
    
    // Close on Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveBtn.click();
      }
    });
    
    // Close on Escape key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cancelBtn.click();
      }
    });
  }

  function showCookingLevelModal(dishName, callback) {
    const modal = document.createElement('div');
    modal.className = 'rename-modal cooking-level-modal';
    modal.innerHTML = `
      <div class="rename-content cooking-level-content">
        <div class="rename-title">Выберите прожарку</div>
        <div class="cooking-level-dish">${dishName}</div>
        <div class="cooking-level-options">
          <button class="cooking-level-btn" data-level="Blue">1. Blue<br><span class="level-desc">С кровью</span></button>
          <button class="cooking-level-btn" data-level="Rare">2. Rare<br><span class="level-desc">Слабая</span></button>
          <button class="cooking-level-btn" data-level="Medium Rare">3. Medium Rare<br><span class="level-desc">Средне-слабая</span></button>
          <button class="cooking-level-btn" data-level="Medium">4. Medium<br><span class="level-desc">Средняя</span></button>
          <button class="cooking-level-btn" data-level="Medium Well">5. Medium Well<br><span class="level-desc">Средне-сильная</span></button>
          <button class="cooking-level-btn" data-level="Well Done">6. Well Done<br><span class="level-desc">Полная</span></button>
        </div>
        <button class="btn secondary" id="cooking-cancel">Отмена</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const cancelBtn = modal.querySelector('#cooking-cancel');
    const levelBtns = modal.querySelectorAll('.cooking-level-btn');
    
    // Event handlers for cooking level buttons
    levelBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const level = btn.dataset.level;
        document.body.removeChild(modal);
        callback(level);
      });
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
        document.removeEventListener('keydown', escHandler);
      }
    });
  }

  function showIceCreamFlavorModal(dishName, callback) {
    const flavors = {
      vanilla: { name: 'Ваниль', emoji: '🤍' },
      chocolate: { name: 'Шоколад', emoji: '🤎' },
      strawberry: { name: 'Клубника', emoji: '🩷' }
    };
    
    let selectedFlavors = { vanilla: 0, chocolate: 0, strawberry: 0 };
    let totalScoops = 0;
    
    const modal = document.createElement('div');
    modal.className = 'rename-modal ice-cream-modal';
    modal.innerHTML = `
      <div class="rename-content ice-cream-content">
        <div class="rename-title">Выберите вкусы мороженого</div>
        <div class="ice-cream-dish">${dishName}</div>
        <div class="ice-cream-subtitle">Выберите 3 шарика (можно одинаковые)</div>
        
        <div class="ice-cream-flavors">
          <div class="ice-cream-flavor-item" data-flavor="vanilla">
            <div class="flavor-name">${flavors.vanilla.emoji} ${flavors.vanilla.name}</div>
            <div class="flavor-controls">
              <button class="flavor-btn flavor-minus" data-flavor="vanilla">−</button>
              <span class="flavor-count" data-flavor="vanilla">0</span>
              <button class="flavor-btn flavor-plus" data-flavor="vanilla">+</button>
            </div>
          </div>
          
          <div class="ice-cream-flavor-item" data-flavor="chocolate">
            <div class="flavor-name">${flavors.chocolate.emoji} ${flavors.chocolate.name}</div>
            <div class="flavor-controls">
              <button class="flavor-btn flavor-minus" data-flavor="chocolate">−</button>
              <span class="flavor-count" data-flavor="chocolate">0</span>
              <button class="flavor-btn flavor-plus" data-flavor="chocolate">+</button>
            </div>
          </div>
          
          <div class="ice-cream-flavor-item" data-flavor="strawberry">
            <div class="flavor-name">${flavors.strawberry.emoji} ${flavors.strawberry.name}</div>
            <div class="flavor-controls">
              <button class="flavor-btn flavor-minus" data-flavor="strawberry">−</button>
              <span class="flavor-count" data-flavor="strawberry">0</span>
              <button class="flavor-btn flavor-plus" data-flavor="strawberry">+</button>
            </div>
          </div>
        </div>
        
        <div class="ice-cream-total">Выбрано шариков: <span id="total-scoops">0</span> / 3</div>
        
        <div class="ice-cream-actions">
          <button class="btn secondary" id="ice-cream-cancel">Отмена</button>
          <button class="btn primary" id="ice-cream-confirm" disabled>Подтвердить</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const updateTotal = () => {
      totalScoops = selectedFlavors.vanilla + selectedFlavors.chocolate + selectedFlavors.strawberry;
      modal.querySelector('#total-scoops').textContent = totalScoops;
      modal.querySelector('#ice-cream-confirm').disabled = totalScoops !== 3;
    };
    
    // Plus buttons
    modal.querySelectorAll('.flavor-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const flavor = btn.dataset.flavor;
        if (totalScoops < 3) {
          selectedFlavors[flavor]++;
          modal.querySelector(`.flavor-count[data-flavor="${flavor}"]`).textContent = selectedFlavors[flavor];
          updateTotal();
        }
      });
    });
    
    // Minus buttons
    modal.querySelectorAll('.flavor-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const flavor = btn.dataset.flavor;
        if (selectedFlavors[flavor] > 0) {
          selectedFlavors[flavor]--;
          modal.querySelector(`.flavor-count[data-flavor="${flavor}"]`).textContent = selectedFlavors[flavor];
          updateTotal();
        }
      });
    });
    
    // Confirm button
    modal.querySelector('#ice-cream-confirm').addEventListener('click', () => {
      const flavorText = [];
      if (selectedFlavors.vanilla > 0) flavorText.push(`${flavors.vanilla.name} x${selectedFlavors.vanilla}`);
      if (selectedFlavors.chocolate > 0) flavorText.push(`${flavors.chocolate.name} x${selectedFlavors.chocolate}`);
      if (selectedFlavors.strawberry > 0) flavorText.push(`${flavors.strawberry.name} x${selectedFlavors.strawberry}`);
      
      document.body.removeChild(modal);
      callback(flavorText.join(', '));
    });
    
    // Cancel button
    modal.querySelector('#ice-cream-cancel').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  async function loadDb(forceReload = false) {
    if (db && !forceReload) return db;
    try {
  // Try to load from embedded data first
  if (typeof DISHES_DATA !== 'undefined') {
    db = DISHES_DATA;
    // Mark kitchen dishes with source property
    if (db.dishes && Array.isArray(db.dishes)) {
      db.dishes = db.dishes.map(dish => ({ ...dish, source: dish.source || 'kitchen' }));
    }
    console.log('Loaded dishes from embedded data:', db.dishes.length, 'dishes');
    
    // Add bar drinks if available
    if (typeof BAR_DRINKS_DATA !== 'undefined' && BAR_DRINKS_DATA.dishes) {
      // Mark bar drinks with source: 'bar'
      const markedBarDrinks = BAR_DRINKS_DATA.dishes.map(drink => ({ ...drink, source: 'bar' }));
      db.dishes = [...db.dishes, ...markedBarDrinks];
      console.log('Added bar drinks:', markedBarDrinks.length, 'drinks');
      console.log('Total items:', db.dishes.length);
    }
    
    return db;
  }
      
      // Fallback to fetch
      const res = await fetch(`./dishes.json?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      
      const text = await res.text();
      console.log('Raw response length:', text.length);
      
      // Try to parse JSON
      try {
        db = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.log('First 500 chars of response:', text.substring(0, 500));
        throw new Error(`JSON parse error: ${parseError.message}`);
      }
      
      if (!db || !db.dishes || !Array.isArray(db.dishes)) {
        throw new Error('Invalid JSON structure: missing dishes array');
      }
      
      // Mark dishes with source property (default 'kitchen' if not set)
      db.dishes = db.dishes.map(dish => ({ ...dish, source: dish.source || 'kitchen' }));
      
      console.log('Successfully loaded dishes.json:', db.dishes.length, 'dishes');
      console.log('First few dishes:', db.dishes.slice(0, 3).map(d => d.name));
      console.log('Categories found:', [...new Set(db.dishes.map(d => d.category))]);
      return db;
    } catch (error) {
      console.error('Failed to load dishes.json:', error);
      throw error; // Re-throw to trigger error handling in viewTable
    }
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function calculatePrice(priceString, category) {
    if (!priceString) return '—';
    
    // Extract base prices from string like "350/400 рублей"
    const prices = priceString.match(/(\d+)/g);
    if (!prices || prices.length < 2) return priceString;
    
    const weekdayPrice = parseInt(prices[0]);
    const weekendPrice = parseInt(prices[1]);
    
    // Use Moscow time for pricing rules
    const now = new Date();
    const moscowString = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const [datePart, timePart] = moscowString.split(',').map(s => s.trim());
    const parts = timePart ? timePart.split(':').map(n => parseInt(n, 10)) : [now.getHours(), now.getMinutes(), 0];
    const hours = parts[0] || 0;
    const moscowDay = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' })).getDay();
    const isWeekend = moscowDay === 0 || moscowDay === 6; // Sunday or Saturday
    const isBefore5PM = hours < 17;
    
    if (isWeekend || !isBefore5PM) {
      return `${weekendPrice} ₽`;
    } else {
      return `${weekdayPrice} ₽`;
    }
  }
  
  // Function to categorize order for sorting
  function getCategoryGroup(order) {
    const itemName = (order.itemName || '').toLowerCase();
    const category = (order.category || '').toLowerCase();
    
    // 1. Напитки - ТОЛЬКО из bar_drinks (проверяем по R_keeper коду или категории бара)
    // Сначала проверяем, есть ли это блюдо в bar_drinks
    if (db && db.dishes) {
      const barDrink = db.dishes.find(d => 
        d.source === 'bar' && 
        (d.name === order.itemName || d.R_keeper === order.rkeeper)
      );
      if (barDrink) {
        return 1; // Напитки из бара
      }
    }
    
    // Дополнительная проверка по категории для напитков
    const barCategories = [
      'безалкогольные напитки', 'алкогольные напитки', 'коктейли', 
      'вино', 'пиво', 'крепкий алкоголь', 'кофе', 'чай'
    ];
    if (barCategories.some(cat => category.includes(cat.toLowerCase()))) {
      return 1; // Напитки
    }
    
    // 2. Холодные блюда - Закуски, Гарниры, Салаты, Супы
    const coldDishCategories = [
      'закуски', 'салат', 'супы', 'гарниры', 'гарнир'
    ];
    
    // Проверяем по категории (точное совпадение)
    if (coldDishCategories.some(cat => category === cat || category.includes(cat))) {
      return 2; // Холодные блюда
    }
    
    // Дополнительная проверка по ключевым словам в названии
    const coldDishKeywords = [
      'салат', 'закуска', 'гарнир', 'суп', 'борщ', 'стрипс'
    ];
    if (coldDishKeywords.some(keyword => itemName.includes(keyword))) {
      return 2; // Холодные блюда
    }
    
    // 4. Десерты - только категория "Десерты"
    if (category === 'десерты') {
      return 4; // Десерты
    }
    
    // 3. Горячие блюда - Пицца, Хоспер, Разное, Бургеры, Сеты, Альтернативные стейки, Прайм
    const hotDishCategories = [
      'римская пицца', 'хоспер', 'разное', 'бургеры', 'сеты', 
      'альтернативные стейки', 'прайм'
    ];
    
    if (hotDishCategories.some(cat => category === cat || category.includes(cat))) {
      return 3; // Горячие блюда
    }
    
    // Дополнительная проверка по ключевым словам для горячих блюд
    const hotDishKeywords = [
      'стейк', 'пицца', 'бургер', 'томагавк', 'рибай', 'филе миньон'
    ];
    
    if (hotDishKeywords.some(keyword => itemName.includes(keyword))) {
      return 3; // Горячие блюда
    }
    
    // По умолчанию - холодные блюда (если не попало ни в одну категорию)
    return 2; // Холодные блюда и закуски
  }

  // Helpers to compute totals
  function parsePriceToNumber(text) {
    const m = String(text || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function computeItemsTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, o) => {
      const unit = parsePriceToNumber(o.calculatedPrice) || parsePriceToNumber(o.price);
      const qty = o.quantity || 1;
      return sum + unit * qty;
    }, 0);
  }
  function computeTableTotalAmount(tableNum) {
    return computeItemsTotal(tableOrders[tableNum]);
  }
  function isCategoryGroupEnabled(groupId) {
    const cfg = CATEGORY_CONFIG[groupId];
    if (!cfg) return true;
    return categoryGrouping[cfg.key] !== false;
  }
  
  // Function to sort table orders by category
  function sortTableOrdersByCategory(tableNum) {
    if (!tableOrders[tableNum] || tableOrders[tableNum].length === 0) {
      return;
    }
    
    // Ensure all orders have addedAt timestamp
    const now = Date.now();
    tableOrders[tableNum].forEach((order, index) => {
      if (!order.addedAt) {
        // If no addedAt, use createdAt or assign based on current position
        order.addedAt = order.createdAt || (now - (tableOrders[tableNum].length - index) * 1000);
      }
      
      const baseGroup = getCategoryGroup(order);
      const groupEnabled = isCategoryGroupEnabled(baseGroup);
      order._categoryGroup = baseGroup;
      order._categoryEnabled = groupEnabled;
      order._sortGroup = groupEnabled ? baseGroup : 1000;
      order._statusRank = order.status === 'served' ? 2 : (order.status === 'rkeeper' ? 1 : 0);
    });
    
    // Sort: category group -> status -> newest first
    tableOrders[tableNum].sort((a, b) => {
      // 1. Sort by category group (1=drinks, 2=cold, 3=hot, 4=dessert, 1000=disabled)
      if (a._sortGroup !== b._sortGroup) {
        return a._sortGroup - b._sortGroup;
      }
      
      // 2. Within same category, sort by status (0=no status first, 1=rkeeper, 2=served last)
      if (a._statusRank !== b._statusRank) {
        return a._statusRank - b._statusRank;
      }
      
      // 3. Within same status, newest first (higher timestamp = newer = comes first)
      return (b.addedAt || 0) - (a.addedAt || 0);
    });
    
    saveTableOrders();
  }

  function reapplyCategoryGroupingToAllTables() {
    Object.keys(tableOrders || {}).forEach(key => {
      const tableNum = Number(key);
      if (!Number.isNaN(tableNum)) {
        sortTableOrdersByCategory(tableNum);
      }
    });
  }

  // Router
  function navigate(path) {
    history.pushState({}, '', path);
    render();
  }
  window.addEventListener('popstate', render);

  // Page navigation
  function setPage(page) {
    currentPage = page;
    try { localStorage.setItem(STORAGE_KEYS.activePage, currentPage); } catch {}
    updateNavItems();
    render();
  }

  function updateNavItems() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === currentPage);
    });
  }

  function viewSearch() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    const panel = document.createElement('section');
    panel.className = 'panel search-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Поиск блюд</h2>
      </div>
      <div class="search-row">
        <input id="search-main" placeholder="Введите название блюда (например: борщ, стейк, салат...)" />
        <button id="filter-btn" class="btn secondary" title="Фильтры">🔍</button>
      </div>
      
      <!-- Filters Panel -->
      <div id="filters-panel" class="filters-panel" style="display: none;">
        <div class="filters-header">
          <h3>Фильтры</h3>
          <button id="close-filters" class="btn-close">✕</button>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Категория:</label>
          <select id="category-filter" class="filter-select">
            <option value="">Все категории</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Цена (₽):</label>
          <div class="filter-range">
            <input type="number" id="price-min" class="filter-input" placeholder="От" min="0" />
            <span class="range-separator">—</span>
            <input type="number" id="price-max" class="filter-input" placeholder="До" min="0" />
          </div>
        </div>
        
        <div class="filter-group">
          <label class="filter-label">Калории (ккал на 100г):</label>
          <div class="filter-range">
            <input type="number" id="calorie-min" class="filter-input" placeholder="От" min="0" />
            <span class="range-separator">—</span>
            <input type="number" id="calorie-max" class="filter-input" placeholder="До" min="0" />
          </div>
        </div>

      <div class="filter-group">
        <label class="filter-label">Исключить аллергены (через запятую):</label>
        <input type="text" id="allergens-exclude" class="filter-input" placeholder="например: глютен, орехи, лактоза" />
      </div>

      <div class="filter-group">
        <label class="filter-label">Поиск по аллергенам (через запятую):</label>
        <input type="text" id="allergens-include" class="filter-input" placeholder="например: перец, яйца, молоко" />
      </div>
        
        <div class="filter-group">
          <label class="filter-label">Сортировка:</label>
          <select id="sort-select" class="filter-select">
            <option value="relevance">По релевантности</option>
            <option value="name">По названию (А-Я)</option>
            <option value="price-asc">Цена: по возрастанию</option>
            <option value="price-desc">Цена: по убыванию</option>
            <option value="calories-asc">Калории: по возрастанию</option>
            <option value="calories-desc">Калории: по убыванию</option>
          </select>
        </div>
        
        <div class="filter-actions">
          <button id="apply-filters" class="btn primary">Применить</button>
          <button id="clear-filters" class="btn secondary">Сбросить</button>
        </div>
        
        <div class="active-filters" id="active-filters" style="display: none;"></div>
      </div>
      
      <div class="search-suggestions" id="search-suggestions" style="display: none;">
        <div class="suggestions-list" id="suggestions-list"></div>
      </div>
      
      <div class="search-results-container" id="search-results">
        <div class="search-placeholder">
          <div class="placeholder-icon">🔍</div>
          <h3>Поиск блюд</h3>
          <p>Введите название блюда для поиска</p>
          <div class="search-examples">
            <span class="example-tag">Борщ</span>
            <span class="example-tag">Стейк Рибай</span>
            <span class="example-tag">Цезарь</span>
            <span class="example-tag">Лимонад</span>
          </div>
        </div>
      </div>
    `;
    wrapper.appendChild(panel);
    
    const searchInput = panel.querySelector('#search-main');
    const suggestionsContainer = panel.querySelector('#search-suggestions');
    const suggestionsList = panel.querySelector('#suggestions-list');
    const resultsContainer = panel.querySelector('#search-results');
    const filterBtn = panel.querySelector('#filter-btn');
    const filtersPanel = panel.querySelector('#filters-panel');
    const closeFiltersBtn = panel.querySelector('#close-filters');
    const categoryFilter = panel.querySelector('#category-filter');
    const priceMin = panel.querySelector('#price-min');
    const priceMax = panel.querySelector('#price-max');
    const calorieMin = panel.querySelector('#calorie-min');
    const calorieMax = panel.querySelector('#calorie-max');
    const allergensExcludeInput = panel.querySelector('#allergens-exclude');
    const allergensIncludeInput = panel.querySelector('#allergens-include');
    const sortSelect = panel.querySelector('#sort-select');
    const applyFiltersBtn = panel.querySelector('#apply-filters');
    const clearFiltersBtn = panel.querySelector('#clear-filters');
    const activeFiltersContainer = panel.querySelector('#active-filters');
    
    let searchTimeout;
    let allDishes = [];
    let filteredDishes = [];
    let currentFilters = {
      category: '',
      priceMin: null,
      priceMax: null,
      calorieMin: null,
      calorieMax: null,
      allergensExclude: [],
      allergensInclude: [],
      sort: 'relevance'
    };
    
    // Filter button - toggle filters panel
    filterBtn.addEventListener('click', () => {
      const isVisible = filtersPanel.style.display !== 'none';
      filtersPanel.style.display = isVisible ? 'none' : 'block';
    });
    
    // Close filters button
    closeFiltersBtn.addEventListener('click', () => {
      filtersPanel.style.display = 'none';
    });
    
    // Load dishes data
    loadDb().then(({dishes}) => {
      allDishes = dishes;
      filteredDishes = [...allDishes];
      console.log('Loaded dishes for search:', allDishes.length);
      
      // Initialize category filter options
      initializeCategories();
      // Restore saved filters
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.searchFilters) || 'null');
        if (saved && typeof saved === 'object') {
          currentFilters = {
            category: saved.category || '',
            priceMin: saved.priceMin ?? null,
            priceMax: saved.priceMax ?? null,
            calorieMin: saved.calorieMin ?? null,
            calorieMax: saved.calorieMax ?? null,
            allergensExclude: Array.isArray(saved.allergensExclude) ? saved.allergensExclude : [],
            allergensInclude: Array.isArray(saved.allergensInclude) ? saved.allergensInclude : [],
            sort: saved.sort || 'relevance'
          };
          categoryFilter.value = currentFilters.category;
          priceMin.value = currentFilters.priceMin ?? '';
          priceMax.value = currentFilters.priceMax ?? '';
          calorieMin.value = currentFilters.calorieMin ?? '';
          calorieMax.value = currentFilters.calorieMax ?? '';
          allergensExcludeInput.value = (currentFilters.allergensExclude || []).join(', ');
          allergensIncludeInput.value = (currentFilters.allergensInclude || []).join(', ');
          sortSelect.value = currentFilters.sort;
          // Apply immediately to reflect saved state
          applyFilters();
        }
      } catch {}
      
      // Add click handlers to example tags
      panel.querySelectorAll('.example-tag').forEach(tag => {
        tag.addEventListener('click', () => {
          searchInput.value = tag.textContent;
          searchInput.dispatchEvent(new Event('input'));
        });
      });
    }).catch(err => {
      console.error('Failed to load dishes for search:', err);
      resultsContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--danger);">
          Ошибка загрузки меню
        </div>
      `;
    });
    
    // Initialize categories
    function initializeCategories() {
      const categories = [...new Set(allDishes.map(dish => dish.category).filter(Boolean))];
      categories.sort();
      categoryFilter.innerHTML = '<option value="">Все категории</option>' + 
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    }
    
    // Extract price from price string
    function extractPrice(priceStr) {
      if (!priceStr || priceStr === '—') return null;
      const match = priceStr.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    
    // Extract calories from KBJU string
    function extractCalories(kbjuStr) {
      if (!kbjuStr || kbjuStr === '—') return null;
      const match = kbjuStr.match(/К[.:\s]*(\d+)/i);
      return match ? parseInt(match[1]) : null;
    }
    
    // Apply filters
    function applyFilters() {
      // Update filters from inputs
      currentFilters.category = categoryFilter.value;
      currentFilters.priceMin = priceMin.value ? parseInt(priceMin.value) : null;
      currentFilters.priceMax = priceMax.value ? parseInt(priceMax.value) : null;
      currentFilters.calorieMin = calorieMin.value ? parseInt(calorieMin.value) : null;
      currentFilters.calorieMax = calorieMax.value ? parseInt(calorieMax.value) : null;
      currentFilters.allergensExclude = (allergensExcludeInput.value || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      currentFilters.allergensInclude = (allergensIncludeInput.value || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      currentFilters.sort = sortSelect.value;
      try { localStorage.setItem(STORAGE_KEYS.searchFilters, JSON.stringify(currentFilters)); } catch {}
      
      // Filter dishes
      filteredDishes = allDishes.filter(dish => {
        // Category filter
        if (currentFilters.category && dish.category !== currentFilters.category) {
          return false;
        }
        
        // Price filter
        if (currentFilters.priceMin !== null || currentFilters.priceMax !== null) {
          const price = extractPrice(dish.price);
          if (price !== null) {
            if (currentFilters.priceMin !== null && price < currentFilters.priceMin) return false;
            if (currentFilters.priceMax !== null && price > currentFilters.priceMax) return false;
          }
        }
        
        // Calorie filter
        if (currentFilters.calorieMin !== null || currentFilters.calorieMax !== null) {
          const calories = extractCalories(dish.kbju);
          if (calories !== null) {
            if (currentFilters.calorieMin !== null && calories < currentFilters.calorieMin) return false;
            if (currentFilters.calorieMax !== null && calories > currentFilters.calorieMax) return false;
          }
        }

        // Allergens exclude filter
        if (currentFilters.allergensExclude && currentFilters.allergensExclude.length > 0) {
          const dishAll = Array.isArray(dish.allergens) ? dish.allergens.map(a => String(a).toLowerCase()) : [];
          const hasExcluded = currentFilters.allergensExclude.some(ex => dishAll.includes(ex));
          if (hasExcluded) return false;
        }

        // Allergens include filter (search by allergen)
        if (currentFilters.allergensInclude && currentFilters.allergensInclude.length > 0) {
          const dishAll = Array.isArray(dish.allergens) ? dish.allergens.map(a => String(a).toLowerCase()) : [];
          // Check if dish contains any of the included allergens
          const hasIncluded = currentFilters.allergensInclude.some(inc => {
            // Check exact match or substring match
            return dishAll.some(allergen => allergen.includes(inc) || inc.includes(allergen));
          });
          if (!hasIncluded) return false;
        }
        
        return true;
      });
      
      // Sort dishes
      sortDishes();
      
      // Show filtered results
      showFilteredResults();
      
      // Update active filters display
      updateActiveFilters();
      
      // Close filters panel
      filtersPanel.style.display = 'none';
    }
    
    // Sort dishes
    function sortDishes() {
      if (currentFilters.sort === 'name') {
        filteredDishes.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      } else if (currentFilters.sort === 'price-asc') {
        filteredDishes.sort((a, b) => {
          const priceA = extractPrice(a.price) || 0;
          const priceB = extractPrice(b.price) || 0;
          return priceA - priceB;
        });
      } else if (currentFilters.sort === 'price-desc') {
        filteredDishes.sort((a, b) => {
          const priceA = extractPrice(a.price) || 0;
          const priceB = extractPrice(b.price) || 0;
          return priceB - priceA;
        });
      } else if (currentFilters.sort === 'calories-asc') {
        filteredDishes.sort((a, b) => {
          const calA = extractCalories(a.kbju) || 0;
          const calB = extractCalories(b.kbju) || 0;
          return calA - calB;
        });
      } else if (currentFilters.sort === 'calories-desc') {
        filteredDishes.sort((a, b) => {
          const calA = extractCalories(a.kbju) || 0;
          const calB = extractCalories(b.kbju) || 0;
          return calB - calA;
        });
      }
    }
    
    // Show filtered results
    function showFilteredResults() {
      if (filteredDishes.length === 0) {
        resultsContainer.innerHTML = `
          <div class="search-placeholder">
            <div class="placeholder-icon">🔍</div>
            <h3>Ничего не найдено</h3>
            <p>Попробуйте изменить фильтры</p>
          </div>
        `;
        return;
      }
      
      resultsContainer.innerHTML = '';
      const resultsGrid = document.createElement('div');
      resultsGrid.className = 'filtered-results-grid';
      
      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const highlight = (text, query) => {
        const q = (query || '').trim();
        if (!q) return text;
        try {
          const re = new RegExp(escapeRegExp(q), 'ig');
          return String(text).replace(re, (m) => `<mark>${m}</mark>`);
        } catch { return text; }
      };

      const currentQuery = (searchInput.value || '').trim();
      filteredDishes.slice(0, 50).forEach(dish => {
        const card = document.createElement('div');
        card.className = 'dish-result-card';
        card.innerHTML = `
          <div class="dish-result-name">${highlight(dish.name, currentQuery)}</div>
          <div class="dish-result-category">${dish.category || '—'}</div>
          <div class="dish-result-footer">
            <span class="dish-result-price">${dish.price || '—'}</span>
            ${extractCalories(dish.kbju) ? `<span class="dish-result-calories">${extractCalories(dish.kbju)} ккал</span>` : ''}
          </div>
        `;
        
        card.addEventListener('click', () => {
          selectDish(dish);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        resultsGrid.appendChild(card);
      });
      
      resultsContainer.appendChild(resultsGrid);
      
      if (filteredDishes.length > 50) {
        const moreInfo = document.createElement('div');
        moreInfo.className = 'results-more-info';
        moreInfo.textContent = `Показано 50 из ${filteredDishes.length} результатов`;
        resultsContainer.appendChild(moreInfo);
      }
    }
    
    // Update active filters display
    function updateActiveFilters() {
      const filters = [];
      
      if (currentFilters.category) {
        filters.push(`Категория: ${currentFilters.category}`);
      }
      if (currentFilters.priceMin !== null || currentFilters.priceMax !== null) {
        const priceText = `Цена: ${currentFilters.priceMin || 0}₽ — ${currentFilters.priceMax || '∞'}₽`;
        filters.push(priceText);
      }
      if (currentFilters.calorieMin !== null || currentFilters.calorieMax !== null) {
        const calText = `Калории: ${currentFilters.calorieMin || 0} — ${currentFilters.calorieMax || '∞'} ккал`;
        filters.push(calText);
      }
      if (currentFilters.allergensExclude && currentFilters.allergensExclude.length > 0) {
        filters.push(`Без аллергенов: ${currentFilters.allergensExclude.join(', ')}`);
      }
      if (currentFilters.allergensInclude && currentFilters.allergensInclude.length > 0) {
        filters.push(`С аллергенами: ${currentFilters.allergensInclude.join(', ')}`);
      }
      if (currentFilters.sort !== 'relevance') {
        const sortNames = {
          'name': 'По названию',
          'price-asc': 'Цена ↑',
          'price-desc': 'Цена ↓',
          'calories-asc': 'Калории ↑',
          'calories-desc': 'Калории ↓'
        };
        filters.push(`Сортировка: ${sortNames[currentFilters.sort]}`);
      }
      
      if (filters.length > 0) {
        activeFiltersContainer.style.display = 'block';
        activeFiltersContainer.innerHTML = '<div class="active-filters-label">Активные фильтры:</div>' +
          filters.map(f => `<span class="filter-tag">${f}</span>`).join('');
      } else {
        activeFiltersContainer.style.display = 'none';
      }
    }
    
    // Clear filters
    function clearFilters() {
      currentFilters = {
        category: '',
        priceMin: null,
        priceMax: null,
        calorieMin: null,
        calorieMax: null,
        allergensExclude: [],
        allergensInclude: [],
        sort: 'relevance'
      };
      
      categoryFilter.value = '';
      priceMin.value = '';
      priceMax.value = '';
      calorieMin.value = '';
      calorieMax.value = '';
      allergensExcludeInput.value = '';
      allergensIncludeInput.value = '';
      sortSelect.value = 'relevance';
      try { localStorage.removeItem(STORAGE_KEYS.searchFilters); } catch {}
      
      filteredDishes = [...allDishes];
      activeFiltersContainer.style.display = 'none';
      
      resultsContainer.innerHTML = `
        <div class="search-placeholder">
          <div class="placeholder-icon">🔍</div>
          <h3>Поиск блюд</h3>
          <p>Введите название блюда для поиска</p>
          <div class="search-examples">
            <span class="example-tag">Борщ</span>
            <span class="example-tag">Стейк Рибай</span>
            <span class="example-tag">Цезарь</span>
            <span class="example-tag">Лимонад</span>
          </div>
        </div>
      `;
      
      // Re-add click handlers to example tags
      resultsContainer.querySelectorAll('.example-tag').forEach(tag => {
        tag.addEventListener('click', () => {
          searchInput.value = tag.textContent;
          searchInput.dispatchEvent(new Event('input'));
        });
      });
      
      filtersPanel.style.display = 'none';
    }
    
    // Event listeners
    applyFiltersBtn.addEventListener('click', applyFilters);
    clearFiltersBtn.addEventListener('click', clearFilters);
    
    function normalize(text) {
      return (text || '').toLowerCase().trim();
    }
    
    function findMatchingDishes(query) {
      if (!query || query.length < 2) return [];
      
      const normalizedQuery = normalize(query);
      const matches = [];
      
      allDishes.forEach(dish => {
        const dishName = normalize(dish.name);
        
        // Exact match gets highest priority
        if (dishName === normalizedQuery) {
          matches.push({...dish, matchType: 'exact', score: 100});
        }
        // Starts with query
        else if (dishName.startsWith(normalizedQuery)) {
          matches.push({...dish, matchType: 'starts', score: 80});
        }
        // Contains query
        else if (dishName.includes(normalizedQuery)) {
          matches.push({...dish, matchType: 'contains', score: 60});
        }
        // Word match - check if any word in dish name starts with query
        else {
          const dishWords = dishName.split(' ');
          const queryWords = normalizedQuery.split(' ');
          
          for (let queryWord of queryWords) {
            for (let dishWord of dishWords) {
              if (dishWord.startsWith(queryWord) && queryWord.length > 1) {
                matches.push({...dish, matchType: 'word', score: 40});
                break;
              }
            }
            if (matches.some(m => m.name === dish.name)) break;
          }
        }
      });
      
      // Sort by score and return top 10
      return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
    
    function renderSuggestions(matches) {
      suggestionsList.innerHTML = '';
      
      if (matches.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
      }
      
      const frag = document.createDocumentFragment();
      
      matches.forEach(dish => {
        const suggestion = document.createElement('div');
        suggestion.className = 'suggestion-item';
        suggestion.innerHTML = `
          <div class="suggestion-content">
            <div class="suggestion-name">${dish.name}</div>
            <div class="suggestion-category">${dish.category || 'Без категории'}</div>
          </div>
          <div class="suggestion-price">${dish.price || '—'}</div>
        `;
        
        suggestion.addEventListener('click', () => {
          selectDish(dish);
        });
        
        frag.appendChild(suggestion);
      });
      
      suggestionsList.appendChild(frag);
      suggestionsContainer.style.display = 'block';
    }
    
    function selectDish(dish) {
      // Fill search input with selected dish name
      searchInput.value = dish.name;
      
      // Hide suggestions
      suggestionsContainer.style.display = 'none';
      
      // Show full dish details
      showDishDetails(dish);
    }
    
    function showDishDetails(dish) {
      resultsContainer.innerHTML = `
        <div class="dish-detail-card">
          <div class="dish-detail-image">
            🍽️
          </div>
          
          <div class="dish-detail-header">
            <h3>${dish.name}</h3>
            <div class="dish-detail-price">${calculatePrice(dish.price, dish.category) || dish.price || '—'}</div>
          </div>
          
          <div class="dish-detail-info">
            <div class="dish-detail-section category-section">
              <strong>Категория:</strong> <span class="category-value">${dish.category || '—'}</span>
            </div>
            
            ${dish.gramm ? `
            <div class="dish-detail-section">
              <strong>Вес:</strong> ${dish.gramm}
            </div>
            ` : ''}
            
            ${dish.kbju ? `
            <div class="dish-detail-section">
              <strong>КБЖУ:</strong> ${dish.kbju}
            </div>
            ` : ''}
            
            ${dish.composition && dish.composition.length > 0 ? `
            <div class="dish-detail-section">
              <strong>Состав:</strong>
              <ul class="composition-list">
                ${dish.composition.map(ingredient => `<li>${ingredient}</li>`).join('')}
              </ul>
            </div>
            ` : ''}
            
            ${dish.allergens && dish.allergens.length > 0 ? `
            <div class="dish-detail-section">
              <strong>Аллергены:</strong>
              <div class="allergens-list">
                ${dish.allergens.map(allergen => `<span class="allergen-tag">${allergen}</span>`).join('')}
              </div>
            </div>
            ` : ''}
            
            ${dish.description && dish.description.length > 0 ? `
            <div class="dish-detail-section">
              <strong>Описание:</strong>
              <p class="dish-description">${dish.description.join(' ')}</p>
            </div>
            ` : ''}
            
            ${dish.R_keeper ? `
            <div class="dish-detail-section rkeeper-section">
              <strong>R_keeper:</strong> <span class="rkeeper-code">${dish.R_keeper}</span>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    }
    
    // Search input handler
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      if (query.length < 2) {
        suggestionsContainer.style.display = 'none';
        resultsContainer.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--muted);">
            Введите минимум 2 символа для поиска
          </div>
        `;
        return;
      }
      
      // Debounce search
      searchTimeout = setTimeout(() => {
        const matches = findMatchingDishes(query);
        renderSuggestions(matches);
        
        // If no suggestions, show "not found" message
        if (matches.length === 0) {
          resultsContainer.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--muted);">
              По запросу "${query}" ничего не найдено
          </div>
        `;
        }
      }, 150);
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target)) {
        suggestionsContainer.style.display = 'none';
      }
    });
    
    // Handle Enter key
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
          const matches = findMatchingDishes(query);
          if (matches.length > 0) {
            selectDish(matches[0]); // Select first match
          }
        }
      }
    });
    
    return wrapper;
  }

  function viewLearn() {
    const hash = location.hash || '';
    
    // Route to sub-pages
    if (hash === '#/learn/menu') return viewLearnMenu();
    if (hash.startsWith('#/learn/menu/category') || hash.startsWith('#/learn/menu/flashcards')) return viewLearnMenuFlashcards();
    if (hash === '#/learn/bar') return viewLearnBar();
    if (hash.startsWith('#/learn/bar/category') || hash.startsWith('#/learn/bar/flashcards')) return viewLearnBarFlashcards();
    if (hash === '#/learn/theory') return viewLearnTheory();
    if (hash === '#/learn/steps') return viewServiceSteps();
    if (hash.startsWith('#/learn/reference/')) return viewReference();
    if (hash.startsWith('#/learn/flashcards/')) return viewFlashcards();
    if (hash.startsWith('#/learn/tests/')) return viewTests();
    
    // Main learning page - gamified with circular progress and level system
    const wrapper = document.createElement('div');
    wrapper.className = 'page learn-page learn-page-gamified';
    
    // Calculate module progress
    const dishesProgress = calculateModuleProgress('dishes');
    const barStudyProgress = calculateModuleProgress('bar-study');
    const theoryModuleProgress = calculateModuleProgress('theory');
    const serviceStepsProgress = calculateModuleProgress('service-steps');
    const overallProgress = calculateOverallProgress();
    const levelInfo = getLevelInfo();
    
    wrapper.innerHTML = `
      <!-- Header -->
      <div class="learn-header">
        <h1 class="learn-page-title">Изучение</h1>
      </div>
      
      <!-- Overall Progress Circle (Gamified) -->
      <div class="learn-overall-progress-gamified">
        <svg class="circular-progress-gamified" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="progressGradientGamified" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:var(--primary);stop-opacity:1" />
              <stop offset="100%" style="stop-color:var(--ring);stop-opacity:1" />
            </linearGradient>
          </defs>
          <circle class="progress-track-gamified" cx="60" cy="60" r="54" fill="none" stroke="var(--muted)" stroke-width="8"/>
          <circle class="progress-bar-gamified" cx="60" cy="60" r="54" fill="none" 
                  stroke="url(#progressGradientGamified)" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="${Math.PI * 108}" 
                  stroke-dashoffset="${Math.PI * 108 * (1 - overallProgress / 100)}"
                  transform="rotate(-90 60 60)"/>
        </svg>
        <div class="circular-progress-text-gamified">
          <div class="progress-percent-large">${overallProgress}%</div>
          <div class="progress-label-small">Общий прогресс</div>
        </div>
      </div>
      
      <!-- Level & XP Card (Gamified) -->
      <div class="learn-level-card-gamified">
        <div class="level-badge-gamified">
          <div class="level-icon">🏆</div>
          <div class="level-info-gamified">
            <div class="level-number-gamified">Level ${levelInfo.level}</div>
            <div class="level-title-gamified">${levelInfo.title}</div>
          </div>
        </div>
        <div class="xp-progress-container">
          <div class="xp-text">${levelInfo.xp} / ${levelInfo.xpForNext} XP</div>
          <div class="xp-progress-bar-gamified">
            <div class="xp-progress-fill-gamified" style="width: ${levelInfo.progress}%"></div>
          </div>
        </div>
      </div>
      
      <!-- Learning Module Cards Grid 2x2 with Circular Progress -->
      <div class="learn-modules-grid-gamified">
        <div class="learn-module-card-gamified" data-module="dishes" data-progress="${dishesProgress}">
          <div class="module-circular-progress-wrapper">
            <svg class="module-circular-progress" viewBox="0 0 80 80">
              <circle class="module-progress-track" cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" stroke-width="6"/>
              <circle class="module-progress-bar" cx="40" cy="40" r="34" fill="none" 
                      stroke="var(--primary)" stroke-width="6" stroke-linecap="round"
                      stroke-dasharray="${Math.PI * 68}" 
                      stroke-dashoffset="${Math.PI * 68 * (1 - dishesProgress / 100)}"
                      transform="rotate(-90 40 40)"/>
            </svg>
            <div class="module-progress-percent">${dishesProgress}%</div>
          </div>
          <span class="module-icon-gamified">🍽️</span>
          <span class="module-title-gamified">Изучение блюд</span>
        </div>
        
        <div class="learn-module-card-gamified" data-module="bar-study" data-progress="${barStudyProgress}">
          <div class="module-circular-progress-wrapper">
            <svg class="module-circular-progress" viewBox="0 0 80 80">
              <circle class="module-progress-track" cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" stroke-width="6"/>
              <circle class="module-progress-bar" cx="40" cy="40" r="34" fill="none" 
                      stroke="var(--primary)" stroke-width="6" stroke-linecap="round"
                      stroke-dasharray="${Math.PI * 68}" 
                      stroke-dashoffset="${Math.PI * 68 * (1 - barStudyProgress / 100)}"
                      transform="rotate(-90 40 40)"/>
            </svg>
            <div class="module-progress-percent">${barStudyProgress}%</div>
          </div>
          <span class="module-icon-gamified">🍷</span>
          <span class="module-title-gamified">Изучение бара</span>
        </div>
        
        <div class="learn-module-card-gamified" data-module="theory" data-progress="${theoryModuleProgress}">
          <div class="module-circular-progress-wrapper">
            <svg class="module-circular-progress" viewBox="0 0 80 80">
              <circle class="module-progress-track" cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" stroke-width="6"/>
              <circle class="module-progress-bar" cx="40" cy="40" r="34" fill="none" 
                      stroke="var(--primary)" stroke-width="6" stroke-linecap="round"
                      stroke-dasharray="${Math.PI * 68}" 
                      stroke-dashoffset="${Math.PI * 68 * (1 - theoryModuleProgress / 100)}"
                      transform="rotate(-90 40 40)"/>
            </svg>
            <div class="module-progress-percent">${theoryModuleProgress}%</div>
          </div>
          <span class="module-icon-gamified">📖</span>
          <span class="module-title-gamified">Теория</span>
        </div>
        
        <div class="learn-module-card-gamified" data-module="service-steps" data-progress="${serviceStepsProgress}">
          <div class="module-circular-progress-wrapper">
            <svg class="module-circular-progress" viewBox="0 0 80 80">
              <circle class="module-progress-track" cx="40" cy="40" r="34" fill="none" stroke="var(--muted)" stroke-width="6"/>
              <circle class="module-progress-bar" cx="40" cy="40" r="34" fill="none" 
                      stroke="var(--primary)" stroke-width="6" stroke-linecap="round"
                      stroke-dasharray="${Math.PI * 68}" 
                      stroke-dashoffset="${Math.PI * 68 * (1 - serviceStepsProgress / 100)}"
                      transform="rotate(-90 40 40)"/>
            </svg>
            <div class="module-progress-percent">${serviceStepsProgress}%</div>
          </div>
          <span class="module-icon-gamified">🤝</span>
          <span class="module-title-gamified">6 шагов сервиса</span>
        </div>
      </div>
    `;
    
    // Module cards - navigate to learning modules
    wrapper.querySelectorAll('.learn-module-card-gamified').forEach(card => {
      card.addEventListener('click', () => {
        const module = card.dataset.module;
        if (module === 'dishes') {
          navigate('#/learn/menu');
        } else if (module === 'bar-study') {
          navigate('#/learn/bar');
        } else if (module === 'theory') {
          navigate('#/learn/theory');
        } else if (module === 'service-steps') {
          navigate('#/learn/steps');
        }
      });
    });
    
    // Prevent scrolling on the page, but allow scrolling in modules grid
    wrapper.addEventListener('touchmove', (e) => {
      const modulesGrid = wrapper.querySelector('.learn-modules-grid-gamified');
      if (modulesGrid && modulesGrid.contains(e.target)) {
        // Allow scrolling in modules grid
        return;
      }
      e.preventDefault();
    }, { passive: false });
    
    wrapper.addEventListener('wheel', (e) => {
      const modulesGrid = wrapper.querySelector('.learn-modules-grid-gamified');
      if (modulesGrid && modulesGrid.contains(e.target)) {
        // Allow scrolling in modules grid
        return;
      }
      e.preventDefault();
    }, { passive: false });
    
    // Add glow effect for completed modules (100%)
    wrapper.querySelectorAll('.learn-module-card-gamified').forEach(card => {
      const progress = parseInt(card.dataset.progress || '0');
      if (progress === 100) {
        card.classList.add('module-completed');
      }
    });
    
    return wrapper;
  }
  
  // Original menu flashcards (kept for backward compatibility)
  function viewLearnMenu() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page learn-menu-page';
    
    wrapper.innerHTML = `
      <div class="learn-menu-header">
        <button id="btn-back-learn-menu" class="back-btn">←</button>
        <h1 class="learn-menu-title">Изучение блюд</h1>
        <div style="width: 40px;"></div>
      </div>
      <p class="learn-menu-subtitle">Выберите категорию меню для изучения</p>
      
      <div class="learn-menu-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="menu-search-input" class="menu-search-input" placeholder="Поиск по меню..." />
      </div>
      
      <div id="learn-categories-grid" class="learn-categories-grid">
        <!-- Categories will be loaded here -->
      </div>
      
      <button id="check-all-menu-btn" class="check-all-menu-btn">Проверить всё меню</button>
      <a href="#" id="associations-link" class="associations-link">Ассоциации</a>
    `;
    
    // Load categories and render cards
    loadDb().then(({dishes}) => {
      const kitchenDishes = dishes.filter(d => d.source !== 'bar' && (!d.source || d.source === 'kitchen'));
      
      // Get unique categories
      const categoriesMap = new Map();
      kitchenDishes.forEach(dish => {
        const category = dish.category || 'Без категории';
        if (!categoriesMap.has(category)) {
          categoriesMap.set(category, []);
        }
        categoriesMap.get(category).push(dish);
      });
      
      // Get learning progress
      let learningProgress = {};
      try {
        learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
      } catch {}
      
      // Calculate progress for each category
      const categories = Array.from(categoriesMap.entries()).map(([categoryName, categoryDishes]) => {
        let studied = 0;
        categoryDishes.forEach(dish => {
          if (learningProgress[`menu_${dish.name}`]) studied++;
        });
        const progress = categoryDishes.length > 0 ? Math.round((studied / categoryDishes.length) * 100) : 0;
        
        // Get first dish with image for category image
        const dishWithImage = categoryDishes.find(d => d.image && d.image !== '-' && d.image !== './images/-.jpg');
        const imageUrl = dishWithImage?.image || categoryDishes[0]?.image || '';
        
        return {
          name: categoryName,
          progress,
          count: categoryDishes.length,
          image: imageUrl
        };
      });
      
      // Render category cards
      const grid = wrapper.querySelector('#learn-categories-grid');
      categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'learn-category-card';
        card.dataset.category = category.name;
        card.innerHTML = `
          <div class="category-card-image-wrapper">
            ${category.image && category.image !== '-' && category.image !== './images/-.jpg' 
              ? `<img src="${category.image}" alt="${category.name}" class="category-card-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
              : ''}
            <div class="category-card-placeholder" style="display: ${category.image && category.image !== '-' ? 'none' : 'flex'};">
              <span class="placeholder-icon">🍽️</span>
            </div>
            <div class="category-card-label">${category.name}</div>
          </div>
          <div class="category-card-name">${category.name}</div>
        `;
        grid.appendChild(card);
        
        card.addEventListener('click', () => {
          navigate(`#/learn/menu/category?cat=${encodeURIComponent(category.name)}`);
        });
      });
    }).catch(err => {
      console.error('Error loading categories:', err);
      wrapper.querySelector('#learn-categories-grid').innerHTML = '<p style="padding: 20px; text-align: center; color: var(--danger);">Ошибка загрузки категорий</p>';
    });
    
    // Search functionality
    const searchInput = wrapper.querySelector('#menu-search-input');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const cards = wrapper.querySelectorAll('.learn-category-card');
      cards.forEach(card => {
        const categoryName = card.dataset.category.toLowerCase();
        if (categoryName.includes(query) || query === '') {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
    
    // Back button
    wrapper.querySelector('#btn-back-learn-menu')?.addEventListener('click', () => navigate('#/learn'));
    
    // Check all menu button
    wrapper.querySelector('#check-all-menu-btn')?.addEventListener('click', () => {
      navigate('#/learn/menu/flashcards');
    });
    
    // Associations link
    wrapper.querySelector('#associations-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      // TODO: Implement associations page
      alert('Страница ассоциаций в разработке');
    });
    
    return wrapper;
  }

  function viewLearnMenuFlashcards() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page learn-flashcards-page';
    
    // Get category from URL
    const hash = location.hash || '';
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const categoryName = urlParams.get('cat') || '';
    const isAllMenu = hash.includes('/flashcards');
    
    let dishes = [];
    let currentIndex = 0;
    let isFlipped = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    
    wrapper.innerHTML = `
      <div class="flashcards-header">
        <button id="btn-back-flashcards" class="back-btn">←</button>
        <div class="flashcards-progress">
          <div class="flashcards-progress-bar">
            <div id="flashcards-progress-fill" class="flashcards-progress-fill"></div>
          </div>
        </div>
        <div style="width: 40px;"></div>
      </div>
      
      <div class="flashcards-container">
        <div id="flashcard" class="flashcard">
          <div class="flashcard-inner">
            <div class="flashcard-front">
              <div class="flashcard-image-wrapper">
                <div class="flashcard-image-placeholder"></div>
                <img id="flashcard-image" class="flashcard-image" style="display: none;" />
              </div>
              <div class="flashcard-content">
                <div class="flashcard-name"></div>
                <div class="flashcard-category-tag"></div>
              </div>
              <button id="flip-btn" class="flip-btn">
                <span class="flip-icon">↻</span>
                <span>Перевернуть</span>
              </button>
            </div>
            <div class="flashcard-back">
              <div class="flashcard-back-content">
                <div class="flashcard-back-title">Состав / Ингредиенты</div>
                <div id="flashcard-composition" class="flashcard-composition"></div>
                <div class="flashcard-back-title" style="margin-top: 20px;">Аллергены</div>
                <div id="flashcard-allergens" class="flashcard-allergens"></div>
              </div>
              <button id="flip-back-btn" class="flip-btn">
                <span class="flip-icon">↻</span>
                <span>Перевернуть</span>
              </button>
            </div>
          </div>
        </div>
        
        <div class="flashcards-hint">
          <span>Свайп вправо → ЗНАЮ</span>
          <span>Свайп влево ← НЕ ЗНАЮ</span>
        </div>
      </div>
      
      <div class="flashcards-actions">
        <button id="know-btn" class="action-btn know-btn">✅ ЗНАЮ</button>
        <button id="dont-know-btn" class="action-btn dont-know-btn">❌ НЕ ЗНАЮ</button>
      </div>
    `;
    
    const flashcard = wrapper.querySelector('#flashcard');
    const flashcardInner = flashcard.querySelector('.flashcard-inner');
    const flipBtn = wrapper.querySelector('#flip-btn');
    const flipBackBtn = wrapper.querySelector('#flip-back-btn');
    const knowBtn = wrapper.querySelector('#know-btn');
    const dontKnowBtn = wrapper.querySelector('#dont-know-btn');
    const progressFill = wrapper.querySelector('#flashcards-progress-fill');
    
    // Load dishes
    loadDb().then(({dishes: allDishes}) => {
      if (isAllMenu) {
        dishes = allDishes.filter(d => d.source !== 'bar' && (!d.source || d.source === 'kitchen'));
      } else if (categoryName) {
        dishes = allDishes.filter(d => 
          d.source !== 'bar' && 
          (!d.source || d.source === 'kitchen') &&
          d.category === decodeURIComponent(categoryName)
        );
      }
      
      if (dishes.length === 0) {
        wrapper.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #ffffff;">
            <p>Блюда не найдены</p>
            <button id="btn-back-flashcards" class="back-btn" style="margin-top: 20px;">← Назад</button>
          </div>
        `;
        wrapper.querySelector('#btn-back-flashcards')?.addEventListener('click', () => navigate('#/learn/menu'));
        return;
      }
      
      // Shuffle dishes
      function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }
      dishes = shuffle(dishes);
      
      renderCard();
    });
    
    function renderCard() {
      if (currentIndex >= dishes.length) {
        wrapper.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #ffffff;">
            <h2>🎉 Готово!</h2>
            <p>Вы изучили все блюда (${dishes.length})</p>
            <button id="btn-back-flashcards" class="back-btn" style="margin-top: 20px;">← Назад</button>
          </div>
        `;
        wrapper.querySelector('#btn-back-flashcards')?.addEventListener('click', () => navigate('#/learn/menu'));
        return;
      }
      
      const dish = dishes[currentIndex];
      isFlipped = false;
      flashcardInner.style.transform = 'rotateY(0deg)';
      
      // Update progress
      const progress = ((currentIndex) / dishes.length) * 100;
      progressFill.style.width = `${progress}%`;
      
      // Front side
      const nameEl = wrapper.querySelector('.flashcard-name');
      const categoryTagEl = wrapper.querySelector('.flashcard-category-tag');
      const imageEl = wrapper.querySelector('#flashcard-image');
      const placeholderEl = wrapper.querySelector('.flashcard-image-placeholder');
      
      nameEl.textContent = dish.name || 'Без названия';
      categoryTagEl.textContent = dish.category || 'Без категории';
      
      if (dish.image && dish.image !== '-' && dish.image !== './images/-.jpg') {
        imageEl.src = dish.image;
        imageEl.style.display = 'block';
        placeholderEl.style.display = 'none';
        imageEl.onerror = () => {
          imageEl.style.display = 'none';
          placeholderEl.style.display = 'flex';
        };
      } else {
        imageEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
      }
      
      // Back side
      const compositionEl = wrapper.querySelector('#flashcard-composition');
      const allergensEl = wrapper.querySelector('#flashcard-allergens');
      
      if (dish.composition && Array.isArray(dish.composition) && dish.composition.length && dish.composition[0] !== '-') {
        compositionEl.textContent = dish.composition.join(', ');
      } else {
        compositionEl.textContent = 'Не указано';
      }
      
      if (dish.allergens && Array.isArray(dish.allergens) && dish.allergens.length && dish.allergens[0] !== '-') {
        allergensEl.textContent = dish.allergens.join(', ');
      } else {
        allergensEl.textContent = 'Не указано';
      }
    }
    
    function flipCard() {
      isFlipped = !isFlipped;
      flashcardInner.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    }
    
    function markAsKnown() {
      const dish = dishes[currentIndex];
      let learningProgress = {};
      try {
        learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
      } catch {}
      learningProgress[`menu_${dish.name}`] = { known: true, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEYS.learningProgress, JSON.stringify(learningProgress));
      
      currentIndex++;
      renderCard();
    }
    
    function markAsUnknown() {
      const dish = dishes[currentIndex];
      let learningProgress = {};
      try {
        learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
      } catch {}
      learningProgress[`menu_${dish.name}`] = { known: false, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEYS.learningProgress, JSON.stringify(learningProgress));
      
      currentIndex++;
      renderCard();
    }
    
    // Touch/swipe handlers
    flashcard.addEventListener('touchstart', (e) => {
      if (isFlipped) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
      currentX = 0;
      currentY = 0;
    });
    
    flashcard.addEventListener('touchmove', (e) => {
      if (!isDragging || isFlipped) return;
      currentX = e.touches[0].clientX - startX;
      currentY = e.touches[0].clientY - startY;
      
      const rotate = currentX * 0.1;
      const opacity = 1 - Math.abs(currentX) / 200;
      
      flashcard.style.transform = `translateX(${currentX}px) rotateZ(${rotate}deg)`;
      flashcard.style.opacity = Math.max(0.3, opacity);
    });
    
    flashcard.addEventListener('touchend', (e) => {
      if (!isDragging || isFlipped) return;
      isDragging = false;
      
      const threshold = 100;
      if (Math.abs(currentX) > threshold) {
        if (currentX > 0) {
          // Swipe right - KNOW
          flashcard.style.transform = 'translateX(500px) rotateZ(30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsKnown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        } else {
          // Swipe left - DON'T KNOW
          flashcard.style.transform = 'translateX(-500px) rotateZ(-30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsUnknown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        }
      } else {
        // Return to original position
        flashcard.style.transform = '';
        flashcard.style.opacity = '1';
      }
    });
    
    // Mouse drag handlers (for desktop testing)
    flashcard.addEventListener('mousedown', (e) => {
      if (isFlipped) return;
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      currentX = 0;
      currentY = 0;
      flashcard.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging || isFlipped) return;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      
      const rotate = currentX * 0.1;
      const opacity = 1 - Math.abs(currentX) / 200;
      
      flashcard.style.transform = `translateX(${currentX}px) rotateZ(${rotate}deg)`;
      flashcard.style.opacity = Math.max(0.3, opacity);
    });
    
    document.addEventListener('mouseup', () => {
      if (!isDragging || isFlipped) return;
      isDragging = false;
      flashcard.style.cursor = '';
      
      const threshold = 100;
      if (Math.abs(currentX) > threshold) {
        if (currentX > 0) {
          flashcard.style.transform = 'translateX(500px) rotateZ(30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsKnown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        } else {
          flashcard.style.transform = 'translateX(-500px) rotateZ(-30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsUnknown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        }
      } else {
        flashcard.style.transform = '';
        flashcard.style.opacity = '1';
      }
    });
    
    flipBtn.addEventListener('click', flipCard);
    flipBackBtn.addEventListener('click', flipCard);
    knowBtn.addEventListener('click', markAsKnown);
    dontKnowBtn.addEventListener('click', markAsUnknown);
    
    wrapper.querySelector('#btn-back-flashcards')?.addEventListener('click', () => navigate('#/learn/menu'));
    
    return wrapper;
  }

  // Bar drinks learning page (similar to menu learning)
  function viewLearnBar() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page learn-menu-page';
    
    wrapper.innerHTML = `
      <div class="learn-menu-header">
        <button id="btn-back-learn-bar" class="back-btn">←</button>
        <h1 class="learn-menu-title">Изучение бара</h1>
        <div style="width: 40px;"></div>
      </div>
      <p class="learn-menu-subtitle">Выберите категорию напитков для изучения</p>
      
      <div class="learn-menu-search">
        <span class="search-icon">🔍</span>
        <input type="text" id="bar-search-input" class="menu-search-input" placeholder="Поиск по барному меню..." />
      </div>
      
      <div id="learn-bar-categories-grid" class="learn-categories-grid">
        <!-- Categories will be loaded here -->
      </div>
      
      <button id="check-all-bar-btn" class="check-all-menu-btn">Проверить весь бар</button>
    `;
    
    // Load categories and render cards
    loadDb().then(({dishes}) => {
      const barDrinks = dishes.filter(d => d.source === 'bar');
      
      // Get unique categories
      const categoriesMap = new Map();
      barDrinks.forEach(drink => {
        const category = drink.category || 'Без категории';
        if (!categoriesMap.has(category)) {
          categoriesMap.set(category, []);
        }
        categoriesMap.get(category).push(drink);
      });
      
      // Get learning progress
      let learningProgress = {};
      try {
        learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
      } catch {}
      
      // Calculate progress for each category
      const categories = Array.from(categoriesMap.entries()).map(([categoryName, categoryDrinks]) => {
        let studied = 0;
        categoryDrinks.forEach(drink => {
          if (learningProgress[`bar_${drink.name}`]) studied++;
        });
        const progress = categoryDrinks.length > 0 ? Math.round((studied / categoryDrinks.length) * 100) : 0;
        
        // Get first drink with image for category image
        const drinkWithImage = categoryDrinks.find(d => d.image && d.image !== '-' && d.image !== './images/-.jpg');
        const imageUrl = drinkWithImage?.image || categoryDrinks[0]?.image || '';
        
        return {
          name: categoryName,
          progress,
          count: categoryDrinks.length,
          image: imageUrl
        };
      });
      
      // Render category cards
      const grid = wrapper.querySelector('#learn-bar-categories-grid');
      categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'learn-category-card';
        card.dataset.category = category.name;
        card.innerHTML = `
          <div class="category-card-image-wrapper">
            ${category.image && category.image !== '-' && category.image !== './images/-.jpg' 
              ? `<img src="${category.image}" alt="${category.name}" class="category-card-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
              : ''}
            <div class="category-card-placeholder" style="display: ${category.image && category.image !== '-' ? 'none' : 'flex'};">
              <span class="placeholder-icon">🍷</span>
            </div>
            <div class="category-card-label">${category.name}</div>
          </div>
          <div class="category-card-name">${category.name}</div>
        `;
        grid.appendChild(card);
        
        card.addEventListener('click', () => {
          navigate(`#/learn/bar/category?cat=${encodeURIComponent(category.name)}`);
        });
      });
    }).catch(err => {
      console.error('Error loading bar categories:', err);
      wrapper.querySelector('#learn-bar-categories-grid').innerHTML = '<p style="padding: 20px; text-align: center; color: var(--danger);">Ошибка загрузки категорий</p>';
    });
    
    // Search functionality
    const searchInput = wrapper.querySelector('#bar-search-input');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const cards = wrapper.querySelectorAll('.learn-category-card');
      cards.forEach(card => {
        const categoryName = card.dataset.category.toLowerCase();
        if (categoryName.includes(query) || query === '') {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
    
    // Back button
    wrapper.querySelector('#btn-back-learn-bar')?.addEventListener('click', () => navigate('#/learn'));
    
    // Check all bar button
    wrapper.querySelector('#check-all-bar-btn')?.addEventListener('click', () => {
      navigate('#/learn/bar/flashcards');
    });
    
    return wrapper;
  }

  function viewLearnBarFlashcards() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page learn-flashcards-page';
    
    // Get category from URL
    const hash = location.hash || '';
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const categoryName = urlParams.get('cat') || '';
    const isAllBar = hash.includes('/flashcards');
    
    let drinks = [];
    let currentIndex = 0;
    let isFlipped = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    
    wrapper.innerHTML = `
      <div class="flashcards-header">
        <button id="btn-back-bar-flashcards" class="back-btn">←</button>
        <div class="flashcards-progress">
          <div class="flashcards-progress-bar">
            <div id="flashcards-progress-fill" class="flashcards-progress-fill"></div>
          </div>
        </div>
        <div style="width: 40px;"></div>
      </div>
      
      <div class="flashcards-container">
        <div id="flashcard" class="flashcard">
          <div class="flashcard-inner">
            <div class="flashcard-front">
              <div class="flashcard-image-wrapper">
                <div class="flashcard-image-placeholder"></div>
                <img id="flashcard-image" class="flashcard-image" style="display: none;" />
              </div>
              <div class="flashcard-content">
                <div class="flashcard-name"></div>
                <div class="flashcard-category-tag"></div>
              </div>
              <button id="flip-btn" class="flip-btn">
                <span class="flip-icon">↻</span>
                <span>Перевернуть</span>
              </button>
            </div>
            <div class="flashcard-back">
              <div class="flashcard-back-content">
                <div class="flashcard-back-title">Состав / Ингредиенты</div>
                <div id="flashcard-composition" class="flashcard-composition"></div>
                <div class="flashcard-back-title" style="margin-top: 20px;">Аллергены</div>
                <div id="flashcard-allergens" class="flashcard-allergens"></div>
              </div>
              <button id="flip-back-btn" class="flip-btn">
                <span class="flip-icon">↻</span>
                <span>Перевернуть</span>
              </button>
            </div>
          </div>
        </div>
        
        <div class="flashcards-hint">
          <span>Свайп вправо → ЗНАЮ</span>
          <span>Свайп влево ← НЕ ЗНАЮ</span>
        </div>
      </div>
      
      <div class="flashcards-actions">
        <button id="know-btn" class="action-btn know-btn">✅ ЗНАЮ</button>
        <button id="dont-know-btn" class="action-btn dont-know-btn">❌ НЕ ЗНАЮ</button>
      </div>
    `;
    
    const flashcard = wrapper.querySelector('#flashcard');
    const flashcardInner = flashcard.querySelector('.flashcard-inner');
    const flipBtn = wrapper.querySelector('#flip-btn');
    const flipBackBtn = wrapper.querySelector('#flip-back-btn');
    const knowBtn = wrapper.querySelector('#know-btn');
    const dontKnowBtn = wrapper.querySelector('#dont-know-btn');
    const progressFill = wrapper.querySelector('#flashcards-progress-fill');
    
    // Load drinks
    loadDb().then(({dishes: allDishes}) => {
      if (isAllBar) {
        drinks = allDishes.filter(d => d.source === 'bar');
      } else if (categoryName) {
        drinks = allDishes.filter(d => 
          d.source === 'bar' &&
          d.category === decodeURIComponent(categoryName)
        );
      }
      
      if (drinks.length === 0) {
        wrapper.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #ffffff;">
            <p>Напитки не найдены</p>
            <button id="btn-back-bar-flashcards" class="back-btn" style="margin-top: 20px;">← Назад</button>
          </div>
        `;
        wrapper.querySelector('#btn-back-bar-flashcards')?.addEventListener('click', () => navigate('#/learn/bar'));
        return;
      }
      
      // Shuffle drinks
      function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }
      drinks = shuffle(drinks);
      
      renderCard();
    });
    
    function renderCard() {
      if (currentIndex >= drinks.length) {
        wrapper.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #ffffff;">
            <h2>🎉 Готово!</h2>
            <p>Вы изучили все напитки (${drinks.length})</p>
            <button id="btn-back-bar-flashcards" class="back-btn" style="margin-top: 20px;">← Назад</button>
          </div>
        `;
        wrapper.querySelector('#btn-back-bar-flashcards')?.addEventListener('click', () => navigate('#/learn/bar'));
        return;
      }
      
      const drink = drinks[currentIndex];
      isFlipped = false;
      flashcardInner.style.transform = 'rotateY(0deg)';
      
      // Update progress
      const progress = ((currentIndex) / drinks.length) * 100;
      progressFill.style.width = `${progress}%`;
      
      // Front side
      const nameEl = wrapper.querySelector('.flashcard-name');
      const categoryTagEl = wrapper.querySelector('.flashcard-category-tag');
      const imageEl = wrapper.querySelector('#flashcard-image');
      const placeholderEl = wrapper.querySelector('.flashcard-image-placeholder');
      
      nameEl.textContent = drink.name || 'Без названия';
      categoryTagEl.textContent = drink.category || 'Без категории';
      
      if (drink.image && drink.image !== '-' && drink.image !== './images/-.jpg') {
        imageEl.src = drink.image;
        imageEl.style.display = 'block';
        placeholderEl.style.display = 'none';
        imageEl.onerror = () => {
          imageEl.style.display = 'none';
          placeholderEl.style.display = 'flex';
        };
      } else {
        imageEl.style.display = 'none';
        placeholderEl.style.display = 'flex';
      }
      
      // Back side
      const compositionEl = wrapper.querySelector('#flashcard-composition');
      const allergensEl = wrapper.querySelector('#flashcard-allergens');
      
      if (drink.composition && Array.isArray(drink.composition) && drink.composition.length && drink.composition[0] !== '-') {
        compositionEl.textContent = drink.composition.join(', ');
      } else {
        compositionEl.textContent = 'Не указано';
      }
      
      if (drink.allergens && Array.isArray(drink.allergens) && drink.allergens.length && drink.allergens[0] !== '-') {
        allergensEl.textContent = drink.allergens.join(', ');
      } else {
        allergensEl.textContent = 'Не указано';
      }
    }
    
    function flipCard() {
      isFlipped = !isFlipped;
      flashcardInner.style.transform = isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    }
    
    function markAsKnown() {
      const drink = drinks[currentIndex];
      let learningProgress = {};
      try {
        learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
      } catch {}
      learningProgress[`bar_${drink.name}`] = { known: true, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEYS.learningProgress, JSON.stringify(learningProgress));
      
      currentIndex++;
      renderCard();
    }
    
    function markAsUnknown() {
      const drink = drinks[currentIndex];
      let learningProgress = {};
      try {
        learningProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learningProgress) || '{}');
      } catch {}
      learningProgress[`bar_${drink.name}`] = { known: false, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEYS.learningProgress, JSON.stringify(learningProgress));
      
      currentIndex++;
      renderCard();
    }
    
    // Touch/swipe handlers
    flashcard.addEventListener('touchstart', (e) => {
      if (isFlipped) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
      currentX = 0;
      currentY = 0;
    });
    
    flashcard.addEventListener('touchmove', (e) => {
      if (!isDragging || isFlipped) return;
      currentX = e.touches[0].clientX - startX;
      currentY = e.touches[0].clientY - startY;
      
      const rotate = currentX * 0.1;
      const opacity = 1 - Math.abs(currentX) / 200;
      
      flashcard.style.transform = `translateX(${currentX}px) rotateZ(${rotate}deg)`;
      flashcard.style.opacity = Math.max(0.3, opacity);
    });
    
    flashcard.addEventListener('touchend', (e) => {
      if (!isDragging || isFlipped) return;
      isDragging = false;
      
      const threshold = 100;
      if (Math.abs(currentX) > threshold) {
        if (currentX > 0) {
          // Swipe right - KNOW
          flashcard.style.transform = 'translateX(500px) rotateZ(30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsKnown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        } else {
          // Swipe left - DON'T KNOW
          flashcard.style.transform = 'translateX(-500px) rotateZ(-30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsUnknown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        }
      } else {
        // Return to original position
        flashcard.style.transform = '';
        flashcard.style.opacity = '1';
      }
    });
    
    // Mouse drag handlers (for desktop testing)
    flashcard.addEventListener('mousedown', (e) => {
      if (isFlipped) return;
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      currentX = 0;
      currentY = 0;
      flashcard.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging || isFlipped) return;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      
      const rotate = currentX * 0.1;
      const opacity = 1 - Math.abs(currentX) / 200;
      
      flashcard.style.transform = `translateX(${currentX}px) rotateZ(${rotate}deg)`;
      flashcard.style.opacity = Math.max(0.3, opacity);
    });
    
    document.addEventListener('mouseup', () => {
      if (!isDragging || isFlipped) return;
      isDragging = false;
      flashcard.style.cursor = '';
      
      const threshold = 100;
      if (Math.abs(currentX) > threshold) {
        if (currentX > 0) {
          flashcard.style.transform = 'translateX(500px) rotateZ(30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsKnown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        } else {
          flashcard.style.transform = 'translateX(-500px) rotateZ(-30deg)';
          flashcard.style.opacity = '0';
          setTimeout(() => {
            markAsUnknown();
            flashcard.style.transform = '';
            flashcard.style.opacity = '1';
          }, 300);
        }
      } else {
        flashcard.style.transform = '';
        flashcard.style.opacity = '1';
      }
    });
    
    flipBtn.addEventListener('click', flipCard);
    flipBackBtn.addEventListener('click', flipCard);
    knowBtn.addEventListener('click', markAsKnown);
    dontKnowBtn.addEventListener('click', markAsUnknown);
    
    wrapper.querySelector('#btn-back-bar-flashcards')?.addEventListener('click', () => navigate('#/learn/bar'));
    
    return wrapper;
  }

  function viewLearnTheory() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    if (!window.TRAINING_DATA || !window.TRAINING_DATA.sections) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <div class="page-title"><h2>Теория для 2 грейда</h2></div>
            <button id="btn-back-learn" class="btn">Назад</button>
          </div>
          <div style="padding:16px; text-align:center; color:var(--danger);">
            <p>Ошибка: Данные обучения не загружены.</p>
            <p style="font-size:14px; margin-top:8px;">Пожалуйста, обновите страницу.</p>
          </div>
        </div>
      `;
      wrapper.querySelector('#btn-back-learn')?.addEventListener('click', () => navigate('#/learn'));
      return wrapper;
    }
    
    wrapper.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="page-title"><h2>Теория для 2 грейда</h2></div>
          <button id="btn-back-learn" class="btn">Назад</button>
        </div>
        
        <div class="learn-theory-modes">
          <button class="theory-mode-card" data-section="meat" data-mode="reference">
            <div class="theory-icon">🥩</div>
            <div class="theory-title">Мясо</div>
            <div class="theory-actions">
              <button class="btn secondary small">Справочник</button>
              <button class="btn secondary small">Флешкарты</button>
              <button class="btn secondary small">Тесты</button>
            </div>
          </button>
          
          <button class="theory-mode-card" data-section="bar" data-mode="reference">
            <div class="theory-icon">🍸</div>
            <div class="theory-title">Барное меню</div>
            <div class="theory-actions">
              <button class="btn secondary small">Справочник</button>
              <button class="btn secondary small">Флешкарты</button>
              <button class="btn secondary small">Тесты</button>
            </div>
          </button>
          
          <button class="theory-mode-card" data-section="competencies" data-mode="reference">
            <div class="theory-icon">⭐</div>
            <div class="theory-title">Компетенции</div>
            <div class="theory-actions">
              <button class="btn secondary small">Справочник</button>
              <button class="btn secondary small">Флешкарты</button>
              <button class="btn secondary small">Тесты</button>
            </div>
          </button>
        </div>
      </div>
    `;
    
    wrapper.querySelector('#btn-back-learn')?.addEventListener('click', () => navigate('#/learn'));
    
    wrapper.querySelectorAll('.theory-mode-card').forEach(card => {
      const section = card.dataset.section;
      const buttons = card.querySelectorAll('.theory-actions button');
      
      if (!section || buttons.length < 3) {
        console.warn('Invalid theory card setup:', section);
        return;
      }
      
      buttons[0]?.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        e.preventDefault();
        navigate(`#/learn/reference/${section}`); 
      });
      buttons[1]?.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        e.preventDefault();
        navigate(`#/learn/flashcards/${section}`); 
      });
      buttons[2]?.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        e.preventDefault();
        navigate(`#/learn/tests/${section}`); 
      });
    });
    
    return wrapper;
  }
  
  function viewServiceSteps() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    if (!window.TRAINING_DATA) {
      wrapper.innerHTML = '<div class="panel"><div class="panel-header"><h2>Ошибка</h2></div><p style="padding:16px;">Данные не загружены</p></div>';
      return wrapper;
    }
    
    const steps = window.TRAINING_DATA.serviceSteps || [];
    
    wrapper.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="page-title"><h2>6 шагов сервиса</h2></div>
          <button id="btn-back-learn" class="btn">Назад</button>
        </div>
        
        <div class="service-steps-list">
          ${steps.map(step => `
            <div class="service-step-card">
              <h3>${step.title}</h3>
              <p>${step.content}</p>
            </div>
          `).join('')}
        </div>
        
        <div style="padding:16px;">
          <button id="start-steps-flashcards" class="btn primary" style="width:100%;">Тренировать флешкартами</button>
        </div>
      </div>
    `;
    
    wrapper.querySelector('#btn-back-learn')?.addEventListener('click', () => navigate('#/learn'));
    wrapper.querySelector('#start-steps-flashcards')?.addEventListener('click', () => navigate('#/learn/flashcards/steps'));
    
    return wrapper;
  }
  
  function viewReference() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    const sectionId = (location.hash || '').split('/').pop();
    if (!window.TRAINING_DATA || !window.TRAINING_DATA.sections) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <h2>Ошибка</h2>
            <button id="btn-back-theory" class="btn">Назад</button>
          </div>
          <p style="padding:16px;">Данные обучения не загружены. Пожалуйста, обновите страницу.</p>
        </div>
      `;
      wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
      return wrapper;
    }
    
    const section = window.TRAINING_DATA.sections.find(s => s.id === sectionId);
    if (!section) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <h2>Ошибка</h2>
            <button id="btn-back-theory" class="btn">Назад</button>
          </div>
          <p style="padding:16px;">Раздел "${sectionId}" не найден. Доступные разделы: ${window.TRAINING_DATA.sections.map(s => s.id).join(', ')}</p>
        </div>
      `;
      wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
      return wrapper;
    }
    
    wrapper.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="page-title"><h2>${section.title}</h2></div>
          <button id="btn-back-theory" class="btn">Назад</button>
        </div>
        
        <div class="reference-search" style="padding:12px;">
          <input id="reference-search-input" class="filter-input" placeholder="Поиск по темам..." />
        </div>
        
        <div class="reference-topics" id="reference-topics">
          ${section.topics.map((topic, idx) => {
            const isRead = learningProgress[section.id]?.[topic.id] || false;
            return `
              <div class="reference-topic" data-topic-id="${topic.id}">
                <div class="topic-header">
                  <h3>${topic.title}</h3>
                  <label class="topic-checkbox">
                    <input type="checkbox" ${isRead ? 'checked' : ''} data-section="${section.id}" data-topic="${topic.id}" />
                    <span>Изучено</span>
                  </label>
                </div>
                <div class="topic-content">${topic.content}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
    
    // Search functionality
    const searchInput = wrapper.querySelector('#reference-search-input');
    searchInput?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      wrapper.querySelectorAll('.reference-topic').forEach(topic => {
        const text = topic.textContent.toLowerCase();
        topic.style.display = text.includes(query) ? '' : 'none';
      });
    });
    
    // Checkbox handlers
    wrapper.querySelectorAll('.topic-checkbox input').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const sectionId = e.target.dataset.section;
        const topicId = e.target.dataset.topic;
        if (!learningProgress[sectionId]) learningProgress[sectionId] = {};
        learningProgress[sectionId][topicId] = e.target.checked;
        saveLearningProgress();
        
        if (e.target.checked) {
          const result = addXP(15);
          if (result.leveledUp) {
            alert(`Поздравляю! Вы достигли уровня ${result.newLevel}!`);
          }
        }
      });
    });
    
    return wrapper;
  }
  
  function viewFlashcards() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    const sectionId = (location.hash || '').split('/').pop();
    if (!window.TRAINING_DATA || !window.TRAINING_DATA.sections) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <h2>Ошибка</h2>
            <button id="btn-back-theory" class="btn">Назад</button>
          </div>
          <p style="padding:16px;">Данные обучения не загружены. Пожалуйста, обновите страницу.</p>
        </div>
      `;
      wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
      return wrapper;
    }
    
    let flashcards = [];
    let sectionTitle = '';
    
    if (sectionId === 'steps') {
      sectionTitle = '6 шагов сервиса';
      flashcards = (window.TRAINING_DATA.serviceSteps || []).map(s => s.flashcard).filter(Boolean);
    } else {
      const section = window.TRAINING_DATA.sections.find(s => s.id === sectionId);
      if (!section) {
        wrapper.innerHTML = `
          <div class="panel">
            <div class="panel-header">
              <h2>Ошибка</h2>
              <button id="btn-back-theory" class="btn">Назад</button>
            </div>
            <p style="padding:16px;">Раздел "${sectionId}" не найден. Доступные разделы: ${window.TRAINING_DATA.sections.map(s => s.id).join(', ')}</p>
          </div>
        `;
        wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
        return wrapper;
      }
      sectionTitle = section.title;
      flashcards = section.flashcards || [];
    }
    
    let currentIndex = 0;
    let userAnswer = '';
    let isAnswered = false;
    let stats = { correct: 0, wrong: 0 };
    
    function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
    flashcards = shuffle([...flashcards]);
    
    wrapper.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="page-title"><h2>${sectionTitle}</h2></div>
          <button id="btn-back-theory" class="btn">Назад</button>
        </div>
        
        <div class="flashcard-progress" style="padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span id="card-counter">Карточка 1 / ${flashcards.length}</span>
            <span id="card-stats">✅ 0 | ❌ 0</span>
          </div>
        </div>
        
        <div class="flashcard-container" id="flashcard-container">
          <div class="flashcard-question" id="question-text"></div>
          <div class="flashcard-input-area" id="input-area">
            <textarea id="user-answer" placeholder="Введите ваш ответ..." rows="3"></textarea>
            <button id="check-answer-btn" class="btn primary">Проверить</button>
          </div>
          <div class="flashcard-result" id="result-area" style="display:none;">
            <div class="result-message" id="result-message"></div>
            <div class="correct-answer" id="correct-answer"></div>
            <div class="flashcard-actions">
              <button id="next-card-btn" class="btn primary">Следующая карточка</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const questionEl = wrapper.querySelector('#question-text');
    const answerInput = wrapper.querySelector('#user-answer');
    const inputArea = wrapper.querySelector('#input-area');
    const resultArea = wrapper.querySelector('#result-area');
    const resultMessage = wrapper.querySelector('#result-message');
    const correctAnswerEl = wrapper.querySelector('#correct-answer');
    const checkBtn = wrapper.querySelector('#check-answer-btn');
    const nextBtn = wrapper.querySelector('#next-card-btn');
    const counterEl = wrapper.querySelector('#card-counter');
    const statsEl = wrapper.querySelector('#card-stats');
    
    function renderCard() {
      if (currentIndex >= flashcards.length) {
        wrapper.querySelector('#flashcard-container').innerHTML = `
          <div style="text-align:center; padding:40px;">
            <h2>🎉 Готово!</h2>
            <p>Правильных ответов: ${stats.correct} из ${flashcards.length}</p>
            <p>Процент: ${Math.round((stats.correct / flashcards.length) * 100)}%</p>
            <button id="restart-btn" class="btn primary">Начать заново</button>
          </div>
        `;
        wrapper.querySelector('#restart-btn')?.addEventListener('click', () => {
          currentIndex = 0;
          stats = { correct: 0, wrong: 0 };
          flashcards = shuffle([...flashcards]);
          renderCard();
        });
        return;
      }
      
      const card = flashcards[currentIndex];
      questionEl.textContent = card.question;
      answerInput.value = '';
      inputArea.style.display = '';
      resultArea.style.display = 'none';
      isAnswered = false;
      
      counterEl.textContent = `Карточка ${currentIndex + 1} / ${flashcards.length}`;
      statsEl.textContent = `✅ ${stats.correct} | ❌ ${stats.wrong}`;
    }
    
    function checkAnswer() {
      if (isAnswered) return;
      isAnswered = true;
      
      const card = flashcards[currentIndex];
      userAnswer = answerInput.value.trim();
      const normalizedUser = userAnswer.toLowerCase().replace(/\s+/g, ' ');
      const normalizedCorrect = card.answer.toLowerCase().replace(/\s+/g, ' ');
      
      let isCorrect = false;
      
      // Check if contains key words
      if (card.keywords && card.keywords.length) {
        const foundKeywords = card.keywords.filter(kw => normalizedUser.includes(kw.toLowerCase()));
        isCorrect = foundKeywords.length >= Math.min(2, card.keywords.length);
      } else {
        // Exact or partial match
        isCorrect = normalizedUser === normalizedCorrect || normalizedUser.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedUser);
      }
      
      if (isCorrect) {
        stats.correct++;
        resultMessage.innerHTML = '<div style="color:#22c55e; font-size:20px; font-weight:600;">✅ Правильно!</div>';
        addXP(10);
      } else {
        stats.wrong++;
        resultMessage.innerHTML = '<div style="color:#ef4444; font-size:20px; font-weight:600;">❌ Неправильно</div>';
      }
      
      correctAnswerEl.innerHTML = `<p><strong>Правильный ответ:</strong></p><p>${card.answer}</p>`;
      if (userAnswer) {
        correctAnswerEl.innerHTML += `<p><strong>Ваш ответ:</strong> ${userAnswer}</p>`;
      }
      
      inputArea.style.display = 'none';
      resultArea.style.display = '';
      statsEl.textContent = `✅ ${stats.correct} | ❌ ${stats.wrong}`;
    }
    
    checkBtn.addEventListener('click', checkAnswer);
    answerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        checkAnswer();
      }
    });
    
    nextBtn.addEventListener('click', () => {
      currentIndex++;
      renderCard();
    });
    
    wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
    
    renderCard();
    return wrapper;
  }
  
  function viewTests() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    const sectionId = (location.hash || '').split('/').pop();
    if (!window.TRAINING_DATA || !window.TRAINING_DATA.sections) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <h2>Ошибка</h2>
            <button id="btn-back-theory" class="btn">Назад</button>
          </div>
          <p style="padding:16px;">Данные обучения не загружены. Пожалуйста, обновите страницу.</p>
        </div>
      `;
      wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
      return wrapper;
    }
    
    const section = window.TRAINING_DATA.sections.find(s => s.id === sectionId);
    if (!section) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <h2>Ошибка</h2>
            <button id="btn-back-theory" class="btn">Назад</button>
          </div>
          <p style="padding:16px;">Раздел "${sectionId}" не найден. Доступные разделы: ${window.TRAINING_DATA.sections.map(s => s.id).join(', ')}</p>
        </div>
      `;
      wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
      return wrapper;
    }
    
    if (!section.tests || section.tests.length === 0) {
      wrapper.innerHTML = `
        <div class="panel">
          <div class="panel-header">
            <h2>Тесты: ${section.title}</h2>
            <button id="btn-back-theory" class="btn">Назад</button>
          </div>
          <p style="padding:16px;">Тесты для этого раздела пока не добавлены.</p>
        </div>
      `;
      wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
      return wrapper;
    }
    
    let currentIndex = 0;
    let selectedAnswer = null;
    let stats = { correct: 0, wrong: 0 };
    const tests = shuffle([...section.tests]);
    
    function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
    
    wrapper.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div class="page-title"><h2>Тесты: ${section.title}</h2></div>
          <button id="btn-back-theory" class="btn">Назад</button>
        </div>
        
        <div class="flashcard-progress" style="padding:12px;">
          <div style="display:flex; justify-content:space-between;">
            <span id="test-counter">Вопрос 1 / ${tests.length}</span>
            <span id="test-stats">✅ 0 | ❌ 0</span>
          </div>
        </div>
        
        <div class="test-container" id="test-container"></div>
      </div>
    `;
    
    const container = wrapper.querySelector('#test-container');
    const counterEl = wrapper.querySelector('#test-counter');
    const statsEl = wrapper.querySelector('#test-stats');
    
    function renderTest() {
      if (currentIndex >= tests.length) {
        container.innerHTML = `
          <div style="text-align:center; padding:40px;">
            <h2>🎉 Тест завершён!</h2>
            <p style="font-size:24px; margin:20px 0;">Результат: ${stats.correct} / ${tests.length}</p>
            <p style="font-size:18px;">Процент: ${Math.round((stats.correct / tests.length) * 100)}%</p>
            <button id="restart-test-btn" class="btn primary" style="margin-top:20px;">Пройти заново</button>
          </div>
        `;
        container.querySelector('#restart-test-btn')?.addEventListener('click', () => {
          currentIndex = 0;
          stats = { correct: 0, wrong: 0 };
          renderTest();
        });
        return;
      }
      
      const test = tests[currentIndex];
      selectedAnswer = null;
      
      container.innerHTML = `
        <div class="test-question-card">
          <h3>${test.question}</h3>
          <div class="test-options" id="test-options">
            ${test.options.map((opt, idx) => `
              <button class="test-option" data-index="${idx}">
                <span class="option-letter">${String.fromCharCode(65 + idx)}</span>
                <span class="option-text">${opt}</span>
              </button>
            `).join('')}
          </div>
          <div class="test-actions">
            <button id="submit-test-btn" class="btn primary" disabled>Ответить</button>
          </div>
          <div id="test-result" class="test-result" style="display:none;"></div>
        </div>
      `;
      
      counterEl.textContent = `Вопрос ${currentIndex + 1} / ${tests.length}`;
      statsEl.textContent = `✅ ${stats.correct} | ❌ ${stats.wrong}`;
      
      const submitBtn = container.querySelector('#submit-test-btn');
      const resultDiv = container.querySelector('#test-result');
      
      container.querySelectorAll('.test-option').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.test-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedAnswer = parseInt(btn.dataset.index);
          submitBtn.disabled = false;
        });
      });
      
      submitBtn.addEventListener('click', () => {
        if (selectedAnswer === null) return;
        
        const isCorrect = selectedAnswer === test.correct;
        if (isCorrect) {
          stats.correct++;
          addXP(20);
          resultDiv.innerHTML = '<div style="color:#22c55e; font-size:18px; padding:16px;">✅ Правильно!</div>';
        } else {
          stats.wrong++;
          const correctOpt = test.options[test.correct];
          resultDiv.innerHTML = `<div style="color:#ef4444; font-size:18px; padding:16px;">❌ Неправильно<br>Правильный ответ: ${correctOpt}</div>`;
        }
        
        resultDiv.style.display = '';
        submitBtn.textContent = 'Следующий вопрос';
        submitBtn.onclick = () => { currentIndex++; renderTest(); };
        container.querySelectorAll('.test-option').forEach(btn => btn.disabled = true);
        
        statsEl.textContent = `✅ ${stats.correct} | ❌ ${stats.wrong}`;
      });
    }
    
    wrapper.querySelector('#btn-back-theory')?.addEventListener('click', () => navigate('#/learn/theory'));
    renderTest();
    
    return wrapper;
  }

  function viewHome() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    // Active tables panel
    const panelTables = document.createElement('section');
    panelTables.className = 'panel';
    panelTables.innerHTML = `
      <div class="panel-header">
        <h2>Столы</h2>
        <div class="panel-actions">
          <button id="btn-add-table" class="btn primary">Добавить стол</button>
        </div>
      </div>
      <div class="tables-grid" id="tables-grid"></div>
    `;
    wrapper.appendChild(panelTables);

    // Render tables
    const grid = panelTables.querySelector('#tables-grid');
    const frag = document.createDocumentFragment();
    activeTables.forEach(n => {
      const card = document.createElement('div');
      card.className = 'table-card';
      const itemsArr = Array.isArray(tableOrders[n]) ? tableOrders[n] : [];
      const totalItems = itemsArr.reduce((sum, o) => sum + (o.quantity || 0), 0);
      const createdAt = itemsArr.length ? new Date(Math.min(...itemsArr.map(i => i.addedAt || Date.now()))) : null;
      const totalAmount = computeTableTotalAmount(n);
      const displayName = getTableDisplayName(n);
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <h3>${displayName}</h3>
          <div style="display: flex; gap: 8px;">
            <button class="table-clear-btn" title="Очистить стол">🗑️</button>
            <button class="table-rename-btn" title="Переименовать стол">✏️</button>
          </div>
        </div>
        <div class="table-meta">
          <span class="pill">Заказов: ${totalItems}</span>
          ${createdAt ? `<span class=\"pill\">Открыт: ${createdAt.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})}</span>` : ''}
          <span class=\"pill\">Итого: ${totalAmount} ₽</span>
        </div>
      `;
      const actions = document.createElement('div');
      actions.className = 'table-actions';
      const openBtn = document.createElement('button'); openBtn.className = 'btn primary'; openBtn.textContent = 'Открыть';
      openBtn.addEventListener('click', () => navigate(`#/table/${n}`));
      const removeBtn = document.createElement('button'); removeBtn.className = 'btn danger'; removeBtn.textContent = 'Удалить';
      removeBtn.addEventListener('click', () => {
        const hasOrders = tableOrders[n] && tableOrders[n].length > 0;
        const message = hasOrders 
          ? `${displayName} содержит ${tableOrders[n].length} заказов. Удалить стол и все заказы?`
          : `Удалить ${displayName}?`;
        showConfirmModal(
          'Удалить стол',
          message,
          () => {
            // Save table orders to history before removing table
            if (tableOrders[n] && tableOrders[n].length > 0) {
              try {
                const items = Array.isArray(tableOrders[n]) ? tableOrders[n] : [];
                const total = computeItemsTotal(items);
                const snapshot = {
                  table: n,
                  tableName: getTableDisplayName(n),
                  items: items.map(i => ({
                    id: i.id,
                    itemName: i.itemName || i.name || i.Name || '',
                    quantity: i.quantity || 1,
                    price: parsePriceToNumber(i.calculatedPrice) || parsePriceToNumber(i.price),
                    priceLabel: i.calculatedPrice || i.price || '',
                    rkeeper: i.rkeeper || i.R_keeper || i.R_keeaper || '—'
                  })),
                  total,
                  createdAt: items.length ? Math.min(...items.map(i => i.addedAt || Date.now())) : Date.now(),
                  updatedAt: Date.now(),
                  closedAt: Date.now(),
                  status: 'closed'
                };
                orderHistory.push(snapshot);
                saveOrderHistory();
              } catch (err) {
                console.error('Error saving order to history:', err);
              }
            }
            
            // Remove table and all its orders
            activeTables = activeTables.filter(t => t !== n);
            delete tableOrders[n];
            delete tableNames[n];
            saveTables();
            saveTableOrders();
            saveTableNames();
            render();
          }
        );
      });
      
      // Add clear button event listener
      const clearBtn = card.querySelector('.table-clear-btn');
      clearBtn.addEventListener('click', () => {
        const hasOrders = tableOrders[n] && tableOrders[n].length > 0;
        if (!hasOrders) {
          alert('Стол уже пуст');
          return;
        }
        
        showConfirmModal(
          'Очистить стол',
          `Вы уверены, что хотите очистить все заказы из ${displayName}? Всего заказов: ${tableOrders[n].length}`,
          () => {
            // Move current table orders to history, then clear table
            try {
              const items = Array.isArray(tableOrders[n]) ? tableOrders[n] : [];
              const total = computeItemsTotal(items);
              const snapshot = {
                table: n,
                tableName: getTableDisplayName(n),
                items: items.map(i => ({
                  id: i.id,
                  itemName: i.itemName || i.name || i.Name || '',
                  quantity: i.quantity || 1,
                  price: parsePriceToNumber(i.calculatedPrice) || parsePriceToNumber(i.price),
                  priceLabel: i.calculatedPrice || i.price || '',
                  rkeeper: i.rkeeper || i.R_keeper || i.R_keeaper || '—'
                })),
                total,
                createdAt: items.length ? Math.min(...items.map(i => i.addedAt || Date.now())) : Date.now(),
                updatedAt: Date.now(),
                closedAt: Date.now(),
                status: 'closed'
              };
              orderHistory.push(snapshot);
              saveOrderHistory();
            } catch {}

            tableOrders[n] = [];
            saveTableOrders();
            render();
          },
          null,
          'Очистить'
        );
      });
      
      // Add rename button event listener
      const renameBtn = card.querySelector('.table-rename-btn');
      renameBtn.addEventListener('click', () => {
        showRenameTableModal(n);
      });
      
      actions.appendChild(openBtn); actions.appendChild(removeBtn);
      card.appendChild(actions); frag.appendChild(card);
    });
    grid.appendChild(frag);

    // Add table handler
    panelTables.querySelector('#btn-add-table').addEventListener('click', () => {
      const tableNumber = prompt('Номер стола?', '');
      if (!tableNumber) return;
      const n = Number(tableNumber);
      if (!Number.isInteger(n) || n <= 0) { alert('Введите корректный номер'); return; }
      
      if (!activeTables.includes(n)) { 
        activeTables.push(n); 
        activeTables.sort((a,b)=>a-b);
        saveTables();
      }
      
      if (!tableOrders[n]) {
        tableOrders[n] = [];
      }
      
      navigate(`#/table/${n}`);
    });

    return wrapper;
  }

  function viewTable(tableNumber) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    if (tableMode === 'todo') {
      return viewTableTodo(tableNumber);
    }

    const panelMenu = document.createElement('section');
    panelMenu.className = 'panel';
    panelMenu.innerHTML = `
      <div class="panel-header">
        <div class="page-title">
          <h2>${getTableDisplayName(tableNumber)}</h2>
        </div>
        <div class="panel-actions">
          <button id="btn-sort" class="btn secondary" title="Обновить и отсортировать">🔄</button>
          <button id="btn-reload" class="btn secondary" title="Перезагрузить меню">⟳</button>
          <button id="btn-back" class="btn">Назад</button>
        </div>
      </div>
      <div class="search-row"><input id="search" placeholder="Поиск блюд" inputmode="search" /></div>
      <div class="menu-list" id="menu-list"></div>
      <div class="bottom-bar">
        <span class="chip">Заказов в столе: ${tableOrders[tableNumber] ? tableOrders[tableNumber].reduce((sum, o) => sum + o.quantity, 0) : 0}</span>
      </div>
    `;
    wrapper.appendChild(panelMenu);

    panelMenu.querySelector('#btn-back').addEventListener('click', () => navigate('#/'));
    
    // Sort button handler - sorts dishes by category
    panelMenu.querySelector('#btn-sort').addEventListener('click', () => {
      sortTableOrdersByCategory(tableNumber);
      renderTableOrders();
      
      // Update counter
      const totalItems = tableOrders[tableNumber] ? tableOrders[tableNumber].reduce((sum, o) => sum + o.quantity, 0) : 0;
      const chip = panelMenu.querySelector('.chip');
      if (chip) {
        chip.textContent = `Заказов в столе: ${totalItems}`;
      }
    });
    
    // Reload button handler
    panelMenu.querySelector('#btn-reload').addEventListener('click', async () => {
      console.log('Reloading dishes...');
      try {
        await loadDb(true); // Force reload
        render(); // Re-render the page
      } catch (error) {
        console.error('Failed to reload dishes:', error);
        alert('Ошибка перезагрузки меню');
      }
    });

    // Load dishes and render
    loadDb().then(({dishes}) => {
      const list = panelMenu.querySelector('#menu-list');
      const searchInput = panelMenu.querySelector('#search');

      const normalize = (s) => (s || '').toLowerCase();

      // Function to render table orders with details
      function renderTableOrders() {
        sortTableOrdersByCategory(tableNumber);
        list.innerHTML = '';
        if (!tableOrders[tableNumber] || tableOrders[tableNumber].length === 0) {
          list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Заказов пока нет. Начните поиск блюд выше</div>';
          return;
        }

        const frag = document.createDocumentFragment();
        
        // Group orders by category
        let lastCategoryGroup = null;
        
        tableOrders[tableNumber].forEach((order, index) => {
          const currentGroup = order._categoryGroup ?? getCategoryGroup(order);
          const categoryConfig = CATEGORY_CONFIG[currentGroup];
          // Always check current state, not cached _categoryEnabled
          const groupingEnabled = currentGroup && isCategoryGroupEnabled(currentGroup);

          if (groupingEnabled && currentGroup) {
            if (currentGroup !== lastCategoryGroup) {
              const separator = document.createElement('div');
              separator.className = 'category-separator';
              separator.innerHTML = `
                <div class="separator-line"></div>
                <div class="separator-text">${categoryConfig?.label || 'Категория'}</div>
                <div class="separator-line"></div>
              `;
              frag.appendChild(separator);
              lastCategoryGroup = currentGroup;
            }
          } else {
            // Reset last group when we hit disabled categories
            if (lastCategoryGroup !== null && lastCategoryGroup < 1000) {
              lastCategoryGroup = null;
            }
          }
          
          frag.appendChild(createOrderElement(order));
        });
        
        list.appendChild(frag);
        
      }

      // Helper function to check if order is a drink
      function isDrink(order) {
        const drinkKeywords = [
          'напиток', 'сок', 'чай', 'кофе', 'вода', 'лимонад', 'компот', 'морс', 'коктейль',
          'пиво', 'вино', 'водка', 'коньяк', 'виски', 'ром', 'джин', 'текила', 'шампанское',
          'кола', 'пепси', 'спрайт', 'фанта', 'миринда', 'энергетик', 'газировка',
          'молоко', 'кефир', 'йогурт', 'ряженка', 'снежок', 'тан', 'айран'
        ];
        
        return drinkKeywords.some(keyword => 
          order.itemName.toLowerCase().includes(keyword)
        );
      }

      // Helper function to create order element
      function createOrderElement(order) {
          const row = document.createElement('div');
          row.className = 'dish-card';
          
          // Header section with image, title, price and controls
          const header = document.createElement('div');
          header.className = 'dish-header';
          
          const img = document.createElement('img'); 
          img.alt = order.itemName; 
          img.src = 'icons/icon-192.png';
          img.className = 'dish-image';
          
          const headerContent = document.createElement('div');
          headerContent.className = 'dish-header-content';
          
          const title = document.createElement('h3'); 
          title.textContent = order.itemName;
          title.className = 'dish-title';
          
          // Add custom dish indicator
          if (order.isCustom) {
            title.style.fontStyle = 'italic';
            title.style.opacity = '0.8';
          }
          
          // Add strikethrough styling based on status
          if (order.status === 'rkeeper') {
            title.style.textDecoration = 'line-through';
            title.style.color = '#22c55e'; // Green color
          } else if (order.status === 'served') {
            title.style.textDecoration = 'line-through';
            title.style.color = '#ef4444'; // Red color
          }
          
          const price = document.createElement('div');
          price.className = 'dish-price-header';
          price.textContent = order.calculatedPrice || order.price || '—';
          
          const controls = document.createElement('div');
          controls.className = 'dish-controls';
          
          const quantityControls = document.createElement('div');
          quantityControls.className = 'quantity-controls';
          
          const minusBtn = document.createElement('button');
          minusBtn.textContent = '-';
          minusBtn.className = 'btn quantity-btn';
          minusBtn.onclick = () => changeQuantity(order.id, -1);
          
          const quantity = document.createElement('span');
          quantity.textContent = order.quantity;
          quantity.className = 'quantity';
          
          const plusBtn = document.createElement('button');
          plusBtn.textContent = '+';
          plusBtn.className = 'btn quantity-btn';
          plusBtn.onclick = () => changeQuantity(order.id, 1);
          
          quantityControls.appendChild(minusBtn);
          quantityControls.appendChild(quantity);
          quantityControls.appendChild(plusBtn);
          
          const statusControls = document.createElement('div');
          statusControls.className = 'status-controls';
          
          // Takeaway button
          const takeawayBtn = document.createElement('button');
          takeawayBtn.textContent = order.isTakeaway ? '✓ 🥡' : '🥡';
          takeawayBtn.className = order.isTakeaway ? 'btn takeaway' : 'btn secondary';
          takeawayBtn.onclick = () => toggleTakeaway(order.id);
          
          // R_keeper button
          const rkeeperBtn = document.createElement('button');
          rkeeperBtn.textContent = order.status === 'rkeeper' ? '✓ R_keeper' : 'R_keeper';
          rkeeperBtn.className = order.status === 'rkeeper' ? 'btn success' : 'btn secondary';
          rkeeperBtn.onclick = () => toggleOrderStatus(order.id, 'rkeeper');
          
          // Served button
          const servedBtn = document.createElement('button');
          servedBtn.textContent = order.status === 'served' ? '✓ Вынесен' : 'Вынесен';
          servedBtn.className = order.status === 'served' ? 'btn danger' : 'btn secondary';
          servedBtn.onclick = () => toggleOrderStatus(order.id, 'served');
          
          const removeBtn = document.createElement('button');
          removeBtn.textContent = 'Удалить';
          removeBtn.className = 'btn danger remove-btn';
          removeBtn.onclick = () => removeOrder(order.id);
          
          statusControls.appendChild(takeawayBtn);
          statusControls.appendChild(rkeeperBtn);
          statusControls.appendChild(servedBtn);
          
          controls.appendChild(quantityControls);
          controls.appendChild(statusControls);
          controls.appendChild(removeBtn);
          
          headerContent.appendChild(title);
          headerContent.appendChild(price);
          headerContent.appendChild(controls);
          
          header.appendChild(img);
          header.appendChild(headerContent);
          
          // Details section with composition and allergens
          const details = document.createElement('div');
          details.className = 'dish-details';
          
          if (order.composition && order.composition !== '—') {
            const composition = document.createElement('div');
            composition.className = 'dish-composition';
            const compLabel = document.createElement('span');
            compLabel.textContent = 'Состав: ';
            compLabel.className = 'detail-label';
            const compText = document.createElement('span');
            compText.textContent = order.composition;
            composition.appendChild(compLabel);
            composition.appendChild(compText);
            details.appendChild(composition);
          }
          
          // Cooking level for steaks
          if (order.cookingLevel) {
            const cookingLevel = document.createElement('div');
            cookingLevel.className = 'dish-cooking-level';
            const levelLabel = document.createElement('span');
            levelLabel.textContent = 'Прожарка: ';
            levelLabel.className = 'detail-label cooking-level-label';
            const levelText = document.createElement('span');
            levelText.textContent = order.cookingLevel;
            levelText.className = 'cooking-level-value';
            cookingLevel.appendChild(levelLabel);
            cookingLevel.appendChild(levelText);
            details.appendChild(cookingLevel);
          }
          
          // Ice cream flavors
          if (order.iceCreamFlavors) {
            const iceCreamFlavors = document.createElement('div');
            iceCreamFlavors.className = 'dish-ice-cream-flavors';
            const flavorsLabel = document.createElement('span');
            flavorsLabel.textContent = 'Вкусы: ';
            flavorsLabel.className = 'detail-label ice-cream-flavors-label';
            const flavorsText = document.createElement('span');
            flavorsText.textContent = order.iceCreamFlavors;
            flavorsText.className = 'ice-cream-flavors-value';
            iceCreamFlavors.appendChild(flavorsLabel);
            iceCreamFlavors.appendChild(flavorsText);
            details.appendChild(iceCreamFlavors);
          }
          
          if (order.allergens && order.allergens !== '—') {
            const allergens = document.createElement('div');
            allergens.className = 'dish-allergens';
            const allLabel = document.createElement('span');
            allLabel.textContent = 'Аллергены: ';
            allLabel.className = 'detail-label allergens-label';
            const allText = document.createElement('span');
            allText.textContent = order.allergens;
            allergens.appendChild(allLabel);
            allergens.appendChild(allText);
            details.appendChild(allergens);
          }
          
          // R_keeper code at the bottom
          const rkeeper = document.createElement('div');
          rkeeper.className = 'dish-rkeeper';
          rkeeper.textContent = `R_keeper: ${order.rkeeper || '—'}`;
          
          // Notes field
          const notes = document.createElement('div');
          notes.className = 'dish-notes';
          const notesLabel = document.createElement('div');
          notesLabel.className = 'dish-notes-label';
          notesLabel.textContent = 'Заметка:';
          const notesInput = document.createElement('textarea');
          notesInput.className = 'dish-notes-input';
          notesInput.placeholder = 'Добавьте заметку к блюду...';
          notesInput.value = order.notes || '';
          notesInput.rows = 2;
          notesInput.addEventListener('blur', () => {
            updateOrderNote(order.id, notesInput.value.trim());
          });
          notesInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              notesInput.blur();
            }
          });
          notes.appendChild(notesLabel);
          notes.appendChild(notesInput);
          
          row.appendChild(header);
          row.appendChild(details);
          row.appendChild(rkeeper);
          row.appendChild(notes);
          
          return row;
      }

      // Global functions for order management
      window.updateOrderNote = (orderId, note) => {
        if (tableOrders[tableNumber]) {
          const order = tableOrders[tableNumber].find(o => o.id === orderId);
          if (order) {
            order.notes = note || undefined;
            saveTableOrders();
          }
        }
      };


      window.changeQuantity = (orderId, delta) => {
        if (tableOrders[tableNumber]) {
          const order = tableOrders[tableNumber].find(o => o.id === orderId);
          if (order) {
            const nextQty = (order.quantity || 1) + delta;
            if (nextQty <= 0) {
              // remove item if decremented from 1
              tableOrders[tableNumber] = tableOrders[tableNumber].filter(o => o.id !== orderId);
            } else {
              order.quantity = nextQty;
            }
            saveTableOrders();
            renderTableOrders();
            // Update counter - count total items, not unique dishes
            const totalItems = tableOrders[tableNumber].reduce((sum, o) => sum + o.quantity, 0);
            const chip = panelMenu.querySelector('.chip');
            if (chip) {
              chip.textContent = `Заказов в столе: ${totalItems}`;
            }
          }
        }
      };

      window.removeOrder = (orderId) => {
        if (tableOrders[tableNumber]) {
          tableOrders[tableNumber] = tableOrders[tableNumber].filter(o => o.id !== orderId);
          saveTableOrders();
          renderTableOrders();
          // Update counter - count total items
          const totalItems = tableOrders[tableNumber].reduce((sum, o) => sum + o.quantity, 0);
          const chip = panelMenu.querySelector('.chip');
          if (chip) {
            chip.textContent = `Заказов в столе: ${totalItems}`;
          }
        }
      };

      window.toggleOrderStatus = (orderId, status) => {
        if (tableOrders[tableNumber]) {
          const order = tableOrders[tableNumber].find(o => o.id === orderId);
          if (order) {
            // If clicking the same status, remove it (toggle off)
            if (order.status === status) {
              order.status = undefined;
            } else {
              // Set new status
              order.status = status;
            }
            sortTableOrdersByCategory(tableNumber);
            renderTableOrders();Вс
          }
        }
      };

      // Live suggestion container
      const suggestEl = document.createElement('div');
      suggestEl.className = 'suggestion';
      suggestEl.style.display = 'none';
      suggestEl.innerHTML = '<span>Добавить: <b></b></span><button class="btn primary">Добавить</button>';
      const suggestNameEl = suggestEl.querySelector('b');
      const suggestBtn = suggestEl.querySelector('button');
      panelMenu.insertBefore(suggestEl, list);

      function renderList(filter) {
        list.innerHTML='';
        const norm = normalize(filter);
        console.log('Searching for:', norm);
        console.log('Total dishes available:', dishes.length);
        console.log('Dish names:', dishes.map(d => d.name));
        
        const items = dishes.filter(d => {
          const name = normalize(d.name);
          const matches = !norm || name.includes(norm);
          if (norm && matches) {
            console.log('Found match:', d.name);
          }
          return matches;
        });
        
        console.log('Filtered items count:', items.length);
        
        const frag = document.createDocumentFragment();
        items.forEach(d => {
          const row = document.createElement('div');
          row.className='dish-card';
          
          // Header section with image, title, code and controls
          const header = document.createElement('div');
          header.className = 'dish-header';
          
          const img = document.createElement('img'); 
          img.alt = d.name; 
          img.src = 'icons/icon-192.png';
          img.loading = 'lazy';
          img.className = 'dish-image';
          
          const headerContent = document.createElement('div');
          headerContent.className = 'dish-header-content';
          
          const title = document.createElement('h3'); 
          title.textContent = d.name;
          title.className = 'dish-title';
          
          // Add category display
          const category = document.createElement('div');
          category.className = 'dish-category';
          category.textContent = d.category || 'Без категории';
          
          const price = document.createElement('div');
          price.className = 'dish-price-header';
          price.textContent = calculatePrice(d.price, d.category) || d.price || '—';
          
          const controls = document.createElement('div');
          controls.className = 'dish-controls';
          
          const quantityControls = document.createElement('div');
          quantityControls.className = 'quantity-controls';
          
          const minusBtn = document.createElement('button');
          minusBtn.textContent = '-';
          minusBtn.className = 'btn quantity-btn';
          
          const quantity = document.createElement('span');
          quantity.textContent = '1';
          quantity.className = 'quantity';
          
          const plusBtn = document.createElement('button');
          plusBtn.textContent = '+';
          plusBtn.className = 'btn quantity-btn';
          
          quantityControls.appendChild(minusBtn);
          quantityControls.appendChild(quantity);
          quantityControls.appendChild(plusBtn);
          
          const addBtn = document.createElement('button');
          addBtn.textContent = 'Добавить';
          addBtn.className = 'btn primary add-btn';
          
          controls.appendChild(quantityControls);
          controls.appendChild(addBtn);
          
          headerContent.appendChild(title);
          headerContent.appendChild(category);
          headerContent.appendChild(price);
          headerContent.appendChild(controls);
          
          header.appendChild(img);
          header.appendChild(headerContent);
          
          // Details section with composition and allergens
          const details = document.createElement('div');
          details.className = 'dish-details';
          
          if (d.composition && d.composition.length > 0) {
            const composition = document.createElement('div');
            composition.className = 'dish-composition';
            const compLabel = document.createElement('span');
            compLabel.textContent = 'Состав: ';
            compLabel.className = 'detail-label';
            const compText = document.createElement('span');
            compText.textContent = d.composition.slice(0, 3).join(', ');
            composition.appendChild(compLabel);
            composition.appendChild(compText);
            details.appendChild(composition);
          }
          
          if (d.allergens && d.allergens.length > 0) {
            const allergens = document.createElement('div');
            allergens.className = 'dish-allergens';
            const allLabel = document.createElement('span');
            allLabel.textContent = 'Аллергены: ';
            allLabel.className = 'detail-label allergens-label';
            const allText = document.createElement('span');
            allText.textContent = d.allergens.slice(0, 3).join(', ');
            allergens.appendChild(allLabel);
            allergens.appendChild(allText);
            details.appendChild(allergens);
          }
          
          // R_keeper code at the bottom
          const rkeeper = document.createElement('div');
          rkeeper.className = 'dish-rkeeper';
          rkeeper.innerHTML = `<span class="rkeeper-label">R_keeper:</span> <span class="rkeeper-code">${d.R_keeper || '—'}</span>`;
          
          // Notes field
          const notes = document.createElement('div');
          notes.className = 'dish-notes';
          const notesInput = document.createElement('input');
          notesInput.type = 'text';
          notesInput.placeholder = 'Заметка к блюду...';
          notesInput.className = 'notes-input';
          notes.appendChild(notesInput);
          
          row.appendChild(header);
          row.appendChild(details);
          row.appendChild(rkeeper);
          row.appendChild(notes);
          
          // Event listeners
          addBtn.addEventListener('click', () => {
            console.log('Add button clicked for:', d.name);
            
            // Check if this is a steak (excluding turkey, fish, and alternative steaks)
            const dishName = (d.name || '').toLowerCase();
            const category = (d.category || '').toLowerCase();
            const isSteak = (dishName.includes('стейк') || 
                           category.includes('стейк') ||
                           category.includes('прайм')) && 
                           !dishName.includes('индейк') && 
                           !dishName.includes('индюш') &&
                           !dishName.includes('рыб') &&
                           !category.includes('альтернативные стейки');
            
            // Check if this is ice cream
            const isIceCream = dishName.includes('мороженое') || dishName.includes('мороженное');
            
            console.log('Is steak:', isSteak, 'Is ice cream:', isIceCream);
            
            // Function to add dish with optional cooking level or ice cream flavors
            const addDishToTable = (cookingLevel = null, iceCreamFlavors = null) => {
              // Initialize table orders if not exists
              if (!tableOrders[tableNumber]) {
                tableOrders[tableNumber] = [];
              }
              // Add to specific table with full details (new items go to top)
              tableOrders[tableNumber].unshift({ 
                id: uuid(), 
                itemName: d.name, 
                quantity: parseInt(quantity.textContent), 
                price: d.price,
                calculatedPrice: calculatePrice(d.price, d.category),
                composition: d.composition ? d.composition.slice(0, 3).join(', ') : '',
                allergens: d.allergens ? d.allergens.slice(0, 3).join(', ') : '',
                rkeeper: d.R_keeper,
                notes: notesInput.value,
                createdAt: Date.now(),
                addedAt: Date.now(),
                category: d.category || '', // Store category for sorting
                cookingLevel: cookingLevel, // Store cooking level for steaks
                iceCreamFlavors: iceCreamFlavors // Store ice cream flavors
              });
              saveTableOrders();
              // Auto-sort after adding
              sortTableOrdersByCategory(tableNumber);
              // Switch to table orders view
              renderTableOrders();
              // Update counter
              const chip = panelMenu.querySelector('.chip');
              if (chip) {
                chip.textContent = `Заказов в столе: ${tableOrders[tableNumber].length}`;
              }
              // Show feedback
              addBtn.textContent = '✓ Добавлено';
              addBtn.disabled = true;
              setTimeout(() => {
                addBtn.textContent = 'Добавить';
                addBtn.disabled = false;
              }, 1000);
            };
            
            // If it's a steak, show cooking level modal
            if (isSteak) {
              console.log('Showing cooking level modal for:', d.name);
              showCookingLevelModal(d.name, (selectedLevel) => {
                console.log('Selected cooking level:', selectedLevel);
                addDishToTable(selectedLevel, null);
              });
            } else if (isIceCream) {
              // If it's ice cream, show flavor selection modal
              console.log('Showing ice cream modal for:', d.name);
              showIceCreamFlavorModal(d.name, (selectedFlavors) => {
                console.log('Selected flavors:', selectedFlavors);
                addDishToTable(null, selectedFlavors);
              });
            } else {
              console.log('Adding dish without modal');
              addDishToTable(null, null);
            }
          });
          
          minusBtn.addEventListener('click', () => {
            const currentQty = parseInt(quantity.textContent);
            if (currentQty > 1) {
              quantity.textContent = currentQty - 1;
            }
          });
          
          plusBtn.addEventListener('click', () => {
            const currentQty = parseInt(quantity.textContent);
            quantity.textContent = currentQty + 1;
          });
          
          frag.appendChild(row);
        });
        list.appendChild(frag);

        // Suggest best prefix match
        if (norm) {
          const best = dishes.find(d => normalize(d.name).startsWith(norm));
          if (best) {
            suggestNameEl.textContent = best.name;
            suggestEl.style.display = '';
            suggestBtn.onclick = () => {
              // Initialize table orders if not exists
              if (!tableOrders[tableNumber]) {
                tableOrders[tableNumber] = [];
              }
              // Add to specific table with full details (new items go to top)
              tableOrders[tableNumber].unshift({ 
                id: uuid(), 
                itemName: best.name, 
                quantity: 1, 
                price: best.price,
                calculatedPrice: calculatePrice(best.price, best.category),
                composition: best.composition ? best.composition.slice(0, 3).join(', ') : '',
                allergens: best.allergens ? best.allergens.slice(0, 3).join(', ') : '',
                rkeeper: best.R_keeper,
                notes: '',
                createdAt: Date.now(),
                addedAt: Date.now(),
                category: best.category || '' // Store category for sorting
              });
              saveTableOrders();
              // Auto-sort after adding
              sortTableOrdersByCategory(tableNumber);
              // Switch to table orders view
              renderTableOrders();
              // Update counter
              const chip = panelMenu.querySelector('.chip');
              if (chip) {
                chip.textContent = `Заказов в столе: ${tableOrders[tableNumber].length}`;
              }
              // Clear search and hide suggestion
              searchInput.value = '';
              suggestEl.style.display = 'none';
            };
          } else {
            suggestEl.style.display = 'none';
          }
        } else {
          suggestEl.style.display = 'none';
        }
      }
      // Show table orders initially, not all dishes
      renderTableOrders();
      
      searchInput.addEventListener('input', (e) => {
        const v = (e.target.value || '').trim();
        if (v) {
          renderList(v);
        } else {
          renderTableOrders();
        }
      });
      // Enter adds suggestion
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && suggestEl.style.display !== 'none') { e.preventDefault(); suggestBtn.click(); }
      });
    }).catch(err => {
      console.error('Failed to load dishes:', err);
      const list = panelMenu.querySelector('#menu-list');
      list.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3>Ошибка загрузки меню</h3>
          <p>Не удалось загрузить файл dishes.json</p>
          <p style="font-size: 12px; color: var(--divider); margin-top: 8px;">
            ${err.message}
          </p>
          <button onclick="location.reload()" class="btn primary" style="margin-top: 16px;">
            Перезагрузить страницу
          </button>
        </div>
      `;
    });

    return wrapper;
  }

  function render() {
    const hash = location.hash || '#/';
    root.innerHTML = '';
    
    if (hash.startsWith('#/table/')) {
      const id = Number(hash.split('/').pop());
      root.appendChild(viewTable(id));
    } else if (hash === '#/course-settings') {
      root.appendChild(viewCourseSettings());
    } else if (hash === '#/order-history') {
      root.appendChild(viewOrderHistory());
    } else if (hash === '#/about') {
      root.appendChild(viewAbout());
    } else {
      // Show current page based on navigation
      switch (currentPage) {
        case 'search':
          root.appendChild(viewSearch());
          break;
        case 'learn':
          root.appendChild(viewLearn());
          break;
        case 'profile':
          root.appendChild(viewProfile());
          break;
        case 'settings':
          root.appendChild(viewSettings());
          break;
        case 'tables':
        default:
          root.appendChild(viewHome());
          break;
      }
    }
  }

  // PWA install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return; installBtn.disabled = true;
    await deferredPrompt.prompt(); await deferredPrompt.userChoice; installBtn.hidden = true; installBtn.disabled = false; deferredPrompt = null;
  });
  if ('serviceWorker' in navigator) {
    const showUpdateBanner = (onReload) => {
      let banner = document.getElementById('sw-update-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sw-update-banner';
        banner.style.position = 'fixed';
        banner.style.left = '12px';
        banner.style.right = '12px';
        banner.style.bottom = '16px';
        banner.style.zIndex = '9999';
        banner.style.background = 'var(--card-bg, #0f172a)';
        banner.style.color = '#fff';
        banner.style.borderRadius = '12px';
        banner.style.boxShadow = '0 8px 24px rgba(0,0,0,.35)';
        banner.style.padding = '12px 12px';
        banner.style.display = 'flex';
        banner.style.gap = '8px';
        banner.style.alignItems = 'center';
        banner.style.justifyContent = 'space-between';
        banner.innerHTML = `
          <span>Доступно обновление приложения</span>
          <div style="display:flex; gap:8px;">
            <button id="sw-update-reload" class="btn primary">Обновить</button>
            <button id="sw-update-dismiss" class="btn secondary">Позже</button>
          </div>
        `;
        document.body.appendChild(banner);
        banner.querySelector('#sw-update-dismiss').addEventListener('click', () => {
          banner.remove();
        });
      }
      const reloadBtn = banner.querySelector('#sw-update-reload');
      reloadBtn.onclick = () => onReload && onReload();
    };

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((registration) => {
        // When a new SW is found
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New update available
                showUpdateBanner(() => {
                  // Ask SW to activate immediately, then reload
                  if (registration.waiting) {
                    registration.waiting.postMessage('SKIP_WAITING');
                  }
                });
              }
            }
          });
        });

        // Ensure page refreshes to use new SW after it takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      }).catch(() => {});
    });
  }

  // Navigation handlers
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      setPage(item.dataset.page);
    });
  });

  // Clear cache function
  window.clearCache = async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('Cache cleared');
      location.reload();
    }
  };
  
  // Force reload function
  window.forceReload = () => {
    location.reload(true);
  };

  // Confirmation modal functions
  function showConfirmModal(title, message, onConfirm, onCancel, confirmButtonText = 'Удалить') {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
      <div class="confirm-content">
        <div class="confirm-title">${title}</div>
        <div class="confirm-message">${message}</div>
        <div class="confirm-actions">
          <button class="btn secondary" id="confirm-cancel">Отмена</button>
          <button class="btn danger" id="confirm-ok">${confirmButtonText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#confirm-cancel').addEventListener('click', () => {
      document.body.removeChild(modal);
      if (onCancel) onCancel();
    });
    
    modal.querySelector('#confirm-ok').addEventListener('click', () => {
      document.body.removeChild(modal);
      if (onConfirm) onConfirm();
    });
  }

  // Todo mode table view
  function viewTableTodo(tableNumber) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    const panelMenu = document.createElement('section');
    panelMenu.className = 'panel';
    panelMenu.innerHTML = `
      <div class="panel-header">
        <div class="page-title">
          <h2>${getTableDisplayName(tableNumber)} - To-Do</h2>
        </div>
        <div class="panel-actions">
          <button id="btn-refresh" class="btn secondary" title="Обновить и отсортировать">🔄</button>
          <button id="btn-back" class="btn">Назад</button>
        </div>
      </div>
      <div class="todo-input-section">
        <div class="todo-input-row">
          <input id="todo-input" placeholder="Введите название блюда или напитка..." inputmode="text" />
          <button id="btn-add-todo" class="btn primary">Добавить</button>
        </div>
        <div class="todo-hint">
          💡 Введите название блюда - оно будет найдено автоматически или добавлено как произвольное
        </div>
      </div>
      <div class="menu-list" id="todo-list"></div>
      <div class="bottom-bar">
        <span class="chip">Заказов в столе: ${tableOrders[tableNumber] ? tableOrders[tableNumber].reduce((sum, o) => sum + o.quantity, 0) : 0}</span>
      </div>
    `;
    wrapper.appendChild(panelMenu);

    panelMenu.querySelector('#btn-back').addEventListener('click', () => navigate('#/'));
    
    // Refresh button handler - sorts dishes by category
    panelMenu.querySelector('#btn-refresh').addEventListener('click', () => {
      sortTableOrdersByCategory(tableNumber);
      renderTodoList();
      
      // Update counter
      const totalItems = tableOrders[tableNumber] ? tableOrders[tableNumber].reduce((sum, o) => sum + o.quantity, 0) : 0;
      const chip = panelMenu.querySelector('.chip');
      if (chip) {
        chip.textContent = `Заказов в столе: ${totalItems}`;
      }
    });

    // Todo input handlers
    const todoInput = panelMenu.querySelector('#todo-input');
    const addBtn = panelMenu.querySelector('#btn-add-todo');
    const todoList = panelMenu.querySelector('#todo-list');
    
    // Add suggestions container for todo mode
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'search-suggestions';
    suggestionsContainer.id = 'todo-suggestions';
    suggestionsContainer.style.display = 'none';
    suggestionsContainer.innerHTML = '<div class="suggestions-list" id="todo-suggestions-list"></div>';
    
    // Insert suggestions container after todo input section
    const todoInputSection = panelMenu.querySelector('.todo-input-section');
    todoInputSection.parentNode.insertBefore(suggestionsContainer, todoInputSection.nextSibling);
    
    const suggestionsList = suggestionsContainer.querySelector('#todo-suggestions-list');
    let searchTimeout;
    let allDishes = [];

    function normalize(text) {
      return (text || '').toLowerCase().trim();
    }

    function findMatchingDishes(query) {
      if (!query || query.length < 2) return [];
      
      const normalizedQuery = normalize(query);
      const matches = [];
      
      allDishes.forEach(dish => {
        const dishName = normalize(dish.name);
        
        // Exact match gets highest priority
        if (dishName === normalizedQuery) {
          matches.push({...dish, matchType: 'exact', score: 100});
        }
        // Starts with query
        else if (dishName.startsWith(normalizedQuery)) {
          matches.push({...dish, matchType: 'starts', score: 80});
        }
        // Contains query
        else if (dishName.includes(normalizedQuery)) {
          matches.push({...dish, matchType: 'contains', score: 60});
        }
        // Word match - check if any word in dish name starts with query
        else {
          const dishWords = dishName.split(' ');
          const queryWords = normalizedQuery.split(' ');
          
          for (let queryWord of queryWords) {
            for (let dishWord of dishWords) {
              if (dishWord.startsWith(queryWord) && queryWord.length > 1) {
                matches.push({...dish, matchType: 'word', score: 40});
                break;
              }
            }
            if (matches.some(m => m.name === dish.name)) break;
          }
        }
      });
      
      // Sort by score and return top 10
      return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }

    function renderSuggestions(matches) {
      suggestionsList.innerHTML = '';
      
      if (matches.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
      }
      
      const frag = document.createDocumentFragment();
      
      matches.forEach(dish => {
        const suggestion = document.createElement('div');
        suggestion.className = 'suggestion-item';
        suggestion.innerHTML = `
          <div class="suggestion-content">
            <div class="suggestion-name">${dish.name}</div>
            <div class="suggestion-category">${dish.category || 'Без категории'}</div>
          </div>
          <div class="suggestion-price">${dish.price || '—'}</div>
        `;
        
        suggestion.addEventListener('click', () => {
          selectDish(dish);
        });
        
        frag.appendChild(suggestion);
      });
      
      suggestionsList.appendChild(frag);
      suggestionsContainer.style.display = 'block';
    }

    function selectDish(dish) {
      console.log('selectDish called for:', dish.name);
      
      // Check if it's a steak that needs cooking level (excluding alternative steaks)
      const isSteak = dish.category && 
        (dish.category.includes('стейк') || 
         dish.category.includes('Прайм') ||
         dish.name.toLowerCase().includes('стейк')) &&
        !dish.category.includes('Альтернативные стейки') &&
        !dish.name.toLowerCase().includes('рыб') &&
        !dish.name.toLowerCase().includes('форель') &&
        !dish.name.toLowerCase().includes('треск') &&
        !dish.name.toLowerCase().includes('дорадо') &&
        !dish.name.toLowerCase().includes('сибас');
      
      // Check if it's ice cream
      const isIceCream = dish.name.toLowerCase().includes('мороженое') || 
                        dish.name.toLowerCase().includes('мороженное');
      
      console.log('Is steak:', isSteak, 'Is ice cream:', isIceCream);
      
      if (isSteak) {
        console.log('Showing cooking level modal from suggestion');
        showCookingLevelModal(dish.name, (selectedLevel) => {
          addOrderToTable(tableNumber, dish, selectedLevel);
          todoInput.value = '';
          suggestionsContainer.style.display = 'none';
          renderTodoList();
        });
      } else if (isIceCream) {
        console.log('Showing ice cream modal from suggestion');
        showIceCreamFlavorModal(dish.name, (selectedFlavors) => {
          addOrderToTable(tableNumber, dish, null, selectedFlavors);
          todoInput.value = '';
          suggestionsContainer.style.display = 'none';
          renderTodoList();
        });
      } else {
        // Add the dish to table directly
        addOrderToTable(tableNumber, dish);
        
        // Clear input and hide suggestions
        todoInput.value = '';
        suggestionsContainer.style.display = 'none';
        
        // Re-render the list
        renderTodoList();
      }
    }

    function addTodoItem() {
      console.log('=== addTodoItem called ===');
      const input = todoInput.value.trim();
      console.log('Input value:', input);
      if (!input) {
        console.log('Input is empty, returning');
        return;
      }

      // Try to find matching dish
      const matchingDish = findDishByName(input);
      console.log('Matching dish:', matchingDish);
      
      if (matchingDish) {
        console.log('Found dish:', matchingDish.name);
        
        // Check if it's a steak that needs cooking level (excluding alternative steaks)
        const isSteak = matchingDish.category && 
          (matchingDish.category.includes('стейк') || 
           matchingDish.category.includes('Прайм') ||
           matchingDish.name.toLowerCase().includes('стейк')) &&
          !matchingDish.category.includes('Альтернативные стейки') &&
          !matchingDish.name.toLowerCase().includes('рыб') &&
          !matchingDish.name.toLowerCase().includes('форель') &&
          !matchingDish.name.toLowerCase().includes('треск') &&
          !matchingDish.name.toLowerCase().includes('дорадо') &&
          !matchingDish.name.toLowerCase().includes('сибас');
        
        // Check if it's ice cream
        const isIceCream = matchingDish.name.toLowerCase().includes('мороженое') || 
                          matchingDish.name.toLowerCase().includes('мороженное');
        
        console.log('Is steak:', isSteak, 'Is ice cream:', isIceCream);
        
        if (isSteak) {
          console.log('Showing cooking level modal');
          showCookingLevelModal(matchingDish.name, (selectedLevel) => {
            addOrderToTable(tableNumber, matchingDish, selectedLevel);
            todoInput.value = '';
            renderTodoList();
          });
        } else if (isIceCream) {
          console.log('Showing ice cream modal');
          showIceCreamFlavorModal(matchingDish.name, (selectedFlavors) => {
            addOrderToTable(tableNumber, matchingDish, null, selectedFlavors);
            todoInput.value = '';
            renderTodoList();
          });
        } else {
          addOrderToTable(tableNumber, matchingDish);
          todoInput.value = '';
          renderTodoList();
        }
      } else {
        // Create custom dish if not found
        const customDish = createCustomDish(input);
        addOrderToTable(tableNumber, customDish);
        todoInput.value = '';
        renderTodoList();
      }
    }

    function createCustomDish(name) {
      // Create a custom dish object for unknown items
      return {
        name: name,
        price: '—', // No price for custom dishes
        R_keeper: '—', // No R_keeper code for custom dishes
        category: 'Произвольное блюдо',
        composition: [],
        allergens: [],
        description: ['Блюдо добавлено вручную'],
        gramm: '—',
        kbju: '—',
        image: '-',
        isCustom: true // Flag to identify custom dishes
      };
    }

    function findDishByName(name) {
      if (!db || !db.dishes) {
        console.log('No dishes data available');
        return null;
      }
      
      const searchName = name.toLowerCase().trim();
      console.log('Searching for:', searchName);
      console.log('Available dishes count:', db.dishes.length);
      
      // Exact match first
      let match = db.dishes.find(dish => 
        dish.name.toLowerCase() === searchName
      );
      
      if (match) {
        console.log('Exact match found:', match.name);
        return match;
      }
      
      // Partial match (search term in dish name)
      match = db.dishes.find(dish => 
        dish.name.toLowerCase().includes(searchName)
      );
      
      if (match) {
        console.log('Partial match found:', match.name);
        return match;
      }
      
      // Reverse partial match (dish name in search term)
      match = db.dishes.find(dish => 
        searchName.includes(dish.name.toLowerCase())
      );
      
      if (match) {
        console.log('Reverse partial match found:', match.name);
        return match;
      }
      
      // Word match - split by spaces and find dishes containing any of the words
      const searchWords = searchName.split(' ').filter(w => w.length > 1);
      if (searchWords.length > 0) {
        match = db.dishes.find(dish => {
          const dishWords = dish.name.toLowerCase().split(' ');
          return searchWords.some(searchWord => 
            dishWords.some(dishWord => dishWord.includes(searchWord))
          );
        });
        
        if (match) {
          console.log('Word match found:', match.name);
          return match;
        }
      }
      
      // Character match - find dishes that start with the same characters
      match = db.dishes.find(dish => 
        dish.name.toLowerCase().startsWith(searchName)
      );
      
      if (match) {
        console.log('Character match found:', match.name);
        return match;
      }
      
      console.log('No match found for:', searchName);
      return null;
    }

    function showTodoNotFound(input) {
      const notFoundDiv = document.createElement('div');
      notFoundDiv.className = 'todo-not-found';
      notFoundDiv.innerHTML = `
        <div class="not-found-content">
          <div class="not-found-icon">❌</div>
          <div class="not-found-text">
            <strong>Блюдо не найдено</strong><br>
            "${input}" не найдено в меню
          </div>
          <button class="btn secondary" onclick="this.parentElement.parentElement.remove()">Закрыть</button>
        </div>
      `;
      
      todoList.appendChild(notFoundDiv);
      
      // Auto remove after 3 seconds
      setTimeout(() => {
        if (notFoundDiv.parentElement) {
          notFoundDiv.remove();
        }
      }, 3000);
    }

    function addOrderToTable(tableNum, dish, cookingLevel = null, iceCreamFlavors = null) {
      if (!tableOrders[tableNum]) {
        tableOrders[tableNum] = [];
      }
      
      // Check if it's a steak (meat, not fish) that needs cooking level (excluding alternative steaks)
      const isSteak = dish.category && 
        (dish.category.includes('стейк') || 
         dish.category.includes('Прайм') ||
         dish.name.toLowerCase().includes('стейк')) &&
        !dish.category.includes('Альтернативные стейки') &&
        !dish.name.toLowerCase().includes('рыб') &&
        !dish.name.toLowerCase().includes('форель') &&
        !dish.name.toLowerCase().includes('треск') &&
        !dish.name.toLowerCase().includes('дорадо') &&
        !dish.name.toLowerCase().includes('сибас');
      
      let itemName = dish.name;
      if (isSteak && cookingLevel) {
        itemName = `${dish.name} (${cookingLevel})`;
      }
      
      const order = {
        id: uuid(),
        itemName: itemName,
        quantity: 1,
        price: dish.price || '—',
        rkeeper: dish.R_keeper || '—',
        composition: dish.composition && dish.composition.length > 0 ? dish.composition.join(', ') : '—',
        allergens: dish.allergens && dish.allergens.length > 0 ? dish.allergens.join(', ') : '—',
        notes: '',
        createdAt: Date.now(),
        addedAt: Date.now(),
        isCustom: dish.isCustom || false, // Flag for custom dishes
        cookingLevel: cookingLevel || null, // Store cooking level for steaks
        iceCreamFlavors: iceCreamFlavors || null, // Store ice cream flavors
        category: dish.category || '', // Store category for sorting
      };
      
      // Add new items to the top
      tableOrders[tableNum].unshift(order);
      saveTableOrders();
      // Auto-sort after adding
      sortTableOrdersByCategory(tableNum);
    }

    function renderTodoList() {
      todoList.innerHTML = '';
      
      if (!tableOrders[tableNumber] || tableOrders[tableNumber].length === 0) {
        todoList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Заказов пока нет. Добавьте блюда выше</div>';
        return;
      }

      const frag = document.createDocumentFragment();
      
      // Group orders by category
      let lastCategoryGroup = null;
      
      tableOrders[tableNumber].forEach((order, index) => {
        const currentGroup = order._categoryGroup ?? getCategoryGroup(order);
        const categoryConfig = CATEGORY_CONFIG[currentGroup];
        const groupingEnabled = currentGroup && isCategoryGroupEnabled(currentGroup);
        
        // Add separator only for ENABLED category groups
        if (groupingEnabled && currentGroup) {
          if (currentGroup !== lastCategoryGroup) {
            const separator = document.createElement('div');
            separator.className = 'category-separator';
            separator.innerHTML = `
              <div class="separator-line"></div>
              <div class="separator-text">${categoryConfig?.label || 'Категория'}</div>
              <div class="separator-line"></div>
            `;
            frag.appendChild(separator);
            lastCategoryGroup = currentGroup;
          }
        } else {
          // Reset when hitting disabled categories
          if (lastCategoryGroup !== null && lastCategoryGroup < 1000) {
            lastCategoryGroup = null;
          }
        }
        const row = document.createElement('div');
        row.className = 'todo-item';

        const content = document.createElement('div');
        content.className = 'todo-content';

        const title = document.createElement('div');
        title.className = 'todo-title';
        title.textContent = order.itemName;
        
        // Add takeaway indicator
        if (order.isTakeaway) {
          const takeawayIcon = document.createElement('span');
          takeawayIcon.textContent = ' 🥡';
          takeawayIcon.className = 'takeaway-icon';
          takeawayIcon.title = 'С собой';
          title.appendChild(takeawayIcon);
        }
        
        // Add custom dish indicator
        if (order.isCustom) {
          title.style.fontStyle = 'italic';
          title.style.opacity = '0.8';
        }
        
        // Add strikethrough styling based on status
        if (order.status === 'rkeeper') {
          title.style.textDecoration = 'line-through';
          title.style.color = '#22c55e'; // Green color
        } else if (order.status === 'served') {
          title.style.textDecoration = 'line-through';
          title.style.color = '#ef4444'; // Red color
        }

        const meta = document.createElement('div');
        meta.className = 'todo-meta';
        let metaHTML = `
          <span class="todo-price">${order.price}</span>
          <span class="todo-rkeeper">R_keeper: ${order.rkeeper}</span>
        `;
        
        // Add cooking level if exists
        if (order.cookingLevel) {
          metaHTML += `<span class="todo-cooking-level">Прожарка: <strong>${order.cookingLevel}</strong></span>`;
        }
        
        // Add ice cream flavors if exists
        if (order.iceCreamFlavors) {
          metaHTML += `<span class="todo-ice-cream-flavors">Вкусы: <strong>${order.iceCreamFlavors}</strong></span>`;
        }
        
        meta.innerHTML = metaHTML;

        // Notes section
        const notesSection = document.createElement('div');
        notesSection.className = 'todo-notes-section';
        
        const notesLabel = document.createElement('div');
        notesLabel.className = 'todo-notes-label';
        notesLabel.textContent = 'Заметка:';
        
        const notesInput = document.createElement('textarea');
        notesInput.className = 'todo-notes-input';
        notesInput.placeholder = 'Добавьте заметку к блюду...';
        notesInput.value = order.notes || '';
        notesInput.rows = 2;
        notesInput.addEventListener('blur', () => {
          updateOrderNote(order.id, notesInput.value.trim());
        });
        notesInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            notesInput.blur();
          }
        });

        notesSection.appendChild(notesLabel);
        notesSection.appendChild(notesInput);

        content.appendChild(title);
        content.appendChild(meta);

        const controls = document.createElement('div');
        controls.className = 'todo-controls';

        const quantityControls = document.createElement('div');
        quantityControls.className = 'quantity-controls';

        const minusBtn = document.createElement('button');
        minusBtn.textContent = '-';
        minusBtn.className = 'btn quantity-btn';
        minusBtn.onclick = () => changeQuantity(order.id, -1);

        const quantity = document.createElement('span');
        quantity.textContent = order.quantity;
        quantity.className = 'quantity';

        const plusBtn = document.createElement('button');
        plusBtn.textContent = '+';
        plusBtn.className = 'btn quantity-btn';
        plusBtn.onclick = () => changeQuantity(order.id, 1);

        quantityControls.appendChild(minusBtn);
        quantityControls.appendChild(quantity);
        quantityControls.appendChild(plusBtn);

        const statusControls = document.createElement('div');
        statusControls.className = 'status-controls';
        
        // Takeaway button
        const takeawayBtn = document.createElement('button');
        takeawayBtn.textContent = order.isTakeaway ? '✓ 🥡' : '🥡';
        takeawayBtn.className = order.isTakeaway ? 'btn takeaway' : 'btn secondary';
        takeawayBtn.onclick = () => toggleTakeaway(order.id);
        
        // R_keeper button
        const rkeeperBtn = document.createElement('button');
        rkeeperBtn.textContent = order.status === 'rkeeper' ? '✓ R' : 'R';
        rkeeperBtn.className = order.status === 'rkeeper' ? 'btn success' : 'btn secondary';
        rkeeperBtn.onclick = () => toggleOrderStatus(order.id, 'rkeeper');
        
        // Served button
        const servedBtn = document.createElement('button');
        servedBtn.textContent = order.status === 'served' ? '✓ V' : 'V';
        servedBtn.className = order.status === 'served' ? 'btn danger' : 'btn secondary';
        servedBtn.onclick = () => toggleOrderStatus(order.id, 'served');

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Удалить';
        removeBtn.className = 'btn danger remove-btn';
        removeBtn.onclick = () => removeOrder(order.id);

        statusControls.appendChild(takeawayBtn);
        statusControls.appendChild(rkeeperBtn);
        statusControls.appendChild(servedBtn);

        controls.appendChild(quantityControls);
        controls.appendChild(statusControls);
        controls.appendChild(removeBtn);

        const mainRow = document.createElement('div');
        mainRow.className = 'todo-main-row';
        mainRow.appendChild(content);
        mainRow.appendChild(controls);
        
        row.appendChild(mainRow);
        row.appendChild(notesSection);

        frag.appendChild(row);
      });
      
      todoList.appendChild(frag);
      
    }

    function changeQuantity(orderId, delta) {
      const order = tableOrders[tableNumber].find(o => o.id === orderId);
      if (!order) return;
      
      order.quantity += delta;
      if (order.quantity <= 0) {
        removeOrder(orderId);
        return;
      }
      
      saveTableOrders();
      renderTodoList();
    }

    function removeOrder(orderId) {
      tableOrders[tableNumber] = tableOrders[tableNumber].filter(o => o.id !== orderId);
      saveTableOrders();
      renderTodoList();
    }

    function toggleOrderStatus(orderId, status) {
      const order = tableOrders[tableNumber].find(o => o.id === orderId);
      if (order) {
        // If clicking the same status, remove it (toggle off)
        if (order.status === status) {
          order.status = undefined;
        } else {
          // Set new status
          order.status = status;
        }
        sortTableOrdersByCategory(tableNumber);
        renderTodoList();
      }
    }

    function toggleTakeaway(orderId) {
      const order = tableOrders[tableNumber].find(o => o.id === orderId);
      if (order) {
        order.isTakeaway = !order.isTakeaway;
        saveTableOrders();
        renderTodoList();
      }
    }

    function updateOrderNote(orderId, note) {
      const order = tableOrders[tableNumber].find(o => o.id === orderId);
      if (order) {
        order.notes = note || '';
        saveTableOrders();
      }
    }

    // Event listeners
    addBtn.addEventListener('click', addTodoItem);

    // Add search input handler for suggestions
    todoInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      if (query.length < 2) {
        suggestionsContainer.style.display = 'none';
        return;
      }
      
      // Debounce search
      searchTimeout = setTimeout(() => {
        const matches = findMatchingDishes(query);
        renderSuggestions(matches);
      }, 150);
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!panelMenu.contains(e.target)) {
        suggestionsContainer.style.display = 'none';
      }
    });

    // Handle Enter key to select first suggestion or add item
    todoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // Prevent form submission
        const query = e.target.value.trim();
        if (query) {
          const matches = findMatchingDishes(query);
          if (matches.length > 0) {
            selectDish(matches[0]); // Select first match
            return;
          }
        }
        // If no suggestions, try to add the item
        addTodoItem();
      }
    });

    // Load dishes and initial render
    loadDb().then(({dishes}) => {
      allDishes = dishes;
      console.log('Loaded dishes for todo mode:', allDishes.length);
      renderTodoList();
    }).catch(error => {
      console.error('Failed to load dishes for todo mode:', error);
      todoList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Ошибка загрузки меню</div>';
    });

    return wrapper;
  }

  // Settings page
  function viewSettings() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    const isDarkMode = document.documentElement.classList.contains('dark');
    
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Настройки</h2>
      </div>
      
      <div class="settings-section">
        <div class="settings-item settings-item-clickable" id="dark-mode-toggle">
          <div class="settings-item-label">Тёмная тема</div>
          <div class="settings-toggle ${isDarkMode ? 'active' : ''}" id="dark-mode-switch"></div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-item settings-item-clickable" id="course-settings-btn">
          <div class="settings-item-label">Настройка курсов</div>
          <div class="settings-item-arrow">›</div>
        </div>
        <div class="settings-item settings-item-clickable" id="order-history-btn">
          <div class="settings-item-label">История заказов</div>
          <div class="settings-item-arrow">›</div>
        </div>
        <div class="settings-item settings-item-clickable" id="about-app-btn">
          <div class="settings-item-label">О приложении</div>
          <div class="settings-item-arrow">›</div>
        </div>
      </div>
    `;

    wrapper.appendChild(panel);

    // Dark mode toggle
    const darkModeToggle = wrapper.querySelector('#dark-mode-toggle');
    const darkModeSwitch = wrapper.querySelector('#dark-mode-switch');
    darkModeToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      darkModeSwitch.classList.toggle('active', isDark);
      saveDarkMode(isDark);
    });

    // Course settings button
    wrapper.querySelector('#course-settings-btn').addEventListener('click', () => {
      navigate('#/course-settings');
    });

    // Order history button
    wrapper.querySelector('#order-history-btn').addEventListener('click', () => {
      navigate('#/order-history');
    });

    // About app button
    wrapper.querySelector('#about-app-btn').addEventListener('click', () => {
      navigate('#/about');
    });

    return wrapper;
  }

  // About app page
  function viewAbout() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <button class="back-btn" id="about-back">‹</button>
        <h2 style="flex: 1; text-align: center; margin: 0;">О приложении</h2>
        <div style="width: 40px;"></div>
      </div>
      
      <div class="settings-section">
        <div class="settings-item">
          <div class="settings-item-label">Версия</div>
          <div class="settings-item-value">${getAppVersion()}</div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">BullTeam PWA</div>
          <div class="settings-item-value">Система управления заказами</div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Данные</h3>
        <div class="settings-item">
          <button id="clear-cache-btn" class="btn secondary">Очистить кэш</button>
        </div>
        
        <div class="settings-item">
          <button id="export-data-btn" class="btn secondary">Экспорт данных</button>
        </div>
        <div class="settings-item">
          <button id="import-data-btn" class="btn secondary">Импорт данных</button>
          <input type="file" id="import-file" accept="application/json" style="display:none;" />
        </div>
        
        <div class="settings-item">
          <button id="reset-app-btn" class="btn danger">Сбросить приложение</button>
        </div>
      </div>
    `;

    wrapper.appendChild(panel);

    // Back button
    wrapper.querySelector('#about-back').addEventListener('click', () => {
      navigate('#/settings');
    });

    // Event handlers
    wrapper.querySelector('#clear-cache-btn').addEventListener('click', () => {
      showConfirmModal(
        'Очистить кэш',
        'Это действие очистит все кэшированные данные и перезагрузит приложение. Продолжить?',
        () => {
          window.clearCache();
        }
      );
    });
    
    wrapper.querySelector('#export-data-btn').addEventListener('click', () => {
      const data = {
        tables: activeTables,
        orders: tableOrders,
        orderHistory,
        profile,
        meta,
        exportDate: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bullteam-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const importBtn = wrapper.querySelector('#import-data-btn');
    const importFile = wrapper.querySelector('#import-file');
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.tables)) {
          const set = new Set(activeTables);
          data.tables.forEach(n => set.add(n));
          activeTables = Array.from(set).sort((a,b)=>a-b);
          saveTables();
        }
        if (data.orders && typeof data.orders === 'object') {
          tableOrders = { ...tableOrders, ...data.orders };
          saveTableOrders();
        }
        if (Array.isArray(data.orderHistory)) {
          const existing = new Set(orderHistory.map(h => `${h.table}-${h.closedAt}-${h.total}`));
          const merged = [...orderHistory];
          for (const h of data.orderHistory) {
            const key = `${h.table}-${h.closedAt}-${h.total}`;
            if (!existing.has(key)) merged.push(h);
          }
          orderHistory = merged.sort((a,b) => (a.closedAt||0) - (b.closedAt||0));
          saveOrderHistory();
        }
        if (data.profile && typeof data.profile === 'object') {
          profile = { ...profile, ...data.profile };
          saveProfile();
        }
        if (data.meta && typeof data.meta === 'object') {
          meta = { ...meta, ...data.meta };
          saveMeta();
        }
        alert('Импорт завершён');
        render();
      } catch (e) {
        alert('Ошибка импорта: ' + e.message);
      } finally {
        importFile.value = '';
      }
    });

    wrapper.querySelector('#reset-app-btn').addEventListener('click', () => {
      showConfirmModal(
        'Сбросить приложение',
        'Это действие удалит ВСЕ данные: столы, заказы, настройки. Действие необратимо! Продолжить?',
        () => {
          localStorage.clear();
          location.reload();
        }
      );
    });

    return wrapper;
  }

  // Course settings page
  function viewCourseSettings() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <button class="back-btn" id="course-settings-back">‹</button>
        <h2 style="flex: 1; text-align: center; margin: 0;">Настройка курсов</h2>
        <div style="width: 40px;"></div>
      </div>
      
      <div class="settings-section">
        <h3>Группировка блюд</h3>
        <div class="settings-item">
          <div class="settings-item-label">Напитки</div>
          <div class="settings-toggle ${categoryGrouping.drinks ? 'active' : ''}" data-category-toggle="drinks"></div>
        </div>
        <div class="settings-item">
          <div class="settings-item-label">Холодные блюда</div>
          <div class="settings-toggle ${categoryGrouping.cold ? 'active' : ''}" data-category-toggle="cold"></div>
        </div>
        <div class="settings-item">
          <div class="settings-item-label">Горячие блюда</div>
          <div class="settings-toggle ${categoryGrouping.hot ? 'active' : ''}" data-category-toggle="hot"></div>
        </div>
        <div class="settings-item">
          <div class="settings-item-label">Десерты</div>
          <div class="settings-toggle ${categoryGrouping.dessert ? 'active' : ''}" data-category-toggle="dessert"></div>
        </div>
      </div>
    `;

    wrapper.appendChild(panel);

    // Back button
    wrapper.querySelector('#course-settings-back').addEventListener('click', () => {
      navigate('#/settings');
    });

    // Category toggles
    wrapper.querySelectorAll('[data-category-toggle]').forEach(toggle => {
      const key = toggle.dataset.categoryToggle;
      toggle.addEventListener('click', () => {
        const currentValue = categoryGrouping[key] !== false;
        const nextValue = !currentValue;
        categoryGrouping[key] = nextValue;
        toggle.classList.toggle('active', nextValue);
        saveCategoryGrouping();
        reapplyCategoryGroupingToAllTables();
      });
    });
    
    return wrapper;
  }

  // Order history page
  function viewOrderHistory() {
    const wrapper = document.createElement('div');
    wrapper.className = 'page';

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <button class="back-btn" id="order-history-back">‹</button>
        <h2 style="flex: 1; text-align: center; margin: 0;">История заказов</h2>
        <div style="width: 40px;"></div>
      </div>
      
      <div class="settings-section" style="padding-top: 0;">
        <div class="settings-item">
          <input id="history-search" class="filter-input" placeholder="Поиск по названию стола или блюду" />
        </div>
      </div>
      
      <div id="history-list" class="order-history-list"></div>
    `;

    wrapper.appendChild(panel);

    // Back button
    wrapper.querySelector('#order-history-back').addEventListener('click', () => {
      navigate('#/settings');
    });

    // Render order history grouped by date
    const historySearch = wrapper.querySelector('#history-search');
    const historyList = wrapper.querySelector('#history-list');
    
    function renderHistory(filter = '') {
      const norm = (filter || '').toLowerCase().trim();
      const items = (orderHistory || []).slice().sort((a,b) => (b.closedAt||0) - (a.closedAt||0));
      const filtered = items.filter(h => {
        if (!norm) return true;
        const t = `${h.tableName || ''} ${h.table}`.toLowerCase();
        const hasDish = (h.items || []).some(i => (i.itemName || '').toLowerCase().includes(norm));
        return t.includes(norm) || hasDish;
      });

      if (filtered.length === 0) {
        historyList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted-foreground);">Пока нет записей</div>';
        return;
      }

      // Group by date
      const groupedByDate = {};
      filtered.forEach(h => {
        const dt = h.closedAt || h.updatedAt || h.createdAt || Date.now();
        const d = new Date(dt);
        const dateKey = d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        
        if (!groupedByDate[dateKey]) {
          groupedByDate[dateKey] = [];
        }
        groupedByDate[dateKey].push(h);
      });

      historyList.innerHTML = '';
      
      Object.entries(groupedByDate).forEach(([dateKey, orders]) => {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'order-history-date-header';
        dateHeader.textContent = dateKey;
        historyList.appendChild(dateHeader);

        orders.forEach(h => {
          const row = document.createElement('div');
          row.className = 'history-row';
          const dt = h.closedAt || h.updatedAt || h.createdAt || Date.now();
          const d = new Date(dt);
          row.innerHTML = `
            <div class="history-card">
              <div class="history-row-main">
                <div class="history-title">${h.tableName || ('Стол ' + h.table)}</div>
                <div class="history-meta">${d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</div>
                <div class="history-total">${h.total || 0} ₽</div>
              </div>
              <div class="history-items" style="display:none;">${(h.items||[]).map(i => `${i.itemName} ×${i.quantity}`).join(', ') || '—'}</div>
            </div>`;
          row.addEventListener('click', () => {
            const el = row.querySelector('.history-items');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
          });
          historyList.appendChild(row);
        });
      });
    }
    
    renderHistory('');
    historySearch.addEventListener('input', (e) => renderHistory(e.target.value));
    
    return wrapper;
  }

  // Profile page
  function viewProfile() {
    const wrapper = document.createElement('div');
    wrapper.className = 'profile-content';
    
    const metrics = computeMonthlyMetrics(new Date());
    const p = {
      name: profile.name || '',
      surname: profile.surname || '',
      role: profile.role || '',
      grade: profile.grade || '',
      location: profile.location || ''
    };
    const photoUrl = profile.photo ? `data:image/jpeg;base64,${profile.photo}` : null;
    const displayName = (p.surname && p.name) ? `${p.surname} ${p.name}` : (p.name || p.surname || 'Имя');

    wrapper.innerHTML = `
      <div class="profile-header-compact">
        <div class="profile-avatar-wrapper">
          <div class="profile-avatar" id="profile-avatar">
            ${photoUrl ? `<img src="${photoUrl}" alt="Фото профиля" class="avatar-image" />` : '<span class="avatar-placeholder">👤</span>'}
          </div>
          <label for="pf-photo" class="profile-photo-add-btn" title="Добавить фото">
            <span>+</span>
          </label>
          <input type="file" id="pf-photo" accept="image/*" style="display:none;" />
        </div>
        <div class="profile-name-compact">${displayName}</div>
      </div>

      <div class="profile-form-compact">
        <div class="profile-form-row">
          <div class="profile-form-field">
            <label for="pf-surname">Фамилия</label>
            <input id="pf-surname" value="${p.surname}" placeholder="Фамилия" />
          </div>
          <div class="profile-form-field">
            <label for="pf-name">Имя</label>
            <input id="pf-name" value="${p.name}" placeholder="Имя" />
          </div>
        </div>
        <div class="profile-form-field">
          <label for="pf-role">Должность</label>
          <input id="pf-role" value="${p.role}" placeholder="официант" />
        </div>
        <div class="profile-form-field">
          <label for="pf-grade">Грейд</label>
          <input id="pf-grade" value="${p.grade}" placeholder="—" />
        </div>
        <div class="profile-form-field">
          <label for="pf-location">Место работы</label>
          <input id="pf-location" value="${p.location}" placeholder="Напр.: Бык Дмитровка" />
        </div>
        <button id="pf-save" class="btn primary" style="width: 100%; margin-top: 12px;">Сохранить</button>
      </div>

      <div class="panel" style="margin-top: 16px;">
        <div class="panel-header"><h2>Смены</h2></div>
        <div id="shifts-calendar-container"></div>
      </div>

      <div class="panel" style="margin-top: 12px;">
        <div class="panel-header"><h2>Продажи за месяц</h2></div>
        <div class="settings-item"><div class="settings-item-label">Кол-во столов</div><div class="settings-item-value">${metrics.numTables}</div></div>
        <div class="settings-item"><div class="settings-item-label">Выручка</div><div class="settings-item-value">${metrics.revenue} ₽</div></div>
        <div class="settings-item"><div class="settings-item-label">Средний чек (1 стол)</div><div class="settings-item-value">${metrics.averageCheck} ₽</div></div>
        <div class="settings-item"><div class="settings-item-label">Топ‑3 блюда</div>
          <div class="settings-item-value">${metrics.top3.map(t => `${t.name} ×${t.qty}`).join(', ') || '—'}</div>
        </div>
      </div>
    `;
    
    // Special handlers for table mode toggles - DISABLED
    // const searchModeToggle = wrapper.querySelector('#search-mode-toggle');
    // const todoModeToggle = wrapper.querySelector('#todo-mode-toggle');
    
    // Set initial state - DISABLED
    // searchModeToggle.classList.toggle('active', tableMode === 'search');
    // todoModeToggle.classList.toggle('active', tableMode === 'todo');
    
    // searchModeToggle.addEventListener('click', () => {
    //   tableMode = 'search';
    //   searchModeToggle.classList.add('active');
    //   todoModeToggle.classList.remove('active');
    //   saveTableMode();
    // });
    
    // todoModeToggle.addEventListener('click', () => {
    //   tableMode = 'todo';
    //   todoModeToggle.classList.add('active');
    //   searchModeToggle.classList.remove('active');
    //   saveTableMode();
    // });
    
    // Photo upload handler
    const photoInput = wrapper.querySelector('#pf-photo');
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('Фото слишком большое (макс. 2 МБ)');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result.split(',')[1];
        profile.photo = base64;
        saveProfile();
        render();
      };
      reader.readAsDataURL(file);
    });

    // Save profile
    wrapper.querySelector('#pf-save').addEventListener('click', () => {
      profile.name = (wrapper.querySelector('#pf-name').value || '').trim();
      profile.surname = (wrapper.querySelector('#pf-surname').value || '').trim();
      profile.role = (wrapper.querySelector('#pf-role').value || '').trim();
      profile.grade = (wrapper.querySelector('#pf-grade').value || '').trim();
      profile.location = (wrapper.querySelector('#pf-location').value || '').trim();
      saveProfile();
      render();
    });

    // Initialize calendar
    initShiftsCalendar(wrapper.querySelector('#shifts-calendar-container'));
    
    return wrapper;
  }

  // Shifts calendar functions
  function initShiftsCalendar(container) {
    let currentDate = new Date();
    currentDate.setDate(1); // Start of month

    function renderCalendar() {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      
      // Get first day of month and number of days
      let firstDay = new Date(year, month, 1).getDay();
      // Convert Sunday (0) to 7, then subtract 1 to make Monday = 0
      firstDay = firstDay === 0 ? 6 : firstDay - 1;
      
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();
      
      let html = `
        <div class="calendar-header">
          <button class="calendar-nav-btn" id="calendar-prev">‹</button>
          <div class="calendar-month-year">${monthNames[month]} ${year}</div>
          <button class="calendar-nav-btn" id="calendar-next">›</button>
        </div>
        <div class="calendar-grid">
          <div class="calendar-days-header">
            ${dayNames.map(day => `<div class="calendar-day-header">${day}</div>`).join('')}
          </div>
          <div class="calendar-days">
      `;
      
      // Previous month days
      for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="calendar-day calendar-day-other">${day}</div>`;
      }
      
      // Current month days
      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const shiftValue = shifts[dateKey] || 0;
        const isFullShift = shiftValue === 1;
        const isHalfShift = shiftValue === 0.5;
        const hasShift = isFullShift || isHalfShift;
        
        html += `
          <div class="calendar-day calendar-day-current ${hasShift ? 'calendar-day-has-shift' : ''}" 
               data-date="${dateKey}" 
               data-shift="${shiftValue}">
            <span class="calendar-day-number">${day}</span>
            ${isFullShift ? '<div class="calendar-shift-full"></div>' : ''}
            ${isHalfShift ? '<div class="calendar-shift-half"></div>' : ''}
          </div>
        `;
      }
      
      // Next month days (fill remaining cells to complete grid)
      const totalCells = firstDay + daysInMonth;
      const remainingCells = Math.ceil(totalCells / 7) * 7 - totalCells;
      for (let day = 1; day <= remainingCells; day++) {
        html += `<div class="calendar-day calendar-day-other">${day}</div>`;
      }
      
      html += `
          </div>
        </div>
        <div class="calendar-legend">
          <div class="calendar-legend-item">
            <div class="calendar-legend-box calendar-legend-full"></div>
            <span>Полная смена</span>
          </div>
          <div class="calendar-legend-item">
            <div class="calendar-legend-box calendar-legend-half"></div>
            <span>Пол смены</span>
          </div>
          <div class="calendar-legend-hint">Нажмите на дату для изменения смены</div>
        </div>
      `;
      
      container.innerHTML = html;
      
      // Event listeners
      container.querySelector('#calendar-prev').addEventListener('click', () => {
        currentDate.setMonth(month - 1);
        renderCalendar();
      });
      
      container.querySelector('#calendar-next').addEventListener('click', () => {
        currentDate.setMonth(month + 1);
        renderCalendar();
      });
      
      // Day click handlers
      container.querySelectorAll('.calendar-day-current').forEach(dayEl => {
        dayEl.addEventListener('click', () => {
          const dateKey = dayEl.dataset.date;
          const currentShift = shifts[dateKey] || 0;
          
          // Cycle: no shift -> half shift -> full shift -> no shift
          let newShift = 0;
          if (currentShift === 0) {
            newShift = 0.5;
          } else if (currentShift === 0.5) {
            newShift = 1;
          } else {
            newShift = 0;
          }
          
          if (newShift === 0) {
            delete shifts[dateKey];
          } else {
            shifts[dateKey] = newShift;
          }
          
          saveShifts();
          renderCalendar();
        });
      });
    }
    
    renderCalendar();
  }

  // Navigation event handlers
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) {
      const navItem = e.target.closest('.nav-item');
      const page = navItem.dataset.page;
      if (page) {
        setPage(page);
      }
    }
  });

  // init
  loadState();
  reapplyCategoryGroupingToAllTables();
  ensureMonthlyPurge(31);
  updateNavItems();
  render();
})();



