import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute, getRoleDashboardPath } from './RoleRoute';
import { AppShell } from '../components/AppShell';

import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { CustomerRegisterPage } from '../pages/customer/CustomerRegisterPage';
import { ManagerRegisterPage } from '../pages/manager/ManagerRegisterPage';
import { ProviderRegisterPage } from '../pages/provider/ProviderRegisterPage';
import { AcceptInvitationPage } from '../pages/AcceptInvitationPage';
import { AcceptStaffInvitationPage } from '../pages/AcceptStaffInvitationPage';
import { NotFoundPage } from '../pages/NotFoundPage';

// Customer Portal Pages
import { CustomerDashboard } from '../pages/portals/CustomerDashboard';
import { BookAppointmentPage } from '../pages/customer/BookAppointmentPage';
import { CustomerAppointmentsPage } from '../pages/customer/CustomerAppointmentsPage';
import { CustomerAppointmentDetailPage } from '../pages/customer/CustomerAppointmentDetailPage';
import { CustomerLiveQueuePage } from '../pages/customer/CustomerLiveQueuePage';
import { NotificationsPage } from '../pages/customer/NotificationsPage';
import { CustomerReviewsPage } from '../pages/customer/CustomerReviewsPage';
import { OrganizationsPage } from '../pages/customer/OrganizationsPage';
import { OrganizationProfilePage } from '../pages/customer/OrganizationProfilePage';
import { CustomerFavoritesPage } from '../pages/customer/CustomerFavoritesPage';
import { GlobalSearchPage } from '../pages/public/GlobalSearchPage';

// Manager Portal Pages
import { ManagerDashboard } from '../pages/portals/ManagerDashboard';
import { ManagerServicesPage } from '../pages/manager/ManagerServicesPage';
import { ManagerProvidersPage } from '../pages/manager/ManagerProvidersPage';
import { ManagerMembersPage } from '../pages/manager/ManagerMembersPage';
import { ManagerStaffPage } from '../pages/manager/ManagerStaffPage';

import { ManagerAnalyticsPage } from '../pages/manager/ManagerAnalyticsPage';
import { ManagerAuditPage } from '../pages/manager/ManagerAuditPage';
import { ManagerSettingsPage } from '../pages/manager/ManagerSettingsPage';
import { ManagerAppointmentsPage } from '../pages/manager/ManagerAppointmentsPage';
import { ManagerQueuePage } from '../pages/manager/ManagerQueuePage';
import { ManagerReviewsPage } from '../pages/manager/ManagerReviewsPage';

// Provider Portal Pages
import { ProviderDashboard } from '../pages/portals/ProviderDashboard';
import { ProviderQueuePage } from '../pages/provider/ProviderQueuePage';
import { ProviderSchedulePage } from '../pages/provider/ProviderSchedulePage';
import { ProviderAppointmentsPage } from '../pages/provider/ProviderAppointmentsPage';
import { ProviderServicesPage } from '../pages/provider/ProviderServicesPage';
import { ProviderReviewsPage } from '../pages/provider/ProviderReviewsPage';

// Staff Portal Pages
import { StaffDashboard } from '../pages/portals/StaffDashboard';
import { StaffQueuePage } from '../pages/staff/StaffQueuePage';
import { StaffAppointmentsPage } from '../pages/staff/StaffAppointmentsPage';
import { StaffCustomersPage } from '../pages/staff/StaffCustomersPage';
import { StaffProvidersPage } from '../pages/staff/StaffProvidersPage';
import { StaffServicesPage } from '../pages/staff/StaffServicesPage';

// Admin Portal Pages
import { AdminDashboard } from '../pages/portals/AdminDashboard';
import { AdminOrganizationsPage } from '../pages/admin/AdminOrganizationsPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { LandingPage } from '../pages/LandingPage';
import { ProfilePage } from '../pages/ProfilePage';

