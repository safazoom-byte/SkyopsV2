import React, { useState } from "react";
import { ShiftConfig, Flight } from "../types";
import { Bot, X, Check, Clock, Settings, Sparkles, Plane, PlaneTakeoff, ArrowRight } from "lucide-react";

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  onApply: (updates: ShiftConfig[]) => void;
  onClose: () => void;
}

interface Rule {
  pickupOffsetHours: number; // negative = before flight time, e.g. -2 = 2h before
  releaseOffsetHours: number; // positive = after flight time, e.g. 0.5 = 30min after
  enabled: boolean;
}

export const AutoScheduleModal: React.FC<Props> = ({
  shifts,
  flights,
  onApply,
  onClose,
}) => {
  // Default rules in HOURS
  const [rules, setRules] = useState<Record<string, Rule>>({
    Arrival:    { pickupOffsetHours: -2,   releaseOffsetHours: 0.5,  enabled: true },
    Departure:  { pickupOffsetHours: -5,   releaseOffsetHours: 0.5,  enabled: true },
    Turnaround: { pickupOffsetHours: -2,   releaseOffsetHours: 0.5,  enabled: true },
  });

  const [applyMode, setApplyMode] = useState<"suggestions" | "direct">("suggestions");
  const [enableRounding, setEnableRounding] = useState(true);
  const [pickupRounding, setPickupRounding] = useState<number>(60); // round to nearest hour
  const [releaseRounding, setReleaseRounding] = useState<number>(30); // round up to nearest 30min

  // Helper to construct exact UTC Date for a flight time with cross-midnight support
  const getFlightDateTime = (
    baseDateStr: string,
    timeStr?: string,
    crossMidnightIfEarlierThan?: string
  ): Date | null => {
    if (!timeStr || timeStr.trim() === "" || timeStr.toUpperCase() === "NS" || timeStr.includes("---")) {
      return null;
    }
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h)) return null;

    const dt = new Date(`${baseDateStr}T00:00:00Z`);
    dt.setUTCHours(h, m || 0, 0, 0);

    // If a turnaround flight has departure time earlier than arrival time on the same record, it spans midnight
    if (crossMidnightIfEarlierThan) {
      const [prevH, prevM] = crossMidnightIfEarlierThan.split(":").map(Number);
      if (!isNaN(prevH)) {
        if (h < prevH || (h === prevH && (m || 0) < (prevM || 0))) {
          dt.setUTCDate(dt.getUTCDate() + 1);
        }
      }
    }
    return dt;
  };

  // Convert Date object to "HH:mm" (UTC)
  const formatTimeUTC = (d: Date): string => {
    const h = d.getUTCHours().toString().padStart(2, "0");
    const m = d.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  // Convert Date object to "YYYY-MM-DD" (UTC)
  const formatDateUTC = (d: Date): string => {
    return d.toISOString().split("T")[0];
  };

  // Calculates duty start (pickup) timestamp and duty end (release) timestamp for a single flight
  const getFlightDutyTimestamps = (
    f: Flight,
    shiftPickupDate: string
  ): { pickupDt: Date | null; releaseDt: Date | null } => {
    const fDate = f.date || shiftPickupDate;

    const arrTime = f.eta || f.sta;
    const depTime = f.etd || f.std;

    const arrDt = getFlightDateTime(fDate, arrTime);
    const depDt = getFlightDateTime(
      fDate,
      depTime,
      f.type === "Turnaround" && arrTime ? arrTime : undefined
    );

    let pickupDt: Date | null = null;
    let releaseDt: Date | null = null;

    // --- 1. PICKUP CALCULATION ---
    if (f.type === "Arrival") {
      if (rules.Arrival.enabled && arrDt) {
        // Staff go to airport before aircraft lands
        pickupDt = new Date(arrDt.getTime() + rules.Arrival.pickupOffsetHours * 3600 * 1000);
      }
    } else if (f.type === "Departure") {
      if (rules.Departure.enabled && depDt) {
        // Counter opens before flight departs
        pickupDt = new Date(depDt.getTime() + rules.Departure.pickupOffsetHours * 3600 * 1000);
      }
    } else {
      // Turnaround
      if (rules.Turnaround.enabled) {
        const candidatePickups: number[] = [];
        if (arrDt) {
          candidatePickups.push(arrDt.getTime() + rules.Arrival.pickupOffsetHours * 3600 * 1000);
        }
        if (depDt) {
          candidatePickups.push(depDt.getTime() + rules.Departure.pickupOffsetHours * 3600 * 1000);
        }
        if (candidatePickups.length > 0) {
          pickupDt = new Date(Math.min(...candidatePickups));
        }
      }
    }

    // --- 2. RELEASE CALCULATION ---
    if (depDt) {
      // Release after departure
      releaseDt = new Date(depDt.getTime() + rules.Departure.releaseOffsetHours * 3600 * 1000);
    } else if (arrDt) {
      // Release after arrival (if arrival only)
      releaseDt = new Date(arrDt.getTime() + rules.Arrival.releaseOffsetHours * 3600 * 1000);
    }

    return { pickupDt, releaseDt };
  };

  const applyRules = () => {
    const updates: ShiftConfig[] = [];

    shifts.forEach((s) => {
      // Skip locked shifts
      if (s.roleCounts?.["__locked"]) return;
      if (!s.flightIds || s.flightIds.length === 0) return;

      const shiftFlights = s.flightIds
        .map((id) => flights.find((f) => f.id === id))
        .filter(Boolean) as Flight[];

      if (shiftFlights.length === 0) return;

      // --- STEP 1: Calculate full UTC timestamps for every flight in the shift ---
      const allPickups: Date[] = [];
      const allReleases: Date[] = [];

      shiftFlights.forEach((f) => {
        const { pickupDt, releaseDt } = getFlightDutyTimestamps(f, s.pickupDate);
        if (pickupDt) allPickups.push(pickupDt);
        if (releaseDt) allReleases.push(releaseDt);
      });

      if (allPickups.length === 0 && allReleases.length === 0) return;

      // --- STEP 2: Find earliest pickup date/time and latest release date/time ---
      let earliestPickup: Date | null =
        allPickups.length > 0
          ? new Date(Math.min(...allPickups.map((d) => d.getTime())))
          : null;

      let latestRelease: Date | null =
        allReleases.length > 0
          ? new Date(Math.max(...allReleases.map((d) => d.getTime())))
          : null;

      // --- STEP 3: Apply rounding across the full timeline ---
      if (enableRounding) {
        if (earliestPickup && pickupRounding > 0) {
          // Round DOWN pickup to give staff enough preparation time (e.g. 17:15 -> 17:00)
          const mins = earliestPickup.getUTCHours() * 60 + earliestPickup.getUTCMinutes();
          const roundedMins = Math.floor(mins / pickupRounding) * pickupRounding;
          const diffMins = roundedMins - mins;
          earliestPickup = new Date(earliestPickup.getTime() + diffMins * 60 * 1000);
        }

        if (latestRelease && releaseRounding > 0) {
          // Round UP release to provide adequate post-flight buffer (e.g. 23:10 -> 23:30)
          const mins = latestRelease.getUTCHours() * 60 + latestRelease.getUTCMinutes();
          const roundedMins = Math.ceil(mins / releaseRounding) * releaseRounding;
          const diffMins = roundedMins - mins;
          latestRelease = new Date(latestRelease.getTime() + diffMins * 60 * 1000);
        }
      }

      const pTime = earliestPickup ? formatTimeUTC(earliestPickup) : s.pickupTime;
      const eTime = latestRelease ? formatTimeUTC(latestRelease) : s.endTime;
      const eDate = latestRelease ? formatDateUTC(latestRelease) : s.endDate || s.pickupDate;

      const newShift = { ...s, roleCounts: { ...(s.roleCounts || {}) } };

      if (applyMode === "direct") {
        newShift.pickupTime = pTime;
        newShift.endTime = eTime;
        newShift.endDate = eDate;

        newShift.roleCounts["__ai_scheduled"] = 1;
        delete newShift.roleCounts["__manual_scheduled"];
        delete newShift.roleCounts["__ai_suggested_pickup"];
        delete newShift.roleCounts["__ai_suggested_end"];
        delete newShift.roleCounts["__ai_suggested_end_date"];
        delete newShift.roleCounts["__has_ai_suggestions"];
      } else {
        // Store as suggestion — manager reviews and approves
        (newShift.roleCounts as any)["__ai_suggested_pickup"] = pTime;
        (newShift.roleCounts as any)["__ai_suggested_end"] = eTime;
        (newShift.roleCounts as any)["__ai_suggested_end_date"] = eDate;
        (newShift.roleCounts as any)["__has_ai_suggestions"] = 1;
      }

      updates.push(newShift);
    });

    onApply(updates);
  };

  const updateRule = (type: string, field: keyof Rule, value: number | boolean) => {
    setRules((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const previewExample = (type: "Arrival" | "Departure" | "Turnaround") => {
    const r = rules[type];
    if (!r.enabled) return null;
    if (type === "Arrival") {
      const offset = r.pickupOffsetHours;
      const m = (19 * 60 + offset * 60 + 24 * 60) % (24 * 60);
      const h = Math.floor(m / 60).toString().padStart(2, "0");
      const mins = (m % 60).toString().padStart(2, "0");
      return `STA 19:00 → staff at ${h}:${mins}`;
    }
    if (type === "Departure") {
      const offset = r.pickupOffsetHours;
      const m = (23 * 60 + offset * 60 + 24 * 60) % (24 * 60);
      const h = Math.floor(m / 60).toString().padStart(2, "0");
      const mins = (m % 60).toString().padStart(2, "0");
      return `STD 23:00 → counter at ${h}:${mins}`;
    }
    if (type === "Turnaround") {
      return `Handles both arrival & departure across multi-day dates`;
    }
    return null;
  };

  const flightTypeConfig = [
    {
      type: "Arrival" as const,
      icon: <Plane size={14} className="rotate-180" />,
      color: "sky",
      pickupLabel: "Staff Pickup Before STA",
      pickupHint: "Hours before aircraft lands. e.g. −2 = staff arrive 2h before STA",
      releaseLabel: "Release After STA",
      releaseHint: "Hours after arrival handling. e.g. 0.5 = 30 min buffer",
    },
    {
      type: "Departure" as const,
      icon: <PlaneTakeoff size={14} />,
      color: "amber",
      pickupLabel: "Counter Open Before STD",
      pickupHint: "Hours before departure. e.g. −5 = counter opens 5h before STD",
      releaseLabel: "Release After STD",
      releaseHint: "Hours after aircraft departs. e.g. 0.5 = 30 min buffer",
    },
    {
      type: "Turnaround" as const,
      icon: <ArrowRight size={14} />,
      color: "violet",
      pickupLabel: "Turnaround Pickup Rule",
      pickupHint: "Calculates earliest of arrival STA and departure STD rules.",
      releaseLabel: "Turnaround Release Rule",
      releaseHint: "Calculates release after last departure STD across dates.",
    },
  ];

  const colorMap: Record<string, string> = {
    sky:    "bg-sky-50 border-sky-200 text-sky-700",
    amber:  "bg-amber-50 border-amber-200 text-amber-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  };
  const iconBgMap: Record<string, string> = {
    sky:    "bg-sky-100 text-sky-600",
    amber:  "bg-amber-100 text-amber-600",
    violet: "bg-violet-100 text-violet-600",
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[900] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 animate-pulse">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase tracking-widest text-slate-900 italic leading-tight">
                Auto-Schedule Shifts
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Multi-flight & cross-date aware scheduling engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-slate-700 shadow-sm shrink-0 transition-all hover:rotate-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">

          {/* How It Works banner */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-800 space-y-1.5">
            <p className="font-black uppercase tracking-wider text-indigo-600 text-[10px]">
              Cross-Date & Multi-Flight Calculation
            </p>
            <p>
              The engine checks <strong>every flight date and time</strong> in the shift. Even if flights span across midnight (e.g. Flight 1 at 23:00 on Day 1, Flight 2 at 03:00 on Day 2):
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] font-medium">
              <li><strong>Pickup</strong> = Earliest duty start across all flight dates</li>
              <li><strong>Release & End Date</strong> = Latest departure time + buffer (accurately advances <code>endDate</code> across midnight)</li>
            </ul>
          </div>

          {/* Flight Type Rules */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Rules Per Flight Type</h4>

            {flightTypeConfig.map(({ type, icon, color, pickupLabel, pickupHint, releaseLabel, releaseHint }) => {
              const r = rules[type];
              const preview = previewExample(type);
              return (
                <div key={type} className={`border rounded-2xl p-4 ${colorMap[color]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${iconBgMap[color]}`}>
                        {icon}
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">
                          {type}
                        </h3>
                        {preview && r.enabled && (
                          <p className="text-[10px] text-slate-500 font-medium">{preview}</p>
                        )}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Enable</span>
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => updateRule(type, "enabled", e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  </div>

                  <div className={`grid grid-cols-2 gap-3 ${!r.enabled ? "opacity-40 pointer-events-none" : ""}`}>
                    {/* Pickup offset */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                        {pickupLabel}
                      </label>
                      <div className="relative">
                        <Clock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          step="0.5"
                          value={r.pickupOffsetHours}
                          onChange={(e) => updateRule(type, "pickupOffsetHours", parseFloat(e.target.value) || 0)}
                          className="w-full pl-8 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">h</span>
                      </div>
                      <p className="text-[9px] text-slate-500 mt-1 leading-tight">{pickupHint}</p>
                    </div>

                    {/* Release offset */}
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-600 block mb-1">
                        {releaseLabel}
                      </label>
                      <div className="relative">
                        <Clock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          step="0.5"
                          value={r.releaseOffsetHours}
                          onChange={(e) => updateRule(type, "releaseOffsetHours", parseFloat(e.target.value) || 0)}
                          className="w-full pl-8 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">h</span>
                      </div>
                      <p className="text-[9px] text-slate-500 mt-1 leading-tight">{releaseHint}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rounding */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Settings size={15} className="text-slate-500" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">
                  Time Rounding
                </h3>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[10px] font-bold uppercase text-slate-500">Enable</span>
                <input
                  type="checkbox"
                  checked={enableRounding}
                  onChange={(e) => setEnableRounding(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-normal">
              Rounds pickup <strong>down</strong> (start earlier) and release <strong>up</strong> (end later) across dates.
            </p>
            <div className={`grid grid-cols-2 gap-3 ${!enableRounding ? "opacity-40 pointer-events-none" : ""}`}>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Pickup Rounding (Down)</label>
                <select
                  value={pickupRounding}
                  onChange={(e) => setPickupRounding(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value={15}>Nearest 15 min</option>
                  <option value={30}>Nearest 30 min</option>
                  <option value={60}>Nearest 1 hour</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Release Rounding (Up)</label>
                <select
                  value={releaseRounding}
                  onChange={(e) => setReleaseRounding(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value={15}>Nearest 15 min</option>
                  <option value={30}>Nearest 30 min</option>
                  <option value={60}>Nearest 1 hour</option>
                </select>
              </div>
            </div>
          </div>

          {/* Apply Mode */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-indigo-500" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">Apply Mode</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setApplyMode("suggestions")}
                className={`border-2 rounded-2xl p-3 cursor-pointer transition-all flex flex-col gap-1 ${
                  applyMode === "suggestions" ? "border-indigo-600 bg-indigo-50/20" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-xs font-black uppercase text-indigo-700 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${applyMode === "suggestions" ? "bg-indigo-600" : "bg-transparent border border-slate-400"}`} />
                  Show Suggestion Box
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Shows proposed times below each shift for your review before applying.
                </span>
              </div>
              <div
                onClick={() => setApplyMode("direct")}
                className={`border-2 rounded-2xl p-3 cursor-pointer transition-all flex flex-col gap-1 ${
                  applyMode === "direct" ? "border-slate-800 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${applyMode === "direct" ? "bg-slate-800" : "bg-transparent border border-slate-400"}`} />
                  Apply Directly
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Overwrites shift times immediately. Faster but no preview.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-white shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={applyRules}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Check size={14} />
            Apply Schedule Rules
          </button>
        </div>
      </div>
    </div>
  );
};
