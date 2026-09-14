import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  loginApi, 
  registerApi, 
  getMeApi, 
  logoutApi, 
  getAuthToken, 
  setAuthToken, 
  removeAuthToken 
} from '../services/api';
import { socketService } from '../services/socket';
import { saveUserSession } from '../utils/userSession';

const AuthContext = createContext({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  clearError: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => getAuthToken());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync user profile with legacy session storage so existing components remain consistent
  const syncUserSession = useCallback((userData) => {
    if (userData) {
      const sessionObj = {
        userId: userData.userId || userData.id,
        displayName: userData.name,
        userColor: userData.userColor || '#6366f1',
        email: userData.email,
        createdAt: userData.createdAt || new Date().toISOString(),
      };
      saveUserSession(sessionObj);
    }
  }, []);

  // Validate stored token on mount
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const storedToken = getAuthToken();
      if (!storedToken) {
        if (isMounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const profile = await getMeApi();
        if (isMounted && profile) {
          setUser(profile);
          setToken(storedToken);
          syncUserSession(profile);
        }
      } catch (err) {
        console.warn('[AuthContext] Stored session invalid or expired:', err.message);
        if (isMounted) {
          removeAuthToken();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();
    return () => { isMounted = false; };
  }, [syncUserSession]);

  /**
   * Log in user with email and password
   */
  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const data = await loginApi(email, password);
      setAuthToken(data.token);
      setToken(data.token);
      setUser(data.user);
      syncUserSession(data.user);

      // Reconnect socket with authenticated identity
      socketService.disconnect();
      socketService.connect();

      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [syncUserSession]);

  /**
   * Register a new user account
   */
  const register = useCallback(async (name, email, password) => {
    setError(null);
    try {
      const data = await registerApi(name, email, password);
      setAuthToken(data.token);
      setToken(data.token);
      setUser(data.user);
      syncUserSession(data.user);

      // Reconnect socket with authenticated identity
      socketService.disconnect();
      socketService.connect();

      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [syncUserSession]);

  /**
   * Log out user
   */
  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } catch (e) {}
    removeAuthToken();
    setToken(null);
    setUser(null);
    setError(null);

    // Disconnect and reset socket connection
    socketService.disconnect();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        error,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
