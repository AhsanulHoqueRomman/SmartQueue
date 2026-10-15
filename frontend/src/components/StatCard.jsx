import React from 'react';
import '../styles/OperationalPrimitives.css';

/**
 * StatCard component.
 * Displays an operational metric KPI card with title, primary value, icon,
 * and optional trend / subtitle information.
 *
 * @param {Object} props
 * @param {string} props.title - Card title / metric description.
 * @param {string|number} props.value - Primary metric number or text.
 * @param {React.ReactNode|string} [props.icon] - Icon representation (emoji string or JSX element).
 * @param {React.ReactNode|string} [props.subtitle] - Supporting explanatory text.
 * @param {string} [props.trend] - Optional trend label (e.g. '+12%').
 * @param {'positive'|'negative'} [props.trendType='positive'] - Trend direction tone.
 * @param {'primary'|'secondary'|'info'|'warning'|'success'|'danger'} [props.color='primary'] - Accent tone variant.
 */
export const StatCard = ({
  title,
  value,
  icon,
  subtitle,
  trend,
  trendType = 'positive',
  color = 'primary',
}) => {
  return (
    <div className={`stat-card stat-card-${color} qt-stat-card qt-stat-card--${color}`}>
      <div className="stat-card-header qt-stat-card__header">
        <span className="stat-card-title qt-stat-card__title">{title}</span>
        {icon && (
          <div className="stat-card-icon qt-stat-card__icon" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
      <div className="stat-card-body qt-stat-card__body">
        <div className="stat-card-value qt-stat-card__value">{value}</div>
        {(subtitle || trend) && (
          <div className="stat-card-footer qt-stat-card__footer">
            {trend && (
              <span className={`stat-trend stat-trend-${trendType} qt-stat-card__trend`}>
                {trend}
              </span>
            )}
            {subtitle && <span className="stat-subtitle qt-stat-card__subtitle">{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
