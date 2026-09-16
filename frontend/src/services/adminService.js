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

  /**
   * Fetch verification queue with optional status filter.
   */
  async getVerificationQueue(status = '') {
    const params = status ? { verification_status: status } : {};
    const response = await apiClient.get('/organizations/admin/verification/', { params });
    return response.data;
  },

  /**
   * Start reviewing an organization.
   */
  async startReview(orgId) {
    const response = await apiClient.post(`/organizations/${orgId}/admin/start-review/`);
    return response.data;
  },

  /**
   * Approve an organization.
   */
  async approveOrg(orgId) {
    const response = await apiClient.post(`/organizations/${orgId}/admin/approve/`);
    return response.data;
  },

  /**
   * Reject an organization with reason.
   */
  async rejectOrg(orgId, reason) {
    const response = await apiClient.post(`/organizations/${orgId}/admin/reject/`, { reason });
    return response.data;
  },

  /**
   * Suspend an organization with reason.
   */
  async suspendOrg(orgId, reason) {
    const response = await apiClient.post(`/organizations/${orgId}/admin/suspend/`, { reason });
    return response.data;
  },

  /**
   * Unsuspend an organization.
   */
  async unsuspendOrg(orgId) {
    const response = await apiClient.post(`/organizations/${orgId}/admin/unsuspend/`);
    return response.data;
  },
};

export default adminService;

