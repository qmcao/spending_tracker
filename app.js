/**
 * Static metadata for available cards. Each entry drives the quick card selector and informs
 * whether a transaction is treated as credit or debit.
 */
const CARDS = [
  {
    id: 'blossom-credit',
    name: 'Blossom Bank',
    nickname: 'Blossom Credit',
    type: 'credit',
    color: '#f9c8da',
  },
  {
    id: 'luna-credit',
    name: 'Luna Bank',
    nickname: 'Luna Credit',
    type: 'credit',
    color: '#d6ccff',
  },
  {
    id: 'blossom-debit',
    name: 'Blossom Bank',
    nickname: 'Blossom Debit',
    type: 'debit',
    color: '#c2f2d0',
  },
];

const LOCAL_KEY = 'spending-tracker-v1';
const CUSTOM_CATEGORY_KEY = 'spending-tracker-custom-categories';
const CATEGORY_SUGGESTIONS = [
  'Clothes/Makeup',
  'Investment',
  'Bill',
  'Car',
  'Food & Drinks',
  'Groceries',
  'Charity',
  'Misc',
  'One time',
  'Vacation',
  'Entertainment',
  'Health',
];
const CHART_COLORS = ['#E7A5C1', '#FADDEA', '#C9B7FF', '#C2F2D0', '#FFD6E0', '#FFBEF0', '#B4E0FF'];
const CHART_SIZE = 240;

// Cached DOM references for all interactive elements on the page.
const form = document.querySelector('#transaction-form');
const dateField = form.elements.date;
const categoryField = form.elements.category;
const historyList = document.querySelector('#history-list');
const totalMonth = document.querySelector('#total-month');
const totalCredit = document.querySelector('#total-credit');
const totalDebit = document.querySelector('#total-debit');
const categoryChips = document.querySelector('#category-chips');
const categoryList = document.querySelector('#category-list');
const cardOptions = document.querySelector('#card-options');
const clearBtn = document.querySelector('#clear-btn');
const exportBtn = document.querySelector('#export-btn');
const importBtn = document.querySelector('#import-btn');
const importDialog = document.querySelector('#import-dialog');
const importTextarea = document.querySelector('#import-text');
const storageWarning = document.querySelector('#storage-warning');
const monthFilter = document.querySelector('#month-filter');
const categoryFilter = document.querySelector('#category-filter');
const addCategoryBtn = document.querySelector('#add-category-btn');
const chartCanvas = document.querySelector('#category-chart');
const breakdownList = document.querySelector('#category-breakdown');
const chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

let transactions = [];
let editingId = null;
let storage = createStorage();
let currentMonthKey = monthKeyFromDate(new Date());
let chartDpr = 1;
let customCategories = loadCustomCategories();
const collapsedMonths = new Set();
let currentCategoryFilter = 'all';

init();

/**
 * Bootstraps the UI: defaults the date, renders card/category helpers, loads data, and wires up events.
 */
function init() {
  dateField.valueAsDate = new Date();
  renderCardOptions();
  cardOptions.addEventListener('change', handleCardChange);
  renderCategorySuggestions();
  setupChartCanvas();
  loadTransactions();
  form.addEventListener('submit', handleSubmit);
  clearBtn.addEventListener('click', handleClearAll);
  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => importDialog.showModal());
  importDialog.addEventListener('close', handleImportDialogClose);
  addCategoryBtn?.addEventListener('click', handleAddCategory);
  monthFilter?.addEventListener('change', (event) => {
    currentMonthKey = event.target.value;
    renderCategorySummary();
  });
  categoryFilter?.addEventListener('change', (event) => {
    currentCategoryFilter = event.target.value || 'all';
    renderHistory();
  });
}

/**
 * Builds the card selector grid from the `CARDS` config.
 */
function renderCardOptions() {
  const frag = document.createDocumentFragment();
  CARDS.forEach((card, index) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'card-option';
    wrapper.style.setProperty('--card-color', card.color);
    wrapper.innerHTML = `
      <input type="radio" name="cardId" value="${card.id}" ${index === 0 ? 'checked' : ''} />
      <span class="card-option__name">${card.nickname}</span>
      <span class="card-option__type">${card.type.toUpperCase()} • ${card.name}</span>
    `;
    wrapper.addEventListener('click', (e) => {
      const all = document.querySelectorAll('.card-option');
      all.forEach((el) => el.classList.remove('active'));
      wrapper.classList.add('active');
    });
    if (index === 0) wrapper.classList.add('active');
    frag.appendChild(wrapper);
  });
  cardOptions.appendChild(frag);
}

