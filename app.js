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
    learnProgress: 'waiter.learnProgress'
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
  /** @type {{ name?: string, role?: string, grade?: string, location?: string }} */
  let profile = {};
  /** @type {{dishes:any[]} | null} */
  let db = null;
  
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
  }
  function saveTableOrders() { localStorage.setItem(STORAGE_KEYS.tableOrders, JSON.stringify(tableOrders)); }
  function saveTables() { localStorage.setItem(STORAGE_KEYS.tables, JSON.stringify(activeTables)); }
  function saveTableMode() { localStorage.setItem(STORAGE_KEYS.tableMode, tableMode); }
  function saveTableNames() { localStorage.setItem(STORAGE_KEYS.tableNames, JSON.stringify(tableNames)); }
  function saveOrderHistory() { localStorage.setItem(STORAGE_KEYS.orderHistory, JSON.stringify(orderHistory)); }
  function saveMeta() { localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify(meta)); }
  function saveProfile() { localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile)); }

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

  async function loadDb(forceReload = false) {
    if (db && !forceReload) return db;
    try {
  // Try to load from embedded data first
  if (typeof DISHES_DATA !== 'undefined') {
    db = DISHES_DATA;
    console.log('Loaded dishes from embedded data:', db.dishes.length, 'dishes');
    
    // Add bar drinks if available
    if (typeof BAR_DRINKS_DATA !== 'undefined') {
      db.dishes = [...db.dishes, ...BAR_DRINKS_DATA.dishes];
      console.log('Added bar drinks:', BAR_DRINKS_DATA.dishes.length, 'drinks');
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
    
    // 1. Напитки (алкогольные и безалкогольные)
    const drinkKeywords = [
      'напиток', 'сок', 'чай', 'кофе', 'вода', 'лимонад', 'компот', 'морс', 'коктейль',
      'пиво', 'вино', 'водка', 'коньяк', 'виски', 'ром', 'джин', 'текила', 'шампанское',
      'кола', 'пепси', 'спрайт', 'фанта', 'миринда', 'энергетик', 'газировка',
      'молоко', 'кефир', 'йогурт', 'ряженка', 'снежок', 'тан', 'айран', 'латте', 'капучино',
      'эспрессо', 'американо', 'раф', 'фраппе', 'глясе', 'безалкогольн', 'алкогольн', 'bar'
    ];
    
    if (drinkKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword))) {
      return 1; // Напитки
    }
    
    // 3. Горячие блюда (стейки, хоспер, гриль) - проверяем раньше холодных закусок
    const hotDishKeywords = [
      'стейк', 'хоспер', 'гриль', 'жарен', 'тушен', 'томлен', 'запечен',
      'прайм', 'рибай', 'филе миньон', 'стриплойн', 'тибон', 'портерхаус',
      'суп', 'бульон', 'харчо', 'солянка', 'окрошка', 'гаспачо',
      'паста', 'ризотто', 'рагу', 'жаркое'
    ];
    
    if (hotDishKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword))) {
      return 3; // Горячие блюда
    }
    
    // 4. Десерты
    const dessertKeywords = [
      'десерт', 'торт', 'пирог', 'мороженое', 'сорбет', 'чизкейк', 'тирамису', 
      'панна котта', 'крем', 'суфле', 'мусс', 'штрудель', 'печенье', 'круассан',
      'пирожное', 'эклер', 'макарун', 'брауни', 'кекс', 'маффин'
    ];
    
    if (dessertKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword))) {
      return 4; // Десерты
    }
    
    // 2. Холодные блюда и закуски (все остальное - салаты, закуски, стрипсы и т.д.)
    return 2; // Холодные блюда и закуски
  }

  // Helpers to compute totals
  function parsePriceToNumber(text) {
    const m = String(text || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function computeTableTotalAmount(tableNum) {
    const items = Array.isArray(tableOrders[tableNum]) ? tableOrders[tableNum] : [];
    return items.reduce((sum, o) => {
      const unit = parsePriceToNumber(o.calculatedPrice) || parsePriceToNumber(o.price);
      const qty = o.quantity || 1;
      return sum + unit * qty;
    }, 0);
  }
  
  // Function to sort table orders by category
  function sortTableOrdersByCategory(tableNum) {
    if (!tableOrders[tableNum] || tableOrders[tableNum].length === 0) {
      return;
    }
    
    // Add category group to each order for sorting
    tableOrders[tableNum].forEach(order => {
      order._categoryGroup = getCategoryGroup(order);
    });
    
    // Sort by category group, then by addedAt (newest first within each group)
    tableOrders[tableNum].sort((a, b) => {
      if (a._categoryGroup !== b._categoryGroup) {
        return a._categoryGroup - b._categoryGroup;
      }
      return (b.addedAt || 0) - (a.addedAt || 0);
    });
    
    saveTableOrders();
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
            sort: saved.sort || 'relevance'
          };
          categoryFilter.value = currentFilters.category;
          priceMin.value = currentFilters.priceMin ?? '';
          priceMax.value = currentFilters.priceMax ?? '';
          calorieMin.value = currentFilters.calorieMin ?? '';
          calorieMax.value = currentFilters.calorieMax ?? '';
          allergensExcludeInput.value = (currentFilters.allergensExclude || []).join(', ');
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
        sort: 'relevance'
      };
      
      categoryFilter.value = '';
      priceMin.value = '';
      priceMax.value = '';
      calorieMin.value = '';
      calorieMax.value = '';
      allergensExcludeInput.value = '';
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
    const wrapper = document.createElement('div');
    wrapper.className = 'page';
    
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Изучение меню</h2>
      </div>
      <div class="learn-controls" style="display:flex; gap:8px; padding:12px;">
        <select id="learn-source" class="filter-select">
          <option value="all">Все блюда</option>
          <option value="kitchen">Кухня</option>
          <option value="bar">Бар</option>
        </select>
        <button id="learn-start" class="btn primary">Старт</button>
        <div id="learn-stats" style="margin-left:auto; color:var(--muted);">—</div>
      </div>
      <div id="learn-card" class="learn-card" style="padding:16px; text-align:center; display:none;">
        <div class="learn-name" style="font-size:20px; font-weight:600;"></div>
        <div class="learn-category" style="color:var(--muted); margin-top:4px;"></div>
        <div class="learn-hidden" style="display:none; margin-top:12px; text-align:left;">
          <div class="learn-comp"></div>
          <div class="learn-all"></div>
          <div class="learn-kcal"></div>
          <div class="learn-rk"></div>
        </div>
        <div class="learn-actions" style="display:flex; gap:8px; justify-content:center; margin-top:12px;">
          <button id="learn-reveal" class="btn secondary">Показать</button>
          <button id="learn-know" class="btn success" disabled>Знаю</button>
          <button id="learn-dont" class="btn danger" disabled>Не знаю</button>
          <button id="learn-next" class="btn" disabled>Далее</button>
        </div>
      </div>
    `;
    wrapper.appendChild(panel);

    let pool = [];
    let idx = 0;
    let progress = { correct: 0, wrong: 0 };
    try { progress = JSON.parse(localStorage.getItem(STORAGE_KEYS.learnProgress) || '{"correct":0,"wrong":0}'); } catch {}
    const statsEl = panel.querySelector('#learn-stats');
    const cardEl = panel.querySelector('#learn-card');
    const nameEl = panel.querySelector('.learn-name');
    const catEl = panel.querySelector('.learn-category');
    const hiddenEl = panel.querySelector('.learn-hidden');
    const compEl = panel.querySelector('.learn-comp');
    const allEl = panel.querySelector('.learn-all');
    const kcalEl = panel.querySelector('.learn-kcal');
    const rkEl = panel.querySelector('.learn-rk');
    const revealBtn = panel.querySelector('#learn-reveal');
    const knowBtn = panel.querySelector('#learn-know');
    const dontBtn = panel.querySelector('#learn-dont');
    const nextBtn = panel.querySelector('#learn-next');
    const sourceSel = panel.querySelector('#learn-source');
    const startBtn = panel.querySelector('#learn-start');

    const updateStats = () => {
      statsEl.textContent = `Верно: ${progress.correct} · Ошибки: ${progress.wrong}`;
      try { localStorage.setItem(STORAGE_KEYS.learnProgress, JSON.stringify(progress)); } catch {}
    };
    updateStats();

    function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

    function loadPool() {
      return loadDb().then(({dishes}) => {
        let items = dishes;
        if (sourceSel.value === 'kitchen') items = dishes.filter(d => d.source !== 'bar');
        if (sourceSel.value === 'bar') items = dishes.filter(d => d.source === 'bar');
        pool = shuffle(items.slice());
        idx = 0;
      });
    }

    function renderCard() {
      if (!pool.length || idx >= pool.length) {
        cardEl.style.display = '';
        nameEl.textContent = 'Готово!';
        catEl.textContent = 'Карточки закончились — нажмите Старт';
        hiddenEl.style.display = 'none';
        revealBtn.disabled = true; knowBtn.disabled = true; dontBtn.disabled = true; nextBtn.disabled = true;
        return;
      }
      const d = pool[idx];
      cardEl.style.display = '';
      nameEl.textContent = d.name;
      catEl.textContent = d.category || '';
      compEl.textContent = d.composition && d.composition.length ? `Состав: ${d.composition.join(', ')}` : '';
      allEl.textContent = d.allergens && d.allergens.length ? `Аллергены: ${d.allergens.join(', ')}` : '';
      const kcal = d.kbju && /К[.:\s]*(\d+)/i.test(d.kbju) ? parseInt(d.kbju.match(/К[.:\s]*(\d+)/i)[1]) : null;
      kcalEl.textContent = kcal ? `Калории: ${kcal}` : '';
      rkEl.textContent = d.R_keeper ? `R_keeper: ${d.R_keeper}` : '';
      hiddenEl.style.display = 'none';
      revealBtn.disabled = false; knowBtn.disabled = true; dontBtn.disabled = true; nextBtn.disabled = true;
    }

    revealBtn.addEventListener('click', () => {
      hiddenEl.style.display = '';
      knowBtn.disabled = false; dontBtn.disabled = false; nextBtn.disabled = false; revealBtn.disabled = true;
    });
    knowBtn.addEventListener('click', () => { progress.correct++; updateStats(); });
    dontBtn.addEventListener('click', () => { progress.wrong++; updateStats(); });
    nextBtn.addEventListener('click', () => { idx++; renderCard(); });
    startBtn.addEventListener('click', () => { loadPool().then(renderCard); });
    
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
              const total = items.reduce((sum, o) => sum + (Number(o.price || o.Price || 0) * (o.quantity || 1)), 0);
              const snapshot = {
                table: n,
                tableName: getTableDisplayName(n),
                items: items.map(i => ({
                  id: i.id,
                  itemName: i.itemName || i.name || i.Name || '',
                  quantity: i.quantity || 1,
                  price: Number(i.price || i.Price || 0),
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
        list.innerHTML = '';
        if (!tableOrders[tableNumber] || tableOrders[tableNumber].length === 0) {
          list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">Заказов пока нет. Начните поиск блюд выше</div>';
          return;
        }

        const frag = document.createDocumentFragment();
        
        // Group orders by category
        let lastCategoryGroup = -1;
        const categoryNames = {
          1: 'Напитки',
          2: 'Холодные блюда и закуски',
          3: 'Горячие блюда',
          4: 'Десерты'
        };
        
        tableOrders[tableNumber].forEach((order, index) => {
          const currentGroup = getCategoryGroup(order);
          
          // Add separator between different category groups
          if (index > 0 && currentGroup !== lastCategoryGroup) {
            const separator = document.createElement('div');
            separator.className = 'category-separator';
            separator.innerHTML = `
              <div class="separator-line"></div>
              <div class="separator-text">${categoryNames[currentGroup] || 'Другое'}</div>
              <div class="separator-line"></div>
            `;
            frag.appendChild(separator);
          } else if (index === 0 && tableOrders[tableNumber].length > 1) {
            // Add first category label
            const separator = document.createElement('div');
            separator.className = 'category-separator';
            separator.innerHTML = `
              <div class="separator-line"></div>
              <div class="separator-text">${categoryNames[currentGroup] || 'Другое'}</div>
              <div class="separator-line"></div>
            `;
            frag.appendChild(separator);
          }
          
          lastCategoryGroup = currentGroup;
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
            saveTableOrders();
            renderTableOrders();
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
              category: d.category || '' // Store category for sorting
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
      // Add the dish to table
      addOrderToTable(tableNumber, dish);
      
      // Clear input and hide suggestions
      todoInput.value = '';
      suggestionsContainer.style.display = 'none';
      
      // Re-render the list
      renderTodoList();
    }

    function addTodoItem() {
      const input = todoInput.value.trim();
      if (!input) return;

      // Try to find matching dish
      const matchingDish = findDishByName(input);
      
      if (matchingDish) {
        // Check if it's a steak that needs cooking level
        const isSteak = matchingDish.category && 
          (matchingDish.category.includes('стейк') || 
           matchingDish.category.includes('Прайм') || 
           matchingDish.category.includes('Альтернативные стейки') ||
           matchingDish.name.toLowerCase().includes('стейк')) &&
          !matchingDish.name.toLowerCase().includes('рыб') &&
          !matchingDish.name.toLowerCase().includes('форель') &&
          !matchingDish.name.toLowerCase().includes('треск') &&
          !matchingDish.name.toLowerCase().includes('дорадо') &&
          !matchingDish.name.toLowerCase().includes('сибас');
        
        if (isSteak) {
          showCookingLevelDialog(matchingDish);
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

    function showCookingLevelDialog(dish) {
      const cookingLevels = [
        { value: 'Blue', label: '1. Blue (с кровью)' },
        { value: 'Rare', label: '2. Rare (с кровью)' },
        { value: 'Medium Rare', label: '3. Medium Rare (с кровью)' },
        { value: 'Medium', label: '4. Medium (розовое мясо)' },
        { value: 'Medium Well', label: '5. Medium Well (слегка розовое)' },
        { value: 'Well Done', label: '6. Well Done (прожаренное)' }
      ];

      // Create modal dialog
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
      `;

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
      `;

      dialog.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #333;">Выберите прожарку для "${dish.name}"</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${cookingLevels.map(level => `
            <button class="cooking-level-btn" data-level="${level.value}" style="
              padding: 12px;
              border: 2px solid #e0e0e0;
              background: white;
              border-radius: 6px;
              cursor: pointer;
              text-align: left;
              transition: all 0.2s;
            ">${level.label}</button>
          `).join('')}
        </div>
        <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
          <button id="cancel-cooking" style="
            padding: 8px 16px;
            border: 1px solid #ccc;
            background: white;
            border-radius: 4px;
            cursor: pointer;
          ">Отмена</button>
        </div>
      `;

      modal.appendChild(dialog);
      document.body.appendChild(modal);

      // Add event listeners
      dialog.querySelectorAll('.cooking-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const level = btn.dataset.level;
          addOrderToTable(tableNumber, dish, level);
          todoInput.value = '';
          renderTodoList();
          document.body.removeChild(modal);
        });

        btn.addEventListener('mouseenter', () => {
          btn.style.borderColor = '#007bff';
          btn.style.backgroundColor = '#f8f9fa';
        });

        btn.addEventListener('mouseleave', () => {
          btn.style.borderColor = '#e0e0e0';
          btn.style.backgroundColor = 'white';
        });
      });

      document.getElementById('cancel-cooking').addEventListener('click', () => {
        document.body.removeChild(modal);
      });

      // Close on outside click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          document.body.removeChild(modal);
        }
      });
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

    function addOrderToTable(tableNum, dish, cookingLevel = null) {
      if (!tableOrders[tableNum]) {
        tableOrders[tableNum] = [];
      }
      
      // Check if it's a steak (meat, not fish) that needs cooking level
      const isSteak = dish.category && 
        (dish.category.includes('стейк') || 
         dish.category.includes('Прайм') || 
         dish.category.includes('Альтернативные стейки') ||
         dish.name.toLowerCase().includes('стейк')) &&
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
      let lastCategoryGroup = -1;
      const categoryNames = {
        1: 'Напитки',
        2: 'Холодные блюда и закуски',
        3: 'Горячие блюда',
        4: 'Десерты'
      };
      
      tableOrders[tableNumber].forEach((order, index) => {
        const currentGroup = getCategoryGroup(order);
        
        // Add separator between different category groups
        if (index > 0 && currentGroup !== lastCategoryGroup) {
          const separator = document.createElement('div');
          separator.className = 'category-separator';
          separator.innerHTML = `
            <div class="separator-line"></div>
            <div class="separator-text">${categoryNames[currentGroup] || 'Другое'}</div>
            <div class="separator-line"></div>
          `;
          frag.appendChild(separator);
        } else if (index === 0 && tableOrders[tableNumber].length > 1) {
          // Add first category label
          const separator = document.createElement('div');
          separator.className = 'category-separator';
          separator.innerHTML = `
            <div class="separator-line"></div>
            <div class="separator-text">${categoryNames[currentGroup] || 'Другое'}</div>
            <div class="separator-line"></div>
          `;
          frag.appendChild(separator);
        }
        
        lastCategoryGroup = currentGroup;
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
        meta.innerHTML = `
          <span class="todo-price">${order.price}</span>
          <span class="todo-rkeeper">R_keeper: ${order.rkeeper}</span>
        `;

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
        saveTableOrders();
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

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Настройки</h2>
      </div>
      
      <div class="settings-section">
        <h3>Приложение</h3>
        <div class="settings-item">
          <div class="settings-item-label">Версия</div>
          <div class="settings-item-value">${getAppVersion()}</div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">Всего столов</div>
          <div class="settings-item-value">${activeTables.length}</div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">Всего заказов</div>
          <div class="settings-item-value">${Object.values(tableOrders).reduce((sum, orders) => sum + (orders ? orders.length : 0), 0)}</div>
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

      <div class="settings-section">
        <h3>Информация</h3>
        <div class="settings-item">
          <div class="settings-item-label">BullTeam PWA</div>
          <div class="settings-item-value">Система управления заказами</div>
        </div>
      </div>

      <div class="settings-section">
        <h3>История заказов</h3>
        <div class="settings-item">
          <input id="history-search" class="filter-input" placeholder="Поиск по названию стола или блюду" />
        </div>
        <div id="history-list" class="history-list"></div>
      </div>
    `;

    wrapper.appendChild(panel);
    // Render order history
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
      const subset = filtered.slice(0, 20);
      historyList.innerHTML = subset.length ? '' : '<div style="color: var(--muted);">Пока нет записей</div>';
      subset.forEach(h => {
        const row = document.createElement('div');
        row.className = 'history-row';
        const dt = h.closedAt || h.updatedAt || h.createdAt || Date.now();
        const d = new Date(dt);
        row.innerHTML = `
          <div class="history-card">
            <div class="history-row-main">
              <div class="history-title">${h.tableName || ('Стол ' + h.table)}</div>
              <div class="history-meta">${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</div>
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
    }
    renderHistory('');
    historySearch.addEventListener('input', (e) => renderHistory(e.target.value));

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

  // Profile page
  function viewProfile() {
    const wrapper = document.createElement('div');
    wrapper.className = 'profile-content';
    
    const metrics = computeMonthlyMetrics(new Date());
    const p = {
      name: profile.name || 'Имя',
      role: profile.role || 'официант',
      grade: profile.grade || '—',
      location: profile.location || '—'
    };

    wrapper.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">👤</div>
        <div class="profile-name">${p.name}</div>
        <div class="profile-role">${p.role}</div>
      </div>

      <div class="panel" style="margin-bottom:12px;">
        <div class="panel-header"><h2>Профиль</h2></div>
        <div class="settings-item"><div class="settings-item-label">Имя</div><input id="pf-name" value="${p.name}" /></div>
        <div class="settings-item"><div class="settings-item-label">Роль</div><input id="pf-role" value="${p.role}" /></div>
        <div class="settings-item"><div class="settings-item-label">Грейд</div><input id="pf-grade" value="${p.grade}" /></div>
        <div class="settings-item"><div class="settings-item-label">Локация</div><input id="pf-location" value="${p.location}" placeholder="Напр.: Бык Дмитровка" /></div>
        <div style="padding:12px; display:flex; gap:8px; justify-content:flex-end;">
          <button id="pf-save" class="btn primary">Сохранить</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h2>Метрики месяца</h2></div>
        <div class="settings-item"><div class="settings-item-label">Кол-во столов</div><div class="settings-item-value">${metrics.numTables}</div></div>
        <div class="settings-item"><div class="settings-item-label">Выручка</div><div class="settings-item-value">${metrics.revenue} ₽</div></div>
        <div class="settings-item"><div class="settings-item-label">Средний чек (1 стол)</div><div class="settings-item-value">${metrics.averageCheck} ₽</div></div>
        <div class="settings-item"><div class="settings-item-label">Топ‑3 блюда</div>
          <div class="settings-item-value">${metrics.top3.map(t => `${t.name} ×${t.qty}`).join(', ') || '—'}</div>
        </div>
      </div>
    `;
    
    // Toggle handlers
    wrapper.querySelectorAll('.settings-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
      });
    });
    
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
    
    // Save profile
    wrapper.querySelector('#pf-save').addEventListener('click', () => {
      profile.name = (wrapper.querySelector('#pf-name').value || '').trim();
      profile.role = (wrapper.querySelector('#pf-role').value || '').trim();
      profile.grade = (wrapper.querySelector('#pf-grade').value || '').trim();
      profile.location = (wrapper.querySelector('#pf-location').value || '').trim();
      saveProfile();
      render();
    });
    
    return wrapper;
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
  ensureMonthlyPurge(31);
  updateNavItems();
  render();
})();


