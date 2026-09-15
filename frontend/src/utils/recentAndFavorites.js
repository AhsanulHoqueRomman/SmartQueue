const RECENT_KEY = 'sq_recently_viewed_orgs';
const FAVORITES_KEY = 'sq_favorite_orgs';

export const getRecentlyViewedOrgs = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
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
      category: org.category || 'HEALTHCARE',
      rating: org.rating || '4.9',
      reviews_count: org.reviews_count || 12,
      services_count: org.services_count || 4,
      address: org.address || '',
      viewed_at: new Date().toISOString(),
    };
    const updated = [item, ...filtered].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error updating recently viewed orgs:', err);
  }
};

export const getFavoriteOrgs = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
};

export const isFavoriteOrg = (orgId) => {
  if (!orgId) return false;
  const current = getFavoriteOrgs();
  return current.some((o) => String(o.id) === String(orgId));
};

export const toggleFavoriteOrg = (org) => {
  if (!org || !org.id) return false;
  try {
    const current = getFavoriteOrgs();
    const exists = current.some((o) => String(o.id) === String(org.id));
    let updated = [];
    if (exists) {
      updated = current.filter((o) => String(o.id) !== String(org.id));
    } else {
      const item = {
        id: org.id,
        name: org.name,
        category: org.category || 'HEALTHCARE',
        rating: org.rating || '4.9',
        reviews_count: org.reviews_count || 12,
        services_count: org.services_count || 4,
        address: org.address || '',
        saved_at: new Date().toISOString(),
      };
      updated = [item, ...current];
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    return !exists;
  } catch (err) {
    console.error('Error toggling favorite org:', err);
    return false;
  }
};
