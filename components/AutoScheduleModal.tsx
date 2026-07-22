import React, { useState } from "react";
import { ShiftConfig, Flight } from "../types";
import { Bot, X, Check, Clock } from "lucide-react";

interface Props {
  shifts: ShiftConfig[];
  flights: Flight[];
  onApply: (updates: ShiftConfig[]) => void;
  onClose: () => void;
}

interface Rule {
  pickupOffsetMins: number;
  releaseOffsetMins: number;
  enabled: boolean;
}

export const AutoScheduleModal: React.FC<Props> = ({
  shifts,
  flights,
  onApply,
  onClose,
}) => {
  const [rules, setRules] = useState<Record<string, Rule>>({
    Arrival: { pickupOffsetMins: -60, releaseOffsetMins: 30, enabled: true },
    Departure: { pickupOffsetMins: -120, releaseOffsetMins: 30, enabled: true },
    Turnaround: { pickupOffsetMins: -60, releaseOffsetMins: 30, enabled: true },
  });

  const getFlightTime = (f: Flight, isStart: boolean) => {
    if (f.type === "Arrival") return f.eta || f.sta;
    if (f.type === "Departure") return f.etd || f.std;
    // Turnaround
    return isStart ? f.eta || f.sta : f.etd || f.std;
  };

  const getMinutes = (timeStr?: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const formatTime = (totalMins: number) => {
    // Handle negative or > 24h
    let mins = totalMins % (24 * 60);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const applyRules = () => {
    const updates: ShiftConfig[] = [];
    
    shifts.forEach((s) => {
      // Skip if locked
      if (s.roleCounts?.["__locked"]) return;
      if (!s.flightIds || s.flightIds.length === 0) return;

      const shiftFlights = s.flightIds
        .map((id) => flights.find((f) => f.id === id))
        .filter(Boolean) as Flight[];
        
      if (shiftFlights.length === 0) return;

      // Sort flights by time
      shiftFlights.sort(
        (a, b) =>
          getMinutes(getFlightTime(a, true)) - getMinutes(getFlightTime(b, true))
      );

      const firstFlight = shiftFlights[0];
      const lastFlight = shiftFlights[shiftFlights.length - 1];

      const firstRule = rules[firstFlight.type || "Turnaround"];
      const lastRule = rules[lastFlight.type || "Turnaround"];

      let updated = false;
      const newShift = { ...s, roleCounts: { ...(s.roleCounts || {}) } };

      if (firstRule?.enabled) {
        const baseMins = getMinutes(getFlightTime(firstFlight, true));
        newShift.pickupTime = formatTime(baseMins + firstRule.pickupOffsetMins);
        updated = true;
      }

      if (lastRule?.enabled) {
        const baseMins = getMinutes(getFlightTime(lastFlight, false));
        newShift.endTime = formatTime(baseMins + lastRule.releaseOffsetMins);
        updated = true;
      }

      if (updated) {
        if (newShift.pickupTime > newShift.endTime) {
          const ed = new Date(newShift.pickupDate);
          ed.setUTCDate(ed.getUTCDate() + 1);
          newShift.endDate = ed.toISOString().split("T")[0];
        } else {
          newShift.endDate = newShift.pickupDate;
        }

        newShift.roleCounts["__ai_scheduled"] = 1;
        delete newShift.roleCounts["__manual_scheduled"];
        updates.push(newShift);
      }
    });

    onApply(updates);
  };

  const updateRule = (type: string, field: keyof Rule, value: number | boolean) => {
    setRules(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value
      }
    }));
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[900] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black uppercase tracking-widest text-slate-900 italic leading-tight">
                Auto-Schedule Shifts
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 font-medium">
                Set pickup & release times based on flight schedules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-slate-700 shadow-sm shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
          {(["Arrival", "Departure", "Turnaround"] as const).map((type) => (
            <div key={type} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">
                  {type} Flights
                </h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Enable</span>
                  <input
                    type="checkbox"
                    checked={rules[type].enabled}
                    onChange={(e) => updateRule(type, "enabled", e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
              </div>
              
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${!rules[type].enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Pickup Offset (Mins)
                  </label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      value={rules[type].pickupOffsetMins}
                      onChange={(e) => updateRule(type, "pickupOffsetMins", parseInt(e.target.value) || 0)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 uppercase">e.g. -60 = 1 hour before</p>
                </div>
                
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Release Offset (Mins)
                  </label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      value={rules[type].releaseOffsetMins}
                      onChange={(e) => updateRule(type, "releaseOffsetMins", parseInt(e.target.value) || 0)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 uppercase">e.g. 30 = 30 mins after</p>
                </div>
              </div>
            </div>
          ))}
          
          <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-xs flex items-start gap-3">
            <Bot size={16} className="shrink-0 mt-0.5" />
            <p>
              <strong>Note:</strong> Auto-schedule will only apply to shifts that have flights assigned and are not manually locked. The first flight determines pickup time, and the last flight determines release time.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
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
            Apply Times
          </button>
        </div>
      </div>
    </div>
  );
};