/**
 * Keeps card tiles visually in sync with the selected radio input.
 */
function handleCardChange(event) {
  if (event.target.name !== 'cardId') return;
  document.querySelectorAll('.card-option').forEach((opt) => opt.classList.remove('active'));
  event.target.closest('.card-option')?.classList.add('active');
}

/**
 * Populates both the datalist and the tappable chips with category shortcuts.
 */
function renderCategorySuggestions() {
  if (!categoryList || !categoryChips) return;
  categoryList.innerHTML = '';
  categoryChips.innerHTML = '';
  getAllCategories().forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    categoryList.appendChild(option);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = item;
    chip.addEventListener('click', () => (categoryField.value = item));
    categoryChips.appendChild(chip);
  });
}

/**
 * Loads transaction data from the current storage adapter and refreshes the UI.
 */
function loadTransactions() {
  try {
    const data = storage.load();
    transactions = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to load data', err);
    transactions = [];
  }
  updateStorageWarning();
  render();
}

/**
 * Persists the in-memory transaction array; swaps to memory fallback if localStorage fails.
 */
function saveTransactions() {
  try {
    storage.save(transactions);
  } catch (err) {
    console.error('Failed to save transactions, switching to in-memory mode', err);
    storage = createMemoryStorage(transactions);
  } finally {
    updateStorageWarning();
  }
}

/**
 * Handles form submission for both creating and updating a transaction.
 */
function handleSubmit(event) {
  event.preventDefault();
  const data = new FormData(form);
  const amountValue = Number(data.get('amount'));
  if (!amountValue || amountValue <= 0) return alert('Enter a valid amount');

  const payload = {
    id: editingId ?? generateId(),
    date: data.get('date'),
    amount: Math.round(amountValue * 100),
    category: (data.get('category') || '').trim(),
    memo: (data.get('memo') || '').trim(),
    cardId: data.get('cardId'),
    cleared: true,
    createdAt: editingId ? transactions.find((t) => t.id === editingId)?.createdAt ?? Date.now() : Date.now(),
  };

  if (!payload.category) return alert('Pick a category');

  if (editingId) {
    transactions = transactions.map((tx) => (tx.id === editingId ? payload : tx));
  } else {
    transactions = [payload, ...transactions];
  }

  editingId = null;
  saveTransactions();
  render();
  form.reset();
  dateField.valueAsDate = new Date();
}

/**
 * Rerenders aggregate totals and history list from current data.
 */
function render() {
  updateMonthFilter();
  updateCategoryFilterOptions();
  renderTotals();
  renderHistory();
  renderCategorySummary();
}

/**
 * Calculates monthly and per-card-type totals for the hero widgets.
 */
function renderTotals() {
  const now = new Date();
  const monthKey = monthKeyFromDate(now);
  let monthTotal = 0;
  let creditTotal = 0;
  let debitTotal = 0;

  transactions.forEach((tx) => {
    const date = new Date(tx.date);
    if (monthKeyFromDate(date) === monthKey) {
      monthTotal += tx.amount;
    }
    const card = cardById(tx.cardId);
    if (card?.type === 'credit') {
      creditTotal += tx.amount;
    } else {
      debitTotal += tx.amount;
    }
  });

  totalMonth.textContent = formatCurrency(monthTotal);
  totalCredit.textContent = formatCurrency(creditTotal);
  totalDebit.textContent = formatCurrency(debitTotal);
}

/**
 * Renders the grouped history section with month collapses and category filtering.
 */
