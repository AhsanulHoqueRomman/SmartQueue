import apiClient from '../api/client';

export const organizationService = {
  /**
   * Fetch list of public active organizations.
   * @param {Object} params - optional query parameters e.g. { search, ordering }
   */
  async getOrganizations(params = {}) {
    const response = await apiClient.get('/organizations/', { params });
    return response.data;
  },

  /**
   * Fetch single organization detail profile.
   */
  async getOrganizationDetail(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/`);
    return response.data;
  },

  /**
   * Fetch active services for a given organization.
   */
  async getServices(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/services/`);
    return response.data;
  },

  /**
   * Fetch active provider profiles for a given organization.
   */
  async getProviders(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/providers/`);
    return response.data;
  },

  /**
   * Update organization profile (Manager/Admin).
   */
  async updateOrganization(orgId, data) {
    const response = await apiClient.patch(`/organizations/${orgId}/`, data);
    return response.data;
  },

  /**
   * Create new organization (Admin).
   */
  async createOrganization(data) {
    const response = await apiClient.post('/organizations/', data);
    return response.data;
  },

  /**
   * Submit organization for admin verification review.
   */
  async submitVerification(orgId) {
    const response = await apiClient.post(`/organizations/${orgId}/verification/submit/`);
    return response.data;
  },

  /**
   * Get uploaded verification documents for an organization.
   */
  async getDocuments(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/documents/`);
    return response.data;
  },

  /**
   * Upload a verification document (FormData containing document_type, title, file).
   */
  async uploadDocument(orgId, formData) {
    const response = await apiClient.post(`/organizations/${orgId}/documents/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Delete a verification document.
   */
  async deleteDocument(orgId, docId) {
    const response = await apiClient.delete(`/organizations/${orgId}/documents/${docId}/`);
    return response.data;
  }
};

export default organizationService;

