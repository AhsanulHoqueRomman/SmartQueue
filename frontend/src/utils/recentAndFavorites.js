const RECENT_KEY = 'sq_recently_viewed_orgs';
const FAVORITES_KEY = 'sq_favorite_orgs';

export const getRecentlyViewedOrgs = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows.filter(item => item && item.id) : [];
  } catch (err) {
    return [];
  }
};

export const addRecentlyViewedOrg = (org) => {
  if (!org || !org.id) return;
  try {
    const current = getRecentlyViewedOrgs();
    // Filter out existing occurrence if any
    const filtered = current.filter((o) => String(o.id) !== String(org.id));
    // Prepend new item with minimal required display properties
    const item = {
      id: org.id,
      name: org.name,
      category: org.category ?? org.industry_type ?? null,
      rating: org.rating ?? null,
      reviews_count: org.reviews_count ?? null,
      services_count: org.services_count ?? null,
      address: org.address || '',
      viewed_at: new Date().toISOString(),
    };
    const updated = [item, ...filtered].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error updating recently viewed orgs:', err);
  }
};

export const getAuthenticatedAccountId = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const token = localStorage.getItem('sq_access_token');
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    let jsonStr = '';
    if (typeof atob === 'function') {
      jsonStr = atob(base64);
    } else if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(base64, 'base64').toString('binary');
    } else {
      return null;
    }
    const decoded = decodeURIComponent(
      jsonStr
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const data = JSON.parse(decoded);
    const id = data.user_id ?? data.id ?? data.sub ?? null;
    return id ? String(id) : null;
  } catch (err) {
    return null;
  }
};

export const getFavoritesStorageKey = (accountIdentifier) => {
  const id = accountIdentifier !== undefined ? accountIdentifier : getAuthenticatedAccountId();
  if (id && String(id).trim()) {
    return `${FAVORITES_KEY}_${String(id).trim()}`;
  }
  return FAVORITES_KEY;
};

export const getFavoriteOrgs = (accountIdentifier) => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const key = getFavoritesStorageKey(accountIdentifier);
    const raw = localStorage.getItem(key);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows.filter((item) => item && item.id) : [];
  } catch (err) {
    return [];
  }
};

export const isFavoriteOrg = (orgId, accountIdentifier) => {
  if (!orgId) return false;
  const current = getFavoriteOrgs(accountIdentifier);
  return current.some((o) => String(o.id) === String(orgId));
};

export const toggleFavoriteOrg = (org, accountIdentifier) => {
  if (!org || !org.id) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    const key = getFavoritesStorageKey(accountIdentifier);
    const current = getFavoriteOrgs(accountIdentifier);
    const exists = current.some((o) => String(o.id) === String(org.id));
    let updated = [];
    if (exists) {
      updated = current.filter((o) => String(o.id) !== String(org.id));
    } else {
      const item = {
        id: org.id,
        name: org.name,
        category: org.category ?? org.industry_type ?? null,
        rating: org.rating !== undefined && org.rating !== null ? org.rating : null,
        reviews_count: org.reviews_count !== undefined && org.reviews_count !== null ? org.reviews_count : null,
        services_count: org.services_count !== undefined && org.services_count !== null ? org.services_count : null,
        address: org.address || '',
        saved_at: new Date().toISOString(),
      };
      updated = [item, ...current];
    }
    localStorage.setItem(key, JSON.stringify(updated));
    return !exists;
  } catch (err) {
    console.error('Error toggling favorite org:', err);
    return false;
  }
};