function renderHistory() {
  historyList.innerHTML = '';

  if (!transactions.length) {
    historyList.innerHTML = `<p class="empty">No transactions yet. Add your first spend!</p>`;
    return;
  }

  const filtered = currentCategoryFilter === 'all'
    ? [...transactions]
    : transactions.filter((tx) => tx.category === currentCategoryFilter);

  if (!filtered.length) {
    historyList.innerHTML = `<p class="empty">No transactions match this category.</p>`;
    return;
  }

  const monthGroups = groupBy(filtered, (tx) => monthKeyFromDate(new Date(tx.date)));
  const sortedMonths = Object.keys(monthGroups).sort((a, b) => (a < b ? 1 : -1));

  sortedMonths.forEach((monthKey) => {
    const section = document.createElement('div');
    section.className = 'month-section';
    const isCollapsed = collapsedMonths.has(monthKey);
    if (isCollapsed) section.classList.add('collapsed');

    const monthTotal = monthGroups[monthKey].reduce((sum, tx) => sum + tx.amount, 0);
    const header = document.createElement('div');
    header.className = 'month-section__header';
    header.innerHTML = `
      <div class="month-section__title">
        <h3>${formatMonthLabel(monthKey)}</h3>
        <span class="month-section__total">${formatCurrency(monthTotal)}</span>
      </div>
    `;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'month-toggle';
    toggle.textContent = isCollapsed ? 'Show details' : 'Hide details';
    toggle.addEventListener('click', () => {
      if (collapsedMonths.has(monthKey)) {
        collapsedMonths.delete(monthKey);
      } else {
        collapsedMonths.add(monthKey);
      }
      renderHistory();
    });
    header.appendChild(toggle);

    section.appendChild(header);

    const monthBody = document.createElement('div');
    monthBody.className = 'month-body';

    const dayGroups = groupBy(monthGroups[monthKey], (tx) => tx.date);
    const sortedDates = Object.keys(dayGroups).sort((a, b) => (a < b ? 1 : -1));
    sortedDates.forEach((date) => {
      monthBody.appendChild(renderDayGroup(date, dayGroups[date]));
    });

    section.appendChild(monthBody);
    historyList.appendChild(section);
  });
}

/**
 * Builds a single day group element for the history list.
 */
function renderDayGroup(date, items) {
  const dayGroup = document.createElement('div');
  dayGroup.className = 'day-group';
  const total = items.reduce((sum, tx) => sum + tx.amount, 0);
  dayGroup.innerHTML = `
    <div class="day-group__header">
      <span class="day-group__date">${formatDay(date)}</span>
      <span class="day-group__total">${formatCurrency(total)}</span>
    </div>
  `;

  items
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((tx) => dayGroup.appendChild(renderTransaction(tx)));

  return dayGroup;
}

/**
 * Updates the monthly category summary UI and pie chart.
 */
function renderCategorySummary() {
  if (!breakdownList) return;
  const monthTx = transactions.filter((tx) => monthKeyFromDate(new Date(tx.date)) === currentMonthKey);

  if (!monthTx.length) {
    breakdownList.innerHTML = `<p class="empty">No spending recorded this month.</p>`;
    clearChart();
    return;
  }

  const totals = monthTx.reduce((acc, tx) => {
    const category = tx.category || 'Uncategorized';
    acc[category] = (acc[category] || 0) + tx.amount;
    return acc;
  }, {});

  const entries = Object.entries(totals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  drawPieChart(entries);

  const totalAmount = entries.reduce((sum, item) => sum + item.amount, 0);
  breakdownList.innerHTML = entries
    .map((item, idx) => {
      const percent = ((item.amount / totalAmount) * 100).toFixed(1);
      const color = CHART_COLORS[idx % CHART_COLORS.length];
      return `
        <div class="summary-row">
          <div class="summary-row__info">
            <div class="summary-row__title">
              <span class="summary-marker" style="background:${color}"></span>
              ${item.category}
            </div>
            <span class="summary-row__percent">${percent}% of month</span>
          </div>
          <span class="summary-row__amount">${formatCurrency(item.amount)}</span>
        </div>
      `;
    })
    .join('');
}

/**
 * Produces a single transaction row DOM node with action buttons.
 */
function renderTransaction(tx) {
  const template = document.querySelector('#transaction-template');
  const el = template.content.cloneNode(true);
  el.querySelector('.category').textContent = tx.category;
  el.querySelector('.memo').textContent = tx.memo || '—';
  el.querySelector('.amount').textContent = formatCurrency(tx.amount);
  const cardBadge = el.querySelector('.card-badge');
  const card = cardById(tx.cardId);
  cardBadge.textContent = card?.nickname ?? 'Card';
  cardBadge.style.background = card?.color ?? 'var(--surface-muted)';
  el.querySelector('.delete-btn').addEventListener('click', () => removeTransaction(tx.id));
  el.querySelector('.edit-btn').addEventListener('click', () => startEdit(tx.id));
  return el;
}

/**
 * Handles creation of a custom category that persists locally.
 */
function handleAddCategory() {
  const name = prompt('Name your category');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (getAllCategories().includes(trimmed)) {
    alert('That category already exists.');
    return;
  }
  customCategories = [...customCategories, trimmed];
  saveCustomCategories(customCategories);
  renderCategorySuggestions();
  updateCategoryFilterOptions();
  categoryField.value = trimmed;
}

/**
 * Returns the combined list of base and custom categories.
 */
function getAllCategories() {
  return [...new Set([...CATEGORY_SUGGESTIONS, ...customCategories])];
}

/**
 * Rebuilds the category filter select options.
 */
function updateCategoryFilterOptions() {
  if (!categoryFilter) return;
  const categoriesFromData = Array.from(new Set(transactions.map((tx) => tx.category).filter(Boolean)));
  const combined = [...new Set([...getAllCategories(), ...categoriesFromData])].sort();
  categoryFilter.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'All categories';
  categoryFilter.appendChild(allOption);
  combined.forEach((cat) => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
  if (currentCategoryFilter !== 'all' && !combined.includes(currentCategoryFilter)) {
    currentCategoryFilter = 'all';
  }
  categoryFilter.value = currentCategoryFilter;
}

function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Unable to load custom categories', err);
    return [];
  }
}

