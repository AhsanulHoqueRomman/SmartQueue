import { useState } from 'react';
import '../styles/ImageWithFallback.css';

// Keep failure state inside the image so loading never resets a parent carousel.
export default function ImageWithFallback({ src, alt, className, fallback }) {
  const [failedSource, setFailedSource] = useState(null);
  const [loadedSource, setLoadedSource] = useState(null);
  const source = typeof src === 'string' ? src.trim() : '';
  const supported = /^https?:\/\//i.test(source) || (source.startsWith('/') && !source.startsWith('//'));
  if (!supported || failedSource === source) return fallback;
  return <span className={`media-image-frame ${className || ''}`}>
    {loadedSource !== source && <span className="media-image-placeholder" aria-hidden="true">{fallback}</span>}
    <img key={source} src={source} alt={alt} className="media-image-content" style={{ opacity: loadedSource === source ? 1 : 0 }} loading="lazy" decoding="async" onLoad={() => setLoadedSource(source)} onError={() => setFailedSource(source)} />
  </span>;
}
