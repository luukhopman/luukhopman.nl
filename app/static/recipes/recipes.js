const API_URL = '/api/cookbook';

// DOM Elements
const recipeList = document.getElementById('recipe-list');
const spinner = document.getElementById('loading-spinner');
const recipeModal = document.getElementById('recipe-modal');
const modalTitle = document.getElementById('modal-title');
const recipeForm = document.getElementById('recipe-form');
const recipeIdInput = document.getElementById('recipe-id');
const recipeUrlInput = document.getElementById('recipe-url');
const convertUnitsToggle = document.getElementById('convert-units-toggle');
const recipeTitleInput = document.getElementById('recipe-title');
const recipeDescriptionInput = document.getElementById('recipe-description');
const recipeIngredientsInput = document.getElementById('recipe-ingredients');
const recipeInstructionsInput = document.getElementById('recipe-instructions');
const showAddFormBtn = document.getElementById('show-add-form-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const searchInput = document.getElementById('recipe-search');
const filterPills = document.querySelectorAll('.filter-pill');

// View Modal Elements
const viewModal = document.getElementById('view-modal');
const viewTitle = document.getElementById('view-title');
const viewDescription = document.getElementById('view-description');
const viewIngredientsList = document.getElementById('view-ingredients-list');
const viewInstructionsContent = document.getElementById('view-instructions-content');
const viewNotesSection = document.getElementById('view-notes-section');
const viewNotesInput = document.getElementById('view-notes-input');
const viewSaveNotesBtn = document.getElementById('view-save-notes-btn');
const viewNotesStatus = document.getElementById('view-notes-status');
const viewNotesContent = document.getElementById('view-notes-content');
const addToWishlistBtn = document.getElementById('add-to-wishlist-btn');
const addToWishlistStatus = document.getElementById('add-to-wishlist-status');
const viewLinkContainer = document.getElementById('view-link-container');
const viewEditBtn = document.getElementById('view-edit-btn');
const viewCloseBtn = document.getElementById('view-close-btn');

let recipes = [];
let currentFilter = 'all';
let searchQuery = '';
let lastParsedUrl = '';
let autoParseTimer = null;
let parseRequestCounter = 0;
let parseInFlight = false;
let modalOpenCount = 0;
let currentViewRecipeId = null;
let currentViewRecipe = null;

async function init() {
    setupEventListeners();
    await fetchRecipes();
}

function setupEventListeners() {
    showAddFormBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', () => closeModal());
    recipeForm.addEventListener('submit', handleSaveRecipe);
    recipeUrlInput.addEventListener('paste', (e) => {
        const pasted = e.clipboardData?.getData('text');
        if (pasted) {
            e.preventDefault();
            recipeUrlInput.value = pasted;
            queueAutoParse(true);
            return;
        }
        setTimeout(() => queueAutoParse(true), 0);
    });
    recipeUrlInput.addEventListener('input', () => {
        queueAutoParse(false);
    });
    recipeUrlInput.addEventListener('change', () => {
        queueAutoParse(true);
    });
    recipeUrlInput.addEventListener('blur', () => {
        queueAutoParse(true);
    });
    if (convertUnitsToggle) {
        convertUnitsToggle.addEventListener('change', handleConvertUnitsToggle);
    }

    // Close on backdrop
    recipeModal.addEventListener('click', (e) => {
        if (e.target === recipeModal) closeModal();
    });

    // Search and Filters
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderRecipes();
    });

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            renderRecipes();
        });
    });

    // View Modal Listeners
    viewCloseBtn.addEventListener('click', () => closeViewModal());
    viewModal.addEventListener('click', (e) => {
        if (e.target === viewModal) closeViewModal();
    });
    viewSaveNotesBtn.addEventListener('click', saveViewNotes);
    addToWishlistBtn.addEventListener('click', addIngredientsToWishlist);
}

function handleConvertUnitsToggle() {
    const url = normalizeRecipeUrl(recipeUrlInput.value);
    if (!url) return;
    handleParseUrl(true);
}

function queueAutoParse(immediate = false) {
    if (autoParseTimer) clearTimeout(autoParseTimer);
    if (immediate) {
        autoParseFromUrlField();
        return;
    }
    autoParseTimer = setTimeout(() => {
        autoParseFromUrlField();
    }, 350);
}

function autoParseFromUrlField() {
    const url = normalizeRecipeUrl(recipeUrlInput.value);
    if (!url) return;
    const hasParsedContent =
        !!recipeTitleInput.value.trim() ||
        !!recipeDescriptionInput.value.trim() ||
        !!recipeIngredientsInput.value.trim() ||
        !!recipeInstructionsInput.value.trim();
    if (url === lastParsedUrl && hasParsedContent) return;

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    } catch (e) {
        return;
    }

    recipeUrlInput.value = url;
    handleParseUrl();
}

