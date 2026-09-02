"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
  verifyMagicLink: (token: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // The JWT lives in an httpOnly cookie managed by the /api proxy; the
  // browser only asks "who am I?" and gets a clean answer or a 401.
  const loadSession = useCallback(async () => {
    try {
      const response = await authApi.me();
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await authApi.login(email, password);
      setUser(response.user);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    setUser(null);
    await fetch('/api/v1/users/me').catch(() => null);
    router.push('/login');
  }, [router]);

  const sendMagicLink = useCallback(async (email: string) => {
    await authApi.loginWithMagicLink(email);
  }, []);

  const verifyMagicLink = useCallback(async (token: string) => {
    const response = await authApi.verifyMagicLink(token);
    setUser(response.user);
    router.push('/dashboard');
  }, [router]);

  const refreshUser = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const value = useMemo(
    () => ({ user, loading, login, logout, sendMagicLink, verifyMagicLink, refreshUser }),
    [user, loading, login, logout, sendMagicLink, verifyMagicLink, refreshUser],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  return { user, loading };
}
