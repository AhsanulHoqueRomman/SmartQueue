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

  /**
   * Fetch system-wide Contact Us inquiries (Admin only).
   */
  async getContactMessages(params = {}) {
    const response = await apiClient.get('/admin/contact/', { params });
    return response.data;
  },

  /**
   * Fetch Contact Us message detail (Admin only).
   */
  async getContactMessageDetail(messageId, markReview = false) {
    const params = markReview ? { mark_review: 'true' } : {};
    const response = await apiClient.get(`/admin/contact/${messageId}/`, { params });
    return response.data;
  },

  /**
   * Update Contact Us message status (Admin only).
   */
  async updateContactStatus(messageId, status) {
    const response = await apiClient.patch(`/admin/contact/${messageId}/`, { status });
    return response.data;
  },

  /**
   * Submit an admin reply to a Contact Us message (Admin only).
   */
  async replyToContactMessage(messageId, message) {
    const response = await apiClient.post(`/admin/contact/${messageId}/reply/`, { message });
    return response.data;
  },
};

export default adminService;
