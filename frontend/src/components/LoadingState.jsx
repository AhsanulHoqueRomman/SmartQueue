import React from 'react';

export const LoadingSpinner = ({ size = 'medium', text }) => {
  return (
    <div className={`loading-spinner-wrapper spinner-${size}`}>
      <div className="spinner"></div>
      {text && <p className="loading-spinner-text">{text}</p>}
    </div>
  );
};

export const SkeletonCard = ({ rows = 3 }) => {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-title"></div>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="skeleton skeleton-line" style={{ width: `${85 - idx * 15}%` }}></div>
      ))}
    </div>
  );
};

export const SkeletonTable = ({ rows = 5, cols = 4 }) => {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: cols }).map((_, idx) => (
          <div key={idx} className="skeleton skeleton-header-cell"></div>
        ))}
      </div>
      <div className="skeleton-table-body">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="skeleton-table-row">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div key={cIdx} className="skeleton skeleton-cell"></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const LoadingState = ({ type = 'spinner', text, rows, cols }) => {
  if (type === 'skeleton-card') return <SkeletonCard rows={rows} />;
  if (type === 'skeleton-table') return <SkeletonTable rows={rows} cols={cols} />;
  return <LoadingSpinner size="medium" text={text} />;
};

export default LoadingState;
