import React from 'react';

/**
 * ResponsiveTable
 * Semantic HTML table with an accessible, keyboard-scrollable container.
 * Encapsulates the table region, header semantics, and responsive scroll container
 * adhering to Refined Operational UI principles without heavy border framing.
 */
export function ResponsiveTable({
  caption,
  ariaLabel,
  columns = [],
  children,
  className = '',
  containerClassName = '',
  hasStickyActions = false,
}) {
  const accessibleRegionLabel = caption || ariaLabel || 'Data table';

  return (
    <div
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
  );
}

export default ResponsiveTable;
