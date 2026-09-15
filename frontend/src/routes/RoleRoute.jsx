import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

export const getRoleDashboardPath = (role) => {
  switch (role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'MANAGER':
      return '/manager/dashboard';
    case 'STAFF':
      return '/staff/dashboard';
    case 'PROVIDER':
      return '/provider/dashboard';
    case 'CUSTOMER':
    default:
      return '/customer/dashboard';
  }
};

export const RoleRoute = ({ allowedRoles, children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { effectiveRole } = useTenant();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Verifying authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if effectiveRole matches allowedRoles
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    const defaultPath = getRoleDashboardPath(effectiveRole);
    return <Navigate to={defaultPath} replace />;
  }

  return children;
};
