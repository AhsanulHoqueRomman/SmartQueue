import apiClient from '../api/client';

export const managerService = {
  // Services Management
  async getServices(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/services/`);
    return response.data;
  },

  async createService(orgId, data) {
    const response = await apiClient.post(
      `/organizations/${orgId}/services/`,
      data
    );
    return response.data;
  },

  async updateService(orgId, serviceId, data) {
    const response = await apiClient.patch(
      `/organizations/${orgId}/services/${serviceId}/`,
      data
    );
    return response.data;
  },

  async deleteService(orgId, serviceId) {
    await apiClient.delete(`/organizations/${orgId}/services/${serviceId}/`);
  },

  // Provider Profiles Management
  async getProviders(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/providers/`);
    return response.data;
  },

  async createProviderProfile(orgId, data) {
    const response = await apiClient.post(
      `/organizations/${orgId}/providers/`,
      data
    );
    return response.data;
  },

  async deleteProviderProfile(orgId, providerId) {
    await apiClient.delete(`/organizations/${orgId}/providers/${providerId}/`);
  },

  // Memberships & Roles Management
  async getMembers(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/members/`);
    return response.data;
  },

  async addMember(orgId, data) {
    const response = await apiClient.post(
      `/organizations/${orgId}/members/`,
      data
    );
    return response.data;
  },

  async updateMember(orgId, membershipId, data) {
    const response = await apiClient.patch(
      `/organizations/${orgId}/members/${membershipId}/`,
      data
    );
    return response.data;
  },

  async removeMember(orgId, membershipId) {
    await apiClient.delete(`/organizations/${orgId}/members/${membershipId}/`);
  },

  // Analytics & Audit
  async getAnalyticsSummary(orgId, params = {}) {
    const response = await apiClient.get(`/organizations/${orgId}/analytics/summary/`, { params });
    return response.data;
  },

  async getOrgDashboardMetrics(orgId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/analytics/dashboard/`
    );
    return response.data;
  },

  async getAuditLogs(orgId, params = {}) {
    const response = await apiClient.get(`/organizations/${orgId}/audit/`, {
      params,
    });
    return response.data;
  },
};

export default managerService;
