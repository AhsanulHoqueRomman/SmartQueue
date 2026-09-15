import { apiClient } from '../api/client';
import { tokenService } from './tokenService';

export const authService = {
  async login(credentials) {
    const response = await apiClient.post('/auth/login/', credentials);
    const { access, refresh, user } = response.data;
    tokenService.setTokens(access, refresh);
    return { user, access, refresh };
  },

  async register(userData) {
    const response = await apiClient.post('/auth/register/', userData);
    const { access, refresh, user } = response.data;
    tokenService.setTokens(access, refresh);
    return { user, access, refresh };
  },

  async logout() {
    const refreshToken = tokenService.getRefreshToken();
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout/', { refresh: refreshToken });
      } catch (err) {
        // Ignore backend logout network/token error during cleanup
      }
    }
    tokenService.clearTokens();
  },

  async getCurrentUser() {
    const response = await apiClient.get('/auth/me/');
    return response.data;
  },

  async updateProfile(profileData) {
    const response = await apiClient.patch('/auth/me/', profileData);
    return response.data;
  },

  async changePassword(passwordData) {
    const response = await apiClient.post('/auth/change-password/', passwordData);
    return response.data;
  },
};

