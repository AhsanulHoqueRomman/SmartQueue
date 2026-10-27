import React from 'react';
import '../../styles/OperationalPrimitives.css';

/**
 * ResponsiveTable
 * Semantic HTML table with an accessible, keyboard-scrollable container.
 * Encapsulates the table region, header semantics, and responsive scroll container
 * adhering to Refined Operational UI principles without heavy border framing.
 */
export function ResponsiveTable({
  id,
  caption,
  ariaLabel,
  columns = [],
  children,
  className = '',
  containerClassName = '',
  hasStickyActions = false,
  showScrollHint = true,
}) {
  const accessibleRegionLabel = caption || ariaLabel || 'Data table';

  return (
    <div className="qt-table-wrapper">
      {showScrollHint && (
        <div className="qt-table-scroll-hint" aria-hidden="true">
          <svg
            className="qt-table-scroll-hint__icon"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Scroll table horizontally for full details and actions</span>
          <svg
            className="qt-table-scroll-hint__icon"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      )}
      <div
        id={id}
        className={`table-container qt-table-container ${hasStickyActions ? 'qt-table-sticky-actions' : ''} ${containerClassName}`}
        role="region"
        aria-label={accessibleRegionLabel}
        tabIndex={0}
      >
      <table className={`table qt-responsive-table ${className}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={col.headerClass || ''}
                style={{
                  textAlign: col.align || 'left',
                  ...(col.width ? { width: col.width } : {}),
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default ResponsiveTable;
