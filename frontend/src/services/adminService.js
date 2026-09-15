import apiClient from '../api/client';

export const adminService = {
  /**
   * Fetch system organizations.
   */
  async getOrganizations() {
    const response = await apiClient.get('/organizations/');
    return response.data;
  },

  /**
   * Create a new organization (Admin level).
   */
  async createOrganization(data) {
    const response = await apiClient.post('/organizations/', data);
    return response.data;
  },

  /**
   * Get organization detail.
   */
  async getOrganizationDetail(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/`);
    return response.data;
  },

  /**
   * Update organization details.
   */
  async updateOrganization(orgId, data) {
    const response = await apiClient.patch(`/organizations/${orgId}/`, data);
    return response.data;
  },
};

export default adminService;
