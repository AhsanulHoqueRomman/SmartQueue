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

let refreshPromise = null;

// Response Interceptor: Handles 401 Unauthorized via deduplicated shared token refresh
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
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${baseURL}/auth/token/refresh/`, {
              refresh: refreshToken,
            })
            .then((res) => {
              const newAccess = res.data.access;
              const newRefresh = res.data.refresh || refreshToken;
              tokenService.setTokens(newAccess, newRefresh);
              return newAccess;
            })
            .catch((err) => {
              tokenService.clearTokens();
              window.dispatchEvent(new Event('sq:auth:unauthorized'));
              throw err;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        try {
          const newAccess = await refreshPromise;
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
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

