import axios from 'axios';
import { tokenService } from '../services/tokenService';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

export const getApiDocsUrl = () => {
  if (import.meta.env.VITE_API_DOCS_URL) {
    return import.meta.env.VITE_API_DOCS_URL;
  }
  return baseURL.replace(/\/api\/v1\/?$/, '/api/docs/').replace(/\/api\/?$/, '/api/docs/');
};

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Bearer access token
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenService.getAccessToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handles 401 Unauthorized via one-time token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Avoid infinite loops for token refresh or login/auth attempts
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/token/refresh') ||
      originalRequest?.url?.includes('/auth/logout');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const refreshToken = tokenService.getRefreshToken();

      if (refreshToken) {
        try {
          // Direct call to refresh endpoint using base axios instance to prevent loop
          const refreshResponse = await axios.post(`${baseURL}/auth/token/refresh/`, {
            refresh: refreshToken,
          });

          const newAccess = refreshResponse.data.access;
          const newRefresh = refreshResponse.data.refresh || refreshToken;

          tokenService.setTokens(newAccess, newRefresh);

          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          tokenService.clearTokens();
          window.dispatchEvent(new Event('sq:auth:unauthorized'));
          return Promise.reject(refreshError);
        }
      } else {
        tokenService.clearTokens();
        window.dispatchEvent(new Event('sq:auth:unauthorized'));
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

