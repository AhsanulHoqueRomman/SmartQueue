import React from 'react';

/**
 * Pagination
 * Accessible pagination navigation with Previous / Next controls and page status info.
 * Avoids complex or unsupported page-size dropdowns, preserving server contracts.
 */
export function Pagination({
  currentPage = 1,
  totalPages = 1,
  itemRange,
  onPageChange,
  disabled = false,
  ariaLabel = 'Pagination navigation',
  className = '',
}) {
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  const handlePrevious = () => {
    if (!isFirstPage && !disabled && onPageChange) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (!isLastPage && !disabled && onPageChange) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={`qt-pagination ${className}`}
    >
      <div className="qt-pagination-summary">
        {itemRange && itemRange.total > 0 ? (
          <span>
            Showing <strong className="qt-tabular-num">{itemRange.start}–{itemRange.end}</strong> of{' '}
            <strong className="qt-tabular-num">{itemRange.total}</strong>
          </span>
        ) : (
          <span>
            Page <strong className="qt-tabular-num">{currentPage}</strong> of{' '}
            <strong className="qt-tabular-num">{Math.max(1, totalPages)}</strong>
          </span>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          Page {currentPage} of {Math.max(1, totalPages)}
        </span>
      </div>

      <div className="qt-pagination-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm qt-pagination-btn"
          onClick={handlePrevious}
          disabled={disabled || isFirstPage}
          aria-label="Go to previous page"
        >
          <span aria-hidden="true">&larr;</span> Previous
        </button>

        <span className="qt-pagination-badge" aria-hidden="true">
          {currentPage} / {Math.max(1, totalPages)}
        </span>

        <button
          type="button"
          className="btn btn-secondary btn-sm qt-pagination-btn"
          onClick={handleNext}
          disabled={disabled || isLastPage}
          aria-label="Go to next page"
        >
          Next <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
