import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import organizationService from '../services/organizationService';
import DiscoveryRail from './DiscoveryRail';
import OrganizationArtwork from './OrganizationArtwork';
import CategoryIcon from './CategoryIcon';
import '../styles/LandingPhaseTwo.css';

export function CategoryDiscoverySection({ organizations }) {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    organizationService.getGlobalCategories().then(data => { if (current) setCategories(data); }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, []);
  return <section className="phase-two-section category-discovery" aria-labelledby="category-heading">
    <span className="discovery-eyebrow">Find your next service</span><h2 id="category-heading">Browse by Service Category</h2>
    <p className="discovery-intro">Everyday care, expert advice and practical services. Start with what you need.</p>
    {error ? <p role="status">Categories are unavailable. <Link to="/organizations">Browse organizations</Link></p> : !categories.length ? <p role="status">Loading categories…</p>
      : <DiscoveryRail label="service categories" items={categories} renderItem={category => {
        const count = organizations.filter(org => org.industry_type === category.industry_type).length;
        return <Link key={category.id} className="discovery-category" to={`/organizations?industry=${encodeURIComponent(category.industry_type)}`}>
        <span className="discovery-category-icon" aria-hidden="true"><CategoryIcon industry={category.industry_type} /></span>
        <h3>{category.name}</h3><span>{count} {count === 1 ? 'organization' : 'organizations'}</span>
      </Link>; }} />}
  </section>;
}

export function PopularOrganizationsSection({ organizations, loading, error }) {
  return <section className="phase-two-section" aria-labelledby="popular-heading">
    <span className="discovery-eyebrow">Explore the community</span><h2 id="popular-heading">Popular Organizations</h2>
    <p className="discovery-intro">Meet organizations across Bangladesh, and find the right professional for your next visit.</p>
    {loading ? <p role="status">Loading organizations…</p> : error ? <p role="status">Organizations are unavailable right now. Please try again later.</p> : !organizations.length ? <p>No organizations available yet.</p>
      : <DiscoveryRail automatic label="popular organizations" items={organizations} renderItem={(org, duplicate) => <article key={org.id} className="discovery-org-card">
        <OrganizationArtwork organization={org} />
        <div className="discovery-org-body"><span className="discovery-eyebrow">{org.industry_label}</span><h3>{org.name}</h3>
          {org.reviews_count > 0 && org.rating != null && <p className="discovery-rating">★ {Number(org.rating).toFixed(1)} <span>· {org.reviews_count} reviews</span></p>}
          <p className="discovery-location">{org.address || 'Location not listed'}</p>
          <p className="discovery-counts">{org.services_count != null && <span>{org.services_count} services</span>}{org.providers_count != null && <span>{org.providers_count} professionals</span>}</p>
          <Link tabIndex={duplicate ? -1 : undefined} to={`/organizations/${org.id}`} className="lp-btn-outline">View Organization Profile</Link>
        </div>
      </article>} />}
    <Link to="/organizations" className="lp-btn-primary discovery-all">Browse All Organizations</Link>
  </section>;
}
