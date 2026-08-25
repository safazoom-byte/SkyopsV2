export type Skill =
  | "Ramp"
  | "Load Control"
  | "Lost and Found"
  | "Shift Leader"
  | "Operations"
  | "Labour"
  | "Security"
  | "Driver"
  | "Accountant";
export type ProficiencyLevel = "Yes" | "No";
export type StaffCategory = "Local" | "Roster";
export type WorkPattern = string;
export type LeaveType =
  | "Day off"
  | "Annual leave"
  | "Lieu leave"
  | "Sick leave"
  | "Roster leave"
  | "NIL";

export const normalizeFlightNumber = (fNum: string) => {
  return fNum.toUpperCase().replace(/\s/g, '').replace(/^([A-Z]+)0+/, '$1');
};

export interface Flight {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  sta?: string;
  std?: string;
  eta?: string;
  etd?: string;
  date: string; // Mandatory date string (YYYY-MM-DD)
  day: number; // Offset for roster logic
  type: "Arrival" | "Departure" | "Turnaround";
  priority: "High" | "Standard" | "Low";
  aircraftType?: string;
  isFerry?: boolean; // Ferry flight — no passengers, skip CKI
}

export interface Staff {
  id: string;
  name: string;
  initials: string;
  staffId?: string;
  type: StaffCategory;
  workPattern: WorkPattern;
  isActive?: boolean;
  // Flattened for direct DB/Excel mapping
  isRamp: boolean;
  isShiftLeader: boolean;
  isOps: boolean;
  isLoadControl: boolean;
  isLostFound: boolean;
  isLabour: boolean;
  isSecurity: boolean;
  isDriver: boolean;
  isAccountant: boolean;
  powerRate: number; // 50-100
  maxShiftsPerWeek: number;
  workFromDate?: string;
  workToDate?: string;
  rosterPeriods?: { start: string; end: string }[];
  rating?: number;
  ratingSL?: number;
  ratingOps?: number;
  ratingLF?: number;
  ratingRamp?: number;
  ratingLC?: number;
}

export interface IncomingDuty {
  id: string;
  staffId: string;
  date: string; // YYYY-MM-DD of when the shift ended
  shiftEndTime: string; // HH:mm
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  type: LeaveType;
}

export interface ShiftConfig {
  id: string;
  day: number; // 0-6
  pickupDate: string; // YYYY-MM-DD
  pickupTime: string; // HH:mm
  endDate: string; // YYYY-MM-DD
  endTime: string; // HH:mm
  pickupDayOffset?: number;
  minStaff: number;
  maxStaff: number;
  targetPower?: number;
  roleCounts?: Record<string, number>;
  flightIds?: string[];
  description?: string;
  isHidden?: boolean;
}

export interface Assignment {
  id: string;
  staffId: string;
  flightId: string;
  role: string; // Changed from Skill to string to support combined roles like 'SL+LC'
  shiftId?: string;
  manualSortIndex?: number;
  note?: string;
  isExtension?: boolean;
  releaseTime?: string;
  initialShiftId?: string;
  customStartTime?: string;
  customStartDateOffset?: number; // -1 = prev day, 0 = same day (default), +1 = next day
  releaseDateOffset?: number;     // -1 = prev day, 0 = same day (default), +1 = next day
}

export interface OffDutyRecord {
  staffId: string;
  type: LeaveType;
}

export interface CkiDestOverride {
  code: string;           // IATA destination code e.g. "DXB"
  minutesBefore: number;  // minutes before STD to open counter
}

export interface CkiConfig {
  enabled: boolean;
  intlMinutesBefore: number;     // default for international flights
  domMinutesBefore: number;      // default for domestic flights
  domesticCodes: string[];       // IATA codes treated as domestic e.g. ["CAI","LXR"]
  overrides: CkiDestOverride[];  // per-destination overrides (take priority)
}

export interface LeavePolicyRule {
  leaveDays: number;         // 0 to 7 days in 7-day program
  workShifts: number;        // Deserved work shifts
  offDays: number;           // Deserved off days
  absenceDeduction: number;  // Shifts deducted from nominal capacity
}

