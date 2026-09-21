import apiClient from '../api/client';

export const appointmentService = {
  /**
   * Get dynamic available slots for a provider on a specific date for a service.
   * @param {string} orgId
   * @param {string} providerId
   * @param {string} serviceId
   * @param {string} dateStr - YYYY-MM-DD
   */
  async getAvailability(orgId, providerId, serviceId, dateStr) {
    const response = await apiClient.get(
      `/organizations/${orgId}/providers/${providerId}/availability/`,
      {
        params: {
          service_id: serviceId,
          date: dateStr,
        },
      }
    );
    return response.data;
  },

  /**
   * Book an appointment.
   * @param {string} orgId
   * @param {Object} data - { provider_id, service_id, start_datetime, notes }
   */
  async bookAppointment(orgId, data) {
    const response = await apiClient.post(
      `/organizations/${orgId}/appointments/`,
      data
    );
    return response.data;
  },

  /**
   * Fetch all customer appointments and active queue entries across all organizations.
   */
  async getCustomerDashboard() {
    const response = await apiClient.get('/customer/dashboard/');
    return response.data;
  },

  /**
   * List appointments for an organization (scoped to current user).
   * @param {string} orgId
   * @param {Object} params - optional filtering / ordering parameters
   */
  async getAppointments(orgId, params = {}) {
    const response = await apiClient.get(
      `/organizations/${orgId}/appointments/`,
      { params }
    );
    return response.data;
  },

  /**
   * Retrieve a single appointment detail.
   * @param {string} orgId
   * @param {string} appointmentId
   */
  async getAppointmentDetail(orgId, appointmentId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/appointments/${appointmentId}/`
    );
    return response.data;
  },

  /**
   * Cancel an appointment.
   * @param {string} orgId
   * @param {string} appointmentId
   * @param {string} reason
   */
  async cancelAppointment(orgId, appointmentId, reason = '') {
    const response = await apiClient.post(
      `/organizations/${orgId}/appointments/${appointmentId}/cancel/`,
      { cancellation_reason: reason }
    );
    return response.data;
  },

  /**
   * Check in to an appointment.
   * @param {string} orgId
   * @param {string} appointmentId
   */
  async checkInAppointment(orgId, appointmentId) {
    const response = await apiClient.post(
      `/organizations/${orgId}/appointments/${appointmentId}/check-in/`
    );
    return response.data;
  },

  /**
   * Fetch review for a completed appointment.
   */
  async getReview(orgId, appointmentId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/appointments/${appointmentId}/review/`
    );
    return response.data;
  },

  /**
   * Submit a review for a completed appointment.
   */
  async submitReview(orgId, appointmentId, reviewData) {
    const response = await apiClient.post(
      `/organizations/${orgId}/appointments/${appointmentId}/review/`,
      reviewData
    );
    return response.data;
  },
};

export default appointmentService;
