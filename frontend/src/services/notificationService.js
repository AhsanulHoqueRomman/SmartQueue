import apiClient from '../api/client';

export const notificationService = {
  /**
   * List notifications for the authenticated user within an organization.
   * @param {string} orgId
   * @param {Object} params - optional filtering (kind, read_at, ordering)
   */
  async getNotifications(orgId, params = {}) {
    const response = await apiClient.get(
      `/organizations/${orgId}/notifications/`,
      { params }
    );
    return response.data;
  },

  /**
   * Mark a notification as read.
   * @param {string} orgId
   * @param {string} notificationId
   */
  async markRead(orgId, notificationId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/notifications/${notificationId}/read/`
    );
    return response.data;
  },

  /**
   * Mark all unread notifications as read.
   * @param {string} orgId
   */
  async markAllRead(orgId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/notifications/read-all/`
    );
    return response.data;
  },
};

export default notificationService;
