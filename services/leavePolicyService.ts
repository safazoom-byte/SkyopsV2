import { LeavePolicyConfig, DEFAULT_LEAVE_POLICY, LeavePolicyRule } from "../types";

const LEAVE_POLICY_STORAGE_KEY = "skyops_leave_rest_policy_v1";

// Event for cross-component reactive updates
export const LEAVE_POLICY_UPDATED_EVENT = "skyops_leave_policy_updated";

export const getStoredLeavePolicy = (): LeavePolicyConfig => {
  try {
    const raw = localStorage.getItem(LEAVE_POLICY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.rules) && parsed.rules.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse stored leave policy, using default:", e);
  }
  return DEFAULT_LEAVE_POLICY;
};

export const saveLeavePolicy = (policy: LeavePolicyConfig): void => {
  try {
    localStorage.setItem(LEAVE_POLICY_STORAGE_KEY, JSON.stringify(policy));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LEAVE_POLICY_UPDATED_EVENT, { detail: policy }));
    }
  } catch (e) {
    console.error("Failed to save leave policy to storage:", e);
  }
};

export const resetLeavePolicyToDefault = (): LeavePolicyConfig => {
  saveLeavePolicy(DEFAULT_LEAVE_POLICY);
  return DEFAULT_LEAVE_POLICY;
};

/**
 * Calculates target work shifts, off days, and manpower capacity deduction
 * for a local staff member based on their total excused leave days in a 7-day period.
 */
export const calculateStaffLeaveAllowance = (
  leaveDays: number,
  policy: LeavePolicyConfig = getStoredLeavePolicy(),
  staffType: "Local" | "Roster" = "Local",
  nominalDays: number = 5
): { workShifts: number; offDays: number; absenceDeduction: number } => {
  const clampedLeave = Math.max(0, Math.min(policy.cycleDays, Math.round(leaveDays)));

  if (staffType === "Roster") {
    // For Roster staff, each leave day directly reduces available capacity from their active period
    const workShifts = Math.max(0, nominalDays - clampedLeave);
    const offDays = 0;
    const absenceDeduction = clampedLeave;
    return { workShifts, offDays, absenceDeduction };
  }

  // Local staff policy lookup
  const rule = policy.rules.find((r) => r.leaveDays === clampedLeave);
  if (rule) {
    return {
      workShifts: rule.workShifts,
      offDays: rule.offDays,
      absenceDeduction: rule.absenceDeduction,
    };
  }

  // Fallback if rule not found for exact count:
  // Standard local max shifts is 5. If leave is 7, max deduction is 5.
  const absenceDeduction = Math.min(5, clampedLeave);
  const workShifts = Math.max(0, 5 - absenceDeduction);
  const offDays = Math.max(0, 7 - clampedLeave - workShifts);

  return { workShifts, offDays, absenceDeduction };
};
