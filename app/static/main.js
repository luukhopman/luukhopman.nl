const API_URL = '/api/products';

// DOM Elements
const productForm = document.getElementById('add-product-form');
const productNameInput = document.getElementById('product-name');
const productStoreInput = document.getElementById('product-store');
const productUrlInput = document.getElementById('product-url');
const productList = document.getElementById('product-list');
const spinner = document.getElementById('loading-spinner');
const filterBtns = document.querySelectorAll('.filter-btn');

// Haptic Feedback Utility
function triggerHaptic(type) {
    if (!navigator.vibrate) return;
    try {
        if (type === 'success') {
            navigator.vibrate([30, 50, 30]);
        } else if (type === 'delete') {
            navigator.vibrate([50]);
        } else if (type === 'tap') {
            navigator.vibrate([20]);
        } else if (type === 'error') {
            navigator.vibrate([50, 100, 50, 100, 50]);
        }
    } catch (e) { }
}

// Edit Modal Elements
const editModal = document.getElementById('edit-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const editForm = document.getElementById('edit-product-form');
const editIdInput = document.getElementById('edit-product-id');
const editNameInput = document.getElementById('edit-product-name');
const editStoreInput = document.getElementById('edit-product-store');
const editUrlInput = document.getElementById('edit-product-url');

// Confirm Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

// Login Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginPasswordInput = document.getElementById('login-password');

// State
let products = [];
let currentFilter = 'pending'; // Defaulting to pending so acquired mostly disappear
let pinnedStores = JSON.parse(localStorage.getItem('pinnedStores') || '[]');
let collapsedStores = JSON.parse(localStorage.getItem('collapsedStores') || '[]');

function togglePin(store) {
    if (pinnedStores.includes(store)) {
        pinnedStores = pinnedStores.filter(s => s !== store);
    } else {
        pinnedStores.push(store);
    }
    localStorage.setItem('pinnedStores', JSON.stringify(pinnedStores));
    renderProducts();
}

function toggleCollapse(store) {
    if (collapsedStores.includes(store)) {
        collapsedStores = collapsedStores.filter(s => s !== store);
    } else {
        collapsedStores.push(store);
    }
    localStorage.setItem('collapsedStores', JSON.stringify(collapsedStores));
    renderProducts();
}

// Initialize
async function init() {
    setupEventListeners();

    const getStores = () => {
        const stores = new Set();
        products.forEach(p => {
            if (p.store && p.store.trim() !== '') stores.add(p.store.trim());
        });
        return Array.from(stores).sort((a, b) => a.localeCompare(b));
    };

    setupAutocomplete(productStoreInput, getStores, { showOnEmptyFocus: true });
    setupAutocomplete(editStoreInput, getStores, { showOnEmptyFocus: true });

    await fetchProducts();
}

// Event Listeners
function setupEventListeners() {
    productForm.addEventListener('submit', handleAddProduct);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Update filter and render
            currentFilter = e.target.dataset.filter;
            renderProducts();
        });
    });

    closeModalBtn.addEventListener('click', () => {
        editModal.classList.add('hidden');
    });

    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
            editModal.classList.add('hidden');
        }
    });

    editForm.addEventListener('submit', handleEditProduct);

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
}

