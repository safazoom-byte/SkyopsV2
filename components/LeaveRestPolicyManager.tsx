import React, { useState, useEffect } from "react";
import {
  CalendarDays,
  CheckCircle2,
  RotateCcw,
  Save,
  HelpCircle,
  Sparkles,
  Info,
  Layers,
  Clock,
  UserCheck,
  TrendingDown,
  Percent,
} from "lucide-react";
import { LeavePolicyConfig, LeavePolicyRule, DEFAULT_LEAVE_POLICY, Staff } from "../types";
import {
  getStoredLeavePolicy,
  saveLeavePolicy,
  resetLeavePolicyToDefault,
  calculateStaffLeaveAllowance,
  LEAVE_POLICY_UPDATED_EVENT,
} from "../services/leavePolicyService";

interface LeaveRestPolicyManagerProps {
  staff?: Staff[];
  onPolicyChange?: (newPolicy: LeavePolicyConfig) => void;
}

export const LeaveRestPolicyManager: React.FC<LeaveRestPolicyManagerProps> = ({
  staff = [],
  onPolicyChange,
}) => {
  const [policy, setPolicy] = useState<LeavePolicyConfig>(getStoredLeavePolicy);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [simLeaveDays, setSimLeaveDays] = useState<number>(6);
  const [simStaffType, setSimStaffType] = useState<"Local" | "Roster">("Local");

  useEffect(() => {
    const handleStorageUpdate = () => {
      setPolicy(getStoredLeavePolicy());
    };
    window.addEventListener(LEAVE_POLICY_UPDATED_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(LEAVE_POLICY_UPDATED_EVENT, handleStorageUpdate);
    };
  }, []);

  const handleRuleChange = (
    leaveDays: number,
    field: keyof Omit<LeavePolicyRule, "leaveDays">,
    value: number
  ) => {
    const newRules = policy.rules.map((rule) => {
      if (rule.leaveDays === leaveDays) {
        const updated = { ...rule, [field]: Math.max(0, value) };
        // Auto-calculate deduction if workShifts changed
        if (field === "workShifts") {
          updated.absenceDeduction = Math.max(0, 5 - updated.workShifts);
        }
        return updated;
      }
      return rule;
    });

    const updatedPolicy: LeavePolicyConfig = {
      ...policy,
      rules: newRules,
    };
    setPolicy(updatedPolicy);
  };

  const handleSave = () => {
    saveLeavePolicy(policy);
    setSavedSuccess(true);
    if (onPolicyChange) {
      onPolicyChange(policy);
    }
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleReset = () => {
    if (window.confirm("Reset Leave & Rest policy to standard SkyOPS defaults?")) {
      const def = resetLeavePolicyToDefault();
      setPolicy(def);
      if (onPolicyChange) {
        onPolicyChange(def);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    }
  };

  const applyPreset = (type: "skyops" | "strict52") => {
    if (type === "skyops") {
      setPolicy(DEFAULT_LEAVE_POLICY);
    } else if (type === "strict52") {
      setPolicy({
        name: "Strict 5/2 Linear Policy",
        cycleDays: 7,
        rules: [
          { leaveDays: 0, workShifts: 5, offDays: 2, absenceDeduction: 0 },
          { leaveDays: 1, workShifts: 4, offDays: 2, absenceDeduction: 1 },
          { leaveDays: 2, workShifts: 4, offDays: 1, absenceDeduction: 1 },
          { leaveDays: 3, workShifts: 3, offDays: 1, absenceDeduction: 2 },
          { leaveDays: 4, workShifts: 2, offDays: 1, absenceDeduction: 3 },
          { leaveDays: 5, workShifts: 1, offDays: 1, absenceDeduction: 4 },
          { leaveDays: 6, workShifts: 1, offDays: 0, absenceDeduction: 4 },
          { leaveDays: 7, workShifts: 0, offDays: 0, absenceDeduction: 5 },
        ],
      });
    }
  };

  const simAllowance = calculateStaffLeaveAllowance(simLeaveDays, policy, simStaffType);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 text-white p-6 sm:p-8 rounded-3xl border border-emerald-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[100px] pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <CalendarDays size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">
                  Leave & Rest Policy Engine
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider border border-emerald-400/30">
                  7-Day Cycle
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-1.5 max-w-2xl leading-relaxed">
                Configure exact work shifts, off days, and manpower capacity deductions per 7-day program.
                Changes automatically link with the <strong>Manpower Capacity Forecast</strong> and update <strong>Initial Box Colors</strong> in the Master Roster.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all border border-slate-700 flex items-center gap-2"
            >
              <RotateCcw size={14} />
              Reset Default
            </button>
            <button
              onClick={handleSave}
              className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 ${
                savedSuccess
                  ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-105"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-105 active:scale-95"
              }`}
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 size={16} /> Saved & Applied!
                </>
              ) : (
                <>
                  <Save size={16} /> Save & Apply Policy
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Preset Pickers & Guidelines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-emerald-600" />
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Quick Presets
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">
                One-Click Configuration
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => applyPreset("skyops")}
                className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black uppercase text-emerald-950">
                    SkyOPS Standard (User Rule)
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  • 6 Days AL $\rightarrow$ <strong>1 Work Shift</strong> (+1 man shift cap)<br />
                  • 4 Days AL $\rightarrow$ <strong>2 Work Shifts, 1 Off</strong><br />
                  • 3 Days AL $\rightarrow$ <strong>3 Work Shifts, 1 Off</strong><br />
                  • 7 Days AL $\rightarrow$ <strong>5 Days max capacity loss</strong> (not 7)
                </p>
              </button>

              <button
                onClick={() => applyPreset("strict52")}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black uppercase text-slate-900">
                    Strict Linear Proportion
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    Alternative
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  • Work shifts scaled directly with 5/7 ratio<br />
                  • Standard deduction from full-time contract<br />
                  • Standard days off allocation
                </p>
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <Info size={14} className="text-blue-500 shrink-0" />
            <span>
              <strong>Local Staff Contract:</strong> 5 working shifts + 2 off days per 7 days. When a staff member takes 7 days of annual leave, the system deducts 5 shifts (the contract capacity), rather than 7 shifts.
            </span>
          </div>
        </div>

        {/* Live Interactive Simulator Widget */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserCheck size={18} className="text-emerald-400" />
                <h4 className="text-sm font-black uppercase tracking-wider text-white">
                  Live Rule Simulator
                </h4>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">
                REAL-TIME PREVIEW
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Excused Leave in 7 Days: <span className="text-emerald-400 font-black text-xs">{simLeaveDays} Days</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="7"
                  value={simLeaveDays}
                  onChange={(e) => setSimLeaveDays(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[9px] font-bold text-slate-500 mt-1">
                  <span>0d</span>
                  <span>1d</span>
                  <span>2d</span>
                  <span>3d</span>
                  <span>4d</span>
                  <span>5d</span>
                  <span>6d</span>
                  <span>7d</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="bg-slate-800/80 p-3 rounded-xl text-center border border-slate-700/50">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">
                    Work Target
                  </span>
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    {simAllowance.workShifts}
                  </span>
                  <span className="text-[8px] text-slate-500 block">shifts</span>
                </div>

                <div className="bg-slate-800/80 p-3 rounded-xl text-center border border-slate-700/50">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">
                    Off Deserved
                  </span>
                  <span className="text-lg font-black text-blue-400 font-mono">
                    {simAllowance.offDays}
                  </span>
                  <span className="text-[8px] text-slate-500 block">days</span>
                </div>

                <div className="bg-slate-800/80 p-3 rounded-xl text-center border border-slate-700/50">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">
                    Cap Deduction
                  </span>
                  <span className="text-lg font-black text-rose-400 font-mono">
                    -{simAllowance.absenceDeduction}
                  </span>
                  <span className="text-[8px] text-slate-500 block">shifts</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 mt-3">
                <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">
                  Initial Box Color in Master Roster:
                </span>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-900 font-bold text-[10px] uppercase shadow-sm">
                    SK-ATZ
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    {simAllowance.workShifts > 0
                      ? `Active/Compliant (Target: ${simAllowance.workShifts} shift${simAllowance.workShifts > 1 ? "s" : ""})`
                      : `Full Absence (Target: 0 shifts)`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Policy Matrix Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h4 className="text-base sm:text-lg font-black uppercase italic tracking-tight text-slate-900">
              7-Day Policy Customization Matrix
            </h4>
            <p className="text-slate-500 text-xs mt-0.5">
              Customize the work requirement, day off entitlement, and capacity deduction for each tier of leave.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
              Cycle: 7 Days
            </span>
            <span className="text-[10px] font-bold uppercase px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
              Full Contract: 5 Shifts
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
                <th className="px-4 py-3 text-center rounded-tl-xl w-24">Leave Days</th>
                <th className="px-4 py-3 text-center">Deserved Work Shifts</th>
                <th className="px-4 py-3 text-center">Deserved Days Off</th>
                <th className="px-4 py-3 text-center">Capacity Deduction (Loss)</th>
                <th className="px-4 py-3 text-center">Available Capacity</th>
                <th className="px-4 py-3 text-center">7-Day Balance</th>
                <th className="px-4 py-3 text-center rounded-tr-xl">Behavior & Roster Note</th>
              </tr>
            </thead>
            <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
              {policy.rules.map((rule) => {
                const totalDays = rule.leaveDays + rule.workShifts + rule.offDays;
                const isBalanced = totalDays === 7;
                const availableCap = Math.max(0, 5 - rule.absenceDeduction);

                return (
                  <tr
                    key={rule.leaveDays}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      rule.leaveDays === 6 ? "bg-emerald-50/30" : ""
                    }`}
                  >
                    {/* Leave Days */}
                    <td className="px-4 py-3 text-center font-black">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 text-slate-900 text-sm font-bold shadow-inner">
                        {rule.leaveDays}d
                      </span>
                    </td>

                    {/* Deserved Work Shifts Input */}
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={rule.workShifts}
                          onChange={(e) =>
                            handleRuleChange(
                              rule.leaveDays,
                              "workShifts",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-16 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-center text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">shifts</span>
                      </div>
                    </td>

                    {/* Deserved Days Off Input */}
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={rule.offDays}
                          onChange={(e) =>
                            handleRuleChange(
                              rule.leaveDays,
                              "offDays",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-16 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-center text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">days</span>
                      </div>
                    </td>

                    {/* Capacity Deduction Input */}
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="5"
                          value={rule.absenceDeduction}
                          onChange={(e) =>
                            handleRuleChange(
                              rule.leaveDays,
                              "absenceDeduction",
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-16 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-xl font-bold text-center text-sm text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <span className="text-[10px] font-bold text-rose-400 uppercase">shifts</span>
                      </div>
                    </td>

                    {/* Available Capacity (Man-Shifts) */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-3 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-mono font-bold text-xs">
                        +{availableCap} man-shift{availableCap === 1 ? "" : "s"}
                      </span>
                    </td>

                    {/* 7-Day Balance */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                          isBalanced
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {rule.leaveDays}L + {rule.workShifts}W + {rule.offDays}O = {totalDays}d
                      </span>
                    </td>

                    {/* Note */}
                    <td className="px-4 py-3 text-left text-[11px] text-slate-500">
                      {rule.leaveDays === 0 && "Standard full week (5 work + 2 off)."}
                      {rule.leaveDays === 1 && "1 day leave: works 4 shifts, 2 off days."}
                      {rule.leaveDays === 2 && "2 days leave: works 3 shifts, 2 off days."}
                      {rule.leaveDays === 3 && "3 days leave: works 3 shifts, 1 off day."}
                      {rule.leaveDays === 4 && "4 days leave: works 2 shifts, 1 off day."}
                      {rule.leaveDays === 5 && "5 days leave: 0 work, 2 off days."}
                      {rule.leaveDays === 6 && (
                        <strong className="text-emerald-700 font-bold">
                          6 days leave: works 1 shift, contributes +1 man-shift to capacity.
                        </strong>
                      )}
                      {rule.leaveDays === 7 && (
                        <strong className="text-slate-800 font-bold">
                          7 days leave: 0 shifts, capped at -5 shifts max deduction.
                        </strong>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              All updates sync live across Master Roster, Staff Audit, and Capacity Forecast.
            </span>
          </div>

          <button
            onClick={handleSave}
            className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 ${
              savedSuccess
                ? "bg-emerald-500 text-white shadow-emerald-500/30 scale-105"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-105 active:scale-95"
            }`}
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 size={16} /> Saved & Applied!
              </>
            ) : (
              <>
                <Save size={16} /> Save & Apply Policy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
