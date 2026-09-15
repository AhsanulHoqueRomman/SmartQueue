import React from 'react';

export const StatCard = ({ title, value, icon, subtitle, trend, trendType = 'positive', color = 'primary' }) => {
  return (
    <div className={`stat-card stat-card-${color} animate-zoom-in`}>
      <div className="stat-card-header">
        <span className="stat-card-title">{title}</span>
        {icon && <div className="stat-card-icon">{icon}</div>}
      </div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value}</div>
        {(subtitle || trend) && (
          <div className="stat-card-footer">
            {trend && (
              <span className={`stat-trend stat-trend-${trendType}`}>
                {trend}
              </span>
            )}
            {subtitle && <span className="stat-subtitle">{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
