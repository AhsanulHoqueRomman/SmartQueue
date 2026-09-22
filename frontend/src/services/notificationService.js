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
   * @param {string|null} orgId
   * @param {string} notificationId
   */
  async markRead(orgId, notificationId) {
    const url = orgId
      ? `/organizations/${orgId}/notifications/${notificationId}/read/`
      : `/customer/notifications/${notificationId}/read/`;
    const response = await apiClient.post(url);
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

  /**
   * List all cross-organization notifications for the authenticated customer.
   * @param {Object} params - optional filtering
   */
  async getCustomerNotifications(params = {}) {
    const response = await apiClient.get('/customer/notifications/', { params });
    return response.data;
  },

  /**
   * Mark all unread notifications as read for the customer across all organizations.
   */
  async markAllCustomerNotificationsRead() {
    const response = await apiClient.post('/customer/notifications/read-all/');
    return response.data;
  },
};

export default notificationService;
