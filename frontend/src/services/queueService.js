import apiClient from '../api/client';

export const queueService = {
  /**
   * Fetch active queue for a specific provider in an organization.
   */
  async getProviderQueue(orgId, providerId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/queue/providers/${providerId}/`
    );
    return response.data;
  },

  /**
   * Fetch customer's active queue position/entry.
   */
  async getMyQueue(orgId) {
    const response = await apiClient.get(`/organizations/${orgId}/queue/my/`);
    return response.data;
  },

  /**
   * Provider calls next waiting patient from their queue.
   */
  async callNext(orgId, providerId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/providers/${providerId}/call-next/`
    );
    return response.data;
  },

  /**
   * Start service for a CALLED queue entry.
   */
  async startEntry(orgId, queueEntryId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/${queueEntryId}/start/`
    );
    return response.data;
  },

  /**
   * Complete service for an IN_PROGRESS queue entry.
   */
  async completeEntry(orgId, queueEntryId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/${queueEntryId}/complete/`
    );
    return response.data;
  },

  /**
   * Skip a CALLED queue entry (marks appointment NO_SHOW).
   */
  async skipEntry(orgId, queueEntryId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/${queueEntryId}/skip/`
    );
    return response.data;
  },

  /**
   * Mark a queue entry as urgent.
   */
  async markUrgent(orgId, queueEntryId, reason = '') {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/${queueEntryId}/urgent/`,
      { reason }
    );
    return response.data;
  },

  /**
   * Register a front-desk walk-in customer.
   */
  async registerWalkIn(orgId, providerId, walkInData) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/providers/${providerId}/walk-in/`,
      walkInData
    );
    return response.data;
  },
};

export default queueService;
