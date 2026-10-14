import apiClient from '../api/client';

export const queueService = {
  /**
   * Fetch active queue for a specific provider in an organization.
   */
  async getProviderQueue(orgId, providerId, date) {
    const response = await apiClient.get(
      `/organizations/${orgId}/queue/providers/${providerId}/`, { params: date ? { date } : {} }
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
  async callNext(orgId, providerId, date) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/providers/${providerId}/call-next/`, null, { params: date ? { date } : {} }
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
   * Restore the existing skipped entry without allocating a new serial.
   */
  async restoreEntry(orgId, queueEntryId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/${queueEntryId}/restore/`
    );
    return response.data;
  },

  /**
   * Register a front-desk walk-in customer.
   */
  async registerWalkIn(orgId, providerId, walkInData) {
    const payload = { ...(walkInData || {}) };
    if (!payload.provider_id) {
      payload.provider_id = providerId;
    }
    const response = await apiClient.post(
      `/organizations/${orgId}/queue/providers/${providerId}/walk-in/`,
      payload
    );
    return response.data;
  },
};

export default queueService;
