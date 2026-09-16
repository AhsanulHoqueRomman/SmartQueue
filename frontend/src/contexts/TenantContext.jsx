import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import organizationService from '../services/organizationService';

const TenantContext = createContext(null);

const STORAGE_KEY = 'sq_selected_org_id';

export const TenantProvider = ({ children }) => {
  const { user, refreshUser } = useAuth();

  const [publicOrgs, setPublicOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  // Fetch public active organizations for booking / general use
  const fetchPublicOrgs = useCallback(async () => {
    setLoadingOrgs(true);
    try {
      const data = await organizationService.getOrganizations();
      const list = Array.isArray(data) ? data : data.results || [];
      setPublicOrgs(list);
    } catch (err) {
      // Ignore background load error for unauthenticated state
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicOrgs();
  }, [fetchPublicOrgs, user]);

  // Active memberships array from user profile
  const memberships = useMemo(() => {
    if (!user || !Array.isArray(user.memberships)) return [];
    return user.memberships.filter((m) => m.is_active);
  }, [user]);

  const [selectedOrgId, setSelectedOrgIdState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  // Keep selectedOrgId in sync with available memberships or public orgs
  useEffect(() => {
    if (!user) {
      setSelectedOrgIdState(null);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    if (memberships.length > 0) {
      const exists = memberships.some((m) => String(m.organization_id) === String(selectedOrgId));
      if (!exists) {
        const defaultOrgId = String(memberships[0].organization_id);
        setSelectedOrgIdState(defaultOrgId);
        localStorage.setItem(STORAGE_KEY, defaultOrgId);
      }
    } else if (publicOrgs.length > 0) {
      const existsInPublic = publicOrgs.some((o) => String(o.id) === String(selectedOrgId));
      if (!existsInPublic) {
        const defaultPublicId = String(publicOrgs[0].id);
        setSelectedOrgIdState(defaultPublicId);
        localStorage.setItem(STORAGE_KEY, defaultPublicId);
      }
    }
  }, [user, memberships, publicOrgs, selectedOrgId]);

  const setSelectedOrgId = (orgId) => {
    setSelectedOrgIdState(orgId);
    if (orgId) {
      localStorage.setItem(STORAGE_KEY, orgId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // Selected membership object (for staff/managers/providers)
  const selectedOrg = useMemo(() => {
    if (!selectedOrgId) return null;
    return memberships.find((m) => String(m.organization_id) === String(selectedOrgId)) || null;
  }, [memberships, selectedOrgId]);

  // Resolve effective role
  const effectiveRole = useMemo(() => {
    if (!user) return null;

    // 1. System Admin takes precedence
    if (user.is_staff || user.is_superuser) {
      return 'ADMIN';
    }

    // 2. Organization-scoped role if organization is selected and user is a member
    if (selectedOrg && selectedOrg.role) {
      return selectedOrg.role; // 'MANAGER' | 'STAFF' | 'PROVIDER'
    }

    // 3. Fallback to Customer
    return 'CUSTOMER';
  }, [user, selectedOrg]);

  // Convenient currentOrg object with standard keys (id, name, slug, role)
  const currentOrg = useMemo(() => {
    if (effectiveRole === 'ADMIN') {
      return null;
    }
    if (selectedOrg) {
      return {
        id: selectedOrg.organization_id,
        name: selectedOrg.organization_name,
        slug: selectedOrg.organization_slug,
        role: selectedOrg.role,
      };
    }
    // Fallback for Customer accounts without employee memberships
    if (selectedOrgId && publicOrgs.length > 0) {
      const pub = publicOrgs.find((o) => String(o.id) === String(selectedOrgId));
      if (pub) {
        return {
          id: pub.id,
          name: pub.name,
          slug: pub.slug,
          role: 'CUSTOMER',
        };
      }
    }
    if (publicOrgs.length > 0) {
      const defaultPub = publicOrgs[0];
      return {
        id: defaultPub.id,
        name: defaultPub.name,
        slug: defaultPub.slug,
        role: 'CUSTOMER',
      };
    }
    return null;
  }, [effectiveRole, selectedOrg, selectedOrgId, publicOrgs]);

  const refreshTenant = useCallback(async () => {
    if (refreshUser) await refreshUser();
    await fetchPublicOrgs();
  }, [refreshUser, fetchPublicOrgs]);

  const value = {
    memberships,
    selectedOrgId,
    selectedOrg,
    currentOrg,
    effectiveRole,
    setSelectedOrgId,
    selectOrg: setSelectedOrgId,
    hasMultipleOrgs: memberships.length > 1,
    organizations: publicOrgs,
    loadingOrgs,
    refreshTenant,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

