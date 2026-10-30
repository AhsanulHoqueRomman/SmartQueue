import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import reviewService from '../services/reviewService';
import TestimonialPages from './TestimonialPages';
import ImageWithFallback from './ImageWithFallback';
import useScrollPresence from '../hooks/useScrollPresence';
import { PublicFooter } from './PublicFooter';
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
          name: review.customer_name || 'Client', avatar: review.customer_avatar_url || null, service: review.service_name || '', organization: organization.name }));
    })).then(results => { if (current) setReviews(results.flatMap(result => result.status === 'fulfilled' ? result.value : [])); });
    return () => { current = false; };
  }, [organizations]);
  if (!reviews.length) return null;
  return <CommunityReviewRail reviews={reviews} />;
}

function CommunityReviewRail({ reviews }) {
  const [ref, entered, visible, supported] = useScrollPresence(.12);
  return <section ref={ref} className={`phase-four-reviews ${supported ? 'is-observed' : ''} ${entered ? 'is-revealed' : ''}`} aria-labelledby="community-heading"><div className="phase-four-inner">
    <header className="phase-four-heading"><span className="discovery-eyebrow">What our community says</span><h2 id="community-heading">What Our Patients &amp; Visitors Say</h2><p>Real experiences from people using QueueTurn across different services.</p></header>
    <TestimonialPages active={entered && visible} items={reviews} renderItem={(review, index) => <article className="community-review" key={review.id} style={{ '--review-delay': `${.22 + index * .12}s` }}>
      <div className="community-stars" role="img" aria-label={`${review.rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(review.rating)}<span className="community-empty-stars">{'☆'.repeat(5 - review.rating)}</span></span></div>
      <blockquote><p>“{review.comment}”</p></blockquote>
      <div className="community-reviewer"><span className="community-avatar" aria-hidden="true"><ImageWithFallback src={review.avatar} alt="" className="community-avatar-image" fallback={review.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')} /></span><div><strong>{review.name}</strong><span>{review.organization}</span>{review.service && <span>{review.service}</span>}</div></div>
    </article>} />
  </div></section>;
}

export function ClosingCallToAction() {
  return <section className="phase-four-closing" aria-labelledby="closing-heading"><div className="phase-four-inner"><div className="closing-panel">
    <span className="closing-mark"><QueueMark /></span>
    <div className="closing-copy"><h2 id="closing-heading">Ready for a seamless experience?</h2><p>Discover trusted organizations and book your next appointment in under 60 seconds.</p></div>
    <div className="closing-actions"><Link to="/customer/book" className="lp-btn-primary lp-btn-lg">Find an Appointment <span aria-hidden="true">→</span></Link></div>
  </div></div></section>;
}

export { PublicFooter, PublicFooter as ProductionFooter };
export default PublicFooter;
