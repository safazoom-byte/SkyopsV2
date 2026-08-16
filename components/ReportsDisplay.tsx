import { saveAs } from "file-saver";
import React, { useMemo, useState, useCallback } from "react";
import { Staff, LeaveRequest, LeaveType, DailyProgram, ShiftConfig } from "../types";
import {
  FileDown,
  Calendar,
  User,
  Search,
  Filter,
  BarChart2,
  Briefcase,
  CalendarDays,
  TrendingUp,
  Users,
  Printer,
  Award,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";

interface ReportsDisplayProps {
  programs?: DailyProgram[];
  shifts?: ShiftConfig[];
  staff: Staff[];
  leaveRequests: LeaveRequest[];
  startDate: string;
  endDate: string;
}

// Active leave types displayed in UI (Lieu & Roster removed per user request)
const UI_LEAVE_TYPES: LeaveType[] = ["Annual leave", "Sick leave", "Day off"];

// Colors per leave type
const LEAVE_COLORS: Record<string, string> = {
  "Day off": "#10b981",
  "Annual leave": "#a855f7",
  "Sick leave": "#f43f5e",
  "Lieu leave": "#f59e0b",
  "Roster leave": "#3b82f6",
};

const ROLE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

export function ReportsDisplay({
  staff,
  leaveRequests,
  startDate: initialStartDate,
  endDate: initialEndDate,
  programs = [],
  shifts = [],
}: ReportsDisplayProps) {
  const [activeTab, setActiveTab] = useState<"leaves" | "work">("leaves");
  const [workView, setWorkView] = useState<"heatmap" | "staff" | "utilization" | "roles" | "shifts">("heatmap");
  const [searchTerm, setSearchTerm] = useState("");
  const [leaveFilter, setLeaveFilter] = useState<"All" | LeaveType>("All");
  const [reportStartDate, setReportStartDate] = useState(initialStartDate);
  const [reportEndDate, setReportEndDate] = useState(initialEndDate);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // ─── Date range helpers ────────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    const dates: string[] = [];
    const daysCount =
      Math.ceil(
        (new Date(reportEndDate).getTime() - new Date(reportStartDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(reportStartDate);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  }, [reportStartDate, reportEndDate]);

  // ─── Leave Summary ─────────────────────────────────────────────────────────
  const leaveSummary = useMemo(() => {
    const summary: Record<string, { [key in LeaveType]: string[] } & { total: number }> = {};

    staff.forEach((s) => {
      summary[s.id] = {
        total: 0,
        "Day off": [],
        "Annual leave": [],
        "Lieu leave": [],
        "Sick leave": [],
        "Roster leave": [],
        NIL: [],
      };
    });

    leaveRequests.forEach((req) => {
      if (req.endDate >= reportStartDate && req.startDate <= reportEndDate) {
        const reqStart = req.startDate < reportStartDate ? reportStartDate : req.startDate;
        const reqEnd = req.endDate > reportEndDate ? reportEndDate : req.endDate;

        let currentDate = new Date(reqStart);
        const end = new Date(reqEnd);
        const datesInPeriod: string[] = [];
        while (currentDate <= end) {
          datesInPeriod.push(currentDate.toISOString().split("T")[0]);
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        if (summary[req.staffId]) {
          if (!summary[req.staffId][req.type]) summary[req.staffId][req.type] = [];
          summary[req.staffId][req.type].push(...datesInPeriod);
        }
      }
    });

    Object.values(summary).forEach((s) => {
      (["Annual leave", "Lieu leave", "Sick leave", "Roster leave", "Day off"] as LeaveType[]).forEach((t) => {
        s[t] = [...new Set(s[t] || [])].sort();
      });
      s.total =
        (s["Annual leave"]?.length || 0) +
        (s["Sick leave"]?.length || 0) +
        (s["Lieu leave"]?.length || 0) +
        (s["Roster leave"]?.length || 0) +
        (s["Day off"]?.length || 0);
    });

    return summary;
  }, [staff, leaveRequests, reportStartDate, reportEndDate]);

  // ─── Work Summary ──────────────────────────────────────────────────────────
  const workSummary = useMemo(() => {
    const summary: Record<string, { totalShifts: number; dates: Record<string, { shiftId: string; role: string }> }> = {};
    staff.forEach((s) => {
      summary[s.id] = { totalShifts: 0, dates: {} };
    });
    programs.forEach((p) => {
      if (p.dateString && p.dateString >= reportStartDate && p.dateString <= reportEndDate) {
        p.assignments.forEach((a) => {
          if (summary[a.staffId] && p.dateString) {
            summary[a.staffId].dates[p.dateString] = { shiftId: a.shiftId || "", role: a.role };
            summary[a.staffId].totalShifts++;
          }
        });
      }
    });
    return summary;
  }, [staff, programs, reportStartDate, reportEndDate]);

  // ─── Filtered staff ────────────────────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    return staff
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.initials.toLowerCase().includes(searchTerm.toLowerCase());
        const hasSelectedLeave =
          leaveFilter === "All" || (leaveSummary[s.id]?.[leaveFilter]?.length || 0) > 0;
        return matchesSearch && hasSelectedLeave;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, searchTerm, leaveFilter, leaveSummary]);

  // ─── KPI cards ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalLeave = Object.values(leaveSummary).reduce((acc, s) => acc + s.total, 0);
    const totalShifts = Object.values(workSummary).reduce((acc, s) => acc + s.totalShifts, 0);
    const activeStaff = staff.length;
    const avgShifts = activeStaff > 0 ? (totalShifts / activeStaff).toFixed(1) : "0";
    return { totalLeave, totalShifts, activeStaff, avgShifts };
  }, [leaveSummary, workSummary, staff]);

  // ─── Chart data ────────────────────────────────────────────────────────────
  const departmentLeaveData = useMemo(() => {
    const counts: Record<string, number> = { "Day off": 0, "Annual leave": 0, "Sick leave": 0 };
    filteredStaff.forEach((s) => {
      const sum = leaveSummary[s.id];
      if (sum) {
        counts["Day off"] += sum["Day off"]?.length || 0;
        counts["Annual leave"] += sum["Annual leave"]?.length || 0;
        counts["Sick leave"] += sum["Sick leave"]?.length || 0;
      }
    });
    return [
      { name: "Day off", value: counts["Day off"], color: LEAVE_COLORS["Day off"] },
      { name: "Annual leave", value: counts["Annual leave"], color: LEAVE_COLORS["Annual leave"] },
      { name: "Sick leave", value: counts["Sick leave"], color: LEAVE_COLORS["Sick leave"] },
    ].filter((item) => item.value > 0);
  }, [filteredStaff, leaveSummary]);

  const monthlyLeaveData = useMemo(() => {
    const year = new Date(reportStartDate).getFullYear() || new Date().getFullYear();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthData = months.map((m) => ({ name: m, "Day off": 0, "Annual leave": 0, "Sick leave": 0 }));
    leaveRequests.forEach((req) => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      let currentDate = new Date(start);
      while (currentDate <= end) {
        if (currentDate.getFullYear() === year) {
          const mi = currentDate.getMonth();
          if (req.type === "Day off") monthData[mi]["Day off"]++;
          else if (req.type === "Annual leave") monthData[mi]["Annual leave"]++;
          else if (req.type === "Sick leave") monthData[mi]["Sick leave"]++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });
    return monthData;
  }, [leaveRequests, reportStartDate]);

  // Top absentees
  const topAbsentees = useMemo(() => {
    return filteredStaff
      .map((s) => ({ staff: s, total: leaveSummary[s.id]?.total || 0 }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [filteredStaff, leaveSummary]);

  // Staff utilization for bar chart
  const utilizationData = useMemo(() => {
    return filteredStaff
      .map((s) => ({ name: s.initials, fullName: s.name, shifts: workSummary[s.id]?.totalShifts || 0 }))
      .sort((a, b) => b.shifts - a.shifts)
      .slice(0, 20);
  }, [filteredStaff, workSummary]);

  // Role distribution
  const roleDistributionData = useMemo(() => {
    const counts: Record<string, number> = {};
    programs.forEach((p) => {
      if (p.dateString && p.dateString >= reportStartDate && p.dateString <= reportEndDate) {
        p.assignments.forEach((a) => {
          counts[a.role] = (counts[a.role] || 0) + 1;
        });
      }
    });
    return Object.entries(counts)
      .map(([name, value], i) => ({ name, value, color: ROLE_COLORS[i % ROLE_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [programs, reportStartDate, reportEndDate]);

  // ─── Excel Export ──────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();

    const applyHeaderStyle = (sheet: any) => {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      sheet.getRow(1).height = 25;
    };
    const applyBorders = (sheet: any) => {
      sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
        row.eachCell({ includeEmpty: false }, (cell: any) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFCBD5E1" } },
            left: { style: "thin", color: { argb: "FFCBD5E1" } },
            bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
            right: { style: "thin", color: { argb: "FFCBD5E1" } },
          };
          if (rowNumber > 1) cell.alignment = { vertical: "middle", horizontal: "center" };
        });
      });
    };

    // Leaves sheet (keeps Lieu + Roster for historical data)
    const leavesSheet = workbook.addWorksheet("Leaves Summary");
    leavesSheet.columns = [
      { header: "Staff ID", key: "staffId", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Type", key: "type", width: 20 },
      { header: "Total Leaves", key: "total", width: 15 },
      { header: "Day Off", key: "dayOff", width: 15 },
      { header: "Annual Leave", key: "annual", width: 15 },
      { header: "Sick Leave", key: "sick", width: 15 },
      { header: "Lieu Leave", key: "lieu", width: 15 },
      { header: "Roster Leave", key: "roster", width: 15 },
    ];
    applyHeaderStyle(leavesSheet);
    filteredStaff.forEach((s, i) => {
      const summary = leaveSummary[s.id];
      if (summary) {
        const row = leavesSheet.addRow({
          staffId: s.staffId || "",
          name: s.name,
          type: s.type,
          total: summary.total || 0,
          dayOff: summary["Day off"]?.length || 0,
          annual: summary["Annual leave"]?.length || 0,
          sick: summary["Sick leave"]?.length || 0,
          lieu: summary["Lieu leave"]?.length || 0,
          roster: summary["Roster leave"]?.length || 0,
        });
        if (i % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
    applyBorders(leavesSheet);

    // Work by Staff sheet
    const workSheet = workbook.addWorksheet("Work by Staff");
    const workCols: any[] = [
      { header: "Staff ID", key: "staffId", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Total Shifts", key: "totalShifts", width: 15 },
    ];
    dateRange.forEach((dh) => {
      const d = new Date(dh);
      const formatted = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      workCols.push({ header: formatted, key: dh, width: 22 });
    });
    workSheet.columns = workCols;
    applyHeaderStyle(workSheet);
    filteredStaff.forEach((s, i) => {
      const ws = workSummary[s.id];
      if (ws) {
        const rowData: Record<string, string | number> = {
          staffId: s.staffId || "",
          name: s.name,
          totalShifts: ws.totalShifts || 0,
        };
        dateRange.forEach((dh) => {
          const dayData = ws.dates[dh];
          if (dayData) {
            const shift = shifts.find((sh) => sh.id === dayData.shiftId);
            rowData[dh] = shift
              ? `${shift.pickupTime}-${shift.endTime} (${dayData.role})`
              : `WORK (${dayData.role})`;
          } else {
            rowData[dh] = "-";
          }
        });
        const row = workSheet.addRow(rowData);
        if (i % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          if (colNumber > 3) {
            if (cell.value && cell.value !== "-") {
              cell.font = { bold: true, color: { argb: "FF047857" } };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
            } else if (cell.value === "-") {
              cell.font = { color: { argb: "FF94A3B8" } };
            }
          }
        });
      }
    });
    applyBorders(workSheet);

    // Daily Shifts sheet
    const shiftDetailSheet = workbook.addWorksheet("Daily Shifts", {
      properties: { tabColor: { argb: "FF10B981" } },
    });
    shiftDetailSheet.columns = [
      { width: 3 },
      { width: 25 },
      { width: 20 },
      { width: 35 },
    ];
    let rowIndex = 1;
    dateRange.forEach((dateStr) => {
      const program = programs.find((p) => p.dateString === dateStr);
      if (program && program.assignments.length > 0) {
        const shiftMap: Record<string, typeof program.assignments> = {};
        program.assignments.forEach((a) => {
          const sId = a.shiftId || "unassigned";
          if (!shiftMap[sId]) shiftMap[sId] = [];
          shiftMap[sId].push(a);
        });
        const sortedShiftIds = Object.keys(shiftMap).sort((a, b) => {
          if (a === "unassigned") return 1;
          if (b === "unassigned") return -1;
          const shiftA = shifts.find((s) => s.id === a);
          const shiftB = shifts.find((s) => s.id === b);
          if (shiftA && shiftB) return shiftA.pickupTime.localeCompare(shiftB.pickupTime);
          return 0;
        });
        const displayDate = new Date(dateStr).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        rowIndex += 2;
        const dateRow = shiftDetailSheet.getRow(rowIndex);
        dateRow.getCell(2).value = displayDate;
        dateRow.getCell(2).font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
        shiftDetailSheet.mergeCells(rowIndex, 2, rowIndex, 4);
        rowIndex++;
        sortedShiftIds.forEach((shiftId) => {
          const shift = shifts.find((s) => s.id === shiftId);
          const shiftText = shift ? `${shift.pickupTime} - ${shift.endTime}` : "Unassigned";
          const assigns = shiftMap[shiftId];
          rowIndex++;
          const shiftRow = shiftDetailSheet.getRow(rowIndex);
          shiftRow.getCell(2).value = `SHIFT: ${shiftText}  (${assigns.length} Staff)`;
          shiftRow.getCell(2).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
          [2, 3, 4].forEach((col) => {
            shiftRow.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
          });
          shiftRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
          shiftDetailSheet.mergeCells(rowIndex, 2, rowIndex, 4);
          rowIndex++;
          const subRow = shiftDetailSheet.getRow(rowIndex);
          subRow.values = [, "Role", "Staff ID", "Staff Name"];
          subRow.font = { bold: true, color: { argb: "FF334155" }, size: 11 };
          subRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
          [2, 3, 4].forEach((col) => {
            subRow.getCell(col).border = {
              top: { style: "thin", color: { argb: "FFCBD5E1" } },
              left: { style: "thin", color: { argb: "FFCBD5E1" } },
              bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
              right: { style: "thin", color: { argb: "FFCBD5E1" } },
            };
            subRow.getCell(col).alignment = { vertical: "middle", horizontal: "center" };
          });
          let staffCount = 0;
          assigns.forEach((a) => {
            const st = staffMap.get(a.staffId);
            if (st) {
              rowIndex++;
              const row = shiftDetailSheet.getRow(rowIndex);
              row.values = [, a.role, st.staffId || "-", st.name];
              row.getCell(2).font = { bold: true, color: { argb: "FF4338CA" } };
              if (staffCount % 2 === 0) {
                [2, 3, 4].forEach((col) => {
                  row.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
                });
              }
              [2, 3, 4].forEach((col) => {
                row.getCell(col).border = {
                  top: { style: "thin", color: { argb: "FFCBD5E1" } },
                  left: { style: "thin", color: { argb: "FFCBD5E1" } },
                  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                  right: { style: "thin", color: { argb: "FFCBD5E1" } },
                };
                row.getCell(col).alignment = { vertical: "middle", horizontal: "center" };
              });
              staffCount++;
            }
          });
          rowIndex++;
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `SkyOps_Reports_${reportStartDate}_to_${reportEndDate}.xlsx`);
  };

  // ─── Print / PDF ────────────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ─── Heatmap cell helper ───────────────────────────────────────────────────
  const getHeatmapCell = (staffId: string, dateStr: string) => {
    const worked = !!workSummary[staffId]?.dates[dateStr];
    const leaveDay = Object.entries(leaveSummary[staffId] || {}).find(
      ([type, dates]) => type !== "total" && Array.isArray(dates) && (dates as string[]).includes(dateStr)
    );
    if (worked) return { bg: "bg-emerald-100", border: "border-emerald-200", label: "W", labelColor: "text-emerald-700" };
    if (leaveDay) {
      const color =
        leaveDay[0] === "Annual leave"
          ? { bg: "bg-purple-100", border: "border-purple-200", label: "AL", labelColor: "text-purple-700" }
          : leaveDay[0] === "Sick leave"
          ? { bg: "bg-rose-100", border: "border-rose-200", label: "SL", labelColor: "text-rose-700" }
          : leaveDay[0] === "Day off"
          ? { bg: "bg-sky-100", border: "border-sky-200", label: "DO", labelColor: "text-sky-700" }
          : { bg: "bg-amber-100", border: "border-amber-200", label: "L", labelColor: "text-amber-700" };
      return color;
    }
    return { bg: "bg-slate-50", border: "border-slate-100", label: "", labelColor: "text-slate-300" };
  };

  // ─── Render date pills ─────────────────────────────────────────────────────
  const renderDates = (dates: string[]) => {
    if (!dates || dates.length === 0) return null;
    return (
      <div className="mt-1.5 flex flex-wrap gap-1 justify-center max-w-[130px] mx-auto">
        {dates.map((d) => {
          const formatted = new Date(d).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          });
          return (
            <span key={d} className="text-[9px] bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
              {formatted}
            </span>
          );
        })}
      </div>
    );
  };

  // ─── Leave Timeline ────────────────────────────────────────────────────────
  const renderLeaveTimeline = () => {
    if (dateRange.length === 0) return null;
    const totalDays = dateRange.length;

    return (
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <CalendarDays className="text-emerald-500" size={20} />
              Leave Timeline
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Staff leave across the selected period</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            {[
              { color: "bg-purple-400", label: "Annual" },
              { color: "bg-rose-400", label: "Sick" },
              { color: "bg-sky-400", label: "Day Off" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded-sm ${color}`} />
                <span className="text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(600, totalDays * 28 + 180) }}>
            {/* Date header */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              <div className="w-44 shrink-0 px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Staff
              </div>
              {dateRange.map((d) => {
                const day = new Date(d);
                const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
                return (
                  <div
                    key={d}
                    className={`flex-1 min-w-[28px] text-center py-2 ${isWeekend ? "bg-slate-100" : ""}`}
                  >
                    <div className="text-[8px] font-black text-slate-400 uppercase">
                      {day.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}
                    </div>
                    <div className="text-[9px] font-bold text-slate-600">
                      {day.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Staff rows */}
            {filteredStaff.map((s, rowIdx) => {
              const summ = leaveSummary[s.id];
              const hasAnyLeave = summ?.total > 0;

              return (
                <div
                  key={s.id}
                  className={`flex border-b border-slate-50 group hover:bg-slate-50/60 transition-colors ${
                    !hasAnyLeave ? "opacity-50" : ""
                  }`}
                >
                  <div className="w-44 shrink-0 flex items-center gap-2 px-4 py-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[9px] shrink-0">
                      {s.initials}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 leading-none">{s.name}</div>
                      <div className="text-[9px] text-slate-400">{s.type}</div>
                    </div>
                  </div>
                  {dateRange.map((d) => {
                    const isAL = summ?.["Annual leave"]?.includes(d);
                    const isSL = summ?.["Sick leave"]?.includes(d);
                    const isDO = summ?.["Day off"]?.includes(d);
                    const isLieu = summ?.["Lieu leave"]?.includes(d);
                    const isRoster = summ?.["Roster leave"]?.includes(d);
                    const isWeekend = new Date(d).getUTCDay() === 0 || new Date(d).getUTCDay() === 6;

                    let cellBg = isWeekend ? "bg-slate-50" : "bg-white";
                    let innerEl: React.ReactNode = null;

                    if (isAL) {
                      cellBg = "bg-purple-50";
                      innerEl = <div className="w-full h-full bg-purple-400 rounded-sm" title="Annual leave" />;
                    } else if (isSL) {
                      cellBg = "bg-rose-50";
                      innerEl = <div className="w-full h-full bg-rose-400 rounded-sm" title="Sick leave" />;
                    } else if (isDO) {
                      cellBg = "bg-sky-50";
                      innerEl = <div className="w-full h-full bg-sky-400 rounded-sm" title="Day off" />;
                    } else if (isLieu) {
                      cellBg = "bg-amber-50";
                      innerEl = <div className="w-full h-full bg-amber-400 rounded-sm" title="Lieu leave" />;
                    } else if (isRoster) {
                      cellBg = "bg-blue-50";
                      innerEl = <div className="w-full h-full bg-blue-400 rounded-sm" title="Roster leave" />;
                    }

                    return (
                      <div key={d} className={`flex-1 min-w-[28px] h-9 p-0.5 ${cellBg} border-l border-slate-50`}>
                        {innerEl}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {/* ── Tab switcher ── */}
      <div className="no-print flex bg-slate-100 p-1 rounded-2xl w-full max-w-sm mb-2">
        <button
          onClick={() => setActiveTab("leaves")}
          className={`flex-1 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all ${
            activeTab === "leaves" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Calendar size={16} /> Leaves
          </div>
        </button>
        <button
          onClick={() => setActiveTab("work")}
          className={`flex-1 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all ${
            activeTab === "work" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Briefcase size={16} /> Work &amp; Shifts
          </div>
        </button>
      </div>

      {/* ── Top bar ── */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center no-print">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Calendar className="text-emerald-500" size={24} />
            {activeTab === "leaves" ? "Leave & Reports" : "Work & Shifts"}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeTab === "leaves" ? "Track staff absences and leave days." : "Analyse staff shift assignments."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
          {/* Date range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-bold"
            />
            <span className="text-slate-400 font-medium">to</span>
            <input
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-bold"
            />
          </div>
          <div className="w-px h-8 bg-slate-200 hidden md:block mx-1" />
          {/* Search */}
          <div className="relative flex-1 md:w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-bold"
            />
          </div>
          {/* Leave filter (leaves tab only) */}
          {activeTab === "leaves" && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                value={leaveFilter}
                onChange={(e) => setLeaveFilter(e.target.value as any)}
                className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-bold appearance-none cursor-pointer"
              >
                <option value="All">All Leave Types</option>
                {UI_LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="w-px h-8 bg-slate-200 hidden md:block mx-1" />
          {/* Export + Print */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-700 transition-colors text-sm font-bold shadow-sm whitespace-nowrap"
          >
            <FileDown size={16} /> Export Excel
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors text-sm font-bold shadow-sm whitespace-nowrap"
          >
            <Printer size={16} /> Print / PDF
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <Users className="text-indigo-500" size={22} />,
            label: "Total Staff",
            value: kpis.activeStaff,
            sub: "in roster",
            bg: "bg-indigo-50",
          },
          {
            icon: <Briefcase className="text-emerald-500" size={22} />,
            label: "Shifts Worked",
            value: kpis.totalShifts,
            sub: "assignments",
            bg: "bg-emerald-50",
          },
          {
            icon: <Calendar className="text-rose-500" size={22} />,
            label: "Total Leave Days",
            value: kpis.totalLeave,
            sub: "days off",
            bg: "bg-rose-50",
          },
          {
            icon: <TrendingUp className="text-amber-500" size={22} />,
            label: "Avg Shifts / Staff",
            value: kpis.avgShifts,
            sub: "per person",
            bg: "bg-amber-50",
          },
        ].map(({ icon, label, value, sub, bg }) => (
          <div
            key={label}
            className={`${bg} rounded-2xl p-5 flex items-center gap-4 border border-white shadow-sm`}
          >
            <div className="shrink-0">{icon}</div>
            <div>
              <div className="text-2xl font-black text-slate-900 leading-none">{value}</div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">{label}</div>
              <div className="text-[10px] text-slate-500">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ════════════════ LEAVES TAB ════════════════ */}
      {activeTab === "leaves" && (
        <>
          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar chart */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 lg:col-span-2">
              <div className="mb-5">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <BarChart2 className="text-emerald-500" size={20} />
                  Leave Trends ({new Date(reportStartDate).getFullYear() || new Date().getFullYear()})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Monthly breakdown of leave requests.</p>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyLeaveData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                    <Bar dataKey="Day off" stackId="a" fill={LEAVE_COLORS["Day off"]} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Annual leave" stackId="a" fill={LEAVE_COLORS["Annual leave"]} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Sick leave" stackId="a" fill={LEAVE_COLORS["Sick leave"]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right column: Pie + Top Absentees */}
            <div className="flex flex-col gap-5">
              {/* Pie chart */}
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-3">
                  Leave Distribution
                </h3>
                <div className="h-[180px] w-full flex items-center justify-center">
                  {departmentLeaveData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={departmentLeaveData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={72}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {departmentLeaveData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-slate-400 font-bold text-sm text-center">
                      No leave data
                      <br />
                      in selected period.
                    </div>
                  )}
                </div>
              </div>

              {/* Top Absentees */}
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-3">
                  <Award className="text-amber-500" size={16} />
                  Top Absentees
                </h3>
                {topAbsentees.length === 0 ? (
                  <div className="text-xs text-slate-400 font-bold text-center py-3">No leave data.</div>
                ) : (
                  <div className="space-y-2">
                    {topAbsentees.map(({ staff: s, total }, idx) => {
                      const max = topAbsentees[0]?.total || 1;
                      const pct = Math.round((total / max) * 100);
                      return (
                        <div key={s.id} className="flex items-center gap-2">
                          <div className="text-[10px] font-black text-slate-400 w-4 text-right">{idx + 1}</div>
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[8px] shrink-0">
                            {s.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <span className="text-xs font-bold text-slate-700 truncate">{s.name}</span>
                              <span className="text-[10px] font-black text-slate-900 ml-2">{total}d</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-rose-400 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Leave Timeline */}
          {renderLeaveTimeline()}

          {/* Leave Detail Table */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Leave Detail by Staff</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                    <th className="px-6 py-4">Staff Member</th>
                    <th className="px-6 py-4 text-center">Day Off</th>
                    <th className="px-6 py-4 text-center">Annual Leave</th>
                    <th className="px-6 py-4 text-center">Sick Leave</th>
                    <th className="px-6 py-4 text-center">Total Leave Days</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium divide-y divide-slate-100">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold">
                        No records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map((s) => {
                      const summary = leaveSummary[s.id];
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 align-top">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                                {s.initials}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{s.name}</div>
                                {s.staffId && (
                                  <div className="text-[10px] text-slate-400 font-mono leading-none">
                                    ID: {s.staffId}
                                  </div>
                                )}
                                <div className="text-xs text-slate-500 font-mono">{s.type}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center align-top">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                summary?.["Day off"]?.length
                                  ? "bg-sky-100 text-sky-700"
                                  : "text-slate-300"
                              }`}
                            >
                              {summary?.["Day off"]?.length || 0} days
                            </span>
                            {renderDates(summary?.["Day off"])}
                          </td>
                          <td className="px-6 py-4 text-center align-top">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                summary?.["Annual leave"]?.length
                                  ? "bg-purple-100 text-purple-700"
                                  : "text-slate-300"
                              }`}
                            >
                              {summary?.["Annual leave"]?.length || 0} days
                            </span>
                            {renderDates(summary?.["Annual leave"])}
                          </td>
                          <td className="px-6 py-4 text-center align-top">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                summary?.["Sick leave"]?.length
                                  ? "bg-rose-100 text-rose-700"
                                  : "text-slate-300"
                              }`}
                            >
                              {summary?.["Sick leave"]?.length || 0} days
                            </span>
                            {renderDates(summary?.["Sick leave"])}
                          </td>
                          <td className="px-6 py-4 text-center align-top">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-black ${
                                summary?.total ? "bg-slate-900 text-white" : "text-slate-300"
                              }`}
                            >
                              {summary?.total || 0}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ════════════════ WORK TAB ════════════════ */}
      {activeTab === "work" && (
        <div className="flex flex-col gap-5">
          {/* Work sub-tab switcher */}
          <div className="no-print flex flex-wrap gap-2">
            {[
              { id: "heatmap", label: "Coverage Heatmap" },
              { id: "utilization", label: "Utilization" },
              { id: "roles", label: "Role Distribution" },
              { id: "staff", label: "By Staff" },
              { id: "shifts", label: "By Shift" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setWorkView(id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                  workView === id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Coverage Heatmap ── */}
          {workView === "heatmap" && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <CalendarDays className="text-emerald-500" size={20} />
                    Coverage Heatmap
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Worked vs. leave vs. unscheduled by staff.</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-bold flex-wrap">
                  {[
                    { color: "bg-emerald-400", label: "Worked (W)" },
                    { color: "bg-purple-400", label: "Annual (AL)" },
                    { color: "bg-rose-400", label: "Sick (SL)" },
                    { color: "bg-sky-400", label: "Day Off (DO)" },
                    { color: "bg-slate-200", label: "None" },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className={`w-3 h-3 rounded-sm ${color}`} />
                      <span className="text-slate-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(600, dateRange.length * 32 + 180) }}>
                  {/* Date header */}
                  <div className="flex border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
                    <div className="w-44 shrink-0 px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Staff
                    </div>
                    {dateRange.map((d) => {
                      const day = new Date(d);
                      const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
                      return (
                        <div key={d} className={`flex-1 min-w-[32px] text-center py-1.5 ${isWeekend ? "bg-slate-100" : ""}`}>
                          <div className="text-[7px] font-black text-slate-400 uppercase">
                            {day.toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" })}
                          </div>
                          <div className="text-[9px] font-bold text-slate-600">
                            {day.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Staff rows */}
                  {filteredStaff.map((s) => (
                    <div key={s.id} className="flex border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                      <div className="w-44 shrink-0 flex items-center gap-2 px-4 py-1.5">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[8px] shrink-0">
                          {s.initials}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 leading-tight">{s.name}</div>
                          <div className="text-[9px] text-slate-400">{s.type}</div>
                        </div>
                      </div>
                      {dateRange.map((d) => {
                        const cell = getHeatmapCell(s.id, d);
                        const isWeekend = new Date(d).getUTCDay() === 0 || new Date(d).getUTCDay() === 6;
                        return (
                          <div
                            key={d}
                            className={`flex-1 min-w-[32px] h-9 flex items-center justify-center border-l ${
                              cell.border
                            } ${cell.bg} ${isWeekend ? "opacity-80" : ""}`}
                            title={d}
                          >
                            <span className={`text-[8px] font-black ${cell.labelColor}`}>{cell.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Utilization Bar Chart ── */}
          {workView === "utilization" && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="mb-5">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <BarChart2 className="text-indigo-500" size={20} />
                  Staff Utilization
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total shifts worked per staff in the selected period (top 20).
                </p>
              </div>
              {utilizationData.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-slate-400 font-bold text-sm">
                  No assignment data in period.
                </div>
              ) : (
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={utilizationData}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 60, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: "#334155", fontWeight: 700 }}
                        width={55}
                      />
                      <Tooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        formatter={(value: any, name: any, props: any) => [
                          `${value} shifts`,
                          props.payload?.fullName || name,
                        ]}
                      />
                      <Bar dataKey="shifts" fill="#6366f1" radius={[0, 6, 6, 0]}>
                        <LabelList dataKey="shifts" position="right" style={{ fontSize: 10, fontWeight: 800, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Role Distribution ── */}
          {workView === "roles" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div className="mb-5">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <User className="text-emerald-500" size={20} />
                    Role Distribution
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Assignments per role across the period.</p>
                </div>
                {roleDistributionData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-slate-400 font-bold text-sm">
                    No assignment data in period.
                  </div>
                ) : (
                  <div className="h-[360px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={roleDistributionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={130}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {roleDistributionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", fontWeight: "bold" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Role count table */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Role Breakdown</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {roleDistributionData.length === 0 ? (
                    <div className="px-6 py-10 text-center text-slate-400 font-bold text-sm">No data.</div>
                  ) : (
                    roleDistributionData.map(({ name, value, color }, idx) => {
                      const max = roleDistributionData[0]?.value || 1;
                      const pct = Math.round((value / max) * 100);
                      const totalAll = roleDistributionData.reduce((a, b) => a + b.value, 0);
                      return (
                        <div key={name} className="px-6 py-3 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                              <span className="text-sm font-bold text-slate-800">{name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                {((value / totalAll) * 100).toFixed(1)}%
                              </span>
                              <span className="text-sm font-black text-slate-900">{value}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── By Staff ── */}
          {workView === "staff" && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                      <th className="px-6 py-4 sticky left-0 z-10 bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                        Staff Member
                      </th>
                      <th className="px-6 py-4 text-center">Total Shifts</th>
                      {dateRange.map((d, i) => {
                        const day = new Date(d);
                        return (
                          <th key={i} className="px-3 py-4 text-center min-w-[80px]">
                            {day.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium divide-y divide-slate-100">
                    {filteredStaff.length === 0 ? (
                      <tr>
                        <td colSpan={100} className="px-6 py-12 text-center text-slate-400 font-bold">
                          No records found.
                        </td>
                      </tr>
                    ) : (
                      filteredStaff.map((s) => {
                        const ws = workSummary[s.id];
                        return (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 align-middle sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                                  {s.initials}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 whitespace-nowrap">{s.name}</div>
                                  {s.staffId && (
                                    <div className="text-[10px] text-slate-400 font-mono leading-none">
                                      ID: {s.staffId}
                                    </div>
                                  )}
                                  <div className="text-xs text-slate-500 font-mono">{s.type}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center align-middle">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-black ${
                                  ws?.totalShifts ? "bg-indigo-100 text-indigo-700" : "text-slate-300"
                                }`}
                              >
                                {ws?.totalShifts || 0}
                              </span>
                            </td>
                            {dateRange.map((dateStr, i) => {
                              const dayData = ws?.dates[dateStr];
                              let shiftContent: React.ReactNode = <span className="text-slate-200">–</span>;
                              if (dayData) {
                                const shift = shifts.find((sh) => sh.id === dayData.shiftId);
                                if (shift) {
                                  shiftContent = (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <div className="text-[10px] font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        {shift.pickupTime}-{shift.endTime}
                                      </div>
                                      <div className="text-[8px] font-bold text-slate-400">{dayData.role}</div>
                                    </div>
                                  );
                                } else {
                                  shiftContent = (
                                    <div className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                      WORK
                                    </div>
                                  );
                                }
                              }
                              return (
                                <td key={i} className="px-3 py-2 text-center align-middle border-l border-slate-50">
                                  {shiftContent}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── By Shift ── */}
          {workView === "shifts" && (
            <div className="space-y-6">
              {dateRange.map((dateStr) => {
                const program = programs.find((p) => p.dateString === dateStr);
                if (!program || program.assignments.length === 0) return null;

                const shiftMap: Record<string, typeof program.assignments> = {};
                program.assignments.forEach((a) => {
                  const sId = a.shiftId || "unassigned";
                  if (!shiftMap[sId]) shiftMap[sId] = [];
                  shiftMap[sId].push(a);
                });

                const sortedShiftIds = Object.keys(shiftMap).sort((a, b) => {
                  if (a === "unassigned") return 1;
                  if (b === "unassigned") return -1;
                  const shiftA = shifts.find((s) => s.id === a);
                  const shiftB = shifts.find((s) => s.id === b);
                  if (shiftA && shiftB) return shiftA.pickupTime.localeCompare(shiftB.pickupTime);
                  return 0;
                });

                return (
                  <div key={dateStr} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden p-6">
                    <h3 className="text-lg font-black text-slate-800 mb-5 flex items-center gap-2">
                      <CalendarDays className="text-indigo-500" size={20} />
                      {new Date(dateStr).toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      })}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sortedShiftIds.map((shiftId) => {
                        const shift = shifts.find((s) => s.id === shiftId);
                        const assigns = shiftMap[shiftId];
                        return (
                          <div key={shiftId} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                            <div className="font-bold text-slate-900 mb-3 border-b border-slate-200 pb-2 flex justify-between items-center">
                              <span className="text-sm">
                                {shift ? `${shift.pickupTime} – ${shift.endTime}` : "Unassigned"}
                              </span>
                              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                                {assigns.length}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {assigns.map((a) => {
                                const st = staffMap.get(a.staffId);
                                if (!st) return null;
                                return (
                                  <div
                                    key={a.staffId}
                                    className="flex justify-between items-center text-sm py-1 border-b border-slate-100/50 last:border-0"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-black text-slate-600">
                                        {st.initials}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="font-medium text-slate-700 text-xs leading-tight">
                                          {st.name}
                                        </span>
                                        {st.staffId && (
                                          <span className="text-[9px] text-slate-400 font-mono">
                                            {st.staffId}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black tracking-widest">
                                      {a.role}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {dateRange.every(
                (d) => !programs.find((p) => p.dateString === d)?.assignments?.length
              ) && (
                <div className="bg-white rounded-3xl p-12 text-center text-slate-400 font-bold border border-slate-100">
                  No shift assignments in the selected period.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