function saveCustomCategories(list) {
  try {
    localStorage.setItem(CUSTOM_CATEGORY_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Unable to save custom categories', err);
  }
}

/**
 * Loads an existing transaction into the form for editing.
 */
function startEdit(id) {
  const tx = transactions.find((item) => item.id === id);
  if (!tx) return;
  editingId = id;
  form.elements.date.value = tx.date;
  form.elements.amount.value = (tx.amount / 100).toFixed(2);
  form.elements.category.value = tx.category;
  form.elements.memo.value = tx.memo || '';
  const cardInput = form.querySelector(`input[name="cardId"][value="${tx.cardId}"]`);
  if (cardInput) {
    cardInput.checked = true;
    document.querySelectorAll('.card-option').forEach((opt) => opt.classList.remove('active'));
    cardInput.closest('.card-option').classList.add('active');
  }
  form.elements.amount.focus();
}

/**
 * Deletes a transaction after user confirmation.
 */
function removeTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  transactions = transactions.filter((tx) => tx.id !== id);
  saveTransactions();
  render();
}

/**
 * Clears every transaction and wipes persisted storage (with confirmation).
 */
function handleClearAll() {
  if (!transactions.length) return;
  if (!confirm('Clear all transactions? This cannot be undone.')) return;
  transactions = [];
  try {
    storage.clear();
  } catch (err) {
    console.error('Failed to clear storage', err);
  }
  collapsedMonths.clear();
  currentCategoryFilter = 'all';
  if (categoryFilter) categoryFilter.value = 'all';
  saveTransactions();
  render();
}

/**
 * Copies the transaction JSON to the clipboard (or downloads as file if denied).
 */
function handleExport() {
  const dataStr = JSON.stringify(transactions, null, 2);
  navigator.clipboard
    .writeText(dataStr)
    .then(() => alert('Transactions copied to clipboard!'))
    .catch(() => downloadFile('transactions.json', dataStr));
}

/**
 * Parses JSON pasted into the dialog and replaces the transaction list.
 */
function handleImportDialogClose(event) {
  if (importDialog.returnValue !== 'import') {
    importTextarea.value = '';
    return;
  }
  try {
    const parsed = JSON.parse(importTextarea.value.trim());
    if (!Array.isArray(parsed)) throw new Error('Invalid data');
    transactions = parsed;
    saveTransactions();
    render();
  } catch (err) {
    alert('Import failed. Make sure you pasted the full JSON export.');
  } finally {
    importTextarea.value = '';
  }
}

/**
 * Downloads content as a JSON file when clipboard access is blocked.
 */
