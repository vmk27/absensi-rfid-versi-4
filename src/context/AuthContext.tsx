import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { StorageService } from '../services/storage';
import { supabase } from '../services/supabase';
import { verifyPassword, hashPassword } from '../utils/cryptoUtils';

interface AuthContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  switchRole: (role: UserRole) => void;
  login: (username: string, password?: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  isGuruPiket: boolean;
  isWaliKelas: boolean;
  hasAccessToClass: (classId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('sman1_active_user');
      if (savedUser) {
        return JSON.parse(savedUser);
      }
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    StorageService.init();
    const savedUser = localStorage.getItem('sman1_active_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        // ignore
      }
    }
  }, []);

  const switchRole = (role: UserRole) => {
    const users = StorageService.getUsers();
    const targetUser = users.find(u => u.role === role);
    if (targetUser) {
      setCurrentUser(targetUser);
      localStorage.setItem('sman1_active_user', JSON.stringify(targetUser));
    }
  };

  const login = async (username: string, password?: string, rememberMe: boolean = true): Promise<boolean> => {
    const cleanUsername = username.toLowerCase().trim();
    if (!cleanUsername) return false;

    let found: User | null = null;

    // 1. Try to fetch directly from Supabase for live verification
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (data && !error) {
        found = {
          id: data.id,
          username: data.username,
          passwordHash: data.password_hash || undefined,
          name: data.name,
          email: data.email || '',
          role: data.role as UserRole,
          assignedClassId: data.assigned_class_id || undefined,
          assignedClassName: data.assigned_class_name || undefined,
          nip: data.nip || undefined
        };
        // Update local storage with this fresh data
        StorageService.saveUser(found);
      }
    } catch (e) {
      console.warn('[Auth] Supabase fetch failed, falling back to local data:', e);
    }

    // 2. Fallback to Local Storage if Supabase failed or user not found there
    if (!found) {
      const localUsers = StorageService.getUsers();
      found = localUsers.find(u => u.username.toLowerCase() === cleanUsername) || null;
    }

    if (!found) return false;

    // 3. Verify Password
    if (password) {
      if (found.passwordHash) {
        const isMatch = await verifyPassword(password, found.passwordHash);
        if (!isMatch) {
          // Check if matches standard known fallback passwords
          const fallbackMatches = 
            (found.role === 'admin' && password === 'admin123') ||
            (found.role === 'guru_piket' && password === 'piket123') ||
            (found.role === 'wali_kelas' && password === 'wali123');
          if (!fallbackMatches) return false;
        }
      } else {
        // No password hash stored: verify against role defaults
        const validDefault = 
          (found.role === 'admin' && password === 'admin123') ||
          (found.role === 'guru_piket' && password === 'piket123') ||
          (found.role === 'wali_kelas' && password === 'wali123');
        if (!validDefault && password !== 'admin123' && password !== '123456') {
          return false;
        }
        // Save computed hash for future logins
        const newHash = await hashPassword(password);
        StorageService.saveUser({ ...found, passwordHash: newHash });
      }
    }

    setCurrentUser(found);
    if (rememberMe) {
      localStorage.setItem('sman1_active_user', JSON.stringify(found));
    }
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('sman1_active_user');
  };

  const isAdmin = currentUser?.role === 'admin';
  const isGuruPiket = currentUser?.role === 'guru_piket' || isAdmin;
  const isWaliKelas = currentUser?.role === 'wali_kelas';

  const hasAccessToClass = (classId: string): boolean => {
    if (isAdmin || isGuruPiket) return true;
    if (isWaliKelas && currentUser?.assignedClassId) {
      return currentUser.assignedClassId === classId;
    }
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        switchRole,
        login,
        logout,
        isAdmin,
        isGuruPiket,
        isWaliKelas,
        hasAccessToClass
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
