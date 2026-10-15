import { create } from 'zustand';
import { UserDTO } from '@bulk-cert/shared';
import { apiRequest } from '../api/client';

interface AuthState {
  user: UserDTO | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  checkSession: () => Promise<boolean>;
  login: (loginName: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  checkSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiRequest<{ user: UserDTO }>('/api/auth/me');
      set({ user: res.user, isAuthenticated: true, isLoading: false });
      return true;
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return false;
    }
  },

  login: async (loginName: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiRequest<{ user: UserDTO }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ loginName, password })
      });
      set({ user: res.user, isAuthenticated: true, isLoading: false, error: null });
      return true;
    } catch (err: any) {
      set({
        error: err.message || 'Incorrect login name or password.',
        isLoading: false,
        isAuthenticated: false
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {}
    set({ user: null, isAuthenticated: false, error: null });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    set((state) => ({
      user: state.user ? { ...state.user, mustChangePassword: false } : null
    }));
  }
}));
