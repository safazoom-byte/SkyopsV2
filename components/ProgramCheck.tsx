import React, { useMemo } from 'react';
import { Staff, ShiftConfig, DailyProgram, LeaveRequest, isStaffActiveOnDate } from '../types';
import { AlertCircle, Clock, CalendarX2, UserMinus, ShieldAlert, CheckCircle2, CalendarOff, Hourglass, Users, AlertTriangle } from 'lucide-react';

interface ProgramCheckProps {
  staff: Staff[];
  shifts: ShiftConfig[];
  programs: DailyProgram[];
  leaveRequests: LeaveRequest[];
  startDate: string;
  endDate: string;
}

interface Issue {
  type: 'error' | 'warning';
  title: string;
  description: string;
  staffName: string;
  staffId: string;
  date?: string;
  icon: React.ElementType;
}

export const ProgramCheck: React.FC<ProgramCheckProps> = ({
  staff,
  shifts,
  programs,
  leaveRequests,
  startDate,
  endDate
}) => {
  const issues = useMemo(() => {
    const foundIssues: Issue[] = [];
    if (!staff.length || !programs.length) return foundIssues;

    // Build lookup maps
    const staffMap = new Map(staff.map(s => [s.id, s]));
    const shiftMap = new Map(shifts.map(s => [s.id, s]));

    // Map staff to their assigned shifts
    // Using a Set of shiftIds to avoid duplicates if they have multiple assignments on same shift
    const staffShifts = new Map<string, Set<string>>();
    
    programs.forEach(dp => {
      dp.assignments?.forEach(a => {
        if (a.staffId && a.shiftId) {
          if (!staffShifts.has(a.staffId)) {
            staffShifts.set(a.staffId, new Set());
          }
          staffShifts.get(a.staffId)!.add(a.shiftId);
        }
      });
    });

    // Process each staff member
    staffShifts.forEach((shiftIds, staffId) => {
      const sInfo = staffMap.get(staffId);
      if (!sInfo) return;

      // Get full shift objects and sort by start time
      const staffShiftObjs = Array.from(shiftIds)
        .map(id => shiftMap.get(id))
        .filter((s): s is ShiftConfig => s !== undefined)
        .map(s => {
          const start = new Date(`${s.pickupDate}T${s.pickupTime}:00`);
          const end = new Date(`${s.endDate}T${s.endTime}:00`);
          return { ...s, start, end };
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      // Check 1 & 2: Overlaps and < 12h Rest
      for (let i = 0; i < staffShiftObjs.length - 1; i++) {
        const current = staffShiftObjs[i];
        const next = staffShiftObjs[i + 1];

        // Overlap
        if (next.start < current.end) {
          foundIssues.push({
            type: 'error',
            title: 'Shift Overlap',
            description: `Assigned to overlapping shifts on ${current.pickupDate}.`,
            staffName: sInfo.name,
            staffId: sInfo.id,
            date: current.pickupDate,
            icon: CalendarX2
          });
        } else {
          // Rest period
          const restMs = next.start.getTime() - current.end.getTime();
          const restHours = restMs / (1000 * 60 * 60);
          if (restHours < 12) {
            foundIssues.push({
              type: 'warning',
              title: 'Insufficient Rest',
              description: `Only ${restHours.toFixed(1)}h rest between shift ending at ${current.endDate} ${current.endTime} and next shift at ${next.pickupDate} ${next.pickupTime}.`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: next.pickupDate,
              icon: Clock
            });
          }
        }
      }

      // Check 3: Leaves vs Duties
      const staffLeaves = leaveRequests.filter(l => l.staffId === staffId);
      staffShiftObjs.forEach(shift => {
        const shiftDateStr = shift.pickupDate;
        const shiftDate = new Date(shiftDateStr);
        staffLeaves.forEach(leave => {
          const lStart = new Date(leave.startDate);
          const lEnd = new Date(leave.endDate);
          if (shiftDate >= lStart && shiftDate <= lEnd) {
            foundIssues.push({
              type: 'error',
              title: 'Duty During Leave',
              description: `Assigned to a shift on ${shiftDateStr} while on approved leave (${leave.type}).`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: shiftDateStr,
              icon: ShieldAlert
            });
          }
        });
      });

      // Check 5: Duty Outside Roster Period
      staffShiftObjs.forEach(shift => {
        const shiftDateStr = shift.pickupDate;
        const shiftDate = new Date(shiftDateStr);
        shiftDate.setHours(0,0,0,0);
        
        // Check general workFromDate / workToDate
        if (sInfo.workFromDate) {
          const from = new Date(sInfo.workFromDate);
          from.setHours(0,0,0,0);
          if (shiftDate < from) {
            foundIssues.push({
              type: 'error',
              title: 'Duty Before Work Period',
              description: `Assigned to shift on ${shiftDateStr} but work period starts on ${sInfo.workFromDate}.`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: shiftDateStr,
              icon: CalendarOff
            });
          }
        }
        if (sInfo.workToDate) {
          const to = new Date(sInfo.workToDate);
          to.setHours(0,0,0,0);
          if (shiftDate > to) {
            foundIssues.push({
              type: 'error',
              title: 'Duty After Work Period',
              description: `Assigned to shift on ${shiftDateStr} but work period ended on ${sInfo.workToDate}.`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: shiftDateStr,
              icon: CalendarOff
            });
          }
        }

        // Check specific rosterPeriods if defined
        if (sInfo.rosterPeriods && sInfo.rosterPeriods.length > 0) {
          let isInsideAnyPeriod = false;
          for (const period of sInfo.rosterPeriods) {
            const pStart = new Date(period.start);
            pStart.setHours(0,0,0,0);
            const pEnd = new Date(period.end);
            pEnd.setHours(0,0,0,0);
            if (shiftDate >= pStart && shiftDate <= pEnd) {
              isInsideAnyPeriod = true;
              break;
            }
          }
          if (!isInsideAnyPeriod) {
            foundIssues.push({
              type: 'error',
              title: 'Duty Outside Roster Period',
              description: `Assigned to shift on ${shiftDateStr} which is outside their specified roster periods.`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: shiftDateStr,
              icon: CalendarOff
            });
          }
        }

        // Check 6: Shift > 12h
        const shiftDurationMs = shift.end.getTime() - shift.start.getTime();
        const shiftDurationHours = shiftDurationMs / (1000 * 60 * 60);
        if (shiftDurationHours > 12) {
            foundIssues.push({
              type: 'error',
              title: 'Shift Exceeds 12 Hours',
              description: `Shift duration is ${shiftDurationHours.toFixed(1)}h (from ${shift.pickupTime} to ${shift.endTime}).`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: shiftDateStr,
              icon: Hourglass
            });
        }
      });
      
      // Check 7: Max Shifts Per Week Exceeded
      // Simple check: total shifts in this period compared to maxShiftsPerWeek (if period is 1 week)
      // For general case, count shifts in rolling 7-day windows
      if (sInfo.maxShiftsPerWeek && staffShiftObjs.length > sInfo.maxShiftsPerWeek) {
          // If the selected period is exactly 7 days, we can just check total shifts
          const periodStart = new Date(startDate);
          const periodEnd = new Date(endDate);
          const periodDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          if (periodDays <= 7 && staffShiftObjs.length > sInfo.maxShiftsPerWeek) {
            foundIssues.push({
              type: 'warning',
              title: 'Max Shifts Exceeded',
              description: `Assigned to ${staffShiftObjs.length} shifts in ${periodDays} days, but max is ${sInfo.maxShiftsPerWeek} per week.`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              icon: AlertCircle
            });
          }
      }
      
      // Check 8: Over 6 consecutive days
      const workingDateStrs = Array.from(new Set(staffShiftObjs.map(s => s.pickupDate))).sort();
      let consecutiveCount = 1;
      for (let i = 1; i < workingDateStrs.length; i++) {
        const prev = new Date(workingDateStrs[i-1]);
        const curr = new Date(workingDateStrs[i]);
        const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            consecutiveCount++;
            if (consecutiveCount > 6) {
                foundIssues.push({
                    type: 'warning',
                    title: 'Too Many Consecutive Days',
                    description: `Working ${consecutiveCount} consecutive days ending on ${workingDateStrs[i]}.`,
                    staffName: sInfo.name,
                    staffId: sInfo.id,
                    date: workingDateStrs[i],
                    icon: CalendarX2
                });
            }
        } else {
            consecutiveCount = 1;
        }
      }
    });

    // Check 4 & 9: Missing Duties & Underutilization
    const pStart = new Date(startDate);
    const pEnd = new Date(endDate);
    const periodDays = Math.round((pEnd.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    staff.forEach(s => {
      if (s.isActive === false) return;
      
      const sShifts = staffShifts.get(s.id);
      const shiftCount = sShifts ? sShifts.size : 0;
      
      if (shiftCount === 0) {
          foundIssues.push({
            type: 'warning',
            title: 'No Duties Assigned',
            description: `Staff member has no duties assigned in the selected period.`,
            staffName: s.name,
            staffId: s.id,
            icon: UserMinus
          });
      } else {
          // They have some shifts. Did they work the expected number?
          let excusedLeaves = 0;
          
          if (s.type === 'Local') {
              programs.forEach(p => {
                const pDate = p.dateString || '';
                const staffLeaves = leaveRequests.filter(l => l.staffId === s.id);
                const hasLeave = staffLeaves.some(l => l.type !== "Day off" && l.startDate <= pDate && l.endDate >= pDate);
                const worked = p.assignments.some(a => a.staffId === s.id);
                if (hasLeave && !worked) excusedLeaves++;
              });
              
              // Default to 5 days per week check if period is 7 days
              if (periodDays === 7) {
                  const targetShifts = 5 - excusedLeaves;
                  const shiftsWorked = programs.reduce(
                    (acc, p) => acc + (p.assignments.some(a => a.staffId === s.id) ? 1 : 0),
                    0
                  );
                  if (shiftsWorked < targetShifts) {
                      foundIssues.push({
                          type: 'warning',
                          title: 'Missing Duties (Local)',
                          description: `Worked ${shiftsWorked} days, but target is ${targetShifts} days (after ${excusedLeaves} excused leaves).`,
                          staffName: s.name,
                          staffId: s.id,
                          icon: UserMinus
                      });
                  }
              }
          } else if (s.type === 'Roster') {
              const workFrom = s.workFromDate ? new Date(s.workFromDate) : pStart;
              const workTo = s.workToDate ? new Date(s.workToDate) : pEnd;
              const overlapStart = workFrom > pStart ? workFrom : pStart;
              const overlapEnd = workTo < pEnd ? workTo : pEnd;
              
              let potential = 0;
              if (overlapStart <= overlapEnd) {
                  potential = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              }
              
              programs.forEach(p => {
                  const d = new Date(p.dateString || '');
                  if (d >= overlapStart && d <= overlapEnd) {
                      const staffLeaves = leaveRequests.filter(l => l.staffId === s.id);
                      const hasLeave = staffLeaves.some(l => l.type !== "Day off" && l.startDate <= (p.dateString || "") && l.endDate >= (p.dateString || ""));
                      const worked = p.assignments.some(a => a.staffId === s.id);
                      if (hasLeave && !worked) excusedLeaves++;
                  }
              });
              
              const shiftsWorked = programs.reduce(
                (acc, p) => acc + (p.assignments.some(a => a.staffId === s.id) ? 1 : 0),
                0
              );
              
              const targetShifts = potential - excusedLeaves;
              if (shiftsWorked < targetShifts) {
                  foundIssues.push({
                      type: 'warning',
                      title: 'Missing Duties (Roster)',
                      description: `Worked ${shiftsWorked} days, but target is ${targetShifts} days (after ${excusedLeaves} excused leaves in window).`,
                      staffName: s.name,
                      staffId: s.id,
                      icon: UserMinus
                  });
              }
          }
      }
    });


    // Check 10: Shift Minimum Staff & Required Roles
    programs.forEach(prog => {
      const pDate = prog.dateString;
      if (!pDate) return;
      
      const shiftsToday = shifts.filter(s => s.pickupDate === pDate);
      shiftsToday.forEach(shift => {
        const assignments = prog.assignments.filter(a => a.shiftId === shift.id);
        
        // 1. Minimum Staff Check
        const nonLabourCount = assignments.filter((a) => {
          const st = staffMap.get(a.staffId);
          return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        
        if (shift.minStaff && nonLabourCount < shift.minStaff) {
            foundIssues.push({
              type: 'error',
              title: 'Under Minimum Staff',
              description: `Shift ${shift.pickupTime}-${shift.endTime} has ${nonLabourCount} agents (excluding support roles), minimum is ${shift.minStaff}.`,
              staffName: 'Shift Issue',
              staffId: shift.id,
              date: pDate,
              icon: Users
            });
        }
        

        // 3. Over Maximum Staff Check
        if (shift.maxStaff && nonLabourCount > shift.maxStaff) {
            foundIssues.push({
              type: 'warning',
              title: 'Over Maximum Staff',
              description: `Shift ${shift.pickupTime}-${shift.endTime} has ${nonLabourCount} agents, maximum is ${shift.maxStaff}.`,
              staffName: 'Shift Issue',
              staffId: shift.id,
              date: pDate,
              icon: Users
            });
        }
        
        // 4. Duplicate Assignments Check
        const staffCounts = new Map<string, number>();
        assignments.forEach(a => {
           const count = staffCounts.get(a.staffId) || 0;
           staffCounts.set(a.staffId, count + 1);
        });
        
        staffCounts.forEach((count, sId) => {
           if (count > 1) {
               const st = staffMap.get(sId);
               foundIssues.push({
                  type: 'error',
                  title: 'Duplicate Assignment',
                  description: `${st?.name} is assigned to shift ${shift.pickupTime}-${shift.endTime} multiple times (${count}x).`,
                  staffName: st?.name || 'Unknown',
                  staffId: sId,
                  date: pDate,
                  icon: AlertTriangle
               });
           }
        });

        assignments.forEach(a => {
            const st = staffMap.get(a.staffId);
            if (st && !isStaffActiveOnDate(st, pDate)) {
                foundIssues.push({
                  type: 'error',
                  title: 'Inactive Staff Assigned',
                  description: `${st.name} is assigned to shift ${shift.pickupTime}-${shift.endTime} but is deactivated or outside their active period on this date.`,
                  staffName: st.name,
                  staffId: st.id,
                  date: pDate,
                  icon: UserMinus
                });
            }
        });

        
        // 5. Unqualified Staff for Role Check
        assignments.forEach(a => {
            if (!a.role) return;
            const st = staffMap.get(a.staffId);
            if (!st) return;
            
            let isQualified = true;
            const role = a.role.toUpperCase().replace(/ /g, "");
            if (role === "LC" || role === "LOADCONTROL") {
                if (!st.isLoadControl && st.initials.toUpperCase() !== "SK-ATZ") isQualified = false;
            }
            if (role === "SL" || role === "SHIFTLEADER") {
                if (!st.isShiftLeader && st.initials.toUpperCase() !== "SK-ATZ") isQualified = false;
            }
            if (role === "RMP" || role === "RAMP") {
                if (!st.isRamp) isQualified = false;
            }
            if (role === "OPS" || role === "OPERATIONS") {
                if (!st.isOps) isQualified = false;
            }
            if (role === "LF" || role === "LOSTANDFOUND") {
                if (!st.isLostFound) isQualified = false;
            }
            
            if (!isQualified) {
                foundIssues.push({
                    type: 'error',
                    title: 'Unqualified for Role',
                    description: `${st.name} is assigned to ${a.role} but does not have the required qualification.`,
                    staffName: st.name,
                    staffId: st.id,
                    date: pDate,
                    icon: AlertTriangle
                });
            }
        });

        // 2. Missing Required Roles
        const coversRole = (a: any, roleCode: string) => {
            const st = staffMap.get(a.staffId);
            if (!st) return false;
            if (a.role === roleCode || a.role === roleCode.replace(/ /g, "")) return true;
            if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
            if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
            if (roleCode === "RMP" && st.isRamp) return true;
            if (roleCode === "OPS" && st.isOps) return true;
            if (roleCode === "LF" && st.isLostFound) return true;
            if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
            return false;
        };

        const checkRole = (roleName: string, roleCode: string, required: boolean) => {
            if (required) {
                const hasRole = assignments.some(a => coversRole(a, roleCode));
                if (!hasRole) {
                    foundIssues.push({
                        type: 'error',
                        title: 'Missing Role',
                        description: `Shift ${shift.pickupTime}-${shift.endTime} is missing required role: ${roleName}.`,
                        staffName: 'Shift Issue',
                        staffId: shift.id,
                        date: pDate,
                        icon: AlertTriangle
                    });
                }
            }
        };

        const slReq = ((shift.roleCounts?.["Shift Leader"] || (shift.roleCounts as any)?.["SL"] || 0) as number) > 0;
        const lcReq = ((shift.roleCounts?.["Load Control"] || (shift.roleCounts as any)?.["LC"] || 0) as number) > 0;
        const rmpReq = ((shift.roleCounts?.["Ramp"] || (shift.roleCounts as any)?.["RMP"] || 0) as number) > 0;
        const opsReq = ((shift.roleCounts?.["Operations"] || (shift.roleCounts as any)?.["OPS"] || 0) as number) > 0;
        const lfReq = ((shift.roleCounts?.["Lost and Found"] || (shift.roleCounts as any)?.["LF"] || 0) as number) > 0;

        checkRole("Shift Leader", "SL", slReq);
        checkRole("Load Control", "LC", lcReq);
        checkRole("Ramp", "RMP", rmpReq);
        checkRole("Operations", "OPS", opsReq);
        checkRole("Lost and Found", "LF", lfReq);
      });
    });

    // Sort issues: errors first, then by staff name
    return foundIssues.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'error' ? -1 : 1;
      return a.staffName.localeCompare(b.staffName);
    });
  }, [staff, shifts, programs, leaveRequests]);

  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 md:space-y-12 animate-in fade-in duration-500">
      <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">
            Program Check
          </h2>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
            <AlertCircle size={14} /> Automated Roster Validation
          </p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center bg-rose-50 px-6 py-3 rounded-2xl border border-rose-100">
            <span className="text-2xl font-black text-rose-600">{errorCount}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-rose-400">Errors</span>
          </div>
          <div className="flex flex-col items-center bg-amber-50 px-6 py-3 rounded-2xl border border-amber-100">
            <span className="text-2xl font-black text-amber-600">{warningCount}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Warnings</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-100">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-emerald-500 gap-4">
            <CheckCircle2 size={64} className="opacity-50" />
            <h3 className="text-2xl font-black uppercase tracking-tighter">All Clear</h3>
            <p className="text-sm font-bold text-slate-400">No issues found in the selected period.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.map((issue, idx) => (
              <div 
                key={idx} 
                className={`flex items-start gap-4 p-5 rounded-2xl border ${
                  issue.type === 'error' 
                    ? 'bg-rose-50/50 border-rose-100' 
                    : 'bg-amber-50/50 border-amber-100'
                }`}
              >
                <div className={`p-3 rounded-xl ${
                  issue.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                }`}>
                  <issue.icon size={24} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-sm font-black uppercase tracking-tight ${
                      issue.type === 'error' ? 'text-rose-700' : 'text-amber-700'
                    }`}>
                      {issue.title}
                    </h4>
                    {issue.date && (
                      <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-100">
                        {issue.date}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-700 mb-2">{issue.staffName}</p>
                  <p className="text-xs font-medium text-slate-500">{issue.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
