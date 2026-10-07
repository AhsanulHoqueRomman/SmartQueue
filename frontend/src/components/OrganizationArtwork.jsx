import ImageWithFallback from './ImageWithFallback';

export default function OrganizationArtwork({ organization, preferConfiguredMedia = false }) {
  const source = organization.cover_image;
  const local = source && (source.startsWith('/') || source.startsWith(window.location.origin));
  const fallback = <svg className="discovery-org-art" viewBox="0 0 400 180" role="img" aria-label={`Illustrated storefront for ${organization.name}`}>
    <rect width="400" height="180" fill="var(--lp-bg-subtle)" />
    <g fill="var(--lp-border)"><path d="M0 62h52v100H0zM340 30h60v132h-60zM20 44h46v118H20z" /></g>
    <path d="M80 164V40h238v124" fill="var(--lp-surface)" stroke="var(--lp-border-med)" strokeWidth="2" />
    <path d="M72 40h254v10H72z" fill="var(--lp-sage)" />
    <rect x="94" y="62" width="211" height="34" rx="3" fill="var(--lp-sage-bg)" />
    <text x="200" y="83" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--lp-text)">{organization.name}</text>
    <g fill="var(--lp-bg-deeper)" stroke="var(--lp-border-med)"><rect x="100" y="110" width="44" height="38" /><rect x="256" y="110" width="44" height="38" /><path d="M174 164v-54h52v54" /></g>
    <path d="M200 110v54M100 129h44M256 129h44M0 168h400" stroke="var(--lp-border-med)" strokeWidth="2" />
    <g fill="var(--lp-sage)"><path d="M45 164v-45h4v45M350 164v-52h4v52" /><circle cx="47" cy="107" r="19" /><circle cx="352" cy="97" r="22" /></g>
  </svg>;
  return <ImageWithFallback src={preferConfiguredMedia || local ? source : null} alt={organization.name} className="discovery-org-art" fallback={fallback} />;
}
