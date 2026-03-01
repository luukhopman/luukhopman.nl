export function normalizeText(str) {
    if (!str) return '';
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

export function escapeHTML(str) {
    if (!str) return '';
    const normalized = normalizeText(str);
    const div = document.createElement('div');
    div.textContent = normalized;
    return div.innerHTML;
}

export function timeAgo(dateString) {
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

export function normalizeRecipeUrl(raw) {
    const value = (raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('www.')) return `https://${value}`;
    if (/^[^\s]+\.[^\s]+$/.test(value)) return `https://${value}`;
    return value;
}

