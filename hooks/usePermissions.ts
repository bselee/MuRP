import { useMemo } from 'react';
import type { InternalRequisition, User } from '../types';
import { useAuth } from '../lib/auth/AuthContext';

type PermissionSummary = {
  role: User['role'] | 'Staff';
  canManagePurchaseOrders: boolean;
  canGeneratePurchaseOrders: boolean;
  canSubmitRequisition: boolean;
  canApproveRequisition: (req: InternalRequisition) => boolean;
  canViewBoms: boolean;
  canEditBoms: boolean;
  canAccessSettings: boolean;
  canViewInventory: boolean;
  isGodMode: boolean;
};

export const usePermissions = (): PermissionSummary => {
  const { user, godMode } = useAuth();

  const role = godMode ? 'Admin' : (user?.role ?? 'Staff');

  const perms = useMemo<PermissionSummary>(() => {
    const roleValue = role ?? 'Staff';
    const canManagePurchaseOrders = roleValue !== 'Staff';
    const canGeneratePurchaseOrders = roleValue !== 'Staff';
    const canSubmitRequisition = true;
    const canEditBoms = roleValue === 'Admin';
    const canViewBoms = roleValue !== undefined;
    const canAccessSettings = roleValue !== 'Staff';
    const canViewInventory = true; // All users can view inventory

    const canApproveRequisition = (req: InternalRequisition) => {
      if (roleValue === 'Admin') return true;
      if (roleValue === 'Manager') {
        return user?.department ? req.department === user.department : false;
      }
      return false;
    };

    return {
      role: roleValue,
      canManagePurchaseOrders,
      canGeneratePurchaseOrders,
      canSubmitRequisition,
      canApproveRequisition,
      canViewBoms,
      canEditBoms,
      canAccessSettings,
      canViewInventory,
      isGodMode: godMode,
    };
  }, [godMode, role, user?.department]);

  return perms;
};