export const AppRoutes = () => {
  const { isAuthenticated, loading } = useAuth();
  const { effectiveRole } = useTenant();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Initializing SmartQueue Platform...</p>
      </div>
    );
  }

  const rolePath = getRoleDashboardPath(effectiveRole);

  return (
    <Routes>
      {/* Root & Auth Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/search" element={<GlobalSearchPage />} />
      <Route path="/favorites" element={<CustomerFavoritesPage />} />
      <Route path="/organizations" element={<OrganizationsPage />} />
      <Route path="/organizations/:organizationId" element={<OrganizationProfilePage />} />
      <Route
        path="/dashboard"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/app/dashboard"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <RegisterPage />}
      />
      <Route
        path="/register/customer"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <CustomerRegisterPage />}
      />
      <Route
        path="/register/manager"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <ManagerRegisterPage />}
      />
      <Route
        path="/register/provider"
        element={isAuthenticated ? <Navigate to={rolePath} replace /> : <ProviderRegisterPage />}
      />
      <Route
        path="/invitations/provider/:token"
        element={<AcceptInvitationPage />}
      />
      <Route
        path="/invitations/staff/:token"
        element={<AcceptStaffInvitationPage />}
      />


      {/* Role Root Redirects & Aliases */}
      <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
      <Route path="/provider" element={<Navigate to="/provider/dashboard" replace />} />
      <Route path="/staff" element={<Navigate to="/staff/dashboard" replace />} />
      <Route path="/manager" element={<Navigate to="/manager/dashboard" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/app" element={<Navigate to="/dashboard" replace />} />

      {/* Global Shortcut Aliases */}
      <Route path="/book" element={<Navigate to="/customer/book" replace />} />
      <Route path="/appointments" element={<Navigate to="/customer/appointments" replace />} />
      <Route path="/appointments/:id" element={<Navigate to="/customer/appointments/:id" replace />} />
      <Route path="/queue/:queueEntryId" element={<Navigate to="/customer/queue/:queueEntryId" replace />} />
      <Route path="/notifications" element={<Navigate to="/customer/notifications" replace />} />
      <Route path="/reviews" element={<Navigate to="/customer/reviews" replace />} />
      <Route path="/queue" element={<Navigate to="/dashboard" replace />} />
      <Route path="/schedule" element={<Navigate to="/dashboard" replace />} />
      <Route path="/services" element={<Navigate to="/dashboard" replace />} />
      <Route path="/providers" element={<Navigate to="/dashboard" replace />} />
      <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
      <Route path="/audit" element={<Navigate to="/dashboard" replace />} />

      {/* Customer Routes */}
      <Route
        path="/customer/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <CustomerDashboard />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/book"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <BookAppointmentPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/appointments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <CustomerAppointmentsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/appointments/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <CustomerAppointmentDetailPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/queue/:queueEntryId"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <CustomerLiveQueuePage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/notifications"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <NotificationsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/reviews"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <CustomerReviewsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer/favorites"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['CUSTOMER']}>
              <AppShell>
                <CustomerFavoritesPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* Provider Routes */}
      <Route
        path="/provider/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['PROVIDER']}>
              <AppShell>
                <ProviderDashboard />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/provider/appointments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['PROVIDER']}>
              <AppShell>
                <ProviderAppointmentsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/provider/queue"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['PROVIDER']}>
              <AppShell>
                <ProviderQueuePage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/provider/services"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['PROVIDER']}>
              <AppShell>
                <ProviderServicesPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/provider/schedule"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['PROVIDER']}>
              <AppShell>
                <ProviderSchedulePage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/provider/reviews"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['PROVIDER']}>
              <AppShell>
                <ProviderReviewsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* Staff Routes */}
      <Route
        path="/staff/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <StaffDashboard />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/queue"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <StaffQueuePage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/appointments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <StaffAppointmentsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/customers"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <StaffCustomersPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/providers"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <StaffProvidersPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/services"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <StaffServicesPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/notifications"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['STAFF']}>
              <AppShell>
                <NotificationsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* Manager Routes */}
      <Route
        path="/manager/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerDashboard />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/appointments"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerAppointmentsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/queue"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerQueuePage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/services"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerServicesPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/providers"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerProvidersPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/members"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerMembersPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/staff"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerStaffPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/reviews"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerReviewsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/analytics"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerAnalyticsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/audit"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerAuditPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager/settings"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MANAGER']}>
              <AppShell>
                <ManagerSettingsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['ADMIN']}>
              <AppShell>
                <AdminDashboard />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/organizations"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['ADMIN']}>
              <AppShell>
                <AdminOrganizationsPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['ADMIN']}>
              <AppShell>
                <AdminUsersPage />
              </AppShell>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* Shared Authenticated Profile Route */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppShell>
              <ProfilePage />
            </AppShell>
          </ProtectedRoute>
        }
      />

      {/* Fallback 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;
