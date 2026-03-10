import { escapeHTML, normalizeRecipeUrl, timeAgo } from '/static/recipes/recipes.utils.js';

const API_URL = '/api/cookbook';

// DOM Elements
const recipeList = document.getElementById('recipe-list');
const spinner = document.getElementById('loading-spinner');
const recipeModal = document.getElementById('recipe-modal');
const modalTitle = document.getElementById('modal-title');
const recipeForm = document.getElementById('recipe-form');
const recipeIdInput = document.getElementById('recipe-id');
const recipeUrlInput = document.getElementById('recipe-url');
const reparseRecipeBtn = document.getElementById('reparse-recipe-btn');
const parseStatus = document.getElementById('parse-status');
const recipeTitleInput = document.getElementById('recipe-title');
const recipeCourseInput = document.getElementById('recipe-course');
const recipeIngredientsInput = document.getElementById('recipe-ingredients');
const recipeInstructionsInput = document.getElementById('recipe-instructions');
const showAddFormBtn = document.getElementById('show-add-form-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const searchInput = document.getElementById('recipe-search');
const courseFilter = document.getElementById('course-filter');
const filterPills = document.querySelectorAll('.filter-pill');

// View Modal Elements
const viewModal = document.getElementById('view-modal');
const viewTitle = document.getElementById('view-title');
const viewCourse = document.getElementById('view-course');
const viewIngredientsList = document.getElementById('view-ingredients-list');
const viewInstructionsContent = document.getElementById('view-instructions-content');
const viewNotesInput = document.getElementById('view-notes-input');
const viewSaveNotesBtn = document.getElementById('view-save-notes-btn');
const viewNotesStatus = document.getElementById('view-notes-status');
const viewNotesContent = document.getElementById('view-notes-content');
const addToWishlistBtn = document.getElementById('add-to-wishlist-btn');
const addToWishlistStatus = document.getElementById('add-to-wishlist-status');
const viewLinkContainer = document.getElementById('view-link-container');
const viewDeleteBtn = document.getElementById('view-delete-btn');
const viewEditBtn = document.getElementById('view-edit-btn');
const viewCloseBtn = document.getElementById('view-close-btn');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

let recipes = [];
let currentFilter = 'all';
let currentCourseFilter = '';
let searchQuery = '';
let lastParsedUrl = '';
let autoParseTimer = null;
let parseStatusTimer = null;
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
            updateParseButtonState();
            setParseStatus('Link pasted. Importing recipe...', 'loading', { persist: true });
            queueAutoParse(true);
            return;
        }
        setTimeout(() => {
            updateParseButtonState();
            queueAutoParse(true);
        }, 0);
    });
    recipeUrlInput.addEventListener('input', () => {
        updateParseButtonState();
        queueAutoParse(false);
    });
    recipeUrlInput.addEventListener('change', () => {
        updateParseButtonState();
        queueAutoParse(true);
    });
    recipeUrlInput.addEventListener('blur', () => {
        queueAutoParse(true);
    });
    if (reparseRecipeBtn) {
        reparseRecipeBtn.addEventListener('click', () => {
            handleParseUrl(true);
        });
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
    if (courseFilter) {
        courseFilter.addEventListener('change', (e) => {
            currentCourseFilter = (e.target.value || '').toLowerCase();
            renderRecipes();
        });
    }

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
    if (viewDeleteBtn) {
        viewDeleteBtn.addEventListener('click', () => {
            if (!currentViewRecipeId) return;
            handleDeleteRecipe(currentViewRecipeId);
        });
    }
    viewModal.addEventListener('click', (e) => {
        if (e.target === viewModal) closeViewModal();
    });
    viewSaveNotesBtn.addEventListener('click', saveViewNotes);
    addToWishlistBtn.addEventListener('click', addIngredientsToWishlist);
}