export interface LeavePolicyConfig {
  name: string;
  cycleDays: number;
  rules: LeavePolicyRule[];
}

export const DEFAULT_LEAVE_POLICY: LeavePolicyConfig = {
  name: "Standard 7-Day Aviation Leave & Rest Policy",
  cycleDays: 7,
  rules: [
    { leaveDays: 0, workShifts: 5, offDays: 2, absenceDeduction: 0 },
    { leaveDays: 1, workShifts: 4, offDays: 2, absenceDeduction: 1 },
    { leaveDays: 2, workShifts: 3, offDays: 2, absenceDeduction: 2 },
    { leaveDays: 3, workShifts: 3, offDays: 1, absenceDeduction: 2 },
    { leaveDays: 4, workShifts: 2, offDays: 1, absenceDeduction: 3 },
    { leaveDays: 5, workShifts: 0, offDays: 2, absenceDeduction: 5 },
    { leaveDays: 6, workShifts: 1, offDays: 0, absenceDeduction: 4 },
    { leaveDays: 7, workShifts: 0, offDays: 0, absenceDeduction: 5 },
  ],
};

export interface GlobalAppSettings {
  minOffDayHours: number;
  maxOffDayHours: number;
  hideDriversOffDuty: boolean;
  hideLabourOffDuty: boolean;
  hideSecurityOffDuty: boolean;
  hideAccountantsOffDuty: boolean;
  ckiConfig?: CkiConfig;
  leavePolicy?: LeavePolicyConfig;
}

export const DEFAULT_GLOBAL_APP_SETTINGS: GlobalAppSettings = {
  minOffDayHours: 23,
  maxOffDayHours: 27,
  hideDriversOffDuty: false,
  hideLabourOffDuty: false,
  hideSecurityOffDuty: false,
  hideAccountantsOffDuty: false,
  ckiConfig: {
    enabled: false,
    intlMinutesBefore: 150,
    domMinutesBefore: 90,
    domesticCodes: ["CAI", "LXR", "HBE", "SSH", "ASW", "HRG", "MUH"],
    overrides: [],
  },
  leavePolicy: DEFAULT_LEAVE_POLICY,
};

export interface PeriodSettings {
  preparedBy?: string;
  revisedBy?: string;
  minOffDayHours?: number;
  maxOffDayHours?: number;
  hideDriversOffDuty?: boolean;
  hideLabourOffDuty?: boolean;
  hideSecurityOffDuty?: boolean;
  hideAccountantsOffDuty?: boolean;
  ckiConfig?: CkiConfig;         // CKI open time configuration
  leavePolicy?: LeavePolicyConfig; // Customizable leave & rest policy
}

export interface DailyProgram {
  day: number;
  dateString?: string;
  assignments: Assignment[];
  offDuty?: OffDutyRecord[];
  notes?: Record<string, string>;
  shiftDrivers?: Record<string, string>;
  periodSettings?: PeriodSettings;
}

export interface ProgramVersion {
  id: string;
  versionNumber: number;
  name: string;
  createdAt: string; // ISO Date
  periodStart: string;
  periodEnd: string;
  programs: DailyProgram[];
  stationHealth: number;
  isAutoSave?: boolean;
}

export interface ManualAssignment {
  staffId: string;
  shiftId: string;
  roles: string[];
}

export interface Airport {
  id: string;
  name: string;
  code: string;
}

export interface Airline {
  id: string;
  name: string;
  iata_code: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "planner";
  airport_id?: string;
  aiDailyLimit: number;
  aiWeeklyLimit: number;
  aiMonthlyLimit: number;
  maxStaff: number;
  maxShifts: number;
  isActive: boolean;
  companyLogo?: string;
  skyopsLogo?: string;
  preparedBy?: string;
  revisedBy?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  actionType: "CREATE" | "UPDATE" | "DELETE" | "GENERATE_AI" | "IMPORT";
  entityType:
    | "FLIGHT"
    | "STAFF"
    | "SHIFT"
    | "PROGRAM"
    | "LEAVE"
    | "USER_PROFILE"
    | "DATABASE";
  entityId: string;
  details: string;
  createdAt: string;
}

