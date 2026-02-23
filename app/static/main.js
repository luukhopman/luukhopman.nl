const API_URL = '/api/products';

// DOM Elements
const productForm = document.getElementById('add-product-form');
const productNameInput = document.getElementById('product-name');
const productStoreInput = document.getElementById('product-store');
const productUrlInput = document.getElementById('product-url');
const productList = document.getElementById('product-list');
const spinner = document.getElementById('loading-spinner');
const filterBtns = document.querySelectorAll('.filter-btn');

// State
let products = [];
let currentFilter = 'pending'; // Defaulting to pending so acquired mostly disappear
let pinnedStores = JSON.parse(localStorage.getItem('pinnedStores') || '[]');

function togglePin(store) {
    if (pinnedStores.includes(store)) {
        pinnedStores = pinnedStores.filter(s => s !== store);
    } else {
        pinnedStores.push(store);
    }
    localStorage.setItem('pinnedStores', JSON.stringify(pinnedStores));
    renderProducts();
}

// Initialize
async function init() {
    setupEventListeners();
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
}

// API Calls
async function fetchProducts() {
    showSpinner();
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch');
        products = await response.json();
        renderProducts();
    } catch (error) {
        console.error('Error fetching products:', error);
        showEmptyState('Could not load products. Please check the connection.');
    } finally {
        hideSpinner();
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

        if (!response.ok) throw new Error('Failed to add product');

        // Clear form
        productForm.reset();
        productNameInput.focus();

        // Refresh list
        await fetchProducts();
    } catch (error) {
        console.error('Error adding product:', error);
        alert('Failed to add product. Please try again.');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

async function toggleAcquired(id, currentStatus) {
    try {
        // Optimistic update
        const productIndex = products.findIndex(p => p.id === id);
        if (productIndex !== -1) {
            products[productIndex].acquired = !currentStatus;
            renderProducts();
        }

        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acquired: !currentStatus })
        });

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
    }
}

async function deleteProduct(id) {
    try {
        const isHardDelete = currentFilter === 'deleted';

        // Optimistic update
        products = products.filter(p => isHardDelete ? p.id !== id : p.id !== id);
        renderProducts();

        const url = isHardDelete ? `${API_URL}/${id}?hard=true` : `${API_URL}/${id}`;
        const response = await fetch(url, {
            method: 'DELETE' // Backend handles soft-delete under the hood unless hard=true
        });

        if (!response.ok) throw new Error('Failed to delete');

    } catch (error) {
        console.error('Error deleting product:', error);
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
            renderProducts();
        }

        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_deleted: false, acquired: false }) // Recover to pending state
        });

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
        groupHeader.innerHTML = `
            <div class="store-header-title">
                <i class="fa-solid fa-store fa-sm"></i> ${escapeHTML(store)}
            </div>
            <div class="store-header-actions">
                <button class="quick-add-btn" data-store="${escapeHTML(store)}" aria-label="Add item to this store" title="Quick Add">
                    <i class="fa-solid fa-plus"></i>
                </button>
                <button class="pin-btn ${isPinned ? 'pinned' : ''}" aria-label="${isPinned ? 'Unpin' : 'Pin'} store">
                    <i class="fa-solid fa-thumbtack"></i>
                </button>
            </div>
        `;

        const pinBtn = groupHeader.querySelector('.pin-btn');
        pinBtn.addEventListener('click', () => togglePin(store));

        const quickAddBtn = groupHeader.querySelector('.quick-add-btn');
        quickAddBtn.addEventListener('click', (e) => {
            const storeName = e.currentTarget.getAttribute('data-store');
            productStoreInput.value = storeName === 'Other Location' ? '' : storeName;
            productNameInput.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        groupContainer.appendChild(groupHeader);

        const ul = document.createElement('ul');
        ul.className = 'store-list';

        grouped[store].forEach((product, index) => {
            const li = document.createElement('li');

            let itemClass = 'product-item';
            if (product.is_deleted) itemClass += ' deleted-item';
            else if (product.acquired) itemClass += ' acquired';

            li.className = itemClass;

            let urlHtml = '';
            if (product.url) {
                let displayUrl = product.url;
                try {
                    const urlObj = new URL(product.url);
                    displayUrl = urlObj.hostname;
                } catch (e) { }

                urlHtml = `
                    <span class="meta-item">
                        <i class="fa-solid fa-link fa-sm"></i>
                        <a href="${escapeHTML(product.url)}" target="_blank" class="meta-link">${escapeHTML(displayUrl)}</a>
                    </span>
                `;
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
                        ${urlHtml}
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

// Utility
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Start application
init();
