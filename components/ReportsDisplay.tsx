import React, { useMemo, useState } from "react";
import { UserProfile, Staff, LeaveRequest, LeaveType } from "../types";
import { FileDown, Calendar, User, Search, Filter, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ReportsDisplayProps {
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
}: ReportsDisplayProps) {
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
        </div>
      </div>


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
    </div>
  );
}
