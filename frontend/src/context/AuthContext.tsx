import React, { createContext, useContext, useState, useEffect } from 'react';
import type { RoleId, RoleInfo } from '../types';
import { INITIAL_ROLES } from '../mock/initialData';
import { RolesApi } from '../services/api';

interface AuthContextType {
  currentRole: RoleInfo;
  allRoles: RoleInfo[];
  isAuthenticated: boolean;
  loginRole: (roleId: RoleId, password?: string) => boolean;
  logout: () => void;
  switchRole: (roleId: RoleId) => void;
  changeRolePassword: (roleId: RoleId, newPassword: string) => boolean;
  updateRolePermissions: (roleId: RoleId, permissions: RoleInfo['permissions']) => void;
  can: (permissionKey: keyof RoleInfo['permissions']) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'wakefit_uaim_auth_role_v2';
const ROLES_STORAGE_KEY = 'wakefit_uaim_roles_config_v2';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allRoles, setAllRoles] = useState<RoleInfo[]>(() => {
    const saved = localStorage.getItem(ROLES_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.some(r => r.id === 'admin')) {
          // Ensure all 3 standard roles exist
          const standardIds: RoleId[] = ['admin', 'supervisor', 'operator'];
          const valid = standardIds.map(id => {
            const found = parsed.find((r: RoleInfo) => r.id === id);
            const initial = INITIAL_ROLES.find(r => r.id === id)!;
            return found ? { ...initial, ...found } : initial;
          });
          return valid;
        }
      } catch (e) {
        console.error('Failed to parse saved roles', e);
      }
    }
    return INITIAL_ROLES;
  });

  const [currentRoleId, setCurrentRoleId] = useState<RoleId | null>(() => {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved && (saved === 'admin' || saved === 'supervisor' || saved === 'operator')) {
      return saved as RoleId;
    }
    return null;
  });

  useEffect(() => {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(allRoles));
  }, [allRoles]);

  useEffect(() => {
    if (currentRoleId) {
      localStorage.setItem(AUTH_STORAGE_KEY, currentRoleId);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [currentRoleId]);

  // Fetch live role credentials from backend API on mount
  useEffect(() => {
    RolesApi.getRoles()
      .then(remoteRoles => {
        if (Array.isArray(remoteRoles) && remoteRoles.length > 0) {
          setAllRoles(prev =>
            prev.map(r => {
              const matched = remoteRoles.find(rr => rr.id === r.id);
              return matched ? { ...r, password: matched.password } : r;
            })
          );
        }
      })
      .catch(err => {
        console.warn('Backend roles API offline, using local roles cache', err);
      });
  }, []);

  const currentRole = allRoles.find(r => r.id === currentRoleId) || allRoles[0];
  const isAuthenticated = currentRoleId !== null;

  const loginRole = (roleId: RoleId, password?: string): boolean => {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return false;
    
    // If a password is set, verify it (case-sensitive or lenient trim)
    if (role.password && password !== undefined) {
      if (password.trim() !== role.password.trim()) {
        return false;
      }
    }

    setCurrentRoleId(roleId);
    return true;
  };

  const logout = () => {
    setCurrentRoleId(null);
  };

  const switchRole = (roleId: RoleId) => {
    setCurrentRoleId(roleId);
  };

  const changeRolePassword = (roleId: RoleId, newPassword: string): boolean => {
    if (!newPassword || newPassword.trim().length === 0) {
      return false;
    }
    const cleanPwd = newPassword.trim();
    setAllRoles(prev =>
      prev.map(r =>
        r.id === roleId
          ? { ...r, password: cleanPwd }
          : r
      )
    );

    // Synchronize password change with backend API
    RolesApi.updatePassword(roleId, cleanPwd).catch(err => {
      console.warn(`Failed to sync password change for ${roleId} to backend:`, err);
    });

    return true;
  };

  const updateRolePermissions = (roleId: RoleId, newPermissions: RoleInfo['permissions']) => {
    setAllRoles(prev => 
      prev.map(role => 
        role.id === roleId 
          ? { ...role, permissions: { ...newPermissions } }
          : role
      )
    );
  };

  const can = (permissionKey: keyof RoleInfo['permissions']): boolean => {
    if (!isAuthenticated || !currentRole) return false;
    if (currentRole.id === 'admin') return true;
    return !!currentRole.permissions[permissionKey];
  };

  return (
    <AuthContext.Provider
      value={{
        currentRole,
        allRoles,
        isAuthenticated,
        loginRole,
        logout,
        switchRole,
        changeRolePassword,
        updateRolePermissions,
        can,
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
