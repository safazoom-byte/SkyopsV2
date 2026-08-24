import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowLeftRight,
  Plus,
  Minus,
  UserPlus,
  UserMinus,
  Clock,
  Search,
  Calendar,
  Filter,
  Users,
  Activity,
  History,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Download,
} from "lucide-react";
import { Staff, ShiftConfig, RosterUpdate, UserProfile } from "../types";
import { db } from "../services/supabaseService";

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
  const [selectedStaffId, setSelectedStaffId] = useState<string>("ALL");
  const [selectedChangeType, setSelectedChangeType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Load updates for the active program period (startDate to endDate)
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
        startDate: startDate,
        endDate: endDate,
        staffId: selectedStaffId === "ALL" ? undefined : selectedStaffId,
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
    [startDate, endDate, selectedStaffId, selectedChangeType, pageOffset]
  );

  // Reload whenever current program dates or filters change
  useEffect(() => {
    loadUpdates(true);
  }, [startDate, endDate, selectedStaffId, selectedChangeType]);

  // Real-time updates subscription
  useEffect(() => {
    const unsubscribe = db.subscribeRosterUpdates((newEntry) => {
      // Bounded strictly to current program period
      if (startDate && endDate && newEntry.affected_date) {
        if (newEntry.affected_date < startDate || newEntry.affected_date > endDate) {
          return;
        }
      }

      if (selectedStaffId !== "ALL" && newEntry.staff_id !== selectedStaffId) {
        return;
      }
      if (selectedChangeType !== "ALL" && newEntry.change_type !== selectedChangeType) {
        return;
      }

      setUpdates((prev) => {
        if (prev.some((u) => u.id === newEntry.id)) return prev;
        return [newEntry, ...prev];
      });
      setTotalCount((prev) => prev + 1);
    });

    return () => {
      unsubscribe();
    };
  }, [startDate, endDate, selectedStaffId, selectedChangeType]);

  // Filtered in-memory by search query
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

  const handleExportCSV = () => {
    if (filteredUpdates.length === 0) return;
    const headers = [
      "Timestamp",
      "Date",
      "Change Type",
      "Staff Initials",
      "Staff Name",
      "From Value",
      "To Value",
      "Changed By",
    ];

    const rows = filteredUpdates.map((u) => [
      u.changed_at ? new Date(u.changed_at).toISOString() : "",
      u.affected_date || "",
      u.change_type || "",
      u.staff_initials || "",
      `"${(u.staff_name || "").replace(/"/g, '""')}"`,
      `"${(u.from_shift_name || u.from_value || "").replace(/"/g, '""')}"`,
      `"${(u.to_shift_name || u.to_value || "").replace(/"/g, '""')}"`,
      `"${(u.changed_by_name || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `SkyOPS_Updates_${startDate || "Period"}_to_${endDate || "Period"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const periodDisplayLabel = useMemo(() => {
    return startDate && endDate
      ? `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
      : "Active Program Period";
  }, [startDate, endDate]);

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
          {/* Left filters & Program Period Badge */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Active Program Period Badge */}
            <div className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 border border-indigo-200/80 rounded-xl text-xs font-bold text-indigo-950 shrink-0">
              <Calendar size={14} className="text-indigo-600 shrink-0" />
              <span>Program: {periodDisplayLabel}</span>
            </div>

            {/* Staff Search */}
            <div className="relative min-w-[200px] flex-1">
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
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 font-bold"
                >
                  ×
                </button>
              )}
            </div>

            {/* Change Type Dropdown */}
            <div className="relative min-w-[160px] flex-1 sm:flex-none">
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

          {/* Action buttons: Export CSV & Refresh */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
            <button
              id="btn-export-csv"
              onClick={handleExportCSV}
              title="Export updates to CSV"
              disabled={filteredUpdates.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-40"
            >
              <Download size={13} />
              <span>CSV</span>
            </button>
            <button
              id="btn-refresh-updates"
              onClick={() => loadUpdates(true)}
              title="Refresh logs"
              disabled={loading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin text-indigo-600" : ""} />
            </button>
          </div>
        </div>

        {/* Active scope indicator pill */}
        <div className="mt-2 px-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Scope: Active Program Period ({periodDisplayLabel})</span>
          </div>
          {filteredUpdates.length > 0 && (
            <span>
              {filteredUpdates.length} change{filteredUpdates.length === 1 ? "" : "s"} logged
            </span>
          )}
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
              Period Updates
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
            <p className="text-xs text-slate-400 mt-1">Fetching roster changes for {periodDisplayLabel}</p>
          </div>
        ) : filteredUpdates.length === 0 ? (
          <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-bold text-slate-700">No Roster Changes Found in This Period</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Any roster edits made during this program period (e.g. shift swaps, day off allocations, time edits) will automatically appear here in real time.
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
                        <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
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
                          {entry.staff_name || "Staff Member"}
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
                    {entry.affected_date && (
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Target Date: {entry.affected_date}
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

