import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AdminUser {
  id: number;
  name: string | null;
  email: string;
  role: 'admin';
}

interface AdminContextType {
  adminUser: AdminUser | null;
  isAdminAuthenticated: boolean;
  /** True until the existing session has been checked on first load. */
  isCheckingSession: boolean;
  adminLogin: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  adminLogout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

/**
 * Admin authentication.
 *
 * Credentials are verified by the backend against a hashed password on the
 * admin user row, and authorisation comes from `role === 'admin'` on that row.
 *
 * This replaces the previous implementation, which compared the email and
 * password to string literals inside the browser bundle and then set a fixed
 * fake token in localStorage. That check was trivially bypassable and, more
 * importantly, protected nothing: the admin API did not exist, so there was
 * no server-side authorisation to bypass in the first place.
 *
 * The session lives in the httpOnly `app_session_id` cookie, so it is never
 * readable from JavaScript.
 */
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  /** Ask the server who we are. The cookie is the only source of truth. */
  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/trpc/auth.me?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: null }))}`,
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
        const response = await fetch('/api/auth/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload?.success) {
          return { ok: false, message: payload?.message ?? 'Invalid email or password' };
        }

        setAdminUser(payload.user as AdminUser);
        return { ok: true };
      } catch {
        return { ok: false, message: 'Could not reach the server. Please try again.' };
      }
    },
    []
  );

  const adminLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/demo-logout', { credentials: 'include' });
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
  if (!context) throw new Error('useAdmin must be used within AdminProvider');
  return context;
}
