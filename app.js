/* Waiter PWA SPA */
(function () {
  const STORAGE_KEYS = {
    tableOrders: 'waiter.tableOrders',
    tables: 'waiter.tables',
    tableMode: 'waiter.tableMode',
    tableNames: 'waiter.tableNames'
  };


  /** @type {Object<number, Array<{id:string, itemName:string, quantity:number, notes?:string, createdAt:number, status?:'rkeeper'|'served', addedAt:number}>>} */
  let tableOrders = {};
  /** @type {Array<number>} */
  let activeTables = [];
  /** @type {Object<number, string>} */
  let tableNames = {};
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
  }
  function saveTableOrders() { localStorage.setItem(STORAGE_KEYS.tableOrders, JSON.stringify(tableOrders)); }
  function saveTables() { localStorage.setItem(STORAGE_KEYS.tables, JSON.stringify(activeTables)); }
  function saveTableMode() { localStorage.setItem(STORAGE_KEYS.tableMode, tableMode); }
  function saveTableNames() { localStorage.setItem(STORAGE_KEYS.tableNames, JSON.stringify(tableNames)); }

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
    
    const now = new Date();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6; // Sunday or Saturday
    const isBefore5PM = now.getHours() < 17;
    
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
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Поиск блюд</h2>
      </div>
      <div class="search-row">
        <input id="search-main" placeholder="Начните вводить название блюда..." />
        <button id="filter-btn" class="btn">Фильтры</button>
      </div>
      
      <!-- Фильтры -->
      <div id="filters-panel" class="filters-panel" style="display: none;">
        <div class="filter-group">
          <label>Категория:</label>
          <select id="category-filter">
            <option value="">Все категории</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label>Цена:</label>
          <div class="price-range">
            <input type="number" id="price-min" placeholder="От" min="0" />
            <span>-</span>
            <input type="number" id="price-max" placeholder="До" min="0" />
          </div>
        </div>
        
        <div class="filter-group">
          <label>Аллергены:</label>
          <div id="allergen-filters" class="checkbox-group">
            <!-- Будет заполнено динамически -->
          </div>
        </div>
        
        <div class="filter-group">
          <label>Калории (на 100г):</label>
          <div class="calorie-range">
            <input type="number" id="calorie-min" placeholder="От" min="0" />
            <span>-</span>
            <input type="number" id="calorie-max" placeholder="До" min="0" />
          </div>
        </div>
        
        <div class="filter-group">
          <label>Тип блюда:</label>
          <div class="checkbox-group">
            <label><input type="checkbox" id="filter-vegan" /> Веганское</label>
            <label><input type="checkbox" id="filter-vegetarian" /> Вегетарианское</label>
            <label><input type="checkbox" id="filter-gluten-free" /> Без глютена</label>
            <label><input type="checkbox" id="filter-spicy" /> Острое</label>
          </div>
        </div>
        
        <div class="filter-actions">
          <button id="apply-filters" class="btn primary">Применить</button>
          <button id="clear-filters" class="btn secondary">Сбросить</button>
        </div>
      </div>
      
      <div class="search-suggestions" id="search-suggestions" style="display: none;">
        <div class="suggestions-list" id="suggestions-list"></div>
      </div>
      
      <div class="search-stats" id="search-stats" style="display: none;">
        <span id="results-count">0 результатов</span>
        <button id="sort-btn" class="btn small">Сортировка</button>
      </div>
      
      <div class="menu-list" id="search-results">
        <div style="padding: 20px; text-align: center; color: var(--muted);">
          Начните поиск блюд для просмотра полного описания
        </div>
      </div>
    `;
    wrapper.appendChild(panel);
    
    const searchInput = panel.querySelector('#search-main');
    const suggestionsContainer = panel.querySelector('#search-suggestions');
    const suggestionsList = panel.querySelector('#suggestions-list');
    const resultsContainer = panel.querySelector('#search-results');
    const filtersPanel = panel.querySelector('#filters-panel');
    const filterBtn = panel.querySelector('#filter-btn');
    const categoryFilter = panel.querySelector('#category-filter');
    const allergenFilters = panel.querySelector('#allergen-filters');
    const priceMin = panel.querySelector('#price-min');
    const priceMax = panel.querySelector('#price-max');
    const calorieMin = panel.querySelector('#calorie-min');
    const calorieMax = panel.querySelector('#calorie-max');
    const searchStats = panel.querySelector('#search-stats');
    const resultsCount = panel.querySelector('#results-count');
    const sortBtn = panel.querySelector('#sort-btn');
    
    let searchTimeout;
    let allDishes = [];
    let filteredDishes = [];
    let currentFilters = {
      category: '',
      priceMin: null,
      priceMax: null,
      allergens: [],
      calorieMin: null,
      calorieMax: null,
      vegan: false,
      vegetarian: false,
      glutenFree: false,
      spicy: false
    };
    let currentSort = 'relevance';
    
    // Load dishes data
    loadDb().then(({dishes}) => {
      allDishes = dishes;
      filteredDishes = [...allDishes];
      console.log('Loaded dishes for search:', allDishes.length);
      
      // Initialize filters
      initializeFilters();
    }).catch(err => {
      console.error('Failed to load dishes for search:', err);
      resultsContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--danger);">
          Ошибка загрузки меню
        </div>
      `;
    });
    
    function normalize(text) {
      return (text || '').toLowerCase().trim();
    }
    
    function initializeFilters() {
      // Initialize categories
      const categories = [...new Set(allDishes.map(dish => dish.category).filter(Boolean))];
      categories.sort();
      categoryFilter.innerHTML = '<option value="">Все категории</option>' + 
        categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
      
      // Initialize allergens
      const allAllergens = new Set();
      allDishes.forEach(dish => {
        if (dish.allergens && Array.isArray(dish.allergens)) {
          dish.allergens.forEach(allergen => {
            if (allergen && allergen !== '-' && allergen.trim()) {
              allAllergens.add(allergen.trim());
            }
          });
        }
      });
      
      const sortedAllergens = Array.from(allAllergens).sort();
      allergenFilters.innerHTML = sortedAllergens.map(allergen => 
        `<label><input type="checkbox" value="${allergen}" /> ${allergen}</label>`
      ).join('');
    }
    
    function applyFilters() {
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
        
        // Allergen filter (exclude dishes with selected allergens)
        if (currentFilters.allergens.length > 0) {
          const dishAllergens = (dish.allergens || []).map(a => a.toLowerCase().trim());
          const hasExcludedAllergen = currentFilters.allergens.some(allergen => 
            dishAllergens.includes(allergen.toLowerCase())
          );
          if (hasExcludedAllergen) return false;
        }
        
        // Calorie filter
        if (currentFilters.calorieMin !== null || currentFilters.calorieMax !== null) {
          const calories = extractCalories(dish.kbju);
          if (calories !== null) {
            if (currentFilters.calorieMin !== null && calories < currentFilters.calorieMin) return false;
            if (currentFilters.calorieMax !== null && calories > currentFilters.calorieMax) return false;
          }
        }
        
        // Type filters
        if (currentFilters.vegan && !isVegan(dish)) return false;
        if (currentFilters.vegetarian && !isVegetarian(dish)) return false;
        if (currentFilters.glutenFree && !isGlutenFree(dish)) return false;
        if (currentFilters.spicy && !isSpicy(dish)) return false;
        
        return true;
      });
      
      updateSearchResults();
    }
    
    function extractPrice(priceStr) {
      if (!priceStr || priceStr === '—') return null;
      const match = priceStr.match(/(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    
    function extractCalories(kbjuStr) {
      if (!kbjuStr || kbjuStr === '—') return null;
      const match = kbjuStr.match(/К\.\s*(\d+)/);
      return match ? parseInt(match[1]) : null;
    }
    
    function isVegan(dish) {
      const composition = (dish.composition || []).join(' ').toLowerCase();
      const nonVeganIngredients = ['мясо', 'рыба', 'молоко', 'сыр', 'яйцо', 'мясной', 'рыбный', 'молочный'];
      return !nonVeganIngredients.some(ingredient => composition.includes(ingredient));
    }
    
    function isVegetarian(dish) {
      const composition = (dish.composition || []).join(' ').toLowerCase();
      const nonVegetarianIngredients = ['мясо', 'рыба', 'мясной', 'рыбный'];
      return !nonVegetarianIngredients.some(ingredient => composition.includes(ingredient));
    }
    
    function isGlutenFree(dish) {
      const composition = (dish.composition || []).join(' ').toLowerCase();
      const glutenIngredients = ['пшеница', 'рожь', 'ячмень', 'овёс', 'глютен', 'мука', 'хлеб', 'макароны'];
      return !glutenIngredients.some(ingredient => composition.includes(ingredient));
    }
    
    function isSpicy(dish) {
      const composition = (dish.composition || []).join(' ').toLowerCase();
      const spicyIngredients = ['перец', 'острый', 'чили', 'хрен', 'горчица', 'имбирь'];
      return spicyIngredients.some(ingredient => composition.includes(ingredient));
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
    
    // Add filter functionality
    function updateSearchResults() {
      const query = searchInput.value.trim();
      let results = [];
      
      if (query) {
        results = findMatchingDishes(query);
      } else {
        results = filteredDishes.slice(0, 20); // Show first 20 dishes when no query
      }
      
      // Sort results
      if (currentSort === 'price-asc') {
        results.sort((a, b) => {
          const priceA = extractPrice(a.price) || 0;
          const priceB = extractPrice(b.price) || 0;
          return priceA - priceB;
        });
      } else if (currentSort === 'price-desc') {
        results.sort((a, b) => {
          const priceA = extractPrice(a.price) || 0;
          const priceB = extractPrice(b.price) || 0;
          return priceB - priceA;
        });
      } else if (currentSort === 'name') {
        results.sort((a, b) => a.name.localeCompare(b.name));
      }
      
      renderResults(results);
      updateStats(results.length);
    }
    
    function renderResults(dishes) {
      resultsContainer.innerHTML = '';
      
      if (dishes.length === 0) {
        resultsContainer.innerHTML = `
          <div style="padding: 20px; text-align: center; color: var(--muted);">
            Блюда не найдены
          </div>
        `;
        return;
      }
      
      const frag = document.createDocumentFragment();
      
      dishes.forEach(dish => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.innerHTML = `
          <div class="menu-item-content">
            <div class="menu-item-header">
              <h3 class="menu-item-title">${dish.name}</h3>
              <div class="menu-item-price">${dish.price || '—'}</div>
            </div>
            <div class="menu-item-meta">
              <span class="menu-item-category">${dish.category || 'Без категории'}</span>
              ${dish.gramm ? `<span class="menu-item-weight">${dish.gramm}</span>` : ''}
            </div>
            ${dish.composition && dish.composition.length > 0 ? `
              <div class="menu-item-composition">
                <strong>Состав:</strong> ${dish.composition.join(', ')}
              </div>
            ` : ''}
            ${dish.allergens && dish.allergens.length > 0 && dish.allergens[0] !== '-' ? `
              <div class="menu-item-allergens">
                <strong>Аллергены:</strong> ${dish.allergens.join(', ')}
              </div>
            ` : ''}
            ${dish.kbju && dish.kbju !== '-' ? `
              <div class="menu-item-kbju">
                <strong>КБЖУ:</strong> ${dish.kbju}
              </div>
            ` : ''}
            ${dish.description && dish.description.length > 0 && dish.description[0] !== '-' ? `
              <div class="menu-item-description">
                ${dish.description.join(' ')}
              </div>
            ` : ''}
          </div>
        `;
        
        item.addEventListener('click', () => {
          selectDish(dish);
        });
        
        frag.appendChild(item);
      });
      
      resultsContainer.appendChild(frag);
    }
    
    function updateStats(count) {
      resultsCount.textContent = `${count} результатов`;
      searchStats.style.display = count > 0 ? 'flex' : 'none';
    }
    
    // Event listeners
    filterBtn.addEventListener('click', () => {
      filtersPanel.style.display = filtersPanel.style.display === 'none' ? 'block' : 'none';
    });
    
    categoryFilter.addEventListener('change', (e) => {
      currentFilters.category = e.target.value;
    });
    
    priceMin.addEventListener('input', (e) => {
      currentFilters.priceMin = e.target.value ? parseInt(e.target.value) : null;
    });
    
    priceMax.addEventListener('input', (e) => {
      currentFilters.priceMax = e.target.value ? parseInt(e.target.value) : null;
    });
    
    calorieMin.addEventListener('input', (e) => {
      currentFilters.calorieMin = e.target.value ? parseInt(e.target.value) : null;
    });
    
    calorieMax.addEventListener('input', (e) => {
      currentFilters.calorieMax = e.target.value ? parseInt(e.target.value) : null;
    });
    
    // Allergen filters
    allergenFilters.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const checkedBoxes = allergenFilters.querySelectorAll('input[type="checkbox"]:checked');
        currentFilters.allergens = Array.from(checkedBoxes).map(cb => cb.value);
      }
    });
    
    // Type filters
    document.getElementById('filter-vegan').addEventListener('change', (e) => {
      currentFilters.vegan = e.target.checked;
    });
    
    document.getElementById('filter-vegetarian').addEventListener('change', (e) => {
      currentFilters.vegetarian = e.target.checked;
    });
    
    document.getElementById('filter-gluten-free').addEventListener('change', (e) => {
      currentFilters.glutenFree = e.target.checked;
    });
    
    document.getElementById('filter-spicy').addEventListener('change', (e) => {
      currentFilters.spicy = e.target.checked;
    });
    
    // Apply and clear filters
    document.getElementById('apply-filters').addEventListener('click', () => {
      applyFilters();
      filtersPanel.style.display = 'none';
    });
    
    document.getElementById('clear-filters').addEventListener('click', () => {
      // Reset all filters
      currentFilters = {
        category: '',
        priceMin: null,
        priceMax: null,
        allergens: [],
        calorieMin: null,
        calorieMax: null,
        vegan: false,
        vegetarian: false,
        glutenFree: false,
        spicy: false
      };
      
      // Reset UI
      categoryFilter.value = '';
      priceMin.value = '';
      priceMax.value = '';
      calorieMin.value = '';
      calorieMax.value = '';
      allergenFilters.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      document.getElementById('filter-vegan').checked = false;
      document.getElementById('filter-vegetarian').checked = false;
      document.getElementById('filter-gluten-free').checked = false;
      document.getElementById('filter-spicy').checked = false;
      
      applyFilters();
    });
    
    // Sort functionality
    sortBtn.addEventListener('click', () => {
      const sortOptions = [
        { value: 'relevance', label: 'По релевантности' },
        { value: 'name', label: 'По названию' },
        { value: 'price-asc', label: 'Цена: по возрастанию' },
        { value: 'price-desc', label: 'Цена: по убыванию' }
      ];
      
      const currentIndex = sortOptions.findIndex(opt => opt.value === currentSort);
      const nextIndex = (currentIndex + 1) % sortOptions.length;
      currentSort = sortOptions[nextIndex].value;
      
      sortBtn.textContent = sortOptions[nextIndex].label;
      updateSearchResults();
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
      <div style="padding: 20px; text-align: center; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">📚</div>
        <h3>Изучение меню</h3>
        <p>Здесь будет удобное изучение меню с карточками, тестами и запоминанием блюд</p>
        <p style="margin-top: 16px; font-size: 14px; color: var(--divider);">
          Функция в разработке
        </p>
      </div>
    `;
    wrapper.appendChild(panel);
    
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
      const totalItems = tableOrders[n] ? tableOrders[n].reduce((sum, o) => sum + o.quantity, 0) : 0;
      const displayName = getTableDisplayName(n);
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <h3>${displayName}</h3>
          <div style="display: flex; gap: 8px;">
            <button class="table-clear-btn" title="Очистить стол">🗑️</button>
            <button class="table-rename-btn" title="Переименовать стол">✏️</button>
          </div>
        </div>
        <div class="table-meta"><span class="pill">Заказов: ${totalItems}</span></div>
      `;
      const actions = document.createElement('div');
      actions.className = 'table-actions';
      const openBtn = document.createElement('button'); openBtn.className = 'btn primary'; openBtn.textContent = 'Открыть';
      openBtn.addEventListener('click', () => navigate(`#/table/${n}`));
      const removeBtn = document.createElement('button'); removeBtn.className = 'btn danger'; removeBtn.textContent = 'Убрать';
      removeBtn.addEventListener('click', () => {
        const hasOrders = tableOrders[n] && tableOrders[n].length > 0;
        const message = hasOrders 
          ? `${displayName} содержит ${tableOrders[n].length} заказов. Вы точно хотите удалить стол со всеми заказами?`
          : `Вы точно хотите удалить ${displayName}?`;
        
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
            // Clear all orders from table but keep the table
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
            order.quantity = Math.max(1, order.quantity + delta);
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
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js'); });
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
    `;

    wrapper.appendChild(panel);

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
    
    wrapper.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">👤</div>
        <div class="profile-name">Официант</div>
        <div class="profile-role">Сотрудник ресторана</div>
      </div>
      
      <div class="settings-section">
        <div class="settings-title">Настройки</div>
        
        <div class="settings-item">
          <div class="settings-item-label">Уведомления</div>
          <div class="settings-toggle active" id="notifications-toggle"></div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">Звуковые сигналы</div>
          <div class="settings-toggle active" id="sounds-toggle"></div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">Темная тема</div>
          <div class="settings-toggle active" id="theme-toggle"></div>
        </div>
      </div>
      
      <div class="settings-section mode-settings-section">
        <div class="settings-title">Режим работы со столами</div>
        
        <div class="settings-item">
          <div class="settings-item-label">Режим поиска</div>
          <div class="settings-toggle active" id="search-mode-toggle"></div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">To-do режим</div>
          <div class="settings-toggle" id="todo-mode-toggle"></div>
        </div>
      </div>
      
      <div class="settings-section">
        <div class="settings-title">Информация</div>
        
        <div class="settings-item">
          <div class="settings-item-label">Версия приложения</div>
          <div class="settings-item-value">${getAppVersion()}</div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">Всего столов</div>
          <div class="settings-item-value">${activeTables.length}</div>
        </div>
        
        <div class="settings-item">
          <div class="settings-item-label">Всего заказов</div>
          <div class="settings-item-value">${Object.values(tableOrders).reduce((sum, orders) => sum + orders.length, 0)}</div>
        </div>
      </div>
      
      <div class="settings-section">
        <div class="settings-title">Действия</div>
        
        <button class="btn secondary" id="clear-cache-btn" style="width: 100%; margin-bottom: 12px;">
          Очистить кэш
        </button>
        
        <button class="btn secondary" id="export-data-btn" style="width: 100%; margin-bottom: 12px;">
          Экспорт данных
        </button>
        
        <button class="btn danger" id="reset-app-btn" style="width: 100%;">
          Сбросить приложение
        </button>
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
    
    // Action handlers
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
        exportDate: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waiter-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
  updateNavItems();
  render();
})();


