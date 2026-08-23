import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeftRight,
  Plus,
  Minus,
  UserPlus,
  UserMinus,
  Clock,
  Search,
  RotateCcw,
  Calendar,
  Filter,
  Users,
  Activity,
  History,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Staff, ShiftConfig, RosterUpdate, UserProfile } from "../types";
import { db, getMonday } from "../services/supabaseService";

interface UpdatesTabProps {
  staff: Staff[];
  shifts: ShiftConfig[];
  startDate?: string;
  endDate?: string;
  currentUser?: UserProfile | null;
}

const CHANGE_TYPES = [
  { id: "ALL", label: "All Changes", icon: Activity },
  { id: "SHIFT_CHANGE", label: "Shift Change", icon: ArrowLeftRight, color: "indigo" },
  { id: "DAY_OFF_TO_WORK", label: "Off ➔ Work", icon: Plus, color: "emerald" },
  { id: "WORK_TO_DAY_OFF", label: "Work ➔ Off", icon: Minus, color: "rose" },
  { id: "STAFF_ADDED", label: "Staff Added", icon: UserPlus, color: "emerald" },
  { id: "STAFF_REMOVED", label: "Staff Removed", icon: UserMinus, color: "rose" },
  { id: "SHIFT_TIME_CHANGE", label: "Time Change", icon: Clock, color: "amber" },
] as const;

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "Just now";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 45) return "Just now";
    if (diffSec < 90) return "1 min ago";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    if (diffSec < 7200) return "1 hour ago";
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    if (diffSec < 172800) return "Yesterday";
    return `${Math.floor(diffSec / 86400)} days ago`;
  } catch {
    return dateStr;
  }
}

function formatExactDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00Z`);
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

export const UpdatesTab: React.FC<UpdatesTabProps> = ({
  staff,
  shifts,
  startDate,
  endDate,
  currentUser,
}) => {
  const [updates, setUpdates] = useState<RosterUpdate[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [pageOffset, setPageOffset] = useState<number>(0);
  const PAGE_SIZE = 50;

  // Filters
  const currentWeekMonday = useMemo(() => {
    return startDate ? getMonday(startDate) : getMonday(new Date().toISOString().split("T")[0]);
  }, [startDate]);

  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekMonday);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedChangeType, setSelectedChangeType] = useState<string>("ALL");

  // Generate available week options (current week +- 8 weeks)
  const availableWeeks = useMemo(() => {
    const weeks: { monday: string; label: string }[] = [];
    const baseDate = new Date(`${currentWeekMonday}T12:00:00Z`);

    for (let i = -6; i <= 6; i++) {
      const wDate = new Date(baseDate);
      wDate.setUTCDate(wDate.getUTCDate() + i * 7);
      const mStr = wDate.toISOString().split("T")[0];
      const sundayDate = new Date(wDate);
      sundayDate.setUTCDate(sundayDate.getUTCDate() + 6);

      const mMonth = wDate.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
      const sMonth = sundayDate.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
      const isCurrent = mStr === currentWeekMonday;

      weeks.push({
        monday: mStr,
        label: `Week of ${mMonth} – ${sMonth} ${isCurrent ? "(Current)" : ""}`,
      });
    }
    return weeks;
  }, [currentWeekMonday]);

  // Load updates
  const loadUpdates = useCallback(
    async (reset = false) => {
      if (reset) {
        setLoading(true);
        setPageOffset(0);
      } else {
        setLoadingMore(true);
      }

      const offset = reset ? 0 : pageOffset;
      const res = await db.fetchRosterUpdates({
        weekStart: selectedWeek === "ALL" ? undefined : selectedWeek,
        changeType: selectedChangeType === "ALL" ? undefined : selectedChangeType,
        limit: PAGE_SIZE,
        offset: offset,
      });

      if (reset) {
        setUpdates(res.data);
        setTotalCount(res.count);
        setPageOffset(PAGE_SIZE);
      } else {
        setUpdates((prev) => [...prev, ...res.data]);
        setTotalCount(res.count);
        setPageOffset((prev) => prev + PAGE_SIZE);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [selectedWeek, selectedChangeType, pageOffset]
  );

  // Initial and on-filter change load
  useEffect(() => {
    loadUpdates(true);
  }, [selectedWeek, selectedChangeType]);

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = db.subscribeRosterUpdates((newEntry) => {
      // Check if entry fits current filter
      if (selectedWeek !== "ALL" && newEntry.week_start && newEntry.week_start !== selectedWeek) {
        return;
      }
      if (selectedChangeType !== "ALL" && newEntry.change_type !== selectedChangeType) {
        return;
      }
      setUpdates((prev) => {
        // avoid duplicate if already present
        if (prev.some((u) => u.id === newEntry.id)) return prev;
        return [newEntry, ...prev];
      });
      setTotalCount((prev) => prev + 1);
    });

    return () => {
      unsubscribe();
    };
  }, [selectedWeek, selectedChangeType]);

  // Filtered in-memory by search query (staff name or initials or user)
  const filteredUpdates = useMemo(() => {
    if (!searchQuery.trim()) return updates;
    const q = searchQuery.toLowerCase().trim();
    return updates.filter((u) => {
      const matchStaff =
        (u.staff_name && u.staff_name.toLowerCase().includes(q)) ||
        (u.staff_initials && u.staff_initials.toLowerCase().includes(q));
      const matchUser = u.changed_by_name && u.changed_by_name.toLowerCase().includes(q);
      const matchShift =
        (u.from_shift_name && u.from_shift_name.toLowerCase().includes(q)) ||
        (u.to_shift_name && u.to_shift_name.toLowerCase().includes(q)) ||
        (u.from_value && u.from_value.toLowerCase().includes(q)) ||
        (u.to_value && u.to_value.toLowerCase().includes(q));
      return matchStaff || matchUser || matchShift;
    });
  }, [updates, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let total = updates.length;
    let shiftChanges = 0;
    let offWorkSwaps = 0;
    const uniqueUsers = new Set<string>();

    updates.forEach((u) => {
      if (u.change_type === "SHIFT_CHANGE") shiftChanges++;
      if (u.change_type === "DAY_OFF_TO_WORK" || u.change_type === "WORK_TO_DAY_OFF") {
        offWorkSwaps++;
      }
      if (u.changed_by_name) uniqueUsers.add(u.changed_by_name);
    });

    return {
      total,
      shiftChanges,
      offWorkSwaps,
      userCount: uniqueUsers.size,
    };
  }, [updates]);

  const handleClearFilters = () => {
    setSelectedWeek(currentWeekMonday);
    setSelectedChangeType("ALL");
    setSearchQuery("");
  };

  const getBadgeConfig = (type: string) => {
    switch (type) {
      case "SHIFT_CHANGE":
        return {
          bg: "bg-indigo-50",
          text: "text-indigo-700",
          border: "border-indigo-200",
          leftBorder: "border-l-indigo-500",
          icon: ArrowLeftRight,
          label: "Shift Change",
        };
      case "DAY_OFF_TO_WORK":
        return {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
          leftBorder: "border-l-emerald-500",
          icon: Plus,
          label: "Off ➔ Work (Extra Day)",
        };
      case "WORK_TO_DAY_OFF":
        return {
          bg: "bg-rose-50",
          text: "text-rose-700",
          border: "border-rose-200",
          leftBorder: "border-l-rose-500",
          icon: Minus,
          label: "Work ➔ Off Day",
        };
      case "STAFF_ADDED":
        return {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-200",
          leftBorder: "border-l-emerald-500",
          icon: UserPlus,
          label: "Staff Added",
        };
      case "STAFF_REMOVED":
        return {
          bg: "bg-rose-50",
          text: "text-rose-700",
          border: "border-rose-200",
          leftBorder: "border-l-rose-500",
          icon: UserMinus,
          label: "Staff Removed",
        };
      case "SHIFT_TIME_CHANGE":
        return {
          bg: "bg-amber-50",
          text: "text-amber-700",
          border: "border-amber-200",
          leftBorder: "border-l-amber-500",
          icon: Clock,
          label: "Time Adjusted",
        };
      default:
        return {
          bg: "bg-slate-50",
          text: "text-slate-700",
          border: "border-slate-200",
          leftBorder: "border-l-slate-400",
          icon: Activity,
          label: type.replace(/_/g, " "),
        };
    }
  };

  return (
    <div id="updates-logs-container" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─────────────────────────────────────────
          PART A — Filter Bar (Sticky)
      ───────────────────────────────────────── */}
      <div
        id="updates-logs-filter-bar"
        className="sticky top-[125px] z-30 bg-slate-50/95 backdrop-blur-md pt-2 pb-4 px-1"
      >
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 md:p-4 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Left filters: Week + Search */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Week Selector */}
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Calendar size={15} />
              </div>
              <select
                id="filter-week-select"
                aria-label="Filter roster changes by week"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Recorded Weeks</option>
                {availableWeeks.map((w) => (
                  <option key={w.monday} value={w.monday}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Staff Search */}
            <div className="relative min-w-[220px] flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search size={15} />
              </div>
              <input
                id="filter-staff-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff, initials, or user..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>

            {/* Change Type Dropdown */}
            <div className="relative min-w-[170px] flex-1 sm:flex-none">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Filter size={14} />
              </div>
              <select
                id="filter-change-type-select"
                aria-label="Filter by change type"
                value={selectedChangeType}
                onChange={(e) => setSelectedChangeType(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
              >
                {CHANGE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons: Reset & Refresh */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
            <button
              id="btn-refresh-updates"
              onClick={() => loadUpdates(true)}
              title="Refresh logs"
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-indigo-600" : ""} />
            </button>
            <button
              id="btn-clear-filters"
              onClick={handleClearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────
          PART B — Summary Cards
      ───────────────────────────────────────── */}
      <div id="updates-logs-metrics-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Total Changes */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Total Updates
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                {totalCount}
              </span>
              <span className="text-[10px] font-bold text-slate-400">entries</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <History size={20} />
          </div>
        </div>

        {/* Shift Changes */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Shift Swaps
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black text-indigo-600 tracking-tight">
                {metrics.shiftChanges}
              </span>
              <span className="text-[10px] font-bold text-slate-400">moves</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ArrowLeftRight size={20} />
          </div>
        </div>

        {/* Off ↔ Work Swaps */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Off ↔ Work Swaps
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black text-emerald-600 tracking-tight">
                {metrics.offWorkSwaps}
              </span>
              <span className="text-[10px] font-bold text-slate-400">swaps</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Activity size={20} />
          </div>
        </div>

        {/* Active Authors / Users */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Active Editors
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
                {metrics.userCount}
              </span>
              <span className="text-[10px] font-bold text-slate-400">users</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Users size={20} />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────
          PART C — Updates Feed (Main Content)
      ───────────────────────────────────────── */}
      <div id="updates-logs-feed-section" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">
              Live Roster Audit Trail
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-400">
            Showing {filteredUpdates.length} of {totalCount}
          </span>
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <RefreshCw size={28} className="animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Loading audit history...</p>
            <p className="text-xs text-slate-400 mt-1">Fetching roster changes from database</p>
          </div>
        ) : filteredUpdates.length === 0 ? (
          <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-bold text-slate-700">No Roster Changes Found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              All roster adjustments (shift drag-and-drop, day off toggles, staff assignments) are automatically recorded here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredUpdates.map((entry) => {
              const badge = getBadgeConfig(entry.change_type);
              const BadgeIcon = badge.icon;
              const relativeTime = formatRelativeTime(entry.changed_at);
              const exactTime = formatExactDate(entry.changed_at);

              return (
                <div
                  key={entry.id}
                  id={`update-card-${entry.id}`}
                  className={`bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm border-l-4 ${badge.leftBorder} hover:shadow-md transition-all group`}
                >
                  {/* Top line: Badge & Timestamps */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${badge.bg} ${badge.text} border ${badge.border}`}
                      >
                        <BadgeIcon size={12} />
                        {badge.label}
                      </span>
                      {entry.affected_date && (
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          📅 {formatShortDate(entry.affected_date)}
                        </span>
                      )}
                    </div>

                    <div className="text-right" title={`Exact time: ${exactTime}`}>
                      <span className="text-xs font-bold text-slate-600 block">
                        {relativeTime}
                      </span>
                      <span className="text-[10px] text-slate-400 block group-hover:text-slate-500 transition-colors">
                        {exactTime}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-1">
                    {/* Staff affected */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center justify-center shadow-sm shrink-0">
                        {entry.staff_initials || (entry.staff_name ? entry.staff_name.slice(0, 2).toUpperCase() : "ST")}
                      </div>
                      <div>
                        <span className="text-sm font-black text-slate-900 block leading-tight">
                          {entry.staff_name || "Unassigned Staff"}
                        </span>
                        {entry.staff_initials && (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Code: {entry.staff_initials}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Change Details / Values */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
                      {/* From value */}
                      <span className="text-slate-500 line-through decoration-rose-400 font-semibold">
                        {entry.from_shift_name || entry.from_value || "None"}
                      </span>
                      <ArrowLeftRight size={13} className="text-slate-400 shrink-0 mx-1" />
                      {/* To value */}
                      <span className="text-slate-900 font-black">
                        {entry.to_shift_name || entry.to_value || "None"}
                      </span>
                    </div>
                  </div>

                  {/* Footer: Who made the change */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span>Changed by:</span>
                      <strong className="text-slate-700 font-bold">
                        {entry.changed_by_name || "System"}
                      </strong>
                    </span>
                    {entry.week_start && (
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Week Ref: {entry.week_start}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More Button */}
        {!loading && filteredUpdates.length < totalCount && (
          <div className="pt-4 text-center">
            <button
              id="btn-load-more-updates"
              onClick={() => loadUpdates(false)}
              disabled={loadingMore}
              className="px-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:shadow transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loadingMore ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-indigo-600" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>Load More Entries ({totalCount - filteredUpdates.length} remaining)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
