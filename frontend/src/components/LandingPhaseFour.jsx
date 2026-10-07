import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import reviewService from '../services/reviewService';
import DiscoveryRail from './DiscoveryRail';
import useScrollPresence from '../hooks/useScrollPresence';
import { getApiDocsUrl } from '../api/client';
import '../styles/LandingPhaseFour.css';

function QueueMark() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" /></svg>;
}

export function CommunityExperiences({ organizations }) {
  const [reviews, setReviews] = useState([]);
  useEffect(() => {
    if (!organizations.length) return;
    let current = true;
    // A small cross-organization sample from the existing review endpoint.
    Promise.allSettled(organizations.slice(0, 7).map(async organization => {
      const data = await reviewService.getReviews(organization.id, { page_size: 2 });
      const rows = Array.isArray(data) ? data : data.results || [];
      return rows.filter(review => review.comment?.trim() && review.rating >= 1 && review.rating <= 5)
        .map(review => ({ id: review.id, rating: review.rating, comment: review.comment.trim(),
          name: review.customer_name || 'Client', service: review.service_name || '', organization: organization.name }));
    })).then(results => { if (current) setReviews(results.flatMap(result => result.status === 'fulfilled' ? result.value : [])); });
    return () => { current = false; };
  }, [organizations]);
  if (!reviews.length) return null;
  return <CommunityReviewRail reviews={reviews} />;
}

function CommunityReviewRail({ reviews }) {
  const [ref, entered, , supported] = useScrollPresence(.12);
  return <section ref={ref} className={`phase-four-reviews ${supported ? 'is-observed' : ''} ${entered ? 'is-revealed' : ''}`} aria-labelledby="community-heading"><div className="phase-four-inner">
    <header className="phase-four-heading"><span className="discovery-eyebrow">What our community says</span><h2 id="community-heading">What Our Patients &amp; Visitors Say</h2><p>Real experiences from people using SmartQueue across different services.</p></header>
    <DiscoveryRail label="customer experiences" items={reviews} renderItem={(review) => <article className="community-review" key={review.id} style={{ '--review-delay': `${reviews.indexOf(review) % 3 * .12}s` }}>
      <div className="community-stars" role="img" aria-label={`${review.rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(review.rating)}<span className="community-empty-stars">{'☆'.repeat(5 - review.rating)}</span></span></div>
      <blockquote><p>“{review.comment}”</p></blockquote>
      <div className="community-reviewer"><span className="community-avatar" aria-hidden="true">{review.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</span><div><strong>{review.name}</strong><span>{review.organization}</span>{review.service && <span>{review.service}</span>}</div></div>
    </article>} />
  </div></section>;
}

export function ClosingCallToAction() {
  return <section className="phase-four-closing" aria-labelledby="closing-heading"><div className="phase-four-inner"><div className="closing-panel">
    <span className="closing-mark"><QueueMark /></span><span className="discovery-eyebrow">Ready to plan your next visit?</span>
    <h2 id="closing-heading">Book your next appointment<br />in under 60 seconds.</h2><p>Discover trusted organizations and reserve your queue serial.</p>
    <div className="closing-actions"><Link to="/customer/book" className="lp-btn-primary lp-btn-lg">Find an Appointment</Link><Link to="/organizations" className="lp-btn-outline lp-btn-lg">Browse Organizations</Link></div>
  </div></div></section>;
}

export function ProductionFooter() {
  const anchor = (event, selector) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    document.querySelector(selector)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  return <footer className="phase-four-footer"><div className="phase-four-inner">
    <div className="production-footer-grid"><div className="production-footer-brand"><Link to="/" className="lp-brand" onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}><span className="lp-brand-mark"><QueueMark /></span><span className="lp-brand-name">SmartQueue</span></Link><p>Multi-service appointment &amp; queue management platform.</p><span className="footer-serial-note">Reserve a serial. Plan your arrival.</span></div>
      <nav aria-label="Footer explore"><h2>Explore</h2><Link to="/organizations">Organizations</Link><Link to="/professionals">Professionals</Link><Link to="/search">Search</Link><Link to="/" onClick={event => anchor(event, '#how-it-works')}>How It Works</Link><Link to="/" onClick={event => anchor(event, '#why-smartqueue')}>Why SmartQueue</Link></nav>
      <nav aria-label="Footer for organizations"><h2>For Organizations</h2><Link to="/" onClick={event => anchor(event, '#for-organizations')}>Overview</Link><Link to="/register/manager">Register Your Organization</Link><Link to="/contact">Contact / Enquiry</Link></nav>
      <nav aria-label="Footer support"><h2>Support</h2><Link to="/contact">Contact Us</Link><a href={getApiDocsUrl()} target="_blank" rel="noopener noreferrer">API Documentation<span className="footer-new-tab"> (new tab)</span></a><p>Questions about a visit or bringing your organization to SmartQueue? Use our contact form.</p></nav>
    </div>
    <div className="production-footer-bottom"><span>© {new Date().getFullYear()} SmartQueue. All rights reserved.</span><Link to="/contact">Get in touch</Link></div>
  </div></footer>;
}