async function fetchRecipes() {
    showSpinner();
    try {
        const response = await fetch(API_URL);
        if (response.status === 401) {
            window.location.href = '/login?redirect=/cookbook';
            return;
        }
        if (!response.ok) throw new Error('Failed to fetch recipes');
        recipes = await response.json();
        renderRecipes();
        openRecipeFromQueryParam();
    } catch (error) {
        console.error('Error:', error);
    } finally {
        hideSpinner();
    }
}

function openRecipeFromQueryParam() {
    const params = new URLSearchParams(window.location.search);
    const recipeParam = params.get('recipe');
    if (!recipeParam) return;
    const recipeId = Number(recipeParam);
    if (!Number.isFinite(recipeId)) return;
    const recipe = recipes.find(r => r.id === recipeId);
    if (recipe) openViewModal(recipe);
}


async function handleSaveRecipe(e) {
    e.preventDefault();
    const id = recipeIdInput.value;
    const recipeData = {
        title: recipeTitleInput.value,
        url: recipeUrlInput.value,
        description: recipeDescriptionInput.value,
        ingredients: recipeIngredientsInput.value,
        instructions: recipeInstructionsInput.value
    };

    try {
        const method = id ? 'PATCH' : 'POST';
        const endpoint = new URL(id ? `${API_URL}/${id}` : API_URL, window.location.origin);
        endpoint.searchParams.set('convert_units', String(isUnitConversionEnabled()));

        const response = await fetch(`${endpoint.pathname}${endpoint.search}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recipeData)
        });

        if (response.ok) {
            closeModal();
            await fetchRecipes();
        } else {
            const details = await response.text();
            throw new Error(`Failed to save recipe (${response.status}): ${details}`);
        }
    } catch (error) {
        console.error('Error saving recipe:', error);
        alert('Could not save recipe. Please try again and check your server logs.');
    }
}

async function handleParseUrl(force = false) {
    const url = normalizeRecipeUrl(recipeUrlInput.value);
    if (!url) return;
    if (parseInFlight && !force) return;
    recipeUrlInput.value = url;
    const requestId = ++parseRequestCounter;
    parseInFlight = true;

    try {
        const query = new URLSearchParams({
            url,
            convert_units: String(isUnitConversionEnabled())
        });
        const response = await fetch(`/api/cookbook/parse?${query.toString()}`);
        if (!response.ok) {
            const details = await response.text();
            throw new Error(`Parsing failed (${response.status}): ${details}`);
        }
        const data = await response.json();
        if (requestId !== parseRequestCounter) return;

        recipeTitleInput.value = data.title || '';
        recipeDescriptionInput.value = data.description || '';
        recipeIngredientsInput.value = data.ingredients || '';
        recipeInstructionsInput.value = data.instructions || '';
        lastParsedUrl = url;
    } catch (error) {
        if (requestId !== parseRequestCounter) return;
        console.error('Parse error:', error);
    } finally {
        if (requestId === parseRequestCounter) {
            parseInFlight = false;
        }
    }
}

function normalizeRecipeUrl(raw) {
    const value = (raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('www.')) return `https://${value}`;
    if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
    return value;
}

function isUnitConversionEnabled() {
    return convertUnitsToggle ? convertUnitsToggle.checked : true;
}

function lockBodyScroll() {
    if (modalOpenCount === 0) {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        document.body.dataset.scrollY = String(scrollY);
        document.body.style.top = `-${scrollY}px`;
        document.body.classList.add('modal-open');
    }
    modalOpenCount += 1;
}

function unlockBodyScroll() {
    if (modalOpenCount === 0) return;
    modalOpenCount -= 1;
    if (modalOpenCount > 0) return;

    const savedScrollY = Number(document.body.dataset.scrollY || '0');
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    delete document.body.dataset.scrollY;
    window.scrollTo(0, savedScrollY);
}

function openModal(recipe = null) {
    const wasHidden = recipeModal.classList.contains('hidden');
    if (recipe) {
        modalTitle.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Recipe';
        recipeIdInput.value = recipe.id;
        recipeUrlInput.value = recipe.url || '';
        recipeTitleInput.value = recipe.title;
        recipeDescriptionInput.value = recipe.description || '';
        recipeIngredientsInput.value = recipe.ingredients || '';
        recipeInstructionsInput.value = recipe.instructions || '';
        lastParsedUrl = recipe.url || '';
        if (convertUnitsToggle) convertUnitsToggle.checked = true;
    } else {
        modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> New Recipe';
        recipeForm.reset();
        recipeIdInput.value = '';
        lastParsedUrl = '';
        if (convertUnitsToggle) convertUnitsToggle.checked = true;
    }
    recipeModal.classList.remove('hidden');
    if (wasHidden) lockBodyScroll();
}

function closeModal() {
    if (recipeModal.classList.contains('hidden')) return;
    recipeModal.classList.add('hidden');
    unlockBodyScroll();
}

function openViewModal(recipe) {
    const wasHidden = viewModal.classList.contains('hidden');
    currentViewRecipeId = recipe.id;
    currentViewRecipe = recipe;
    viewTitle.textContent = recipe.title || 'Untitled Recipe';
    viewDescription.textContent = recipe.description || '';
    addToWishlistStatus.classList.add('hidden');
    addToWishlistStatus.textContent = '';

    // Render Ingredients with checkboxes
    viewIngredientsList.innerHTML = '';
    const ingredients = (recipe.ingredients || '').split('\n')
        .map(i => i.trim())
        .filter(i => i && i !== '-' && i !== '•');

    ingredients.forEach(item => {
        const li = document.createElement('li');
        // Remove common bullet prefixes
        const cleanItem = item.replace(/^[-•*]\s*/, '');
        li.innerHTML = `
            <input type="checkbox">
            <span class="ingredient-text">${escapeHTML(cleanItem)}</span>
            <button type="button" class="ingredient-add-btn" title="Add this ingredient to wishlist">
                <i class="fa-solid fa-plus"></i>
            </button>
        `;
        li.addEventListener('click', (e) => {
            if (e.target.closest('.ingredient-add-btn')) {
                return;
            }
            if (e.target.tagName !== 'INPUT') {
                const cb = li.querySelector('input');
                cb.checked = !cb.checked;
            }
            li.classList.toggle('checked');
        });

        const addBtn = li.querySelector('.ingredient-add-btn');
        addBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await addIngredientToWishlist(cleanItem, addBtn);
        });
        viewIngredientsList.appendChild(li);
    });

    // Render Instructions as numbered list
    viewInstructionsContent.innerHTML = '';
    const instructions = (recipe.instructions || '').split('\n')
        .map(i => i.trim())
        .filter(i => i && !/^\d+\.?$/.test(i)); // Filter out standalone numbers

    instructions.forEach((step, idx) => {
        const div = document.createElement('div');
        div.className = 'instruction-step';
        // Remove existing number prefixes if present
        const cleanStep = step.replace(/^\d+[\.\)\-]?\s*/, '');
        div.innerHTML = `
            <div class="step-number">${idx + 1}</div>
            <div class="step-text">${escapeHTML(cleanStep)}</div>
        `;
        viewInstructionsContent.appendChild(div);
    });

    // Render Notes
    const notes = recipe.notes || '';
    viewNotesInput.value = notes;
    viewNotesContent.textContent = notes || 'No notes yet.';
    viewNotesStatus.classList.add('hidden');

    // External Link Badge
    viewLinkContainer.innerHTML = '';
    if (recipe.url) {
        try {
            const domain = new URL(recipe.url).hostname.replace('www.', '');
            const badge = document.createElement('a');
            badge.href = recipe.url;
            badge.target = '_blank';
            badge.className = 'recipe-link-badge view-badge';
            badge.innerHTML = `<i class="fa-solid fa-link"></i> Open ${domain}`;
            viewLinkContainer.appendChild(badge);
        } catch (e) { }
    }

    // Edit button inside view
    viewEditBtn.onclick = () => {
        closeViewModal();
        openModal(recipe);
    };

    viewModal.classList.remove('hidden');
    if (wasHidden) lockBodyScroll();
}

