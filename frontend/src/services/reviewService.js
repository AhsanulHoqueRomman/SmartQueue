import apiClient from '../api/client';

export const reviewService = {
  /**
   * List organization public reviews.
   * @param {string} orgId
   * @param {Object} params
   */
  async getReviews(orgId, params = {}) {
    const response = await apiClient.get(
      `/organizations/${orgId}/reviews/`,
      { params }
    );
    return response.data;
  },

  /**
   * Fetch all reviews submitted by the authenticated customer across all organizations.
   * @param {Object} params
   */
  async getMyReviews(params = {}) {
    const response = await apiClient.get(
      '/customer/reviews/',
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
      `/organizations/${orgId}/reviews/appointments/${appointmentId}/`
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
      `/organizations/${orgId}/reviews/appointments/${appointmentId}/`,
      reviewData
    );
    return response.data;
  },
};

export default reviewService;
