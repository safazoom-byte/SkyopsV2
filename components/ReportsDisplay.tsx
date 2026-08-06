import { saveAs } from "file-saver";
import React, { useMemo, useState } from "react";
import { UserProfile, Staff, LeaveRequest, LeaveType, DailyProgram, ShiftConfig } from "../types";
import { FileDown, Calendar, User, Search, Filter, BarChart2, Briefcase, Clock, CalendarDays } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ReportsDisplayProps {
  programs?: DailyProgram[];
  shifts?: ShiftConfig[];
  staff: Staff[];
  leaveRequests: LeaveRequest[];
  startDate: string;
  endDate: string;
}

export function ReportsDisplay({
  staff,
  leaveRequests,
  startDate: initialStartDate,
  endDate: initialEndDate,
  programs = [],
  shifts = [],
}: ReportsDisplayProps) {
  const [activeTab, setActiveTab] = useState<"leaves" | "work">("leaves");
  const [workView, setWorkView] = useState<"staff" | "shifts">("staff");
  const [searchTerm, setSearchTerm] = useState("");
  const [leaveFilter, setLeaveFilter] = useState<"All" | LeaveType>("All");
  const [reportStartDate, setReportStartDate] = useState(initialStartDate);
  const [reportEndDate, setReportEndDate] = useState(initialEndDate);

  const staffMap = useMemo(() => {
    return new Map(staff.map((s) => [s.id, s]));
  }, [staff]);

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
        "NIL": [],
      };
    });

    leaveRequests.forEach((req) => {
      // Check if leave overlaps with selected period
      if (req.endDate >= reportStartDate && req.startDate <= reportEndDate) {
        // Calculate days in period
        const reqStart = req.startDate < reportStartDate ? reportStartDate : req.startDate;
        const reqEnd = req.endDate > reportEndDate ? reportEndDate : req.endDate;
        
        const start = new Date(reqStart);
        const end = new Date(reqEnd);
        
        // collect all specific dates
        let currentDate = new Date(start);
        const datesInPeriod: string[] = [];
        while (currentDate <= end) {
          datesInPeriod.push(currentDate.toISOString().split("T")[0]);
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        if (summary[req.staffId]) {
          if (!summary[req.staffId][req.type]) {
            summary[req.staffId][req.type] = [];
          }
          summary[req.staffId][req.type].push(...datesInPeriod);
          summary[req.staffId].total += datesInPeriod.length;
        }
      }
    });
    
    // Sort and deduplicate dates for each staff and type
    Object.values(summary).forEach(s => {
       s["Annual leave"] = [...new Set(s["Annual leave"] || [])].sort();
       s["Lieu leave"] = [...new Set(s["Lieu leave"] || [])].sort();
       s["Sick leave"] = [...new Set(s["Sick leave"] || [])].sort();
       s["Roster leave"] = [...new Set(s["Roster leave"] || [])].sort();
       s["Day off"] = [...new Set(s["Day off"] || [])].sort();
       s.total = (s["Annual leave"]?.length || 0) + (s["Sick leave"]?.length || 0) + (s["Lieu leave"]?.length || 0) + (s["Roster leave"]?.length || 0) + (s["Day off"]?.length || 0);
    });

    return summary;
  }, [staff, leaveRequests, reportStartDate, reportEndDate]);

  
  const workSummary = useMemo(() => {
    const summary: Record<string, { totalShifts: number, dates: Record<string, { shiftId: string, role: string }> }> = {};
    
    staff.forEach(s => {
      summary[s.id] = { totalShifts: 0, dates: {} };
    });

    programs.forEach(p => {
      if (p.dateString && p.dateString >= reportStartDate && p.dateString <= reportEndDate) {
        const dStr = p.dateString;
        p.assignments.forEach(a => {
          if (summary[a.staffId] && dStr) {
            summary[a.staffId].dates[dStr] = { shiftId: a.shiftId || "", role: a.role };
            summary[a.staffId].totalShifts++;
          }
        });
      }
    });

    return summary;
  }, [staff, programs, reportStartDate, reportEndDate]);

  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.initials.toLowerCase().includes(searchTerm.toLowerCase());
      
      const hasSelectedLeave = leaveFilter === "All" || (leaveSummary[s.id]?.[leaveFilter]?.length || 0) > 0;

      return matchesSearch && hasSelectedLeave;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, searchTerm, leaveFilter, leaveSummary]);

  const availableLeaveTypes: LeaveType[] = [
    "Annual leave",
    "Lieu leave",
    "Sick leave",
    "Roster leave",
  ];
  

  const departmentLeaveData = useMemo(() => {
    const counts = {
      "Day off": 0,
      "Annual leave": 0,
      "Sick leave": 0,
      "Lieu leave": 0,
      "Roster leave": 0,
    };
    
    filteredStaff.forEach(s => {
       const sum = leaveSummary[s.id];
       if (sum) {
         counts["Day off"] += sum["Day off"]?.length || 0;
         counts["Annual leave"] += sum["Annual leave"]?.length || 0;
         counts["Sick leave"] += sum["Sick leave"]?.length || 0;
         counts["Lieu leave"] += sum["Lieu leave"]?.length || 0;
         counts["Roster leave"] += sum["Roster leave"]?.length || 0;
       }
    });

    return [
      { name: "Day off", value: counts["Day off"], color: "#10b981" },
      { name: "Annual leave", value: counts["Annual leave"], color: "#a855f7" },
      { name: "Sick leave", value: counts["Sick leave"], color: "#f43f5e" },
      { name: "Lieu leave", value: counts["Lieu leave"], color: "#f59e0b" },
      { name: "Roster leave", value: counts["Roster leave"], color: "#3b82f6" },
    ].filter(item => item.value > 0);
  }, [filteredStaff, leaveSummary]);

  const monthlyLeaveData = useMemo(() => {
    const year = new Date(reportStartDate).getFullYear() || new Date().getFullYear();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthData = months.map(m => ({ name: m, "Day off": 0, "Annual leave": 0, "Sick leave": 0, "Lieu leave": 0, "Roster leave": 0 }));
    
    leaveRequests.forEach(req => {
       const start = new Date(req.startDate);
       const end = new Date(req.endDate);
       
       let currentDate = new Date(start);
       while (currentDate <= end) {
         if (currentDate.getFullYear() === year) {
           const monthIndex = currentDate.getMonth();
           if (req.type === "Day off" || req.type === "Annual leave" || req.type === "Sick leave" || req.type === "Lieu leave" || req.type === "Roster leave") {
              monthData[monthIndex][req.type] += 1;
           }
         }
         currentDate.setDate(currentDate.getDate() + 1);
       }
    });
    
    return monthData;
  }, [leaveRequests, reportStartDate]);



  const handleExportExcel = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    
    // --- Helper for styling ---
    const applyHeaderStyle = (sheet: any) => {
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }; // Slate 900
      sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.getRow(1).height = 25;
    };
    
    const applyBorders = (sheet: any) => {
      sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
        row.eachCell({ includeEmpty: false }, (cell: any) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
          if (rowNumber > 1) {
             cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });
    };

    // -- LEAVES SHEET --
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
        
        // Alternate row colors
        if (i % 2 === 0) {
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; // Slate 50
        }
      }
    });
    
    applyBorders(leavesSheet);

    // -- WORK & SHIFTS SHEET (By Staff) --
    const workSheet = workbook.addWorksheet("Work by Staff");
    
    const dateHeaders: string[] = [];
    const daysCount = Math.ceil((new Date(reportEndDate).getTime() - new Date(reportStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(reportStartDate);
      d.setUTCDate(d.getUTCDate() + i);
      dateHeaders.push(d.toISOString().split("T")[0]);
    }
    
    const workCols = [
      { header: "Staff ID", key: "staffId", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Total Shifts", key: "totalShifts", width: 15 }
    ];
    
    dateHeaders.forEach(dh => {
      const d = new Date(dh);
      const formatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
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
        
        dateHeaders.forEach(dh => {
          const dayData = ws.dates[dh];
          if (dayData) {
            const shift = shifts.find(sh => sh.id === dayData.shiftId);
            if (shift) {
               rowData[dh] = `${shift.pickupTime}-${shift.endTime} (${dayData.role})`;
            } else {
               rowData[dh] = `WORK (${dayData.role})`;
            }
          } else {
            rowData[dh] = "-";
          }
        });
        
        const row = workSheet.addRow(rowData);
        if (i % 2 === 0) {
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        }
        
        // Colorize shifts vs empty
        row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          if (colNumber > 3) {
            const val = cell.value;
            if (val && val !== "-") {
               cell.font = { bold: true, color: { argb: "FF047857" } }; // Emerald 700
               cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } }; // Emerald 50
            } else if (val === "-") {
               cell.font = { color: { argb: "FF94A3B8" } }; // Slate 400
            }
          }
        });
      }
    });
    
    applyBorders(workSheet);

        // -- SHIFT DETAILS SHEET (By Shift) --
    const shiftDetailSheet = workbook.addWorksheet("Daily Shifts", { properties: { tabColor: { argb: 'FF10B981' } } });
    shiftDetailSheet.columns = [
      { width: 3 }, // spacer
      { width: 25 }, // Role
      { width: 20 }, // Staff ID
      { width: 35 }, // Staff Name
    ];
    
    let rowIndex = 1;
    
    dateHeaders.forEach(dateStr => {
      const program = programs.find(p => p.dateString === dateStr);
      if (program && program.assignments.length > 0) {
        // Group by shift
        const shiftMap: Record<string, typeof program.assignments> = {};
        program.assignments.forEach(a => {
          const sId = a.shiftId || "unassigned";
          if (!shiftMap[sId]) shiftMap[sId] = [];
          shiftMap[sId].push(a);
        });
        
        const sortedShiftIds = Object.keys(shiftMap).sort((a, b) => {
          if (a === "unassigned") return 1;
          if (b === "unassigned") return -1;
          const shiftA = shifts.find(s => s.id === a);
          const shiftB = shifts.find(s => s.id === b);
          if (shiftA && shiftB) return shiftA.pickupTime.localeCompare(shiftB.pickupTime);
          return 0;
        });
        
        const displayDate = new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        
        rowIndex += 2;
        const dateRow = shiftDetailSheet.getRow(rowIndex);
        dateRow.getCell(2).value = displayDate;
        dateRow.getCell(2).font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }; // Slate 900
        shiftDetailSheet.mergeCells(rowIndex, 2, rowIndex, 4);
        rowIndex++;
        
        sortedShiftIds.forEach(shiftId => {
           const shift = shifts.find(s => s.id === shiftId);
           const shiftText = shift ? `${shift.pickupTime} - ${shift.endTime}` : "Unassigned";
           const assigns = shiftMap[shiftId];
           
           rowIndex++;
           const shiftRow = shiftDetailSheet.getRow(rowIndex);
           shiftRow.getCell(2).value = `SHIFT: ${shiftText}  (${assigns.length} Staff)`;
           shiftRow.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
           shiftRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } }; // Emerald 700
           shiftRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
           shiftRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
           shiftRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
           shiftDetailSheet.mergeCells(rowIndex, 2, rowIndex, 4);
           
           // Sub header
           rowIndex++;
           const subRow = shiftDetailSheet.getRow(rowIndex);
           subRow.values = [, "Role", "Staff ID", "Staff Name"];
           subRow.font = { bold: true, color: { argb: 'FF334155' }, size: 11 }; // Slate 700
           subRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; // Slate 200
           
           [2, 3, 4].forEach(col => {
             subRow.getCell(col).border = {
               top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
               left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
               bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
               right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
             };
             subRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'center' };
           });
           
           let staffCount = 0;
           assigns.forEach(a => {
             const st = staffMap.get(a.staffId);
             if (st) {
               rowIndex++;
               const row = shiftDetailSheet.getRow(rowIndex);
               row.values = [, a.role, st.staffId || "-", st.name];
               
               // Role coloring
               row.getCell(2).font = { bold: true, color: { argb: 'FF4338CA' } }; // Indigo 700
               
               if (staffCount % 2 === 0) {
                 [2, 3, 4].forEach(col => {
                   row.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; // Slate 50
                 });
               }
               
               [2, 3, 4].forEach(col => {
                 row.getCell(col).border = {
                   top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                   left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                   bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                   right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
                 };
                 row.getCell(col).alignment = { vertical: 'middle', horizontal: 'center' };
               });
               
               staffCount++;
             }
           });
           
           rowIndex++; // Blank row after shift group
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `SkyOps_Reports_${reportStartDate}_to_${reportEndDate}.xlsx`);
  };
  const renderDates = (dates: string[]) => {
    if (!dates || dates.length === 0) return null;
    
    // show dates as MM-DD
    return (
      <div className="mt-2 flex flex-wrap gap-1 justify-center max-w-[120px] mx-auto">
        {dates.map(d => {
          const dateObj = new Date(d);
          const formatted = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
          return (
             <span key={d} className="text-[9px] bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
               {formatted}
             </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">

      <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-sm mb-6">
        <button
          onClick={() => setActiveTab("leaves")}
          className={`flex-1 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all ${
            activeTab === "leaves"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Calendar size={16} /> Leaves
          </div>
        </button>
        <button
          onClick={() => setActiveTab("work")}
          className={`flex-1 py-2 text-xs md:text-sm font-black uppercase tracking-wider rounded-xl transition-all ${
            activeTab === "work"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Briefcase size={16} /> Work & Shifts
          </div>
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <Calendar className="text-emerald-500" size={24} />
            Leave & Reports
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Track staff absences and leave days.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
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
          <div className="w-px h-8 bg-slate-200 hidden md:block mx-1"></div>
          <div className="relative flex-1 md:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-bold"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <select
              value={leaveFilter}
              onChange={(e) => setLeaveFilter(e.target.value as any)}
              className="pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-bold appearance-none cursor-pointer"
            >
              <option value="All">All Leave Types</option>
              {availableLeaveTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors text-sm font-bold shadow-sm whitespace-nowrap"
          >
            <FileDown size={18} />
            Export Excel
          </button>
        </div>
      </div>


      {activeTab === "leaves" && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 lg:col-span-2">
          <div className="mb-6">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <BarChart2 className="text-emerald-500" size={20} />
              Leave Trends ({new Date(reportStartDate).getFullYear() || new Date().getFullYear()})
            </h3>
            <p className="text-xs text-slate-500 mt-1">Monthly breakdown of leave requests across the department.</p>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyLeaveData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="Day off" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Annual leave" stackId="a" fill="#a855f7" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Sick leave" stackId="a" fill="#f43f5e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Lieu leave" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Roster leave" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              Leave Distribution
            </h3>
            <p className="text-xs text-slate-500 mt-1">Total days consumed in selected period.</p>
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            {departmentLeaveData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={departmentLeaveData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {departmentLeaveData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 font-bold text-sm text-center">
                No leave data<br/>in selected period.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                <th className="px-6 py-4">Staff Member</th>
                <th className="px-6 py-4 text-center">Day Off</th>
                <th className="px-6 py-4 text-center">Annual Leave</th>
                <th className="px-6 py-4 text-center">Sick Leave</th>
                <th className="px-6 py-4 text-center">Lieu Leave</th>
                <th className="px-6 py-4 text-center">Roster Leave</th>
                <th className="px-6 py-4 text-center">Total Leaves</th>
              </tr>
            </thead>
            <tbody className="text-sm font-medium divide-y divide-slate-100">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">
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
                            {s.staffId && <div className="text-[10px] text-slate-400 font-mono leading-none">ID: {s.staffId}</div>}
                            <div className="text-xs text-slate-500 font-mono">{s.type}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center align-top">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${summary?.["Day off"]?.length ? "bg-emerald-100 text-emerald-700" : "text-slate-300"}`}>
                          {summary?.["Day off"]?.length || 0} days
                        </span>
                        {renderDates(summary?.["Day off"])}
                      </td>
                      <td className="px-6 py-4 text-center align-top">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${summary?.["Annual leave"]?.length ? "bg-purple-100 text-purple-700" : "text-slate-300"}`}>
                          {summary?.["Annual leave"]?.length || 0} days
                        </span>
                        {renderDates(summary?.["Annual leave"])}
                      </td>
                      <td className="px-6 py-4 text-center align-top">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${summary?.["Sick leave"]?.length ? "bg-rose-100 text-rose-700" : "text-slate-300"}`}>
                          {summary?.["Sick leave"]?.length || 0} days
                        </span>
                        {renderDates(summary?.["Sick leave"])}
                      </td>
                      <td className="px-6 py-4 text-center align-top">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${summary?.["Lieu leave"]?.length ? "bg-amber-100 text-amber-700" : "text-slate-300"}`}>
                          {summary?.["Lieu leave"]?.length || 0} days
                        </span>
                        {renderDates(summary?.["Lieu leave"])}
                      </td>
                      <td className="px-6 py-4 text-center align-top">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${summary?.["Roster leave"]?.length ? "bg-blue-100 text-blue-700" : "text-slate-300"}`}>
                          {summary?.["Roster leave"]?.length || 0} days
                        </span>
                        {renderDates(summary?.["Roster leave"])}
                      </td>
                      <td className="px-6 py-4 text-center align-top">
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${summary?.total ? "bg-slate-900 text-white" : "text-slate-300"}`}>
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

      {activeTab === "work" && (
        <div className="flex flex-col gap-4">
          <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-[240px]">
            <button onClick={() => setWorkView('staff')} className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${workView === 'staff' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>By Staff</button>
            <button onClick={() => setWorkView('shifts')} className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${workView === 'shifts' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>By Shift</button>
          </div>

          {workView === 'staff' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                  <th className="px-6 py-4 sticky left-0 z-10 bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">Staff Member</th>
                  <th className="px-6 py-4 text-center">Total Shifts</th>
                  {Array.from({ length: Math.ceil((new Date(reportEndDate).getTime() - new Date(reportStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 }).map((_, i) => {
                    const d = new Date(reportStartDate);
                    d.setUTCDate(d.getUTCDate() + i);
                    return (
                      <th key={i} className="px-3 py-4 text-center min-w-[80px]">
                        {d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-sm font-medium divide-y divide-slate-100">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={100} className="px-6 py-12 text-center text-slate-400 font-bold">
                      No records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((s) => {
                    const ws = workSummary[s.id];
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 align-top sticky left-0 z-10 bg-white group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                              {s.initials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 whitespace-nowrap">{s.name}</div>
                              {s.staffId && <div className="text-[10px] text-slate-400 font-mono leading-none">ID: {s.staffId}</div>}
                              <div className="text-xs text-slate-500 font-mono">{s.type}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center align-middle">
                          <span className={`px-3 py-1 rounded-full text-xs font-black ${ws?.totalShifts ? "bg-indigo-100 text-indigo-700" : "text-slate-300"}`}>
                            {ws?.totalShifts || 0}
                          </span>
                        </td>
                        {Array.from({ length: Math.ceil((new Date(reportEndDate).getTime() - new Date(reportStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 }).map((_, i) => {
                          const d = new Date(reportStartDate);
                          d.setUTCDate(d.getUTCDate() + i);
                          const dateStr = d.toISOString().split("T")[0];
                          const dayData = ws?.dates[dateStr];
                          
                          let shiftContent = <span className="text-slate-200">-</span>;
                          if (dayData) {
                            const shift = shifts.find(sh => sh.id === dayData.shiftId);
                            if (shift) {
                               shiftContent = (
                                 <div className="flex flex-col items-center justify-center gap-0.5">
                                   <div className="text-[10px] font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">{shift.pickupTime}-{shift.endTime}</div>
                                   <div className="text-[8px] font-bold text-slate-400">{dayData.role}</div>
                                 </div>
                               );
                            } else {
                               shiftContent = <div className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">WORK</div>;
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

          {workView === 'shifts' && (
            <div className="space-y-6">
              {Array.from({ length: Math.ceil((new Date(reportEndDate).getTime() - new Date(reportStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 }).map((_, i) => {
                const d = new Date(reportStartDate);
                d.setUTCDate(d.getUTCDate() + i);
                const dateStr = d.toISOString().split("T")[0];
                const program = programs.find(p => p.dateString === dateStr);
                if (!program || program.assignments.length === 0) return null;
                
                // Group assignments by shift
                const shiftMap: Record<string, typeof program.assignments> = {};
                program.assignments.forEach(a => {
                  const sId = a.shiftId || "unassigned";
                  if (!shiftMap[sId]) shiftMap[sId] = [];
                  shiftMap[sId].push(a);
                });

                // Sort shift keys by pickup time
                const sortedShiftIds = Object.keys(shiftMap).sort((a, b) => {
                  if (a === "unassigned") return 1;
                  if (b === "unassigned") return -1;
                  const shiftA = shifts.find(s => s.id === a);
                  const shiftB = shifts.find(s => s.id === b);
                  if (shiftA && shiftB) return shiftA.pickupTime.localeCompare(shiftB.pickupTime);
                  return 0;
                });

                return (
                  <div key={dateStr} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden p-6">
                    <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                      <CalendarDays className="text-indigo-500" size={20} />
                      {new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sortedShiftIds.map(shiftId => {
                        const shift = shifts.find(s => s.id === shiftId);
                        const assigns = shiftMap[shiftId];
                        return (
                          <div key={shiftId} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col h-full">
                            <div className="font-bold text-slate-900 mb-3 border-b border-slate-200 pb-2 flex justify-between items-center">
                              <span>{shift ? `${shift.pickupTime} - ${shift.endTime}` : "Unassigned"}</span>
                              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{assigns.length}</span>
                            </div>
                            <div className="space-y-2 flex-1">
                              {assigns.map(a => {
                                const st = staffMap.get(a.staffId);
                                if (!st) return null;
                                return (
                                  <div key={a.staffId} className="flex justify-between items-center text-sm py-1 border-b border-slate-100/50 last:border-0">
                                    <div className="flex flex-col">
                                      <span className="font-medium text-slate-700">{st.name}</span>
                                      {st.staffId && <span className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">ID: {st.staffId}</span>}
                                    </div>
                                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black tracking-widest">{a.role}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
