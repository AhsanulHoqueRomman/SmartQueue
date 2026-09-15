import apiClient from '../api/client';

export const providerManagementService = {
  /**
   * Get provider profile detail.
   */
  async getProviderProfile(orgId, providerId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/providers/${providerId}/`
    );
    return response.data;
  },

  /**
   * Update provider bio, title, active status.
   */
  async updateProviderProfile(orgId, providerId, data) {
    const response = await apiClient.patch(
      `/organizations/${orgId}/providers/${providerId}/`,
      data
    );
    return response.data;
  },

  /**
   * Fetch provider weekly schedule.
   */
  async getSchedules(orgId, providerId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/providers/${providerId}/schedules/`
    );
    return response.data;
  },

  /**
   * Create or update a day schedule.
   */
  async updateSchedule(orgId, providerId, scheduleData) {
    const response = await apiClient.post(
      `/organizations/${orgId}/providers/${providerId}/schedules/`,
      scheduleData
    );
    return response.data;
  },

  /**
   * Add break to a schedule day.
   */
  async addBreak(orgId, providerId, scheduleId, breakData) {
    const response = await apiClient.post(
      `/organizations/${orgId}/providers/${providerId}/schedules/${scheduleId}/breaks/`,
      breakData
    );
    return response.data;
  },

  /**
   * Delete a break from schedule day.
   */
  async deleteBreak(orgId, providerId, scheduleId, breakId) {
    await apiClient.delete(
      `/organizations/${orgId}/providers/${providerId}/schedules/${scheduleId}/breaks/${breakId}/`
    );
  },

  /**
   * Fetch provider leaves.
   */
  async getLeaves(orgId, providerId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/providers/${providerId}/leaves/`
    );
    return response.data;
  },

  /**
   * Add a leave period for provider.
   */
  async createLeave(orgId, providerId, leaveData) {
    const response = await apiClient.post(
      `/organizations/${orgId}/providers/${providerId}/leaves/`,
      leaveData
    );
    return response.data;
  },

  /**
   * Delete a leave period.
   */
  async deleteLeave(orgId, providerId, leaveId) {
    await apiClient.delete(
      `/organizations/${orgId}/providers/${providerId}/leaves/${leaveId}/`
    );
  },

  /**
   * Fetch services assigned to a provider.
   */
  async getProviderServices(orgId, providerId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/providers/${providerId}/services/`
    );
    return response.data;
  },

  /**
   * Assign service to provider.
   */
  async assignService(orgId, providerId, data) {
    const response = await apiClient.post(
      `/organizations/${orgId}/providers/${providerId}/services/`,
      data
    );
    return response.data;
  },

  /**
   * Remove service assignment from provider.
   */
  async removeService(orgId, providerId, providerServiceId) {
    await apiClient.delete(
      `/organizations/${orgId}/providers/${providerId}/services/${providerServiceId}/`
    );
  },
};

export default providerManagementService;
