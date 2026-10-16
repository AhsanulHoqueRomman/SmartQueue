import React from 'react';

/**
 * SearchFilterBar
 * An accessible, responsive toolbar for searching and filtering tabular records.
 * Adheres to Refined Operational UI principles: avoids heavy nested cards,
 * uses clear labels, visible focus rings, and explicit submit/clear behavior.
 */
export function SearchFilterBar({
  searchValue = '',
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search records...',
  searchLabel = 'Search records',
  filters = [],
  isFiltered = false,
  onClear,
  isLoading = false,
  className = '',
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSearchSubmit) {
      onSearchSubmit();
    }
  };

  return (
    <div className={`qt-search-filter-bar ${className}`}>
      <form
        role="search"
        aria-label={searchLabel}
        onSubmit={handleSubmit}
        className="qt-search-filter-form"
      >
        <div className="qt-search-filter-inputs">
          {/* Text Search Input */}
          <div className="qt-search-field">
            <label htmlFor="qt-search-input" className="qt-field-label sr-only">
              {searchLabel}
            </label>
            <div className="qt-input-with-icon">
              <span className="qt-input-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                id="qt-search-input"
                type="search"
                className="form-control qt-search-control"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                disabled={isLoading}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Dynamic Filter Selects */}
          {filters.map((filter) => (
            <div key={filter.id} className="qt-filter-field">
              <label htmlFor={filter.id} className="qt-field-label sr-only">
                {filter.label}
              </label>
              <select
                id={filter.id}
                className="form-control qt-filter-select"
                value={filter.value}
                onChange={(e) => filter.onChange(e.target.value)}
                disabled={isLoading}
              >
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="qt-search-filter-actions">
          <button
            type="submit"
            className="btn btn-primary qt-search-btn"
            disabled={isLoading}
          >
            Search
          </button>

          {isFiltered && onClear && (
            <button
              type="button"
              className="btn btn-secondary qt-clear-btn"
              onClick={onClear}
              disabled={isLoading}
              aria-label="Clear active search and filters"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default SearchFilterBar;
