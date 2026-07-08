import re

with open("components/ProgramCheck.tsx", "r") as f:
    code = f.read()

# Replace the useMemo function body entirely to fix the logical errors.
search_start = "  const issues = useMemo(() => {"
search_end = "  }, [staff, shifts, programs, leaveRequests, flights, startDate, endDate]);"

new_usememo = """  const issues = useMemo(() => {
    const foundIssues: Issue[] = [];
    if (!staff.length || !programs.length) return foundIssues;

    // Build lookup maps
    const staffMap = new Map(staff.map(s => [s.id, s]));
    const shiftMap = new Map(shifts.map(s => [s.id, s]));

    const getShiftsForDate = (allShifts: ShiftConfig[], dateString: string) => {
      const d = new Date(dateString);
      const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
      return allShifts.filter((s) => {
        if (!s.isActive) return false;
        if (s.pattern === "Once" && s.pickupDate === dateString) return true;
        if (s.pattern === "Daily") {
          return d >= new Date(s.pickupDate) && (!s.endDate || d <= new Date(s.endDate));
        }
        if (s.pattern === "Weekly" && s.daysOfWeek?.includes(dayName)) {
          return d >= new Date(s.pickupDate) && (!s.endDate || d <= new Date(s.endDate));
        }
        if (s.pattern === "Custom" && s.customDates?.includes(dateString)) {
          return true;
        }
        return false;
      });
    };

    interface ScheduledDuty {
       shift: ShiftConfig;
       date: string;
       start: Date;
       end: Date;
       role?: string;
    }
    const staffDuties = new Map<string, ScheduledDuty[]>();
        
    programs.forEach(dp => {
      const pDate = dp.dateString;
      if (!pDate) return;
      dp.assignments?.forEach(a => {
        if (a.staffId && a.shiftId) {
          const shift = shiftMap.get(a.shiftId);
          if (shift) {
             const start = new Date(`${pDate}T${shift.pickupTime}:00`);
             let endDateStr = pDate;
             if (shift.endTime < shift.pickupTime) {
                 const nextDay = new Date(start);
                 nextDay.setUTCDate(nextDay.getUTCDate() + 1);
                 endDateStr = nextDay.toISOString().split('T')[0];
             }
             const end = new Date(`${endDateStr}T${shift.endTime}:00`);
             
             if (!staffDuties.has(a.staffId)) {
                staffDuties.set(a.staffId, []);
             }
             staffDuties.get(a.staffId)!.push({ shift, date: pDate, start, end, role: a.role });
          }
        }
      });
    });

    // Process each staff member
    staffDuties.forEach((duties, staffId) => {
      const sInfo = staffMap.get(staffId);
      if (!sInfo) return;

      duties.sort((a, b) => a.start.getTime() - b.start.getTime());

      // Check 1 & 2: Overlaps and < 12h Rest
      for (let i = 0; i < duties.length - 1; i++) {
        const current = duties[i];
        const next = duties[i + 1];
        
        if (next.start < current.end) {
          foundIssues.push({
            type: 'error',
            title: 'Shift Overlap',
            description: `Assigned to overlapping shifts on ${current.date}.`,
            staffName: sInfo.name,
            staffId: sInfo.id,
            date: current.date,
            icon: CalendarX2
          });
        } else {
          const restMs = next.start.getTime() - current.end.getTime();
          const restHours = restMs / (1000 * 60 * 60);
          if (restHours < 12) {
            foundIssues.push({
              type: 'warning',
              title: 'Insufficient Rest',
              description: `Only ${restHours.toFixed(1)}h rest between shift ending at ${current.shift.endTime} and next shift at ${next.shift.pickupTime}.`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: next.date,
              icon: Clock
            });
          }
        }
      }

      // Check 3: Leaves vs Duties
      const staffLeaves = leaveRequests.filter(l => l.staffId === staffId);
      duties.forEach(duty => {
        const dutyDate = new Date(duty.date);
        staffLeaves.forEach(leave => {
          const lStart = new Date(leave.startDate);
          const lEnd = new Date(leave.endDate);
          if (dutyDate >= lStart && dutyDate <= lEnd) {
            foundIssues.push({
              type: 'error',
              title: 'Duty During Leave',
              description: `Assigned to a shift on ${duty.date} while on approved leave (${leave.type}).`,
              staffName: sInfo.name,
              staffId: sInfo.id,
              date: duty.date,
              icon: CalendarOff
            });
          }
        });
      });
    });

    // Check 4: Roster & Contractual Limits
    const periodDays = programs.length;
    const pStart = new Date(startDate);
    const pEnd = new Date(endDate);

    staff.forEach(s => {
      if (s.isActive === false) return;
      const potential = periodDays;
      let excusedLeaves = 0;

      if (s.type === 'Local') {
          programs.forEach(p => {
            const pDate = p.dateString || '';
            const staffLeaves = leaveRequests.filter(l => l.staffId === s.id);
            const hasLeave = staffLeaves.some(l => l.type !== "Day off" && l.startDate <= pDate && l.endDate >= pDate);
            const worked = p.assignments.some(a => a.staffId === s.id);
            if (hasLeave && !worked) excusedLeaves++;
          });
          
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
    });

    // Check 5 & 6: Shift Requirements (Min Staff, Roles, Unqualified)
    programs.forEach(prog => {
      const pDate = prog.dateString;
      if (!pDate) return;
      
      const shiftsToday = getShiftsForDate(shifts, pDate);
      shiftsToday.forEach(shift => {
        const assignments = prog.assignments.filter(a => a.shiftId === shift.id);
        
        // Minimum Staff Check
        const nonLabourCount = assignments.filter((a) => {
          const st = staffMap.get(a.staffId);
          return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        
        if (shift.minStaff && nonLabourCount < shift.minStaff) {
            foundIssues.push({
              type: 'error',
              title: 'Under Minimum Staff',
              description: `Shift ${shift.pickupTime}-${shift.endTime} has ${nonLabourCount} agents, minimum is ${shift.minStaff}.`,
              staffName: 'Shift Issue',
              staffId: shift.id,
              date: pDate,
              icon: Users
            });
        }
        
        // Over Maximum Staff Check
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

        // Inactive Staff Check
        assignments.forEach(a => {
            const st = staffMap.get(a.staffId);
            if (st && !isStaffActiveOnDate(st, pDate)) {
                foundIssues.push({
                  type: 'error',
                  title: 'Inactive Staff Assigned',
                  description: `${st.name} is assigned to shift ${shift.pickupTime}-${shift.endTime} but is deactivated or outside their active period.`,
                  staffName: st.name,
                  staffId: st.id,
                  date: pDate,
                  icon: UserMinus
                });
            }
        });
        
        // Unqualified Staff for Role Check
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

        // Missing Required Roles
        const coversRole = (a: any, roleCode: string) => {
            const st = staffMap.get(a.staffId);
            if (!st) return false;
            const r = (a.role || "").toUpperCase().replace(/ /g, "");
            if (r === roleCode || 
               (r === "SHIFTLEADER" && roleCode === "SL") || 
               (r === "LOADCONTROL" && roleCode === "LC") || 
               (r === "RAMP" && roleCode === "RMP") || 
               (r === "OPERATIONS" && roleCode === "OPS") || 
               (r === "LOSTANDFOUND" && roleCode === "LF") || 
               (r === "LABOUR" && roleCode === "LBR")) return true;
            
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

    // Check Flights without shifts
    const flightsInRange = flights.filter(f => f.date >= startDate && f.date <= endDate);
    flightsInRange.forEach(f => {
       const isCovered = shifts.some(s => s.flightIds && s.flightIds.includes(f.id));
       if (!isCovered) {
          foundIssues.push({
             type: 'warning',
             title: 'Uncovered Flight',
             description: `Flight ${f.flightNumber} on ${f.date} is not associated with any shift.`,
             staffName: 'Flight Issue',
             staffId: f.id,
             date: f.date,
             icon: AlertTriangle
          });
       }
    });

    // Sort issues: errors first, then by staff name
    return foundIssues.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'error' ? -1 : 1;
      return a.staffName.localeCompare(b.staffName);
    });
  }, [staff, shifts, programs, leaveRequests, flights, startDate, endDate]);"""

start_idx = code.find(search_start)
end_idx = code.find(search_end) + len(search_end)

if start_idx != -1 and end_idx != -1:
    code = code[:start_idx] + new_usememo + code[end_idx:]

with open("components/ProgramCheck.tsx", "w") as f:
    f.write(code)
