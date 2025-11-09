/**
 * Static metadata for available cards. Each entry drives the quick card selector and informs
 * whether a transaction is treated as credit (can be pending) or debit (instantly cleared).
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
const CATEGORY_SUGGESTIONS = [
  'Coffee',
  'Groceries',
  'Dining Out',
  'Ride Share',
  'Beauty',
  'Fun Money',
  'Bills',
  'Subscriptions',
  'Travel',
];

// Cached DOM references for all interactive elements on the page.
const form = document.querySelector('#transaction-form');
const dateField = form.elements.date;
const categoryField = form.elements.category;
const memoField = form.elements.memo;
const clearedField = form.elements.cleared;
const amountField = form.elements.amount;
const historyList = document.querySelector('#history-list');
const totalMonth = document.querySelector('#total-month');
const totalPending = document.querySelector('#total-pending');
const totalCleared = document.querySelector('#total-cleared');
const categoryChips = document.querySelector('#category-chips');
const categoryList = document.querySelector('#category-list');
const cardOptions = document.querySelector('#card-options');
const clearBtn = document.querySelector('#clear-btn');
const exportBtn = document.querySelector('#export-btn');
const importBtn = document.querySelector('#import-btn');
const importDialog = document.querySelector('#import-dialog');
const importTextarea = document.querySelector('#import-text');
const storageWarning = document.querySelector('#storage-warning');

let transactions = [];
let editingId = null;
let storage = createStorage();

init();

/**
 * Bootstraps the UI: defaults the date, renders card/category helpers, loads data, and wires up events.
 */
function init() {
  dateField.valueAsDate = new Date();
  renderCardOptions();
  cardOptions.addEventListener('change', handleCardChange);
  renderCategorySuggestions();
  loadTransactions();
  form.addEventListener('submit', handleSubmit);
  clearBtn.addEventListener('click', handleClearAll);
  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => importDialog.showModal());
  importDialog.addEventListener('close', handleImportDialogClose);
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
 * Populates both the datalist and the tappable chips with common categories for quick entry.
 */
function renderCategorySuggestions() {
  CATEGORY_SUGGESTIONS.forEach((item) => {
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
    cleared: data.get('cleared') === 'on',
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
  renderTotals();
  renderHistory();
}

/**
 * Calculates monthly, pending, and cleared totals and updates the hero widgets.
 */
function renderTotals() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  let monthTotal = 0;
  let pending = 0;
  let cleared = 0;

  transactions.forEach((tx) => {
    const date = new Date(tx.date);
    if (`${date.getFullYear()}-${date.getMonth()}` === monthKey) {
      monthTotal += tx.amount;
    }
    if (tx.cleared || cardById(tx.cardId)?.type === 'debit') {
      cleared += tx.amount;
    } else {
      pending += tx.amount;
    }
  });

  totalMonth.textContent = formatCurrency(monthTotal);
  totalPending.textContent = formatCurrency(pending);
  totalCleared.textContent = formatCurrency(cleared);
}

/**
 * Renders the grouped day-by-day history section.
 */
function renderHistory() {
  historyList.innerHTML = '';

  if (!transactions.length) {
    historyList.innerHTML = `<p class="empty">No transactions yet. Add your first spend!</p>`;
    return;
  }

  const groups = groupBy(transactions, (tx) => tx.date);
  const sortedDates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  sortedDates.forEach((date) => {
    const dayGroup = document.createElement('div');
    dayGroup.className = 'day-group';
    const total = groups[date].reduce((sum, tx) => sum + tx.amount, 0);
    dayGroup.innerHTML = `
      <div class="day-group__header">
        <span class="day-group__date">${formatDay(date)}</span>
        <span class="day-group__total">${formatCurrency(total)}</span>
      </div>
    `;

    groups[date]
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach((tx) => dayGroup.appendChild(renderTransaction(tx)));

    historyList.appendChild(dayGroup);
  });
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
  const statusBadge = el.querySelector('.status-badge');
  const isCleared = tx.cleared || card?.type === 'debit';
  statusBadge.textContent = isCleared ? 'Cleared' : 'Pending';
  statusBadge.classList.add(isCleared ? 'cleared' : 'pending');
  statusBadge.addEventListener('click', () => toggleCleared(tx.id));
  el.querySelector('.delete-btn').addEventListener('click', () => removeTransaction(tx.id));
  el.querySelector('.edit-btn').addEventListener('click', () => startEdit(tx.id));
  return el;
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
  form.elements.cleared.checked = tx.cleared;
  const cardInput = form.querySelector(`input[name="cardId"][value="${tx.cardId}"]`);
  if (cardInput) {
    cardInput.checked = true;
    document.querySelectorAll('.card-option').forEach((opt) => opt.classList.remove('active'));
    cardInput.closest('.card-option').classList.add('active');
  }
  form.elements.amount.focus();
}

/**
 * Toggles the cleared flag for a transaction unless the card is a debit (always cleared).
 */
function toggleCleared(id) {
  transactions = transactions.map((tx) =>
    tx.id === id ? { ...tx, cleared: !(tx.cleared || cardById(tx.cardId)?.type === 'debit') } : tx
  );
  saveTransactions();
  render();
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
