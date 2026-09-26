import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

interface AdminUser {
  id: number;
  name: string | null;
  email: string;
  role: 'admin';
}

interface AdminContextType {
  adminUser: AdminUser | null;
  isAdminAuthenticated: boolean;
  isCheckingSession: boolean;
  adminLogin: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  adminLogout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/trpc/auth.me?batch=1&input=${encodeURIComponent(
          JSON.stringify({ 0: null })
        )}`,
        { credentials: 'include' }
      );

      const payload = await response.json();
      const user = payload?.[0]?.result?.data?.json;

      setAdminUser(user && user.role === 'admin' ? user : null);
    } catch {
      setAdminUser(null);
    } finally {
      setIsCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const adminLogin = useCallback(
    async (email: string, password: string) => {
      try {
        const response = await fetch(`${API_URL}/api/auth/admin-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.success) {
          return {
            ok: false,
            message: payload?.message ?? 'Invalid email or password',
          };
        }

        setAdminUser(payload.user as AdminUser);
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: 'Could not reach the server. Please try again.',
        };
      }
    },
    []
  );

  const adminLogout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/auth/demo-logout`, {
        credentials: 'include',
      });
    } finally {
      setAdminUser(null);
    }
  }, []);

  return (
    <AdminContext.Provider
      value={{
        adminUser,
        isAdminAuthenticated: !!adminUser,
        isCheckingSession,
        adminLogin,
        adminLogout,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);

  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider');
  }

  return context;
}