export interface ProgramData {
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  programs: DailyProgram[];
  leaveRequests?: LeaveRequest[];
  incomingDuties?: IncomingDuty[];
  manualAssignments?: ManualAssignment[];
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }

  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }
}


export const isStaffActiveOnDate = (staff: Staff, dateString: string): boolean => {
  if (staff.isActive === false) return false;
  
  // Deactivation date overrides everything
  if (staff.workToDate && dateString > staff.workToDate) return false;
  
  if (staff.type === "Roster") {
    // If they have roster periods, they are active only during those periods
    if (staff.rosterPeriods && staff.rosterPeriods.length > 0) {
      return staff.rosterPeriods.some(p => dateString >= p.start && dateString <= p.end);
    }
  }
  
  if (staff.workFromDate && dateString < staff.workFromDate) return false;
  
  return true;
};


export const isStaffActiveInPeriod = (staff: Staff, programs: DailyProgram[]): boolean => {
  if (programs.length === 0) return staff.isActive !== false;
  return programs.some(p => isStaffActiveOnDate(staff, p.dateString!));
};

export const isStaffActiveForDateRange = (staff: Staff, startDateStr: string, endDateStr: string): boolean => {
  if (staff.isActive === false) return false;
  if (staff.workToDate && startDateStr > staff.workToDate) return false;
  if (staff.workFromDate && endDateStr < staff.workFromDate) return false;
  
  if (staff.type === "Roster" && staff.rosterPeriods && staff.rosterPeriods.length > 0) {
    return staff.rosterPeriods.some(p => 
      // Check if period overlaps with date range
      p.start <= endDateStr && p.end >= startDateStr
    );
  }
  
  return true;
};

// ── C&G Rating Interfaces & Formulas ──
export interface CgConfig {
  id?: string;
  weight_exp: number;
  weight_thr: number;
  weight_acc: number;
  exp_t1_years: number;
  exp_t1_score: number;
  exp_t2_years: number;
  exp_t2_score: number;
  exp_t3_years: number;
  exp_t3_score: number;
  exp_t4_years: number;
  exp_t4_score: number;
  exp_t5_score: number;
  thr_t1_pax: number;
  thr_t1_score: number;
  thr_t2_pax: number;
  thr_t2_score: number;
  thr_t3_pax: number;
  thr_t3_score: number;
  thr_t4_pax: number;
  thr_t4_score: number;
  thr_t5_score: number;
  acc_t1_err: number;
  acc_t1_score: number;
  acc_t2_err: number;
  acc_t2_score: number;
  acc_t3_err: number;
  acc_t3_score: number;
  acc_t4_err: number;
  acc_t4_score: number;
  acc_t5_err: number;
  acc_t5_score: number;
  acc_t6_score: number;
  updated_at?: string;
}

export interface CgRating {
  id?: string;
  staff_id: string;
  years_exp: number;
  pax_per_flight: number;
  errors_per_150: number;
  score_exp: number;
  score_thr: number;
  score_acc: number;
  cg_score: number;
  updated_at?: string;
}

export interface StaffCgRating extends Staff {
  years_exp: number;
  pax_per_flight: number;
  errors_per_150: number;
  score_exp: number;
  score_thr: number;
  score_acc: number;
  cg_score: number;
  rating_id?: string;
  rating_updated_at?: string;
}

export type CgLevel = "Weak" | "Moderate" | "Good" | "Excellent";

export const DEFAULT_CG_CONFIG: CgConfig = {
  weight_exp: 30,
  weight_thr: 45,
  weight_acc: 25,
  exp_t1_years: 1,
  exp_t1_score: 20,
  exp_t2_years: 3,
  exp_t2_score: 40,
  exp_t3_years: 6,
  exp_t3_score: 60,
  exp_t4_years: 10,
  exp_t4_score: 80,
  exp_t5_score: 100,

  thr_t1_pax: 30,
  thr_t1_score: 25,
  thr_t2_pax: 40,
  thr_t2_score: 50,
  thr_t3_pax: 50,
  thr_t3_score: 75,
  thr_t4_pax: 60,
  thr_t4_score: 87,
  thr_t5_score: 100,

  acc_t1_err: 0,
  acc_t1_score: 100,
  acc_t2_err: 0.25,
  acc_t2_score: 90,
  acc_t3_err: 0.5,
  acc_t3_score: 75,
  acc_t4_err: 1,
  acc_t4_score: 60,
  acc_t5_err: 3,
  acc_t5_score: 40,
  acc_t6_score: 20,
};