function closeViewModal() {
    if (viewModal.classList.contains('hidden')) return;
    viewModal.classList.add('hidden');
    currentViewRecipeId = null;
    currentViewRecipe = null;
    unlockBodyScroll();
}

function collectIngredientsForWishlist() {
    const allIngredients = [];
    const checkedIngredients = [];

    viewIngredientsList.querySelectorAll('li').forEach((li) => {
        const text = li.querySelector('.ingredient-text')?.textContent?.trim();
        if (!text) return;
        allIngredients.push(text);
        if (li.querySelector('input')?.checked) checkedIngredients.push(text);
    });

    return checkedIngredients.length ? checkedIngredients : allIngredients;
}

async function addIngredientsToWishlist() {
    if (!currentViewRecipe) {
        addToWishlistStatus.textContent = 'Open a recipe first.';
        addToWishlistStatus.classList.remove('hidden');
        return;
    }

    const ingredients = collectIngredientsForWishlist();
    if (!ingredients.length) {
        addToWishlistStatus.textContent = 'No ingredients to add.';
        addToWishlistStatus.classList.remove('hidden');
        return;
    }

    addToWishlistBtn.disabled = true;
    const prevLabel = addToWishlistBtn.innerHTML;
    addToWishlistBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
    addToWishlistStatus.textContent = 'Adding ingredients...';
    addToWishlistStatus.classList.remove('hidden');

    try {
        const result = await importIngredientsToWishlist(ingredients);

        const { added, skipped } = result;
        setWishlistStatus(`Added ${added} ingredient${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''} to`);
        addToWishlistStatus.classList.remove('hidden');
    } catch (error) {
        console.error('Error adding ingredients to wishlist:', error);
        addToWishlistStatus.textContent = 'Could not add ingredients right now.';
        addToWishlistStatus.classList.remove('hidden');
    } finally {
        addToWishlistBtn.disabled = false;
        addToWishlistBtn.innerHTML = prevLabel;
    }
}

