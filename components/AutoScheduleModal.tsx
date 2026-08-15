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

  // Convert "HH:mm" to total minutes from midnight
  const getMinutes = (timeStr?: string): number => {
    if (!timeStr || timeStr.trim() === "" || timeStr.toUpperCase() === "NS") return -1;
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h)) return -1;
    return h * 60 + (m || 0);
  };

  // Convert total minutes to "HH:mm", handles >24h and negatives
  const formatTime = (totalMins: number): string => {
    let mins = totalMins % (24 * 60);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  // Returns the pickup time (in minutes from midnight) for a single flight based on its type
  // This is the time staff need to be picked up / on duty for that specific flight
  const getFlightPickupMins = (f: Flight): number | null => {
    if (f.type === "Arrival") {
      if (!rules.Arrival.enabled) return null;
      const sta = getMinutes(f.eta || f.sta);
      if (sta < 0) return null;
      // Staff go to airport to handle arrival: X hours before STA
      return sta + rules.Arrival.pickupOffsetHours * 60;
    }
    if (f.type === "Departure") {
      if (!rules.Departure.enabled) return null;
      const std = getMinutes(f.etd || f.std);
      if (std < 0) return null;
      // Counter opens for passengers: X hours before STD
      return std + rules.Departure.pickupOffsetHours * 60;
    }
    if (f.type === "Turnaround") {
      if (!rules.Turnaround.enabled) return null;
      const times: number[] = [];
      // Arrival side: staff go to handle incoming aircraft
      const sta = getMinutes(f.eta || f.sta);
      if (sta >= 0) times.push(sta + rules.Arrival.pickupOffsetHours * 60);
      // Departure side: counter opens for passengers
      const std = getMinutes(f.etd || f.std);
      if (std >= 0) times.push(std + rules.Departure.pickupOffsetHours * 60);
      if (times.length === 0) return null;
      return Math.min(...times); // Earliest of the two sides
    }
    return null;
  };

  // Returns the release time (in minutes from midnight) for a single flight
  // Release is always after the last departure (STD), or after last arrival if no departure
  const getFlightReleaseMins = (f: Flight): number | null => {
    // Departure or Turnaround: release after STD
    const std = getMinutes(f.etd || f.std);
    if (std >= 0) {
      return std + rules.Departure.releaseOffsetHours * 60;
    }
    // Arrival-only: release after STA + buffer
    const sta = getMinutes(f.eta || f.sta);
    if (sta >= 0) {
      return sta + rules.Arrival.releaseOffsetHours * 60;
    }
    return null;
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

      // --- STEP 1: Calculate per-flight pickup and release times ---
      const pickupTimes = shiftFlights
        .map(getFlightPickupMins)
        .filter((t): t is number => t !== null);

      const releaseTimes = shiftFlights
        .map(getFlightReleaseMins)
        .filter((t): t is number => t !== null);

      if (pickupTimes.length === 0 && releaseTimes.length === 0) return;

      // --- STEP 2: Shift pickup = EARLIEST counter-open across all flights ---
      let finalPickupMins = pickupTimes.length > 0 ? Math.min(...pickupTimes) : null;
      // --- STEP 3: Shift release = LATEST release time across all flights ---
      let finalReleaseMins = releaseTimes.length > 0 ? Math.max(...releaseTimes) : null;

      // --- STEP 4: Apply rounding ---
      if (enableRounding) {
        if (finalPickupMins !== null && pickupRounding > 0) {
          // Round DOWN for pickup (start earlier, not later)
          finalPickupMins = Math.floor(finalPickupMins / pickupRounding) * pickupRounding;
        }
        if (finalReleaseMins !== null && releaseRounding > 0) {
          // Round UP for release (give more buffer, not less)
          finalReleaseMins = Math.ceil(finalReleaseMins / releaseRounding) * releaseRounding;
        }
      }

      const pTime = finalPickupMins !== null ? formatTime(finalPickupMins) : s.pickupTime;
      const eTime = finalReleaseMins !== null ? formatTime(finalReleaseMins) : s.endTime;

      const newShift = { ...s, roleCounts: { ...(s.roleCounts || {}) } };

      if (applyMode === "direct") {
        newShift.pickupTime = pTime;
        newShift.endTime = eTime;

        // Handle overnight: if pickup > end, shift crosses midnight
        if (newShift.pickupTime > newShift.endTime) {
          const ed = new Date(newShift.pickupDate);
          ed.setUTCDate(ed.getUTCDate() + 1);
          newShift.endDate = ed.toISOString().split("T")[0];
        } else {
          newShift.endDate = newShift.pickupDate;
        }

        newShift.roleCounts["__ai_scheduled"] = 1;
        delete newShift.roleCounts["__manual_scheduled"];
        delete newShift.roleCounts["__ai_suggested_pickup"];
        delete newShift.roleCounts["__ai_suggested_end"];
        delete newShift.roleCounts["__ai_suggested_end_date"];
        delete newShift.roleCounts["__has_ai_suggestions"];
      } else {
        // Store as suggestion — manager reviews before applying
        (newShift.roleCounts as any)["__ai_suggested_pickup"] = pTime;
        (newShift.roleCounts as any)["__ai_suggested_end"] = eTime;

        let aiEndDate = s.pickupDate;
        if (pTime > eTime) {
          const ed = new Date(s.pickupDate);
          ed.setUTCDate(ed.getUTCDate() + 1);
          aiEndDate = ed.toISOString().split("T")[0];
        }
        (newShift.roleCounts as any)["__ai_suggested_end_date"] = aiEndDate;
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

  // Show a live preview of what the pickup/release would be for the rules
  const previewExample = (type: "Arrival" | "Departure" | "Turnaround") => {
    const r = rules[type];
    if (!r.enabled) return null;
    if (type === "Arrival") {
      const offset = r.pickupOffsetHours;
      return `STA 19:00 → staff at ${formatTime(19 * 60 + offset * 60)}`;
    }
    if (type === "Departure") {
      const offset = r.pickupOffsetHours;
      return `STD 23:00 → counter at ${formatTime(23 * 60 + offset * 60)}`;
    }
    if (type === "Turnaround") {
      const arrOffset = rules.Arrival.pickupOffsetHours;
      const depOffset = rules.Departure.pickupOffsetHours;
      const pick = Math.min(19 * 60 + arrOffset * 60, 23 * 60 + depOffset * 60);
      return `STA 19:00 / STD 23:00 → staff at ${formatTime(pick)}`;
    }
    return null;
  };

  const flightTypeConfig = [
    {
      type: "Arrival" as const,
      icon: <Plane size={14} className="rotate-180" />,
      color: "sky",
      pickupLabel: "Staff Pickup Before STA",
      pickupHint: "Hours before aircraft lands. e.g. −2 = staff go 2h before arrival",
      releaseLabel: "Release After STA",
      releaseHint: "Hours after arrival handling complete. e.g. 0.5 = 30 min after",
    },
    {
      type: "Departure" as const,
      icon: <PlaneTakeoff size={14} />,
      color: "amber",
      pickupLabel: "Counter Open Before STD",
      pickupHint: "Hours before departure. e.g. −5 = counter opens 5h before STD",
      releaseLabel: "Release After STD",
      releaseHint: "Hours after aircraft departs. e.g. 0.5 = 30 min after STD",
    },
    {
      type: "Turnaround" as const,
      icon: <ArrowRight size={14} />,
      color: "violet",
      pickupLabel: "Pickup Override (Hours)",
      pickupHint: "Uses Arrival & Departure rules automatically. Override only if needed.",
      releaseLabel: "Release After STD",
      releaseHint: "Hours after last departure. Overrides departure rule for this flight.",
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
                Calculate pickup & release times from flight schedule
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

          {/* How It Works note */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-800 space-y-1.5">
            <p className="font-black uppercase tracking-wider text-indigo-600 text-[10px]">How It Works</p>
            <p>
              For each shift, the engine checks <strong>every assigned flight</strong> individually,
              calculates when staff must be on duty, then sets:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] font-medium">
              <li><strong>Pickup</strong> = earliest duty time across all flights in the shift</li>
              <li><strong>Release</strong> = latest departure time + release buffer</li>
            </ul>
            <p className="text-[11px] text-indigo-600 font-semibold mt-1">
              Example: Arrival STA 19:00 (−2h = 17:00) + Departure STD 23:00 (−5h = 18:00) → Shift pickup = <strong>17:00</strong>
            </p>
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
              Rounds pickup <strong>down</strong> (start earlier) and release <strong>up</strong> (end later) for cleaner shift times.
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
