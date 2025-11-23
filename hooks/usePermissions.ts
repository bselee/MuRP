import { useMemo } from 'react';
import type { InternalRequisition, User } from '../types';
import { useAuth } from '../lib/auth/AuthContext';

type PermissionSummary = {
  role: User['role'] | 'Staff';
  canManagePurchaseOrders: boolean;
  canGeneratePurchaseOrders: boolean;
  canSubmitRequisition: boolean;
  canApproveRequisition: (req: InternalRequisition) => boolean;
  canOpsApproveRequisition: (req: InternalRequisition) => boolean;
  canViewBoms: boolean;
  canEditBoms: boolean;
  canAccessSettings: boolean;
  canViewInventory: boolean;
  isPurchasing: boolean;
  isOperations: boolean;
  isAdminLike: boolean;
  isGodMode: boolean;
};

export const usePermissions = (): PermissionSummary => {
  const { user, godMode } = useAuth();

  const role = godMode ? 'Admin' : (user?.role ?? 'Staff');

  const perms = useMemo<PermissionSummary>(() => {
    const roleValue = role ?? 'Staff';
    const isPurchasing = user?.department === 'Purchasing';
    const isOperations = user?.department === 'Operations';
    const isAdminLike = roleValue === 'Admin' || isOperations;
    const canManagePurchaseOrders = isAdminLike || isPurchasing || roleValue === 'Manager';
    const canGeneratePurchaseOrders = canManagePurchaseOrders;
    const canSubmitRequisition = true;
    const canEditBoms = isAdminLike;
    const canViewBoms = roleValue !== undefined;
    const canAccessSettings = isAdminLike || roleValue === 'Manager';
    const canViewInventory = true; // All users can view inventory

    const canApproveRequisition = (req: InternalRequisition) => {
      if (isAdminLike) return true;
      if (roleValue === 'Manager' && req.status === 'Pending') {
        return user?.department ? req.department === user.department : false;
      }
      if (isOperations && req.opsApprovalRequired && req.status === 'OpsPending') {
        return true;
      }
      return false;
    };

    const canOpsApproveRequisition = (req: InternalRequisition) => {
      if (isAdminLike) return true;
      if (isOperations && req.opsApprovalRequired && req.status === 'OpsPending') {
        return true;
      }
      return false;
    };

    return {
      role: roleValue,
      canManagePurchaseOrders,
      canGeneratePurchaseOrders,
      canSubmitRequisition,
      canApproveRequisition,
      canOpsApproveRequisition,
      canViewBoms,
      canEditBoms,
      canAccessSettings,
      canViewInventory,
      isPurchasing,
      isOperations,
      isAdminLike,
      isGodMode: godMode,
    };
  }, [godMode, role, user?.department]);

  return perms;
};
