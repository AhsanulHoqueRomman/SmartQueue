import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import organizationService from '../services/organizationService';
import { getRecentlyViewedOrgs } from '../utils/recentAndFavorites';
import '../styles/LandingPolish.css';

export default function RecentlyViewedOrganizations() {
  const { user } = useAuth();
  const { effectiveRole } = useTenant();
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!user || effectiveRole !== 'CUSTOMER') return;
    let active = true;
    // Stored IDs preserve visit order; public API fields avoid stale/fabricated cached ratings.
    const recent = getRecentlyViewedOrgs().slice(0, 5);
    Promise.all(recent.map(item => organizationService.getOrganizationDetail(item.id).catch(() => null)))
      .then(rows => { if (active) setItems(rows.filter(Boolean)); });
    return () => { active = false; };
  }, [user, effectiveRole]);
  if (!user || effectiveRole !== 'CUSTOMER' || !items.length) return null;
  return <section className="customer-recent-history" aria-labelledby="recent-history-heading"><header><div><span className="discovery-eyebrow">Your browsing history</span><h2 id="recent-history-heading">Recently Viewed Clinics &amp; Organizations</h2></div><span>{items.length} recently viewed</span></header><div>{items.map(org => <Link key={org.id} to={`/organizations/${org.id}`}><strong>{org.name}</strong><span>{org.industry_label || org.industry_type || ''}</span>{org.rating != null && org.reviews_count > 0 && <span className="recent-rating">★ {org.rating} · {org.reviews_count} reviews</span>}<span className="recent-profile">View Organization Profile</span></Link>)}</div></section>;
}
