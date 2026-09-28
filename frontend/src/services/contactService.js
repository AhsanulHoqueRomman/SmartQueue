import { apiClient } from '../api/client';

export const contactService = {
  /**
   * Submit a public Contact Us inquiry.
   * POST /api/v1/contact/
   *
   * Fields match the backend ContactMessageSerializer contract:
   *   name *, email *, phone (optional), subject *, message *
   */
  async submit(data) {
    const response = await apiClient.post('/contact/', data);
    return response.data;
  },
};