async function importIngredientsToWishlist(ingredients) {
    const recipeId = currentViewRecipe?.id || null;
    const response = await fetch('/api/cookbook/wishlist/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ingredients,
            store: currentViewRecipe?.title || 'Cookbook',
            recipe_id: recipeId,
            source_url: currentViewRecipe?.url || null
        })
    });

    if (response.status === 401) {
        window.location.href = '/login?redirect=/cookbook';
        throw new Error('Unauthorized');
    }
    if (!response.ok) {
        // Backward-compatible fallback while backend import endpoint is unavailable
        // or temporarily failing on older/newer mixed deployments.
        return importIngredientsViaWishlistApi(ingredients);
    }

    return response.json();
}

async function importIngredientsViaWishlistApi(ingredients) {
    const store = currentViewRecipe?.title || 'Cookbook';
    const cookbookLink = currentViewRecipe?.id ? `/cookbook?recipe=${currentViewRecipe.id}` : '/cookbook';

    const existingResponse = await fetch('/api/wishlist/products');
    if (existingResponse.status === 401) {
        window.location.href = '/login?redirect=/cookbook';
        throw new Error('Unauthorized');
    }
    if (!existingResponse.ok) {
        const details = await existingResponse.text();
        throw new Error(`Failed to load wishlist items (${existingResponse.status}): ${details}`);
    }

    const existingProducts = await existingResponse.json();
    const existingKeys = new Set(
        existingProducts
            .filter(p => !p.is_deleted)
            .map(p => `${(p.name || '').trim().toLowerCase()}::${(p.store || '').trim().toLowerCase()}`)
    );

    let added = 0;
    let skipped = 0;

    for (const ingredient of ingredients) {
        const key = `${ingredient.trim().toLowerCase()}::${store.trim().toLowerCase()}`;
        if (!ingredient.trim() || existingKeys.has(key)) {
            skipped += 1;
            continue;
        }

        const createResponse = await fetch('/api/wishlist/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: ingredient,
                store,
                url: cookbookLink
            })
        });

        if (createResponse.status === 401) {
            window.location.href = '/login?redirect=/cookbook';
            throw new Error('Unauthorized');
        }
        if (!createResponse.ok) {
            const details = await createResponse.text();
            throw new Error(`Failed to add "${ingredient}" (${createResponse.status}): ${details}`);
        }

        existingKeys.add(key);
        added += 1;
    }

    return { added, skipped };
}

async function addIngredientToWishlist(ingredient, button) {
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        const { added, skipped } = await importIngredientsToWishlist([ingredient]);
        if (added > 0) {
            button.innerHTML = '<i class="fa-solid fa-check"></i>';
            button.classList.add('added');
            setWishlistStatus(`Added "${escapeHTML(ingredient)}" to`);
        } else if (skipped > 0) {
            button.innerHTML = '<i class="fa-solid fa-check"></i>';
            button.classList.add('added');
            setWishlistStatus(`"${escapeHTML(ingredient)}" is already in`);
        } else {
            button.innerHTML = originalHtml;
        }
        addToWishlistStatus.classList.remove('hidden');
    } catch (error) {
        console.error('Error adding ingredient to wishlist:', error);
        button.innerHTML = originalHtml;
        addToWishlistStatus.textContent = `Could not add "${ingredient}".`;
        addToWishlistStatus.classList.remove('hidden');
    } finally {
        button.disabled = false;
    }
}

