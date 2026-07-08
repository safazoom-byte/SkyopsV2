import re

with open("components/ProgramCheck.tsx", "r") as f:
    code = f.read()

# 1. Update ProgramCheckProps to include flights
props_search = """interface ProgramCheckProps {
  staff: Staff[];
  shifts: ShiftConfig[];
  programs: DailyProgram[];
  leaveRequests: LeaveRequest[];
  startDate: string;
  endDate: string;
}"""

props_replace = """import { Flight } from '../types';

interface ProgramCheckProps {
  staff: Staff[];
  shifts: ShiftConfig[];
  programs: DailyProgram[];
  leaveRequests: LeaveRequest[];
  flights: Flight[];
  startDate: string;
  endDate: string;
}"""

code = code.replace(props_search, props_replace)

# 2. Add flights to destructured props
destruct_search = """export const ProgramCheck: React.FC<ProgramCheckProps> = ({
  staff,
  shifts,
  programs,
  leaveRequests,
  startDate,
  endDate
}) => {"""

destruct_replace = """export const ProgramCheck: React.FC<ProgramCheckProps> = ({
  staff,
  shifts,
  programs,
  leaveRequests,
  flights,
  startDate,
  endDate
}) => {"""

code = code.replace(destruct_search, destruct_replace)

# 3. Add flight coverage check and update coversRole
check_search = """        // 2. Missing Required Roles
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
        };"""

check_replace = """        // 2. Missing Required Roles
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
        };"""

code = code.replace(check_search, check_replace)

dep_search = """  }, [staff, shifts, programs, leaveRequests]);"""

dep_replace = """    });

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

code = code.replace("""    // Sort issues: errors first, then by staff name
    return foundIssues.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'error' ? -1 : 1;
      return a.staffName.localeCompare(b.staffName);
    });
  }, [staff, shifts, programs, leaveRequests]);""", dep_replace)

with open("components/ProgramCheck.tsx", "w") as f:
    f.write(code)
