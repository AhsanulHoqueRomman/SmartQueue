import apiClient from '../api/client';

export const reviewService = {
  /**
   * List organization reviews or customer's reviews.
   * @param {string} orgId
   * @param {Object} params
   */
  async getReviews(orgId, params = {}) {
    const response = await apiClient.get(
      `/organizations/${orgId}/feedback/`,
      { params }
    );
    return response.data;
  },

  /**
   * Get review for a specific appointment.
   * @param {string} orgId
   * @param {string} appointmentId
   */
  async getAppointmentReview(orgId, appointmentId) {
    const response = await apiClient.get(
      `/organizations/${orgId}/feedback/appointments/${appointmentId}/`
    );
    return response.data;
  },

  /**
   * Submit a review for a completed appointment.
   * @param {string} orgId
   * @param {string} appointmentId
   * @param {Object} reviewData - { rating: 1-5, comment: string }
   */
  async submitReview(orgId, appointmentId, reviewData) {
    const response = await apiClient.post(
      `/organizations/${orgId}/feedback/appointments/${appointmentId}/`,
      reviewData
    );
    return response.data;
  },
};

export default reviewService;
