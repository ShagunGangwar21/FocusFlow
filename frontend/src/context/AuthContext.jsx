import { createContext, useContext, useState, useEffect } from 'react';
import {
  fetchCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  getCsrfToken,
} from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        await getCsrfToken().catch(() => {});
        const currentUser = await fetchCurrentUser();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch (err) {
        if (err.status !== 401) {
          console.warn('[AuthContext] Session check:', err.message);
        }
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const loggedInUser = await loginUser({ email, password });
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
      throw err;
    }
  };

  const register = async (name, email, password, timezone) => {
    setError(null);
    try {
      const newUser = await registerUser({ name, email, password, timezone });
      setUser(newUser);
      return newUser;
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your inputs.');
      throw err;
    }
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.warn('[AuthContext] Logout endpoint error:', err.message);
    } finally {
      setUser(null);
      setError(null);
    }
  };

  const value = {
    user,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