function downloadFile(name, contents) {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Groups an array by key derived from a callback.
 */
function groupBy(list, fn) {
  return list.reduce((acc, item) => {
    const key = fn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Formats an integer number of cents into USD currency text.
 */
function formatCurrency(cents) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/**
 * Formats a YYYY-MM-DD string into a friendly weekday/month/day label.
 */
function formatDay(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

/**
 * Looks up card metadata by id.
 */
function cardById(id) {
  return CARDS.find((card) => card.id === id);
}

/**
 * Generates a unique id using Web Crypto when available, with a fallback.
 */
function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates the storage adapter, preferring localStorage but falling back to in-memory mode when blocked.
 */
function createStorage() {
  try {
    const testKey = '__spending_test__';
    window.localStorage.setItem(testKey, 'ok');
    window.localStorage.removeItem(testKey);
    return {
      persisted: true,
      load() {
        const raw = localStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : [];
      },
      save(data) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      },
      clear() {
        localStorage.removeItem(LOCAL_KEY);
      },
    };
  } catch (err) {
    console.warn('Local storage unavailable, using in-memory fallback', err);
    return createMemoryStorage();
  }
}

/**
 * Returns a simple in-memory storage adapter that mirrors the API of the persistent one.
 */
function createMemoryStorage(initial = []) {
  let data = Array.isArray(initial) ? [...initial] : [];
  return {
    persisted: false,
    load() {
      return data;
    },
    save(next) {
      data = Array.isArray(next) ? [...next] : [];
    },
    clear() {
      data = [];
    },
  };
}

/**
 * Shows/hides the yellow banner depending on whether writes are persisted.
 */
function updateStorageWarning() {
  if (!storageWarning) return;
  storageWarning.hidden = storage.persisted;
}

/**
 * Builds or refreshes the month dropdown from current transactions.
 */
function updateMonthFilter() {
  if (!monthFilter) return;
  const months = new Set();
  transactions.forEach((tx) => months.add(monthKeyFromDate(new Date(tx.date))));
  months.add(monthKeyFromDate(new Date()));
  const options = Array.from(months).sort((a, b) => (a < b ? 1 : -1));
  monthFilter.innerHTML = options
    .map((key) => `<option value="${key}">${formatMonthLabel(key)}</option>`)
    .join('');
  if (!options.includes(currentMonthKey)) {
    currentMonthKey = options[0];
  }
  monthFilter.value = currentMonthKey;
}

/**
 * Sizes the canvas for HiDPI screens.
 */
function setupChartCanvas() {
  if (!chartCanvas || !chartCtx) return;
  chartDpr = window.devicePixelRatio || 1;
  chartCanvas.width = CHART_SIZE * chartDpr;
  chartCanvas.height = CHART_SIZE * chartDpr;
  chartCanvas.style.width = `${CHART_SIZE}px`;
  chartCanvas.style.height = `${CHART_SIZE}px`;
  chartCtx.scale(chartDpr, chartDpr);
}

/**
 * Draws a basic pie chart using canvas arcs.
 */
function drawPieChart(entries) {
  if (!chartCtx) return;
  clearChart();
  const total = entries.reduce((sum, item) => sum + item.amount, 0);
  if (!total) return;
  const center = CHART_SIZE / 2;
  const radius = center - 10;
  let startAngle = -Math.PI / 2;

  entries.forEach((item, idx) => {
    const slice = (item.amount / total) * Math.PI * 2;
    const endAngle = startAngle + slice;
    chartCtx.beginPath();
    chartCtx.moveTo(center, center);
    chartCtx.arc(center, center, radius, startAngle, endAngle);
    chartCtx.closePath();
    chartCtx.fillStyle = CHART_COLORS[idx % CHART_COLORS.length];
    chartCtx.fill();
    startAngle = endAngle;
  });
}

/**
 * Clears the chart canvas.
 */
function clearChart() {
  if (!chartCtx || !chartCanvas) return;
  chartCtx.save();
  chartCtx.setTransform(1, 0, 0, 1, 0, 0);
  chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  chartCtx.restore();
}

/**
 * Converts a YYYY-MM key into a friendly label like "June 2024".
 */
function formatMonthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
}

/**
 * Returns a normalized key (`YYYY-MM`) for a given date object.
 */
function monthKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