// API Calls
async function fetchProducts() {
    showSpinner();
    try {
        const response = await fetch(API_URL);
        if (response.status === 401) {
            loginModal.classList.remove('hidden');
            loginPasswordInput.focus();
            hideSpinner();
            return;
        }
        if (!response.ok) throw new Error('Failed to fetch');
        products = await response.json();
        renderProducts();
    } catch (error) {
        console.error('Error fetching products:', error);
        showEmptyState('Could not load products. Please check the connection.');
    } finally {
        if (loginModal.classList.contains('hidden')) {
            hideSpinner();
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const password = loginPasswordInput.value;
    if (!password) return;

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (response.status === 401) {
            triggerHaptic('error');
            alert('Incorrect password');
        } else if (response.ok) {
            triggerHaptic('success');
            loginModal.classList.add('hidden');
            loginPasswordInput.value = '';
            // Refresh products
            await fetchProducts();
        } else {
            throw new Error('Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        triggerHaptic('error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleAddProduct(e) {
    e.preventDefault();

    const name = productNameInput.value.trim();
    if (!name) return;

    const store = productStoreInput.value.trim();
    const url = productUrlInput.value.trim();

    // Optimistic UI update could be added here
    const submitBtn = productForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
    submitBtn.disabled = true;

    try {
        const payload = {
            name: name,
            store: store ? store : null,
            url: url ? url : null
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        if (!response.ok) throw new Error('Failed to add product');

        // Clear form
        productForm.reset();
        productNameInput.focus();

        // Refresh list
        await fetchProducts();
        triggerHaptic('success');
    } catch (error) {
        console.error('Error adding product:', error);
        triggerHaptic('error');
        alert('Failed to add product. Please try again.');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function handleEditProduct(e) {
    e.preventDefault();

    const id = editIdInput.value;
    const name = editNameInput.value.trim();
    if (!name || !id) return;

    const store = editStoreInput.value.trim();
    const url = editUrlInput.value.trim();

    const submitBtn = editForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;

    try {
        const payload = {
            name: name,
            store: store ? store : "",
            url: url ? url : ""
        };

        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        if (!response.ok) throw new Error('Failed to edit product');

        editModal.classList.add('hidden');
        await fetchProducts();
        triggerHaptic('success');
    } catch (error) {
        console.error('Error editing product:', error);
        triggerHaptic('error');
        alert('Failed to edit product. Please try again.');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function openEditModal(product) {
    editIdInput.value = product.id;
    editNameInput.value = product.name || '';
    editStoreInput.value = product.store || '';
    editUrlInput.value = product.url || '';
    editModal.classList.remove('hidden');
    editNameInput.focus();
}

async function toggleAcquired(id, currentStatus) {
    try {
        // Optimistic update
        const productIndex = products.findIndex(p => p.id === id);
        if (productIndex !== -1) {
            products[productIndex].acquired = !currentStatus;
            products[productIndex].acquired_at = !currentStatus ? new Date().toISOString() : null;
            renderProducts();
            triggerHaptic(!currentStatus ? 'success' : 'tap');
        }

        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acquired: !currentStatus })
        });

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        if (!response.ok) {
            // Revert on failure
            if (productIndex !== -1) {
                products[productIndex].acquired = currentStatus;
                renderProducts();
            }
            throw new Error('Failed to update status');
        }
    } catch (error) {
        console.error('Error updating product:', error);
        triggerHaptic('error');
    }
}

async function deleteProduct(id) {
    try {
        const isHardDelete = currentFilter === 'deleted';

        // Optimistic update
        if (isHardDelete) {
            products = products.filter(p => p.id !== id);
        } else {
            const productIndex = products.findIndex(p => p.id === id);
            if (productIndex !== -1) {
                products[productIndex].is_deleted = true;
                products[productIndex].deleted_at = new Date().toISOString();
            }
        }
        renderProducts();
        triggerHaptic('delete');

        const url = isHardDelete ? `${API_URL}/${id}?hard=true` : `${API_URL}/${id}`;
        const response = await fetch(url, {
            method: 'DELETE' // Backend handles soft-delete under the hood unless hard=true
        });

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        if (!response.ok) throw new Error('Failed to delete');

    } catch (error) {
        console.error('Error deleting product:', error);
        triggerHaptic('error');
        // Recalculate if failed
        await fetchProducts();
    }
}

async function recoverProduct(id) {
    try {
        // Optimistic update
        const productIndex = products.findIndex(p => p.id === id);
        if (productIndex !== -1) {
            products[productIndex].is_deleted = false;
            products[productIndex].deleted_at = null;
            products[productIndex].acquired = false;
            products[productIndex].acquired_at = null;
            renderProducts();
            triggerHaptic('tap');
        }

        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_deleted: false, acquired: false }) // Recover to pending state
        });

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to recover item');
        }
    } catch (error) {
        console.error('Error recovering product:', error);
        await fetchProducts();
    }
}

// UI Rendering
function renderProducts() {
    productList.innerHTML = '';

    let filteredProducts = products;
    if (currentFilter === 'pending') {
        filteredProducts = products.filter(p => !p.acquired && !p.is_deleted);
    } else if (currentFilter === 'acquired') {
        filteredProducts = products.filter(p => p.acquired && !p.is_deleted);
    } else if (currentFilter === 'deleted') {
        filteredProducts = products.filter(p => p.is_deleted);
    } else {
        // 'all' doesn't show deleted ones by default to keep it clean, unless you want them to - let's hide them from 'all'
        filteredProducts = products.filter(p => !p.is_deleted);
    }

    if (filteredProducts.length === 0) {
        showEmptyState(
            currentFilter === 'all'
                ? "Your list is empty. Add something you need!"
                : `No ${currentFilter} items found.`
        );
        return;
    }

    // Group products by store
    const grouped = filteredProducts.reduce((acc, current) => {
        let store = current.store ? current.store.trim() : 'Other Location';
        if (store === '') store = 'Other Location';

        if (!acc[store]) {
            acc[store] = [];
        }
        acc[store].push(current);
        return acc;
    }, {});

    // Sort the keys alphabetically, but put 'Other Location' at the end
    const sortedStores = Object.keys(grouped).sort((a, b) => {
        const aPinned = pinnedStores.includes(a);
        const bPinned = pinnedStores.includes(b);

        // Pinned stores always come first
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        if (a === 'Other Location') return 1;
        if (b === 'Other Location') return -1;
        return a.localeCompare(b);
    });

    sortedStores.forEach(store => {
        const groupContainer = document.createElement('div');
        groupContainer.className = 'group-container';

        const groupHeader = document.createElement('h2');
        groupHeader.className = 'store-header';

        const isPinned = pinnedStores.includes(store);
        const isCollapsed = collapsedStores.includes(store);
        let clearStoreBtnHtml = '';
        if (currentFilter === 'acquired' || currentFilter === 'deleted') {
            clearStoreBtnHtml = `
                <button class="clear-store-btn" data-store="${escapeHTML(store)}" aria-label="Clear ${currentFilter} items in store" title="Clear All">
                    <i class="fa-solid fa-eraser"></i>
                </button>
            `;
        }

        groupHeader.innerHTML = `
            <div class="store-header-title" style="cursor: pointer; user-select: none;">
                <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} fa-sm toggle-collapse-icon" style="margin-right: 0.4rem; color: var(--text-muted); width: 1rem; text-align: center;"></i>
                <i class="fa-solid fa-tag fa-sm"></i> ${escapeHTML(store)}
            </div>
            <div class="store-header-actions">
                ${clearStoreBtnHtml}
                <button class="quick-add-btn" data-store="${escapeHTML(store)}" aria-label="Add item to this store" title="Quick Add">
                    <i class="fa-solid fa-plus"></i>
                </button>
                <button class="pin-btn ${isPinned ? 'pinned' : ''}" aria-label="${isPinned ? 'Unpin' : 'Pin'} store">
                    <i class="fa-solid fa-thumbtack"></i>
                </button>
            </div>
        `;

        const storeTitle = groupHeader.querySelector('.store-header-title');
        storeTitle.addEventListener('click', () => toggleCollapse(store));

        const pinBtn = groupHeader.querySelector('.pin-btn');
        pinBtn.addEventListener('click', () => togglePin(store));

        const quickAddBtn = groupHeader.querySelector('.quick-add-btn');
        quickAddBtn.addEventListener('click', (e) => {
            const storeName = e.currentTarget.getAttribute('data-store');
            productStoreInput.value = storeName === 'Other Location' ? '' : storeName;
            productNameInput.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        if (clearStoreBtnHtml) {
            const clearStoreBtn = groupHeader.querySelector('.clear-store-btn');
            clearStoreBtn.addEventListener('click', async (e) => {
                const storeProducts = grouped[store];
                const storeName = store === 'Other Location' ? 'this location' : store;
                const action = currentFilter === 'deleted' ? 'permanently delete' : 'clear';

                const confirmed = await showConfirm(
                    `${action === 'permanently delete' ? 'Delete Forever?' : 'Clear All?'}`,
                    `This will ${action} all ${storeProducts.length} ${currentFilter} item${storeProducts.length === 1 ? '' : 's'} from ${storeName}.`
                );
                if (!confirmed) return;

                clearStoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                clearStoreBtn.disabled = true;

                const idsToDelete = storeProducts.map(p => p.id);
                try {
                    triggerHaptic('delete');
                    const isHardDelete = currentFilter === 'deleted';
                    const urls = idsToDelete.map(id => isHardDelete ? `${API_URL}/${id}?hard=true` : `${API_URL}/${id}`);

                    await Promise.all(urls.map(url => fetch(url, { method: 'DELETE' })));

                    if (isHardDelete) {
                        products = products.filter(p => !idsToDelete.includes(p.id));
                    } else {
                        const now = new Date().toISOString();
                        products.forEach(p => {
                            if (idsToDelete.includes(p.id)) {
                                p.is_deleted = true;
                                p.deleted_at = now;
                            }
                        });
                    }

                    renderProducts();
                } catch (err) {
                    console.error('Error clearing store items:', err);
                    await fetchProducts();
                }
            });
        }

        groupContainer.appendChild(groupHeader);

        const ul = document.createElement('ul');
        ul.className = 'store-list';
        if (isCollapsed) {
            ul.classList.add('hidden');
        }

        grouped[store].forEach((product, index) => {
            const li = document.createElement('li');

            let itemClass = 'product-item';
            if (product.is_deleted) itemClass += ' deleted-item';
            else if (product.acquired) itemClass += ' acquired';

            li.className = itemClass;

            let metaHtml = '';
            if (product.url) {
                let displayUrl = product.url;
                try {
                    const urlObj = new URL(product.url);
                    displayUrl = urlObj.hostname;
                } catch (e) { }

                metaHtml += `
                    <span class="meta-item">
                        <i class="fa-solid fa-link fa-sm"></i>
                        <a href="${escapeHTML(product.url)}" target="_blank" class="meta-link">${escapeHTML(displayUrl)}</a>
                    </span>
                `;
            }

            if (product.is_deleted && product.deleted_at) {
                metaHtml += `<span class="meta-item"><i class="fa-regular fa-clock fa-sm"></i> Deleted ${timeAgo(product.deleted_at)}</span>`;
            } else if (product.acquired && product.acquired_at) {
                metaHtml += `<span class="meta-item"><i class="fa-regular fa-clock fa-sm"></i> Acquired ${timeAgo(product.acquired_at)}</span>`;
            }

            let actionButtonsHtml = '';
            if (product.is_deleted) {
                actionButtonsHtml = `
                    <div class="action-buttons">
                        <button class="action-btn recover-btn" aria-label="Recover item">
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                        <button class="action-btn delete-btn" aria-label="Permanently delete item" title="Permanently Delete">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                 `;
            } else {
                actionButtonsHtml = `
                    <div class="action-buttons">
                        <button class="action-btn edit-btn" aria-label="Edit item">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="action-btn delete-btn" aria-label="Delete item">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                 `;
            }

            li.innerHTML = `
                <div class="checkbox-container">
                    <button class="custom-checkbox" aria-label="${product.acquired ? 'Mark as pending' : 'Mark as acquired'}">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
                <div class="product-details">
                    <div class="product-header">
                        <h3 class="product-name">${escapeHTML(product.name)}</h3>
                        ${actionButtonsHtml}
                    </div>
                    <div class="product-meta">
                        ${metaHtml}
                    </div>
                </div>
            `;

            const checkbox = li.querySelector('.custom-checkbox');
            checkbox.addEventListener('click', () => toggleAcquired(product.id, product.acquired));

            if (product.is_deleted) {
                const recoverBtn = li.querySelector('.recover-btn');
                if (recoverBtn) recoverBtn.addEventListener('click', () => recoverProduct(product.id));
                const deleteBtn = li.querySelector('.delete-btn');
                if (deleteBtn) deleteBtn.addEventListener('click', () => deleteProduct(product.id));
            } else {
                const editBtn = li.querySelector('.edit-btn');
                if (editBtn) editBtn.addEventListener('click', () => openEditModal(product));
                const deleteBtn = li.querySelector('.delete-btn');
                if (deleteBtn) deleteBtn.addEventListener('click', () => deleteProduct(product.id));
            }

            ul.appendChild(li);
        });

        groupContainer.appendChild(ul);
        productList.appendChild(groupContainer);
    });
}

function showSpinner() {
    spinner.classList.remove('hidden');
    productList.classList.add('hidden');
}

function hideSpinner() {
    spinner.classList.add('hidden');
    productList.classList.remove('hidden');
}

function showEmptyState(message) {
    productList.innerHTML = `
        <div class="empty-state">
            <i class="fa-regular fa-clipboard"></i>
            <p>${message}</p>
        </div>
    `;
}

// Time formatter
function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    // Fallback if future
    const seconds = Math.max(0, Math.floor((new Date() - date) / 1000));

    let interval = seconds / 31536000;
    if (interval >= 1) return Math.floor(interval) + " year" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 2592000;
    if (interval >= 1) return Math.floor(interval) + " month" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 86400;
    if (interval >= 1) return Math.floor(interval) + " day" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 3600;
    if (interval >= 1) return Math.floor(interval) + " hour" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + " min" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    return "just now";
}

// Custom Confirm Modal
function showConfirm(title, message) {
    return new Promise((resolve) => {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmModal.classList.remove('hidden');

        // Re-trigger the wobble animation
        const icon = confirmModal.querySelector('.confirm-icon');
        icon.style.animation = 'none';
        icon.offsetHeight; // force reflow
        icon.style.animation = '';

        function cleanup() {
            confirmOkBtn.removeEventListener('click', onOk);
            confirmCancelBtn.removeEventListener('click', onCancel);
            confirmModal.removeEventListener('click', onBackdrop);
            confirmModal.classList.add('hidden');
        }

        function onOk() { cleanup(); resolve(true); }
        function onCancel() { cleanup(); resolve(false); }
        function onBackdrop(e) { if (e.target === confirmModal) { cleanup(); resolve(false); } }

        confirmOkBtn.addEventListener('click', onOk);
        confirmCancelBtn.addEventListener('click', onCancel);
        confirmModal.addEventListener('click', onBackdrop);
    });
}

// Utility
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function setupAutocomplete(input, getValues, opts = {}) {
    const { showOnEmptyFocus = true } = opts;
    const dropdown = document.createElement('ul');
    dropdown.className = 'autocomplete-dropdown';
    input.parentNode.appendChild(dropdown);

    let currentFocus = -1;

    function closeAllLists() {
        dropdown.classList.remove('show');
        dropdown.innerHTML = '';
        currentFocus = -1;
    }

    function populateDropdown(val) {
        closeAllLists();

        const allValues = getValues();

        // Hide suggestions if the input already exactly matches an option
        if (val && allValues.some(v => v.toLowerCase() === val.toLowerCase())) return;

        const matches = val
            ? allValues.filter(v => v.toLowerCase().includes(val.toLowerCase()))
            : allValues;

        if (matches.length === 0) return;

        matches.forEach((value) => {
            const item = document.createElement('li');
            item.className = 'autocomplete-item';

            if (val) {
                const regex = new RegExp(`(${val.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
                item.innerHTML = escapeHTML(value).replace(regex, "<strong>$1</strong>");
            } else {
                item.textContent = value;
            }

            item.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                input.value = value;
                closeAllLists();
                input.focus();
            });
            dropdown.appendChild(item);
        });

        dropdown.classList.add('show');
    }

    input.addEventListener('input', function () {
        populateDropdown(this.value);
    });

    input.addEventListener('focus', function () {
        if (showOnEmptyFocus || this.value.trim() !== '') {
            populateDropdown(this.value);
        }
    });

    input.addEventListener('keydown', function (e) {
        if (!dropdown.classList.contains('show') || dropdown.children.length === 0) return;

        const items = Array.from(dropdown.querySelectorAll('.autocomplete-item'));

        if (e.key === 'ArrowDown') {
            currentFocus++;
            addActive(items);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            currentFocus--;
            addActive(items);
            e.preventDefault();
        } else if (e.key === 'Enter') {
            if (currentFocus > -1) {
                e.preventDefault();
                items[currentFocus].click();
            }
        } else if (e.key === 'Escape') {
            closeAllLists();
        } else if (e.key === 'Tab') {
            closeAllLists();
        }
    });

    function addActive(items) {
        if (!items) return;
        removeActive(items);
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = items.length - 1;
        items[currentFocus].classList.add('highlighted');
        items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function removeActive(items) {
        items.forEach(item => item.classList.remove('highlighted'));
    }

    document.addEventListener('click', function (e) {
        if (e.target !== input && e.target !== dropdown && !dropdown.contains(e.target)) {
            closeAllLists();
        }
    });
}

// Start application
init();