export function getExpScore(years: number, c: CgConfig = DEFAULT_CG_CONFIG): number {
  if (years < c.exp_t1_years) return c.exp_t1_score;
  if (years < c.exp_t2_years) return c.exp_t2_score;
  if (years < c.exp_t3_years) return c.exp_t3_score;
  if (years <= c.exp_t4_years) return c.exp_t4_score;
  return c.exp_t5_score;
}

export function getThrScore(pax: number, c: CgConfig = DEFAULT_CG_CONFIG): number {
  if (pax < c.thr_t1_pax) return c.thr_t1_score;
  if (pax < c.thr_t2_pax) return c.thr_t2_score;
  if (pax < c.thr_t3_pax) return c.thr_t3_score;
  if (pax < c.thr_t4_pax) return c.thr_t4_score;
  return c.thr_t5_score;
}

export function getAccScore(err: number, c: CgConfig = DEFAULT_CG_CONFIG): number {
  if (err <= c.acc_t1_err) return c.acc_t1_score;
  if (err <= c.acc_t2_err) return c.acc_t2_score;
  if (err <= c.acc_t3_err) return c.acc_t3_score;
  if (err <= c.acc_t4_err) return c.acc_t4_score;
  if (err <= c.acc_t5_err) return c.acc_t5_score;
  return c.acc_t6_score;
}

export function calcCgScore(
  years: number,
  pax: number,
  err: number,
  c: CgConfig = DEFAULT_CG_CONFIG
): { expS: number; thrS: number; accS: number; cg: number } {
  const expS = getExpScore(years, c);
  const thrS = getThrScore(pax, c);
  const accS = getAccScore(err, c);
  const cg = Math.round(
    expS * (c.weight_exp / 100) +
    thrS * (c.weight_thr / 100) +
    accS * (c.weight_acc / 100)
  );
  return { expS, thrS, accS, cg };
}

export function getCgLevel(score: number): {
  label: CgLevel;
  color: string;
  bg: string;
  border: string;
  text: string;
  barColor: string;
} {
  if (score >= 90) {
    return {
      label: "Excellent",
      color: "emerald",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      barColor: "bg-emerald-500",
    };
  }
  if (score >= 70) {
    return {
      label: "Good",
      color: "indigo",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-700",
      barColor: "bg-indigo-500",
    };
  }
  if (score >= 50) {
    return {
      label: "Moderate",
      color: "amber",
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-700",
      barColor: "bg-amber-500",
    };
  }
  return {
    label: "Weak",
    color: "rose",
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    barColor: "bg-rose-500",
  };
}

export type RosterChangeType =
  | "SHIFT_CHANGE"
  | "DAY_OFF_TO_WORK"
  | "WORK_TO_DAY_OFF"
  | "STAFF_ADDED"
  | "STAFF_REMOVED"
  | "SHIFT_TIME_CHANGE";

export interface RosterUpdate {
  id: string;
  change_type: RosterChangeType | string;
  staff_id?: string | null;
  staff_name?: string | null;
  staff_initials?: string | null;
  from_value?: string | null;
  to_value?: string | null;
  affected_date?: string | null;
  from_shift_id?: string | null;
  to_shift_id?: string | null;
  from_shift_name?: string | null;
  to_shift_name?: string | null;
  changed_by_id?: string | null;
  changed_by_name?: string | null;
  changed_at?: string;
  week_start?: string | null;
  airport_id?: string | null;
}

export interface UpdateLogEntry {
  change_type: RosterChangeType | string;
  staff_id?: string;
  staff_name?: string;
  staff_initials?: string;
  from_value?: string;
  to_value?: string;
  affected_date?: string;
  from_shift_id?: string;
  to_shift_id?: string;
  from_shift_name?: string;
  to_shift_name?: string;
  week_start?: string;
  airport_id?: string;
}