function setWishlistStatus(prefixText) {
    addToWishlistStatus.innerHTML = `${prefixText} <a href="/wishlist">Wishlist</a>.`;
}

async function saveViewNotes() {
    if (!currentViewRecipeId) return;

    viewSaveNotesBtn.disabled = true;
    viewNotesStatus.classList.add('hidden');
    const notes = viewNotesInput.value.trim();

    try {
        const response = await fetch(`${API_URL}/${currentViewRecipeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
        });

        if (!response.ok) {
            const details = await response.text();
            throw new Error(`Failed to save note (${response.status}): ${details}`);
        }

        const recipe = recipes.find(r => r.id === currentViewRecipeId);
        if (recipe) recipe.notes = notes;
        viewNotesContent.textContent = notes || 'No notes yet.';
        viewNotesStatus.textContent = 'Saved';
        viewNotesStatus.classList.remove('hidden');
    } catch (error) {
        console.error('Error saving note:', error);
        viewNotesStatus.textContent = 'Save failed';
        viewNotesStatus.classList.remove('hidden');
    } finally {
        viewSaveNotesBtn.disabled = false;
    }
}

function renderRecipes() {
    recipeList.innerHTML = '';

    // Filter and Search logic
    let filtered = recipes.filter(recipe => {
        const matchesSearch =
            (recipe.title || '').toLowerCase().includes(searchQuery) ||
            (recipe.description || '').toLowerCase().includes(searchQuery) ||
            (recipe.ingredients || '').toLowerCase().includes(searchQuery);

        let matchesFilter = true;
        if (currentFilter === 'link') {
            matchesFilter = !!recipe.url;
        } else if (currentFilter === 'recent') {
            const created = new Date(recipe.created_at);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            matchesFilter = created > sevenDaysAgo;
        }

        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        recipeList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-cookie-bite"></i>
                <p>${searchQuery || currentFilter !== 'all' ? 'No recipes match your criteria.' : 'No recipes yet. Add one!'}</p>
            </div>
        `;
        return;
    }

    filtered.forEach((recipe, index) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.style.animationDelay = `${index * 0.1}s`;

        // Card click opens VIEW modal
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.recipe-link-badge') && !e.target.closest('.edit-card-btn')) {
                openViewModal(recipe);
            }
        });

        let linkHtml = '';
        if (recipe.url) {
            try {
                const domain = new URL(recipe.url).hostname.replace('www.', '');
                linkHtml = `<a href="${recipe.url}" target="_blank" class="recipe-link-badge" title="Open source link">
                    <i class="fa-solid fa-link"></i> ${domain}
                </a>`;
            } catch (e) { }
        }

        const title = escapeHTML(recipe.title || 'Untitled Recipe');

        card.innerHTML = `
            <div class="card-top">
                ${linkHtml}
                <button class="edit-card-btn" title="Edit Recipe">
                    <i class="fa-solid fa-pen"></i>
                </button>
            </div>
            <h3>${title}</h3>
            <p>${escapeHTML(recipe.description || 'No description')}</p>
            <div class="recipe-meta">Created ${timeAgo(recipe.created_at)}</div>
        `;

        // Stop propagation on link badge and edit button handled by internal content or listeners
        const editBtn = card.querySelector('.edit-card-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openModal(recipe);
        });

        const linkBadge = card.querySelector('.recipe-link-badge');
        if (linkBadge) {
            linkBadge.addEventListener('click', (e) => e.stopPropagation());
        }

        recipeList.appendChild(card);
    });
}

function showSpinner() {
    spinner.classList.remove('hidden');
    recipeList.classList.add('hidden');
}

function hideSpinner() {
    spinner.classList.add('hidden');
    recipeList.classList.remove('hidden');
}

function normalizeText(str) {
    if (!str) return '';
    // Map of common fraction entities/unicodes to plain text
    const fractions = {
        '&frac14;': '1/4',
        '¼': '1/4',
        '&frac12;': '1/2',
        '½': '1/2',
        '&frac34;': '3/4',
        '¾': '3/4',
        '&frac18;': '1/8',
        '⅛': '1/8',
        '&frac38;': '3/8',
        '⅜': '3/8',
        '&frac58;': '5/8',
        '⅝': '5/8',
        '&frac78;': '7/8',
        '⅞': '7/8'
    };

    let normalized = str;
    for (const [key, val] of Object.entries(fractions)) {
        normalized = normalized.split(key).join(val);
    }
    return normalized;
}

function escapeHTML(str) {
    if (!str) return '';
    const normalized = normalizeText(str);
    const div = document.createElement('div');
    div.textContent = normalized;
    return div.innerHTML;
}

function timeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

init();