function updateParseButtonState() {
    if (!reparseRecipeBtn) return;
    const hasUrl = !!normalizeRecipeUrl(recipeUrlInput.value);
    reparseRecipeBtn.classList.toggle('loading', parseInFlight);
    reparseRecipeBtn.disabled = parseInFlight || !hasUrl;
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
    if (!url) {
        if (parseStatus) parseStatus.classList.add('hidden');
        return;
    }
    const hasParsedContent =
        !!recipeTitleInput.value.trim() ||
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
        populateCourseFilterOptions();
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
        course: recipeCourseInput.value,
        url: recipeUrlInput.value,
        ingredients: recipeIngredientsInput.value,
        instructions: recipeInstructionsInput.value
    };

    try {
        const method = id ? 'PATCH' : 'POST';
        const endpoint = new URL(id ? `${API_URL}/${id}` : API_URL, window.location.origin);
        endpoint.searchParams.set('convert_units', 'true');

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

async function handleDeleteRecipe(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    const recipeTitle = (recipe?.title || 'this recipe').trim();
    const confirmed = await showConfirm(
        'Delete recipe?',
        `"${recipeTitle}" will be permanently removed. This cannot be undone.`
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_URL}/${recipeId}`, {
            method: 'DELETE'
        });

        if (response.status === 401) {
            window.location.href = '/login?redirect=/cookbook';
            return;
        }
        if (!response.ok) {
            const details = await response.text();
            throw new Error(`Failed to delete recipe (${response.status}): ${details}`);
        }

        if (currentViewRecipeId === recipeId) {
            closeViewModal();
        }
        recipes = recipes.filter(r => r.id !== recipeId);
        renderRecipes();
    } catch (error) {
        console.error('Error deleting recipe:', error);
        alert('Could not delete recipe right now. Please try again.');
    }
}

function showConfirm(title, message) {
    if (!confirmModal || !confirmTitle || !confirmMessage || !confirmOkBtn || !confirmCancelBtn) {
        return Promise.resolve(window.confirm(message || title || 'Are you sure?'));
    }

    return new Promise((resolve) => {
        confirmTitle.textContent = title || 'Are you sure?';
        confirmMessage.textContent = message || '';
        confirmModal.classList.remove('hidden');
        lockBodyScroll();

        const icon = confirmModal.querySelector('.confirm-icon');
        if (icon) {
            icon.style.animation = 'none';
            icon.offsetHeight;
            icon.style.animation = '';
        }

        function cleanup(result) {
            confirmOkBtn.removeEventListener('click', onOk);
            confirmCancelBtn.removeEventListener('click', onCancel);
            confirmModal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKeyDown);
            confirmModal.classList.add('hidden');
            unlockBodyScroll();
            resolve(result);
        }

        function onOk() {
            cleanup(true);
        }

        function onCancel() {
            cleanup(false);
        }

        function onBackdrop(e) {
            if (e.target === confirmModal) cleanup(false);
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') cleanup(false);
        }

        confirmOkBtn.addEventListener('click', onOk);
        confirmCancelBtn.addEventListener('click', onCancel);
        confirmModal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKeyDown);
    });
}

async function handleParseUrl(force = false) {
    const url = normalizeRecipeUrl(recipeUrlInput.value);
    if (!url) return;
    if (parseInFlight && !force) return;
    recipeUrlInput.value = url;
    const requestId = ++parseRequestCounter;
    parseInFlight = true;
    updateParseButtonState();
    setParseStatus('Importing recipe from link...', 'loading', { persist: true });

    try {
        const query = new URLSearchParams({
            url,
            convert_units: 'true'
        });
        const response = await fetch(`/api/cookbook/parse?${query.toString()}`);
        if (!response.ok) {
            const details = await response.text();
            throw new Error(`Parsing failed (${response.status}): ${details}`);
        }
        const data = await response.json();
        if (requestId !== parseRequestCounter) return;

        recipeTitleInput.value = data.title || '';
        recipeCourseInput.value = data.course || '';
        recipeIngredientsInput.value = data.ingredients || '';
        recipeInstructionsInput.value = data.instructions || '';
        lastParsedUrl = url;

        const hasIngredients = !!(data.ingredients || '').trim();
        const hasInstructions = !!(data.instructions || '').trim();
        const hasCoreRecipeData = hasIngredients || hasInstructions;
        const parseError = (data.parse_error || '').trim();

        if (hasCoreRecipeData) {
            setParseStatus('Recipe imported successfully.', 'success');
        } else if (parseError) {
            setParseStatus(parseError, 'error');
        } else {
            setParseStatus('Could not import recipe details from this link.', 'error');
        }
    } catch (error) {
        if (requestId !== parseRequestCounter) return;
        console.error('Parse error:', error);
        setParseStatus('Could not import this link. Try a different one.', 'error');
    } finally {
        if (requestId === parseRequestCounter) {
            parseInFlight = false;
            updateParseButtonState();
        }
    }
}

function setParseStatus(message, type = 'loading', options = {}) {
    if (!parseStatus) return;

    const { persist = false } = options;
    parseStatus.textContent = message || '';
    parseStatus.classList.remove('hidden', 'parse-status-loading', 'parse-status-success', 'parse-status-error');

    if (type === 'success') {
        parseStatus.classList.add('parse-status-success');
    } else if (type === 'error') {
        parseStatus.classList.add('parse-status-error');
    } else {
        parseStatus.classList.add('parse-status-loading');
    }

    if (parseStatusTimer) {
        clearTimeout(parseStatusTimer);
        parseStatusTimer = null;
    }

    if (!persist) {
        parseStatusTimer = setTimeout(() => {
            parseStatus.classList.add('hidden');
        }, 2400);
    }
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
    if (parseStatusTimer) {
        clearTimeout(parseStatusTimer);
        parseStatusTimer = null;
    }
    if (parseStatus) {
        parseStatus.textContent = '';
        parseStatus.classList.add('hidden');
        parseStatus.classList.remove('parse-status-loading', 'parse-status-success', 'parse-status-error');
    }
    if (recipe) {
        modalTitle.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Recipe';
        recipeIdInput.value = recipe.id;
        recipeUrlInput.value = recipe.url || '';
        recipeTitleInput.value = recipe.title;
        recipeCourseInput.value = recipe.course || '';
        recipeIngredientsInput.value = recipe.ingredients || '';
        recipeInstructionsInput.value = recipe.instructions || '';
        lastParsedUrl = recipe.url || '';
    } else {
        modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> New Recipe';
        recipeForm.reset();
        recipeIdInput.value = '';
        lastParsedUrl = '';
    }
    updateParseButtonState();
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
    const course = (recipe.course || '').trim();
    if (course) {
        viewCourse.textContent = course;
        viewCourse.classList.remove('hidden');
    } else {
        viewCourse.textContent = '';
        viewCourse.classList.add('hidden');
    }
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
            badge.title = domain;
            badge.innerHTML = `
                <i class="fa-solid fa-link"></i>
                <span class="recipe-link-badge-label">Source: ${escapeHTML(domain)}</span>
            `;
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
    populateCourseFilterOptions();

    // Filter and Search logic
    let filtered = recipes.filter(recipe => {
        const matchesSearch =
            (recipe.title || '').toLowerCase().includes(searchQuery) ||
            (recipe.description || '').toLowerCase().includes(searchQuery) ||
            (recipe.ingredients || '').toLowerCase().includes(searchQuery) ||
            (recipe.course || '').toLowerCase().includes(searchQuery);

        const matchesCourse = !currentCourseFilter || (recipe.course || '').toLowerCase() === currentCourseFilter;

        let matchesFilter = true;
        if (currentFilter === 'link') {
            matchesFilter = !!recipe.url;
        } else if (currentFilter === 'recent') {
            const created = new Date(recipe.created_at);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            matchesFilter = created > sevenDaysAgo;
        }

        return matchesSearch && matchesFilter && matchesCourse;
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
            if (
                !e.target.closest('.recipe-link-badge') &&
                !e.target.closest('.edit-card-btn')
            ) {
                openViewModal(recipe);
            }
        });

        let linkHtml = '';
        if (recipe.url) {
            try {
                const domain = new URL(recipe.url).hostname.replace('www.', '');
                linkHtml = `<a href="${recipe.url}" target="_blank" class="recipe-link-badge" title="${escapeHTML(domain)}">
                    <i class="fa-solid fa-link"></i>
                    <span class="recipe-link-badge-label">${escapeHTML(domain)}</span>
                </a>`;
            } catch (e) { }
        }

        const title = escapeHTML(recipe.title || 'Untitled Recipe');

        card.innerHTML = `
            <div class="card-top">
                ${linkHtml}
                <div class="card-actions">
                    <button class="edit-card-btn" title="Edit Recipe">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </div>
            <h3>${title}</h3>
            ${recipe.course ? `<div class="recipe-course-pill">${escapeHTML(recipe.course)}</div>` : ''}
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

function populateCourseFilterOptions() {
    if (!courseFilter) return;

    const selectedValue = courseFilter.value || '';
    const courses = Array.from(
        new Set(
            recipes
                .map(r => (r.course || '').trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));

    courseFilter.innerHTML = '<option value="">All Courses</option>';
    courses.forEach((course) => {
        const option = document.createElement('option');
        option.value = course;
        option.textContent = course;
        courseFilter.appendChild(option);
    });

    if (selectedValue && courses.includes(selectedValue)) {
        courseFilter.value = selectedValue;
    } else if (selectedValue && !courses.includes(selectedValue)) {
        currentCourseFilter = '';
        courseFilter.value = '';
    }
}

function showSpinner() {
    spinner.classList.remove('hidden');
    recipeList.classList.add('hidden');
}

function hideSpinner() {
    spinner.classList.add('hidden');
    recipeList.classList.remove('hidden');
}

init();
