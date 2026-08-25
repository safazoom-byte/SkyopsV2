import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  DailyProgram,
  Flight,
  Staff,
  ShiftConfig,
  LeaveRequest,
  IncomingDuty,
  Skill,
  ProgramVersion,
  ManualAssignment,
  PeriodSettings,
  CgRating,
  CgConfig,
  DEFAULT_CG_CONFIG,
  calcCgScore,
  isStaffActiveOnDate,
  isStaffActiveInPeriod,
  CkiConfig,
  CkiDestOverride,
  LeavePolicyConfig,
} from "../types";
import {
  getStoredLeavePolicy,
  calculateStaffLeaveAllowance,
  LEAVE_POLICY_UPDATED_EVENT,
} from "../services/leavePolicyService";

const getStaffRoleRating = (st: Staff | undefined | null, role: string) => {
  if (!st) return 100;
  if (role === "SL" || role === "Shift Leader") return st.ratingSL != null ? Number(st.ratingSL) : (st.rating != null ? Number(st.rating) : 100);
  if (role === "RMP" || role === "Ramp") return st.ratingRamp != null ? Number(st.ratingRamp) : (st.rating != null ? Number(st.rating) : 100);
  if (role === "OPS" || role === "Operations") return st.ratingOps != null ? Number(st.ratingOps) : (st.rating != null ? Number(st.rating) : 100);
  if (role === "LF" || role === "Lost and Found") return st.ratingLF != null ? Number(st.ratingLF) : (st.rating != null ? Number(st.rating) : 100);
  if (role === "LC" || role === "Load Control") return st.ratingLC != null ? Number(st.ratingLC) : (st.rating != null ? Number(st.rating) : 100);
  return st.rating != null ? Number(st.rating) : 100;
};
import { ProgramCheck } from "./ProgramCheck";
import {
  FileDown,
  CalendarDays,
  Users,
  Plane,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Printer,
  Clock,
  RotateCcw,
  Save,
  History,
  Trash2,
  Eye,
  Lock,
  Unlock,
  ShieldCheck,
  MessageSquare,
  X,
  Edit3,
  Settings,
  Plus,
} from "lucide-react";
import { DAYS_OF_WEEK_FULL, AVAILABLE_SKILLS } from "../constants";
import { db, supabase, logRosterUpdate } from "../services/supabaseService";
import { UpdatesTab } from "./UpdatesTab";
import { UserProfile, GlobalAppSettings, DEFAULT_GLOBAL_APP_SETTINGS } from "../types";

interface Props {
  programs: DailyProgram[];
  flights: Flight[];
  staff: Staff[];
  shifts: ShiftConfig[];
  leaveRequests: LeaveRequest[];
  incomingDuties: IncomingDuty[];
  manualAssignments?: ManualAssignment[];
  startDate: string;
  endDate: string;
  stationHealth: number;
  alerts: { type: "danger" | "warning"; message: string }[];
  minRestHours: number;
  currentUser?: UserProfile | null;
  onUpdatePrograms: (p: DailyProgram[], changedDates?: string[]) => void;
  onRestoreVersion: (v: ProgramVersion) => void;
  onUpdateLeaves?: (l: LeaveRequest[]) => void;
  getLatestPrograms?: () => DailyProgram[];
  getLatestLeaveRequests?: () => LeaveRequest[];
}

export const ProgramDisplay: React.FC<Props> = ({
  programs,
  flights,
  staff,
  shifts,
  leaveRequests,
  incomingDuties,
  manualAssignments = [],
  startDate,
  endDate,
  stationHealth,
  minRestHours,
  currentUser,
  onUpdatePrograms,
  onRestoreVersion,
  onUpdateLeaves,
  getLatestPrograms,
  getLatestLeaveRequests,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingStaffPdf, setIsGeneratingStaffPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [versions, setVersions] = useState<ProgramVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "Daily" | "Program Check" | "Matrix" | "Roles" | "Staff Checks" | "Updates Logs"
  >("Daily");
  const [unlockAbsences, setUnlockAbsences] = useState(false);
  const [noteModal, setNoteModal] = useState<{dateString: string, shiftId: string, currentNote: string} | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [versionNameModal, setVersionNameModal] = useState<{open: boolean, name: string}>({open: false, name: ""});
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const jumpRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  const [referencePrograms, setReferencePrograms] = useState<DailyProgram[]>(programs);

  const [periodPreparedBy, setPeriodPreparedBy] = useState("");
  const [periodRevisedBy, setPeriodRevisedBy] = useState("");
  const [minOffDayHours, setMinOffDayHours] = useState(23);
  const [maxOffDayHours, setMaxOffDayHours] = useState(27);
  const [hideDriversOffDuty, setHideDriversOffDuty] = useState(false);
  const [hideLabourOffDuty, setHideLabourOffDuty] = useState(false);
  const [hideSecurityOffDuty, setHideSecurityOffDuty] = useState(false);
  const [hideAccountantsOffDuty, setHideAccountantsOffDuty] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeCkiConfig, setActiveCkiConfig] = useState<CkiConfig>({
    enabled: false,
    intlMinutesBefore: 150,
    domMinutesBefore: 90,
    domesticCodes: ["CAI", "LXR", "HBE", "SSH", "ASW", "HRG", "MUH"],
    overrides: [],
  });

  const [userProfile, setUserProfile] = useState<any>(null);
  const [cgRatingsMap, setCgRatingsMap] = useState<Record<string, CgRating>>({});
  const [cgConfig, setCgConfig] = useState<CgConfig>(DEFAULT_CG_CONFIG);
  const [leavePolicy, setLeavePolicy] = useState<LeavePolicyConfig>(getStoredLeavePolicy);

  useEffect(() => {
    const handlePolicyUpdate = () => {
      setLeavePolicy(getStoredLeavePolicy());
    };
    window.addEventListener(LEAVE_POLICY_UPDATED_EVENT, handlePolicyUpdate);
    return () => {
      window.removeEventListener(LEAVE_POLICY_UPDATED_EVENT, handlePolicyUpdate);
    };
  }, []);

  // Temporary state for the modal form inputs
  const [tempPrep, setTempPrep] = useState("");
  const [tempRev, setTempRev] = useState("");
  const [tempMinOff, setTempMinOff] = useState("23");
  const [tempMaxOff, setTempMaxOff] = useState("27");
  const [tempHideDrivers, setTempHideDrivers] = useState(false);
  const [tempHideLabour, setTempHideLabour] = useState(false);
  const [tempHideSecurity, setTempHideSecurity] = useState(false);
  const [tempHideAccountants, setTempHideAccountants] = useState(false);

  // Temporary state for CKI in modal
  const [tempCkiEnabled, setTempCkiEnabled] = useState(false);
  const [tempCkiIntlMins, setTempCkiIntlMins] = useState("150");
  const [tempCkiDomMins, setTempCkiDomMins] = useState("90");
  const [tempCkiDomCodes, setTempCkiDomCodes] = useState("CAI, LXR, HBE, SSH, ASW, HRG, MUH");
  const [tempCkiOverrides, setTempCkiOverrides] = useState<CkiDestOverride[]>([]);
  const [newOverrideCode, setNewOverrideCode] = useState("");
  const [newOverrideMins, setNewOverrideMins] = useState("180");

  useEffect(() => {
    const fetchProfileAndCg = async () => {
      try {
        if (supabase) {
          const prof = await db.getUserProfile(true);
          setUserProfile(prof);
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      }

      try {
        const [fetchedRatings, fetchedConfig] = await Promise.all([
          db.getCgRatings(),
          db.getCgConfig(),
        ]);
        const map: Record<string, CgRating> = {};
        (fetchedRatings || []).forEach((r) => {
          map[r.staff_id] = r;
        });
        setCgRatingsMap(map);
        if (fetchedConfig) {
          setCgConfig(fetchedConfig);
        }
      } catch (err) {
        console.error("Error loading C&G data in ProgramDisplay:", err);
      }
    };
    fetchProfileAndCg();

    // Fetch and subscribe to global app settings from DB (syncs across all devices & users)
    const loadGlobalSettings = async () => {
      try {
        const globalSettings = await db.getGlobalAppSettings();
        setMinOffDayHours(globalSettings.minOffDayHours ?? 23);
        setMaxOffDayHours(globalSettings.maxOffDayHours ?? 27);
        setHideDriversOffDuty(!!globalSettings.hideDriversOffDuty);
        setHideLabourOffDuty(!!globalSettings.hideLabourOffDuty);
        setHideSecurityOffDuty(!!globalSettings.hideSecurityOffDuty);
        setHideAccountantsOffDuty(!!globalSettings.hideAccountantsOffDuty);
        if (globalSettings.ckiConfig) {
          setActiveCkiConfig(globalSettings.ckiConfig);
        }
      } catch (err) {
        console.error("Error loading global app settings:", err);
      }
    };
    loadGlobalSettings();

    const unsubscribeGlobal = db.subscribeGlobalAppSettings((updatedSettings) => {
      setMinOffDayHours(updatedSettings.minOffDayHours ?? 23);
      setMaxOffDayHours(updatedSettings.maxOffDayHours ?? 27);
      setHideDriversOffDuty(!!updatedSettings.hideDriversOffDuty);
      setHideLabourOffDuty(!!updatedSettings.hideLabourOffDuty);
      setHideSecurityOffDuty(!!updatedSettings.hideSecurityOffDuty);
      setHideAccountantsOffDuty(!!updatedSettings.hideAccountantsOffDuty);
      if (updatedSettings.ckiConfig) {
        setActiveCkiConfig(updatedSettings.ckiConfig);
      }
    });

    return () => {
      if (unsubscribeGlobal) unsubscribeGlobal();
    };
  }, []);

  // Signatures (Staff Excel) are strictly tied to the active program period (startDate to endDate)
  useEffect(() => {
    const keyPrefix = `${startDate}_${endDate}`;
    const savedPrep = localStorage.getItem(`prep_${keyPrefix}`);
    const savedRev = localStorage.getItem(`rev_${keyPrefix}`);

    const activeRangePrograms = programs.filter(
      (p) => p.dateString && p.dateString >= startDate && p.dateString <= endDate
    );
    const dbSettings = activeRangePrograms.find((p) => p.periodSettings !== undefined)?.periodSettings;

    let activePrep = "";
    let activeRev = "";

    if (dbSettings) {
      activePrep = dbSettings.preparedBy ?? (savedPrep !== null ? savedPrep : "");
      activeRev = dbSettings.revisedBy ?? (savedRev !== null ? savedRev : "");
    } else {
      if (savedPrep !== null) {
        activePrep = savedPrep;
      }
      if (savedRev !== null) {
        activeRev = savedRev;
      }
    }

    setPeriodPreparedBy(activePrep);
    setPeriodRevisedBy(activeRev);
  }, [startDate, endDate, programs]);

  const handleSaveSettings = async (
    prep: string,
    rev: string,
    minH: number,
    maxH: number,
    ckiConf?: CkiConfig
  ) => {
    // 1. Signatures strictly saved per active program period
    const keyPrefix = `${startDate}_${endDate}`;
    localStorage.setItem(`prep_${keyPrefix}`, prep);
    localStorage.setItem(`rev_${keyPrefix}`, rev);
    setPeriodPreparedBy(prep);
    setPeriodRevisedBy(rev);

    // 2. All other settings saved globally to Supabase and synced across all devices
    const globalPayload: GlobalAppSettings = {
      minOffDayHours: minH,
      maxOffDayHours: maxH,
      hideDriversOffDuty: tempHideDrivers,
      hideLabourOffDuty: tempHideLabour,
      hideSecurityOffDuty: tempHideSecurity,
      hideAccountantsOffDuty: tempHideAccountants,
      ckiConfig: ckiConf || activeCkiConfig,
    };

    setMinOffDayHours(minH);
    setMaxOffDayHours(maxH);
    setHideDriversOffDuty(tempHideDrivers);
    setHideLabourOffDuty(tempHideLabour);
    setHideSecurityOffDuty(tempHideSecurity);
    setHideAccountantsOffDuty(tempHideAccountants);
    if (ckiConf) {
      setActiveCkiConfig(ckiConf);
    }

    // Persist global settings to DB in background
    db.upsertGlobalAppSettings(globalPayload).catch((err) => {
      console.warn("Failed to sync global settings to DB:", err);
    });

    // 3. Save signatures to the current program period in DB
    const newPeriodSettings: PeriodSettings = {
      preparedBy: prep,
      revisedBy: rev,
      minOffDayHours: minH,
      maxOffDayHours: maxH,
      hideDriversOffDuty: tempHideDrivers,
      hideLabourOffDuty: tempHideLabour,
      hideSecurityOffDuty: tempHideSecurity,
      hideAccountantsOffDuty: tempHideAccountants,
      ckiConfig: ckiConf || activeCkiConfig,
    };

    // Calculate all date strings in [startDate...endDate]
    const affectedDates: string[] = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      affectedDates.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }

    const dateMap = new Map<string, DailyProgram>();
    programs.forEach((p) => {
      if (p.dateString) dateMap.set(p.dateString, { ...p });
    });

    affectedDates.forEach((dStr) => {
      const existing = dateMap.get(dStr);
      if (existing) {
        existing.periodSettings = newPeriodSettings;
      } else {
        dateMap.set(dStr, {
          day: new Date(dStr).getDay() + 1,
          dateString: dStr,
          assignments: [],
          offDuty: [],
          notes: {},
          shiftDrivers: {},
          periodSettings: newPeriodSettings,
        });
      }
    });

    const updatedPrograms = Array.from(dateMap.values());

    try {
      if (onUpdatePrograms) {
        await onUpdatePrograms(updatedPrograms, affectedDates);
      }
    } catch (err) {
      console.error("Error saving program-period settings to DB:", err);
    }

    setShowSettingsModal(false);
  };

  const isOffDutyVisible = (s: Staff) => {
    if (hideDriversOffDuty && s.isDriver) return false;
    if (hideLabourOffDuty && s.isLabour) return false;
    if (hideSecurityOffDuty && s.isSecurity) return false;
    if (hideAccountantsOffDuty && s.isAccountant) return false;
    return true;
  };

  // Live C&G rate lookup for staff
  const getStaffCgRate = (st: Staff | undefined | null): number => {
    if (!st) return 100;
    const r = cgRatingsMap[st.id];
    if (r) {
      if (r.cg_score !== undefined && r.cg_score !== null && r.cg_score > 0) {
        return r.cg_score;
      }
      const { cg } = calcCgScore(r.years_exp, r.pax_per_flight, r.errors_per_150, cgConfig);
      return cg;
    }
    if (st.rating !== undefined && st.rating !== null && st.rating !== 100) {
      return st.rating;
    }
    // Default fallback from calcCgScore with 0 years, 0 pax, 0 err
    const { cg } = calcCgScore(0, 0, 0, cgConfig);
    return cg;
  };

  useEffect(() => {
    if (referencePrograms.length === 0 && programs.length > 0) {
      setReferencePrograms(programs);
    }
  }, [programs, referencePrograms]);

  const handleMarkAllCopied = () => {
    setReferencePrograms(programs);
  };

  const latestProgramsRef = useRef(programs);
  const latestVersionsRef = useRef(versions);
  const latestStationHealthRef = useRef(stationHealth);
  const lastSavedStringifiedRef = useRef<string>("");

  useEffect(() => {
    latestProgramsRef.current = programs;
  }, [programs]);

  useEffect(() => {
    latestVersionsRef.current = versions;
  }, [versions]);
  
  useEffect(() => {
    latestStationHealthRef.current = stationHealth;
  }, [stationHealth]);


  useEffect(() => {
    const loadVersions = async () => {
      let allVersions: ProgramVersion[] = [];
      
      if (supabase) {
        const dbVersions = await db.getProgramVersions();
        if (dbVersions.length > 0) {
          allVersions = dbVersions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
      }
      
      if (allVersions.length > 0) {
        setVersions(allVersions);
      }
    };
    loadVersions();
  }, []);

  const saveVersion = () => {
    setVersionNameModal({ open: true, name: `Version ${versions.length + 1}` });
  };

  const confirmSaveVersion = async (name: string) => {
    if (!name.trim()) return;
    setVersionNameModal({ open: false, name: "" });

    const newVersion: ProgramVersion = {
      id: crypto.randomUUID(),
      versionNumber: versions.length + 1,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      periodStart: startDate,
      periodEnd: endDate,
      programs: JSON.parse(JSON.stringify(programs)),
      stationHealth,
      isAutoSave: false,
    };

    let updatedVersions = [newVersion, ...versions];
    const versionsToDelete = updatedVersions.slice(10);
    if (updatedVersions.length > 10) updatedVersions = updatedVersions.slice(0, 10);
    setVersions(updatedVersions);

    if (supabase) {
      await db.saveProgramVersion(newVersion);
      for (const old of versionsToDelete) await db.deleteProgramVersion(old.id);
    }
  };

  const deleteVersion = async (id: string) => {
    if (!confirm("Are you sure you want to delete this version?")) return;
    const updated = versions.filter((v) => v.id !== id);
    setVersions(updated);
    if (supabase) {
      await db.deleteProgramVersion(id);
    }
  };

  const restoreVersion = (v: ProgramVersion) => {
    if (
      !confirm(
        `Restore version "${v.name}"? Current unsaved changes will be lost.`,
      )
    )
      return;
    onRestoreVersion(v);
    setShowHistory(false);
  };
  const activePrograms = React.useMemo(() => {
    const map = new Map<string, DailyProgram>();
    programs.forEach((p) => {
      if (p.dateString && p.dateString >= startDate && p.dateString <= endDate) {
        map.set(p.dateString, p);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      (a.dateString || "").localeCompare(b.dateString || "")
    );
  }, [programs, startDate, endDate]);


  const getStaff = (id: string) => staff.find((s) => s.id === id);
  const getFlight = (id: string) => flights.find((f) => f.id === id);
  const getShift = (id: string) => shifts.find((s) => s.id === id);

  const sortAssignments = (assignments: any[]) => {
    return [...assignments].sort((a, b) => {
      const stA = getStaff(a.staffId);
      const stB = getStaff(b.staffId);
      if (!stA && !stB) return 0;
      if (!stA) return 1;
      if (!stB) return -1;

      // Group ranks: 1 = Traffic, 2 = Security, 3 = Labour
      const getGroupRank = (st: any) => {
        if (st.isLabour) return 3;
        if (st.isSecurity) return 2;
        return 1; // Traffic staff (includes other non-labour/non-security roles)
      };

      const rankA = getGroupRank(stA);
      const rankB = getGroupRank(stB);
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      // Within Traffic group, keep Shift Leaders and Load Control first
      if (rankA === 1) {
        const getTrafficSubRank = (assig: any, st: any) => {
          if (
            assig.role === "SL" ||
            assig.role === "Shift Leader" ||
            st.isShiftLeader ||
            st.initials.toUpperCase() === "SK-ATZ"
          )
            return 1;
          if (
            assig.role === "LC" ||
            assig.role === "Load Control" ||
            st.isLoadControl
          )
            return 2;
          return 3;
        };
        const subRankA = getTrafficSubRank(a, stA);
        const subRankB = getTrafficSubRank(b, stB);
        if (subRankA !== subRankB) {
          return subRankA - subRankB;
        }
      }

      // Respect manual sort index if they differ
      const aSort = a.manualSortIndex || 0;
      const bSort = b.manualSortIndex || 0;
      if (aSort !== bSort) {
        return aSort - bSort;
      }

      // Fallback: alphabetical by initials
      return (stA.initials || "").localeCompare(stB.initials || "");
    });
  };

  const sortAssignmentsForPDF = (assignments: any[]) => {
    return [...assignments].sort((a, b) => {
      const aSort = a.manualSortIndex || 0;
      const bSort = b.manualSortIndex || 0;
      if (aSort !== bSort) {
        return aSort - bSort;
      }

      const stA = getStaff(a.staffId);
      const stB = getStaff(b.staffId);
      const score = (assig: any, st: any) => {
        if (!st) return 100;
        if (
          assig.role === "SL" ||
          assig.role === "Shift Leader" ||
          st.isShiftLeader ||
          st.initials.toUpperCase() === "SK-ATZ"
        )
          return 1;
        if (
          assig.role === "LC" ||
          assig.role === "Load Control" ||
          st.isLoadControl
        )
          return 2;
        if (st.isLabour) return 10;
        return 5;
      };
      return score(a, stA) - score(b, stB);
    });
  };

  const getAssignmentStartDateTime = (dateString: string, shiftPickupTime: string, customStartTime?: string): Date => {
    const startStr = customStartTime || shiftPickupTime;
    const [ph, pm] = startStr.split(":").map(Number);
    const dt = new Date(`${dateString}T12:00:00Z`);
    dt.setHours(ph, pm, 0, 0);

    // If customStartTime was given as late evening (e.g. >= 18:00)
    // but the original shift is in the early morning (e.g. <= 06:00),
    // then the shift actually started the previous night!
    if (customStartTime) {
      const [origH] = shiftPickupTime.split(":").map(Number);
      if (ph >= 18 && origH <= 6) {
        dt.setUTCDate(dt.getUTCDate() - 1);
      }
    }
    return dt;
  };

  const getAssignmentEndDateTime = (dateString: string, shiftPickupTime: string, shiftEndTime: string, customStartTime?: string, releaseTime?: string): Date => {
    const startDt = getAssignmentStartDateTime(dateString, shiftPickupTime, customStartTime);
    const endStr = releaseTime || shiftEndTime;
    const [sh, sm] = endStr.split(":").map(Number);
    
    // Base end datetime on the start datetime's date
    const endDt = new Date(startDt);
    endDt.setHours(sh, sm, 0, 0);
    
    // If end time is earlier than or equal to start time, it crossed midnight into next day
    if (endDt.getTime() <= startDt.getTime()) {
      endDt.setUTCDate(endDt.getUTCDate() + 1);
    }
    return endDt;
  };

  const getStaffDayWorkingHours = (staffId: string, dateString: string, pAssignments?: any[]) => {
    const assigns = (pAssignments || (programs.find(p => p.dateString === dateString)?.assignments || [])).filter(
      (a: any) => {
        const ts = getShift(a.shiftId || "");
        return a.staffId === staffId && ts && !ts.isHidden;
      }
    );
    if (assigns.length === 0) return 0;

    // Check if there is an extended continuous duty sequence
    const hasExt = assigns.some((a: any) => a.isExtension || assigns.some((other: any) => other.isExtension && other.initialShiftId === a.shiftId));
    if (hasExt) {
      // Find the earliest start time among the assignments on that date
      let earliestTime = Infinity;
      let latestEndTime = -Infinity;

      assigns.forEach((a: any) => {
        const ts = getShift(a.shiftId || "");
        if (!ts) return;
        const startDt = getAssignmentStartDateTime(dateString, ts.pickupTime, a.customStartTime);
        const endDt = getAssignmentEndDateTime(dateString, ts.pickupTime, ts.endTime, a.customStartTime, a.releaseTime);
        
        if (startDt.getTime() < earliestTime) earliestTime = startDt.getTime();
        if (endDt.getTime() > latestEndTime) latestEndTime = endDt.getTime();
      });

      if (earliestTime !== Infinity && latestEndTime !== -Infinity) {
        return Math.max(0, (latestEndTime - earliestTime) / (1000 * 60 * 60));
      }
    }

    return assigns.reduce((sum: number, a: any) => sum + getShiftHours(a.shiftId || "", a, dateString), 0);
  };

  const getShiftHours = (shiftId: string, assign?: any, dateString?: string) => {
    const shift = getShift(shiftId);
    if (!shift) return 0;
    const baseDate = dateString || shift.pickupDate || startDate;
    const startDt = getAssignmentStartDateTime(baseDate, shift.pickupTime, assign?.customStartTime);
    const endDt = getAssignmentEndDateTime(baseDate, shift.pickupTime, shift.endTime, assign?.customStartTime, assign?.releaseTime);
    const diffMs = endDt.getTime() - startDt.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60));
  };

  const getStaffTotalHours = (staffId: string) => {
    return activePrograms.reduce((acc, p) => {
      return acc + getStaffDayWorkingHours(staffId, p.dateString || "", p.assignments);
    }, 0);
  };


  const activeStaff = React.useMemo(() => staff.filter((s) => isStaffActiveInPeriod(s, activePrograms)), [staff, activePrograms]);

  const sortFlightsByTime = (flightIds: string[], shiftPickupTime: string) => {
    return flightIds
      .map((fid) => getFlight(fid))
      .filter(Boolean)
      .sort((a, b) => {
        const getFlightTime = (f: any) => {
          if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
            return f.sta;
          }
          if (f?.std && f.std.trim() !== "" && f.std !== "---") {
            return f.std;
          }
          return "";
        };
        const getMinutes = (fTime: string) => {
          if (!fTime || fTime.toUpperCase().includes("NS") || fTime.includes("---")) return 9999;
          const parts = fTime.split(":");
          const fh = parseInt(parts[0]) || 0;
          const fm = parseInt(parts[1]) || 0;
          const ph = parseInt(shiftPickupTime.split(":")[0]) || 0;
          let totalMins = fh * 60 + fm;
          if (ph >= 12 && fh < 12) {
            totalMins += 24 * 60;
          }
          return totalMins;
        };
        return getMinutes(getFlightTime(a)) - getMinutes(getFlightTime(b));
      })
      .map((f) => f!.flightNumber)
      .join(" / ") || "NIL";
  };

  const leaveMapByStaff = React.useMemo(() => {
    const map: Record<string, LeaveRequest[]> = {};
    leaveRequests.forEach((l) => {
      if (!map[l.staffId]) map[l.staffId] = [];
      map[l.staffId].push(l);
    });
    return map;
  }, [leaveRequests]);

  const hasLeaveOnDate = React.useCallback(
    (staffId: string, dateString: string, excludeDayOff = false) => {
      const leaves = leaveMapByStaff[staffId];
      if (!leaves) return null;
      return leaves.find((l) => {
        if (excludeDayOff && l.type === "Day off") return false;
        return l.startDate <= dateString && l.endDate >= dateString;
      });
    },
    [leaveMapByStaff],
  );

  const totalAssignments = activePrograms.reduce(
    (acc, p) => acc + p.assignments.length,
    0,
  );
  const isFailedGeneration = false; // We no longer block on empty assignments

  const incomingDutiesByStaff = React.useMemo(() => {
    const map: Record<string, IncomingDuty[]> = {};
    incomingDuties.forEach(d => {
      if (!map[d.staffId]) map[d.staffId] = [];
      map[d.staffId].push(d);
    });
    return map;
  }, [incomingDuties]);

  const assignmentsByStaff = React.useMemo(() => {
    const map: Record<string, (DailyProgram['assignments'][number] & { dateString: string })[]> = {};
    programs.forEach(p => {
      const pDate = p.dateString || startDate;
      p.assignments.forEach(a => {
        if (!map[a.staffId]) map[a.staffId] = [];
        map[a.staffId].push({ ...a, dateString: pDate });
      });
    });
    return map;
  }, [programs, startDate]);

  const calculateRestHours = (
    staffId: string,
    currentShiftStart: Date,
  ): number | null => {
    let lastEndTime: Date | null = null;
    const staffIncoming = incomingDutiesByStaff[staffId] || [];
    
    staffIncoming.forEach((d) => {
      let dateStr = d.date;
      if (!dateStr) {
        const pd = new Date(`${startDate}T12:00:00Z`);
        pd.setUTCDate(pd.getUTCDate() - 1);
        dateStr = pd.toISOString().split("T")[0];
      }
      const dt = new Date(`${dateStr}T${d.shiftEndTime}`);
      if (dt <= currentShiftStart && (!lastEndTime || dt > lastEndTime)) {
        lastEndTime = dt;
      }
    });

    const assigns = assignmentsByStaff[staffId] || [];
    assigns.forEach((a) => {
      const s = getShift(a.shiftId || "");
      if (s) {
        const startDt = getAssignmentStartDateTime(a.dateString, s.pickupTime, a.customStartTime);
        const endDt = getAssignmentEndDateTime(a.dateString, s.pickupTime, s.endTime, a.customStartTime, a.releaseTime);
        
        // We only consider previous shifts (ones that started before this current one).
        // If they end after currentShiftStart, diffMs will be negative and throw a warning.
        if (
          startDt.getTime() < currentShiftStart.getTime() &&
          (!lastEndTime || endDt.getTime() > lastEndTime.getTime())
        ) {
          lastEndTime = endDt;
        }
      }
    });
    
    if (!lastEndTime) return null;
    const diffMs = currentShiftStart.getTime() - (lastEndTime as Date).getTime();
    return parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1));
  };

  const generateFullReport = async () => {
    setIsGeneratingPdf(true);
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF("l", "mm", "a4");

    // --- 1. DAILY PROGRAM PAGES ---
    activePrograms.forEach((prog, index) => {
      if (index > 0) doc.addPage();

      const currentDate = new Date(`${prog.dateString || startDate}T12:00:00Z`);
      const dateStr = `${DAYS_OF_WEEK_FULL[currentDate.getUTCDay()].toUpperCase()} - ${currentDate.getUTCDate()}/${currentDate.getUTCMonth() + 1}/${currentDate.getUTCFullYear()}`;

      // Header
      doc.setFillColor(255, 255, 255);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("SkyOPS Station Handling Program", 14, 15);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Target Period: ${startDate} to ${endDate}`, 14, 22);

      let contentStartY = 35;

      // --- REST LOG TABLE ---
      if (index === 0) {
        const groupedMap = new Map<string, string[]>();

        incomingDuties.forEach((d) => {
          const dateStr = d.date || startDate;
          const dDate = new Date(`${dateStr}T12:00:00Z`);
          const sDate = new Date(`${startDate}T12:00:00Z`);
          const diffTime = sDate.getTime() - dDate.getTime();
          const diffDays = diffTime / (1000 * 3600 * 24);

          if (diffDays >= 0 && diffDays <= 2) {
            const key = `${dateStr}|${d.shiftEndTime}`;
            const st = getStaff(d.staffId);
            if (st) {
              const existing = groupedMap.get(key) || [];
              existing.push(st.initials);
              groupedMap.set(key, existing);
            }
          }
        });

        const sortedKeys = Array.from(groupedMap.keys()).sort();

        if (sortedKeys.length > 0) {
          const restRows = sortedKeys.map((key, i) => {
            const [dDate, dTime] = key.split("|");
            const endDt = new Date(`${dDate}T${dTime}`);
            const releaseDt = new Date(
              endDt.getTime() + minRestHours * 60 * 60 * 1000,
            );

            const isPrevDay = new Date(dDate) < new Date(`${startDate}T12:00:00Z`);
            const dateLabel = isPrevDay
              ? "Prev Day"
              : `${endDt.getUTCDate()}/${endDt.getMonth() + 1}`;
            const releaseDateLabel =
              releaseDt.getUTCDate() !== endDt.getUTCDate()
                ? releaseDt.getUTCDate() === new Date(`${startDate}T12:00:00Z`).getUTCDate()
                  ? ""
                  : `${releaseDt.getUTCDate()}/${releaseDt.getMonth() + 1}`
                : "";

            const initials = groupedMap.get(key)?.join("-") || "";
            const hc = groupedMap.get(key)?.length || 0;

            return [
              (i + 1).toString(),
              `${dTime} (${dateLabel})`,
              `${releaseDt.getHours().toString().padStart(2, "0")}:${releaseDt.getMinutes().toString().padStart(2, "0")} ${releaseDateLabel}`,
              hc.toString(),
              initials,
            ];
          });

          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text(
            "PREVIOUS DAY SHIFTS (INCOMING HANDOVER)",
            14,
            contentStartY - 2,
          );

          autoTable(doc, {
            startY: contentStartY,
            head: [
              ["S/N", "SHIFT END", "RELEASE", "HC", "PERSONNEL (REST LOG)"],
            ],
            body: restRows,
            theme: "grid",
            headStyles: {
              fillColor: [255, 204, 0],
              textColor: [0, 0, 0],
              fontStyle: "bold",
              fontSize: 8,
              lineWidth: 0.1,
              lineColor: [0, 0, 0],
            },
            styles: {
              fontSize: 8,
              cellPadding: 1.5,
              textColor: [0, 0, 0],
              lineColor: [0, 0, 0],
              lineWidth: 0.1,
              fillColor: [255, 255, 235],
              valign: "middle",
            },
            columnStyles: {
              0: { cellWidth: 10, halign: "center" },
              1: { cellWidth: 35 },
              2: { cellWidth: 35 },
              3: { cellWidth: 15, halign: "center", fontStyle: "bold" },
              4: { cellWidth: "auto" },
            },
            margin: { left: 14, right: 14 },
          });
          contentStartY = (doc as any).lastAutoTable.finalY + 10;
        }
      }

      const workingIds = new Set(prog.assignments.map((a) => a.staffId));
      const offStaff = activeStaff.filter((s) => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!) && isOffDutyVisible(s));
      const pdfCategories: Record<string, string[]> = {
        "DAYS OFF": [],
        "ROSTER LEAVE": [],
        "ANNUAL LEAVE": [],
        "SICK LEAVE": [],
        "STANDBY (RESERVE)": [],
      };

      offStaff.forEach((s) => {
        const leave = hasLeaveOnDate(s.id, prog.dateString!);
        let count = 1;
        if (leave) {
          const start = new Date(`${leave.startDate}T12:00:00Z`);
          const current = new Date(`${prog.dateString!}T12:00:00Z`);
          count =
            Math.floor(
              (current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
            ) + 1;
        } else {
          for (let i = index - 1; i >= 0; i--) {
            const prevProg = activePrograms[i];
            const worked = prevProg.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; });
            const prevLeave = hasLeaveOnDate(s.id, prevProg.dateString!);
            if (!worked && !prevLeave) count++;
            else break;
          }
        }
        const label = s.initials;
        let isRosterOutOfContract = false;
        if (s.type === "Roster") {
          if (s.rosterPeriods && s.rosterPeriods.length > 0) {
            isRosterOutOfContract = !s.rosterPeriods.some(
              (p) => prog.dateString! >= p.start && prog.dateString! <= p.end,
            );
          } else {
            if (s.workFromDate && prog.dateString! < s.workFromDate) isRosterOutOfContract = true;
            if (s.workToDate && prog.dateString! > s.workToDate) isRosterOutOfContract = true;
          }
        }

        if (leave) {
          if (leave.type === "Annual leave")
            pdfCategories["ANNUAL LEAVE"].push(label);
          else if (leave.type === "Roster leave")
            pdfCategories["ROSTER LEAVE"].push(label);
          else if (leave.type === "Sick leave")
            pdfCategories["SICK LEAVE"].push(label);
          else pdfCategories["DAYS OFF"].push(label);
        } else if (isRosterOutOfContract) {
          pdfCategories["ROSTER LEAVE"].push(label);
        } else {
          if (s.type === "Local") pdfCategories["DAYS OFF"].push(label);
          else pdfCategories["STANDBY (RESERVE)"].push(label);
        }
      });

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(dateStr, 14, contentStartY);

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(70, 70, 70);
      const statsText = `HEADCOUNT RECONCILIATION: Total Registered: ${staff.length} | Working: ${workingIds.size} | Days Off: ${pdfCategories["DAYS OFF"].length} | Annual Leave: ${pdfCategories["ANNUAL LEAVE"].length} | Sick Leave: ${pdfCategories["SICK LEAVE"].length} | Standby: ${pdfCategories["STANDBY (RESERVE)"].length} | Roster Leave: ${pdfCategories["ROSTER LEAVE"].length}`;
      doc.text(statsText, 14, contentStartY + 5);

      contentStartY += 10;

      const shiftsToday = shifts
        .filter((s) => s.pickupDate === prog.dateString && !s.isHidden)
        .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
      const tableData = shiftsToday.map((shift, idx) => {
        const assignments = sortAssignmentsForPDF(prog.assignments.filter(
          (a) => a.shiftId === shift.id,
        ));
        const nonLabourCount = assignments.filter((a) => {
          const st = getStaff(a.staffId);
          return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        const flightStrs = sortFlightsByTime(shift.flightIds || [], shift.pickupTime);

        const personnelStrs = assignments
          .map((a) => {
            const st = getStaff(a.staffId);
            if (!st) return "";
            let label = st.initials;
            if (a.customStartTime && a.releaseTime) {
              label = `${st.initials}${a.note ? ` (${a.note})` : ""}(From ${a.customStartTime}) (till ${a.releaseTime})`;
            } else if (a.customStartTime) {
              label = `${st.initials}${a.note ? ` (${a.note})` : ""}(From ${a.customStartTime})`;
            } else if (a.releaseTime) {
              label = `${st.initials}${a.note ? ` (${a.note})` : ""} (till ${a.releaseTime})`;
            } else if (a.note) {
              label = `${st.initials} (${a.note})`;
            }
            return label;
          })
          .join("-");

        const roleChecks = Object.entries(shift.roleCounts || {})
          .filter(([k, count]) => count > 0 && !k.startsWith("__"))
          .map(([role, count]) => {
            let roleKey = role;
            if (role === "Load Control") roleKey = "LC";
            if (role === "Shift Leader") roleKey = "SL";
            if (role === "Ramp") roleKey = "RMP";
            if (role === "Operations") roleKey = "OPS";
            if (role === "Lost and Found") roleKey = "LF";
            if (role === "Labour") roleKey = "LBR";
            if (role === "Security") roleKey = "SEC";
            if (role === "Driver") roleKey = "DRV";
            if (role === "Accountant") roleKey = "ACC";
 
            const fulfilledCount = assignments.filter((a) => {
              const st = getStaff(a.staffId);
              if (!st) return false;
              if (a.role === roleKey || a.role === role) return true;
              if (
                roleKey === "LC" &&
                (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")
              )
                return true;
              if (
                roleKey === "SL" &&
                (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")
              )
                return true;
              if (roleKey === "RMP" && st.isRamp) return true;
              if (roleKey === "OPS" && st.isOps) return true;
              if (roleKey === "LF" && st.isLostFound) return true;
              if ((roleKey === "LBR" || roleKey === "Labour") && st.isLabour)
                return true;
              if ((roleKey === "DRV" || roleKey === "Driver") && st.isDriver)
                return true;
              if ((roleKey === "SEC" || roleKey === "Security") && st.isSecurity)
                return true;
              if ((roleKey === "ACC" || roleKey === "Accountant") && st.isAccountant)
                return true;
              return false;
            }).length;
            const isFulfilled = fulfilledCount >= count;
            return `${roleKey} ${isFulfilled ? "(OK)" : "(X)"}`;
          });

        const reqStr =
          roleChecks.length > 0 ? `\nReq: ${roleChecks.join(" | ")}` : "";

        return [
          (idx + 1).toString(),
          shift.pickupTime,
          shift.endTime,
          flightStrs,
          `${nonLabourCount} / ${shift.maxStaff}`,
          personnelStrs + reqStr,
        ];
      });

      autoTable(doc, {
        startY: contentStartY,
        head: [
          [
            "S/N",
            "PICKUP",
            "RELEASE",
            "FLIGHTS",
            "HC / MAX",
            "PERSONNEL & ASSIGNED ROLES",
          ],
        ],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [0, 0, 0],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20, halign: "center" },
          5: { cellWidth: "auto" },
        },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      if (finalY > 180) doc.addPage();

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("ABSENCE AND REST REGISTRY", 14, finalY);

      const registryData = [
        ["DAYS OFF", pdfCategories["DAYS OFF"].join("-") || "NIL"],
        ["ROSTER LEAVE", pdfCategories["ROSTER LEAVE"].join("-") || "NIL"],
        ["ANNUAL LEAVE", pdfCategories["ANNUAL LEAVE"].join("-") || "NIL"],
        ["SICK LEAVE", pdfCategories["SICK LEAVE"].join("-") || "NIL"],
        [
          "STANDBY (RESERVE)",
          pdfCategories["STANDBY (RESERVE)"].join("-") || "NIL",
        ],
      ];

      autoTable(doc, {
        startY: finalY + 2,
        head: [["STATUS CATEGORY", "PERSONNEL INITIALS"]],
        body: registryData,
        theme: "grid",
        headStyles: { fillColor: [50, 50, 60], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2, valign: "middle" },
        columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
      });
    });

    // --- 2. WEEKLY AUDITS ---
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Weekly Personnel Utilization Audit (Local)", 14, 15);
    const localStaff = activeStaff.filter((s) => s.type === "Local" && isStaffActiveInPeriod(s, activePrograms));
    const localAuditData = localStaff.map((s, idx) => {
      const shiftsWorked = activePrograms.reduce(
        (acc, p) =>
          acc + (p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }) ? 1 : 0),
        0,
      );
      let excusedLeaves = 0;
      activePrograms.forEach((p) => {
        const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
        if (hasLeave && !p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }))
          excusedLeaves++;
      });
      const daysOff = activePrograms.length - shiftsWorked - excusedLeaves;
      const targetShifts = 5 - excusedLeaves;
      const targetOff = 2;
      const isMatch = shiftsWorked === targetShifts && daysOff === targetOff;
      const leavesText = excusedLeaves > 0 ? excusedLeaves.toString() : "-";
      return [
        (idx + 1).toString(),
        s.name,
        s.initials,
        shiftsWorked.toString(),
        daysOff.toString(),
        leavesText,
        isMatch ? "MATCH" : "CHECK",
      ];
    });
    autoTable(doc, {
      startY: 20,
      head: [
        ["S/N", "NAME", "INIT", "WORK SHIFTS", "OFF DAYS", "LEAVES", "STATUS"],
      ],
      body: localAuditData,
      theme: "striped",
      headStyles: { fillColor: [0, 0, 0] },
      styles: { fontSize: 9, halign: "center" },
      columnStyles: { 1: { halign: "left" } },
      didParseCell: (data) => {
        if (data.section === "body") {
          const status = (data.row.raw as string[])[6];
          if (status === "MATCH") {
            data.cell.styles.fillColor = [22, 163, 74];
            data.cell.styles.textColor = [255, 255, 255];
          } else if (status === "CHECK") {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      },
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Weekly Personnel Utilization Audit (Roster)", 14, 15);
    const rosterStaff = activeStaff.filter((s) => s.type === "Roster" && isStaffActiveInPeriod(s, activePrograms));
    const rosterAuditData = rosterStaff.map((s, idx) => {
      const shiftsWorked = activePrograms.reduce(
        (acc, p) =>
          acc + (p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }) ? 1 : 0),
        0,
      );
      const progStart = new Date(`${startDate}T12:00:00Z`);
      const progEnd = new Date(`${endDate}T12:00:00Z`);
      const workFrom = s.workFromDate ? new Date(`${s.workFromDate}T12:00:00Z`) : progStart;
      const workTo = s.workToDate ? new Date(`${s.workToDate}T12:00:00Z`) : progEnd;
      const overlapStart = workFrom > progStart ? workFrom : progStart;
      const overlapEnd = workTo < progEnd ? workTo : progEnd;
      let potential = 0;
      if (overlapStart <= overlapEnd) {
        potential =
          Math.floor(
            (overlapEnd.getTime() - overlapStart.getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
      }

      let excusedLeaves = 0;
      activePrograms.forEach((p) => {
        const d = new Date(`${p.dateString!}T12:00:00Z`);
        if (d >= overlapStart && d <= overlapEnd) {
          const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
          if (hasLeave && !p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }))
            excusedLeaves++;
        }
      });

      const isMatch = shiftsWorked === potential - excusedLeaves;
      const leavesText = excusedLeaves > 0 ? excusedLeaves.toString() : "-";
      return [
        (idx + 1).toString(),
        s.name,
        s.initials,
        s.workFromDate || "N/A",
        s.workToDate || "N/A",
        potential.toString(),
        shiftsWorked.toString(),
        leavesText,
        isMatch ? "MATCH" : "CHECK",
      ];
    });
    autoTable(doc, {
      startY: 20,
      head: [
        [
          "S/N",
          "NAME",
          "INIT",
          "WORK FROM",
          "WORK TO",
          "POTENTIAL",
          "ACTUAL",
          "LEAVES",
          "STATUS",
        ],
      ],
      body: rosterAuditData,
      theme: "striped",
      headStyles: { fillColor: [0, 0, 0] },
      styles: { fontSize: 9, halign: "center" },
      columnStyles: { 1: { halign: "left" } },
      didParseCell: (data) => {
        if (data.section === "body") {
          const status = (data.row.raw as string[])[8];
          if (status === "MATCH") {
            data.cell.styles.fillColor = [22, 163, 74];
            data.cell.styles.textColor = [255, 255, 255];
          } else if (status === "CHECK") {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      },
    });

    // --- 3. MATRIX & ROLE FULFILLMENT ---
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Weekly Operations Matrix View", 14, 15);
    const dateHeaders = activePrograms.map((p) => {
      const d = new Date(`${p.dateString || startDate}T12:00:00Z`);
      return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    });
    const matrixHead = [["S/N", "AGENT", ...dateHeaders, "AUDIT"]];

    const getStaffTypeRankPdf = (s: Staff) => {
      if (s.isDriver) return 5;
      if (s.isLabour) return 4;
      if (s.isSecurity) return 3;
      if (s.isAccountant) return 2;
      return 1;
    };

    const sortedMatrixStaffPdf = [...staff].filter(s => s.isActive !== false && isStaffActiveInPeriod(s, activePrograms))
      .map((s) => ({
        ...s,
        totalHours: getStaffTotalHours(s.id),
      }))
      .sort((a, b) => {
        const rankA = getStaffTypeRankPdf(a);
        const rankB = getStaffTypeRankPdf(b);
        if (rankA !== rankB) return rankA - rankB;
        return a.totalHours - b.totalHours;
      });

    const matrixBody = sortedMatrixStaffPdf.map((s, idx) => {
      const row: any[] = [
        (idx + 1).toString(),
        `${s.name} (${s.initials})`,
      ];
      let workedCount = 0;
      let excusedLeaves = 0;
      activePrograms.forEach((p) => {
        const leave = hasLeaveOnDate(s.id, p.dateString!);
        if (leave && leave.type !== "Day off" && !p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; })) {
          excusedLeaves++;
        }
        const assign = p.assignments.find((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; });
        if (assign) {
          workedCount++;
          const shift = getShift(assign.shiftId || "");
          if (shift) {
            const shiftStart = getAssignmentStartDateTime(p.dateString!, shift.pickupTime, assign.customStartTime);
            const rest = calculateRestHours(s.id, shiftStart);
            const restWarning = rest !== null && rest < minRestHours;
            const duration = `${getShiftHours(assign.shiftId || "", assign, p.dateString!).toFixed(1)}H`;
            const restLabel = rest !== null ? ` [${rest.toFixed(1)}H]` : "";
            const displayTime = assign.customStartTime || shift.pickupTime;
            const cellText = `${duration}\n${displayTime}${restLabel}`;
            if (restWarning) {
              row.push({ content: cellText, styles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: "bold" } });
            } else {
              row.push(cellText);
            }
          } else {
            row.push("-");
          }
        } else if (leave) {
          if (leave.type === "Day off") row.push("-");
          else if (leave.type === "Annual leave") row.push("Annual");
          else if (leave.type === "Sick leave") row.push("SL");
          else if (leave.type === "Roster leave") row.push("RL");
          else row.push(leave.type);
        } else {
          row.push("-");
        }
      });
      row.push(
        `${workedCount}/${activePrograms.length} [${s.totalHours.toFixed(1)}H]${excusedLeaves > 0 ? ` (+${excusedLeaves} AL)` : ""}`,
      );
      return row;
    });
    autoTable(doc, {
      startY: 20,
      head: matrixHead,
      body: matrixBody,
      theme: "grid",
      headStyles: { fillColor: [220, 100, 0] },
      styles: { fontSize: 7, halign: "center", cellPadding: 1.5 },
      columnStyles: { 1: { halign: "left", fontStyle: "bold" } },
      didParseCell: (data) => {
        if (
          data.section === "head" &&
          data.column.index === dateHeaders.length + 2
        ) {
          data.cell.styles.fillColor = [79, 70, 229]; // indigo-600
        }
        if (data.section === "body") {
          const staff = sortedMatrixStaffPdf[data.row.index];
          if (staff) {
            let baseColor = [255, 255, 255]; // white default
            if (staff.isDriver) {
              baseColor = [254, 243, 199]; // amber-100 (light yellow)
            } else if (staff.isLabour) {
              baseColor = [255, 237, 213]; // orange-100 (light orange)
            } else if (staff.isSecurity) {
              baseColor = [220, 252, 231]; // green-100 (light green)
            } else if (staff.isAccountant) {
              baseColor = [243, 232, 255]; // purple-100
            } else {
              baseColor = [219, 234, 254]; // blue-100 (traffic/normal)
            }

            // Striping
            if (data.row.index % 2 !== 0) {
              baseColor = [
                Math.max(0, baseColor[0] - 12),
                Math.max(0, baseColor[1] - 12),
                Math.max(0, baseColor[2] - 12),
              ];
            }
            data.cell.styles.fillColor = baseColor as [number, number, number];
          }

          if (data.column.index === dateHeaders.length + 2) {
            data.cell.styles.fillColor = [238, 242, 255]; // indigo-50
            data.cell.styles.textColor = [49, 46, 129]; // indigo-900
            data.cell.styles.fontStyle = "bold";
          } else if (
            data.column.index > 1 &&
            data.column.index < dateHeaders.length + 2
          ) {
            const text = typeof data.cell.raw === "object" && data.cell.raw !== null && "content" in (data.cell.raw as any) ? (data.cell.raw as any).content : (data.cell.raw as string);
            
            if (text === "-") {
              // removed fillColor to keep row color
              data.cell.styles.textColor = [15, 23, 42]; // slate-900
              data.cell.styles.fontStyle = "bold";
            } else if (text === "Annual") {
              // removed fillColor to keep row color
              data.cell.styles.textColor = [113, 63, 18]; // yellow-900
              data.cell.styles.fontStyle = "bold";
            } else if (text === "SL") {
              data.cell.styles.fillColor = [252, 165, 165]; // red-300
              data.cell.styles.textColor = [127, 29, 29]; // red-900
              data.cell.styles.fontStyle = "bold";
            } else if (text === "RL") {
              data.cell.styles.fillColor = [216, 180, 254]; // purple-300
              data.cell.styles.textColor = [88, 28, 135]; // purple-900
              data.cell.styles.fontStyle = "bold";
            } else if (text && text.includes("[")) {
              const match = text.match(/\[([\d.]+)H\]/);
              if (match) {
                const rest = parseFloat(match[1]);
                if (rest < minRestHours) {
                  data.cell.styles.fillColor = [220, 38, 38];
                  data.cell.styles.textColor = [255, 255, 255];
                  data.cell.styles.fontStyle = "bold";
                }
              }
            }
          }
        }
      },
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Specialist Role Fulfillment Matrix", 14, 15);
    const roleMatrixData: any[] = [];
    const roleMatrixMeta: any[] = [];

    activePrograms.forEach((p) => {
      const d = new Date(`${p.dateString || startDate}T12:00:00Z`);
      const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      const shiftsToday = shifts
        .filter((s) => s.pickupDate === p.dateString && !s.isHidden)
        .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
      shiftsToday.forEach((s) => {
        const assignments = p.assignments.filter((a) => a.shiftId === s.id);
        const coversRole = (a: any, targetRole: string) => {
          const st = getStaff(a.staffId);
          if (!st) return false;
          const roleCode =
            targetRole === "Shift Leader"
              ? "SL"
              : targetRole === "Load Control"
                ? "LC"
                : targetRole === "Ramp"
                  ? "RMP"
                  : targetRole === "Operations"
                    ? "OPS"
                    : targetRole === "Lost and Found"
                      ? "LF"
                      : targetRole === "Accountant"
                        ? "ACC"
                        : targetRole;

          // If looking for a specialist role, strictly enforce the profile flag
          if (roleCode === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
          if (roleCode === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
          if (roleCode === "RMP" && !st.isRamp) return false;
          if (roleCode === "OPS" && !st.isOps) return false;
          if (roleCode === "LF" && !st.isLostFound) return false;
          if ((roleCode === "Labour" || roleCode === "LBR") && !st.isLabour) return false;
          if ((roleCode === "Driver" || roleCode === "DRV") && !st.isDriver) return false;
          if ((roleCode === "Security" || roleCode === "SEC") && !st.isSecurity) return false;
          if ((roleCode === "Accountant" || roleCode === "ACC") && !st.isAccountant) return false;

          if (a.role === roleCode || a.role === targetRole) return true;

          // Fallback if they are just on shift but not explicitly assigned to role, check if they can cover
          if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
          if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
          if (roleCode === "RMP" && st.isRamp) return true;
          if (roleCode === "OPS" && st.isOps) return true;
          if (roleCode === "LF" && st.isLostFound) return true;
          if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
          if ((roleCode === "Driver" || roleCode === "DRV") && st.isDriver) return true;
          if ((roleCode === "Security" || roleCode === "SEC") && st.isSecurity) return true;
          if ((roleCode === "Accountant" || roleCode === "ACC") && st.isAccountant) return true;

          return false;
        };
        const getStaffForRole = (role: string) => {
          return assignments
            .filter((a) => coversRole(a, role))
            .map((a) => getStaff(a.staffId)?.initials)
            .filter(Boolean)
            .join(", ");
        };
        const sl = getStaffForRole("Shift Leader");
        const lc = getStaffForRole("Load Control");
        const rmp = getStaffForRole("Ramp");
        const ops = getStaffForRole("Operations");
        const lf = getStaffForRole("Lost and Found");
        const drv = getStaffForRole("Driver");
        const sec = getStaffForRole("Security");
        
        roleMatrixData.push([
          dateLabel,
          `${s.pickupTime}-${s.endTime}`,
          sl,
          lc,
          rmp,
          ops,
          lf,
          drv,
          sec,
        ]);
        roleMatrixMeta.push({
          slReq:
            (s.roleCounts?.["Shift Leader"] ||
              (s.roleCounts as any)?.["SL"] ||
              0) > 0,
          lcReq:
            (s.roleCounts?.["Load Control"] ||
              (s.roleCounts as any)?.["LC"] ||
              0) > 0,
          rmpReq:
            (s.roleCounts?.["Ramp"] || (s.roleCounts as any)?.["RMP"] || 0) > 0,
          opsReq:
            (s.roleCounts?.["Operations"] ||
              (s.roleCounts as any)?.["OPS"] ||
              0) > 0,
          lfReq:
            (s.roleCounts?.["Lost and Found"] ||
              (s.roleCounts as any)?.["LF"] ||
              0) > 0,
          drvReq:
            (s.roleCounts?.["Driver"] ||
              (s.roleCounts as any)?.["DRV"] ||
              0) > 0,
          secReq:
            (s.roleCounts?.["Security"] ||
              (s.roleCounts as any)?.["SEC"] ||
              0) > 0,
        });
      });
    });
    autoTable(doc, {
      startY: 20,
      head: [["DATE", "SHIFT", "SL", "LC", "RMP", "OPS", "LF", "DRV", "SEC"]],
      body: roleMatrixData,
      theme: "grid",
      headStyles: { fillColor: [0, 0, 0] },
      styles: {
        fontSize: 7,
        halign: "center",
        valign: "middle",
        cellPadding: 1.5,
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index > 1) {
          const rowIndex = data.row.index;
          const meta = roleMatrixMeta[rowIndex];
          if (!meta) return;
          const colIdx = data.column.index;
          let isRequired = false;
          if (colIdx === 2) isRequired = meta.slReq;
          if (colIdx === 3) isRequired = meta.lcReq;
          if (colIdx === 4) isRequired = meta.rmpReq;
          if (colIdx === 5) isRequired = meta.opsReq;
          if (colIdx === 6) isRequired = meta.lfReq;
          const content = data.cell.raw as string;
          const hasContent = content && content.length > 0;
          if (hasContent) {
            data.cell.styles.fillColor = [22, 163, 74];
            data.cell.styles.textColor = [255, 255, 255];
          } else if (isRequired) {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.text = ["MISSING"];
          }
        }
      },
    });

    // --- 4. REQUESTED SHIFTS (MANUAL ASSIGNMENTS) ---
    if (manualAssignments && manualAssignments.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Requested Shifts (Pre-Assigned)", 14, 15);

      const requestedShiftsData = manualAssignments.map((ma) => {
        const st = activeStaff.find((s) => s.id === ma.staffId);
        const sh = shifts.find((s) => s.id === ma.shiftId);
        const staffName = st ? `${st.initials} - ${st.name}` : ma.staffId;
        const shiftDetails = sh
          ? `${sh.pickupDate} ${sh.pickupTime}-${sh.endTime}`
          : ma.shiftId;
        return [staffName, shiftDetails, "Done"];
      });

      autoTable(doc, {
        startY: 20,
        head: [["STAFF MEMBER", "REQUESTED SHIFT", "STATUS"]],
        body: requestedShiftsData,
        theme: "grid",
        headStyles: { fillColor: [0, 0, 0] },
        styles: {
          fontSize: 9,
          halign: "center",
          valign: "middle",
          cellPadding: 2,
        },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 2) {
            data.cell.styles.fillColor = [22, 163, 74]; // Emerald green
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
    }

    doc.save(`SkyOPS_Full_Report_${startDate}.pdf`);
    setIsGeneratingPdf(false);
  };

  const generateStaffExcelReport = async () => {
    setIsGeneratingExcel(true);
    try {
      const ExcelJS = await import("exceljs");
      const { saveAs } = await import("file-saver");
      
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Staff Program", {
        pageSetup: {
          paperSize: 9, 
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.2, right: 0.2, top: 0.5, bottom: 0.5, header: 0, footer: 0 }
        }
      });
      
      const profile = await db.getUserProfile(true);
      
      sheet.columns = [
        { width: 10 }, { width: 18 }, { width: 10 }, { width: 10 },
        { width: 10 }, { width: 10 }, { width: 15 }, { width: 60 }
      ];

      const row1 = sheet.addRow([]);
      row1.height = 45;
      
      sheet.mergeCells('B1:G1');
      const titleCell = sheet.getCell('B1');
      titleCell.value = `ASE SDU Weekly Program From ${startDate} Till ${endDate}`;
      titleCell.font = { name: 'Arial', size: 15, bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      if (profile?.companyLogo && profile.companyLogo.includes(';base64,')) {
        const parts = profile.companyLogo.split(';base64,');
        if (parts.length > 1) {
          const base64Data = parts[1];
          const extMatch = profile.companyLogo.match(/image\/(jpeg|png|jpg|webp)/);
          const extension = extMatch ? extMatch[1] : 'png';
          const imgId = workbook.addImage({ base64: base64Data, extension: (extension === 'jpg' ? 'jpeg' : extension) as any });
          sheet.addImage(imgId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 60, height: 45 } });
        }
      }
      
      if (profile?.skyopsLogo && profile.skyopsLogo.includes(';base64,')) {
        const parts = profile.skyopsLogo.split(';base64,');
        if (parts.length > 1) {
          const base64Data = parts[1];
          const extMatch = profile.skyopsLogo.match(/image\/(jpeg|png|jpg|webp)/);
          const extension = extMatch ? extMatch[1] : 'png';
          const imgId = workbook.addImage({ base64: base64Data, extension: (extension === 'jpg' ? 'jpeg' : extension) as any });
          sheet.addImage(imgId, { tl: { col: 7.1, row: 0.1 }, ext: { width: 60, height: 45 } });
        }
      }

      const headers = ["S/N", "Flight No/Day", "From", "STA", "STD", "To", "Pick up Time", "SDU Staff Assignment (staff initials)"];
      const headerRow = sheet.addRow(headers);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      activePrograms.forEach(prog => {
        const d = new Date(`${prog.dateString || startDate}T12:00:00Z`);
        const dayName = DAYS_OF_WEEK_FULL[d.getUTCDay()];
        const dateFormatted = `${d.getUTCDate()}-${d.toLocaleString('default', { month: 'short' }).toUpperCase()}-${d.getUTCFullYear().toString().substr(2)}`;
        
        const dayRow = sheet.addRow([`${dayName} ${dateFormatted}`, "", "", "", "", "", "", ""]);
        sheet.mergeCells(`A${dayRow.number}:H${dayRow.number}`);
        const dayHeaderCell = sheet.getCell(`A${dayRow.number}`);
        dayHeaderCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        dayHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
        dayHeaderCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        dayHeaderCell.alignment = { vertical: 'middle', horizontal: 'center' };
        dayRow.height = 24;
        
        const categories = {
          "Day off": [] as { initials: string, isSecurity: boolean }[],
          "Annual": [] as { initials: string, isSecurity: boolean }[],
          "Lieu": [] as { initials: string, isSecurity: boolean }[],
          "Sick Leave": [] as { initials: string, isSecurity: boolean }[]
        };

        const workingIds = new Set(prog.assignments.map((a) => a.staffId));
        const offStaff = activeStaff.filter((s) => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!) && isOffDutyVisible(s));

        offStaff.forEach(s => {
          const leave = hasLeaveOnDate(s.id, prog.dateString!);
          let isRosterOutOfContract = false;
          if (s.type === "Roster") {
            if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
            if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;
          }
          
          let mappedCat = "";
          if (leave) {
            if (leave.type === "Annual leave") mappedCat = "Annual";
            else if (leave.type === "Roster leave") mappedCat = "Lieu";
            else if (leave.type === "Sick leave") mappedCat = "Sick Leave";
            else mappedCat = "Day off";
          } else if (isRosterOutOfContract) {
            mappedCat = "Lieu";
          } else {
            if (s.type === "Local") mappedCat = "Day off";
          }

          if (mappedCat && (categories as any)[mappedCat]) {
            (categories as any)[mappedCat].push({ initials: s.initials, isSecurity: s.isSecurity });
          }
        });

        const formatInitials = (staffList: { initials: string, isSecurity: boolean }[]) => {
          const regular = staffList.filter(s => !s.isSecurity).map(s => s.initials);
          const security = staffList.filter(s => s.isSecurity).map(s => s.initials);
          let parts = [];
          if (regular.length > 0) parts.push(regular.join(" - "));
          if (security.length > 0) parts.push(`SEC : ${security.join(" - ")}`);
          return parts.join("\n");
        };

        const absenceRowsData: { category: string, label: string, formattedText: string }[] = [];
        if (categories["Day off"].length > 0) {
          absenceRowsData.push({ category: "Day off", label: "DAY OFF", formattedText: formatInitials(categories["Day off"]) });
        }
        if (categories["Annual"].length > 0) {
          absenceRowsData.push({ category: "Annual", label: "ANNUAL LEAVE", formattedText: formatInitials(categories["Annual"]) });
        }
        if (categories["Lieu"].length > 0) {
          absenceRowsData.push({ category: "Lieu", label: "ROSTER LEAVE", formattedText: formatInitials(categories["Lieu"]) });
        }
        if (categories["Sick Leave"].length > 0) {
          absenceRowsData.push({ category: "Sick Leave", label: "SICK LEAVE", formattedText: formatInitials(categories["Sick Leave"]) });
        }

        const shiftsToday = shifts
          .filter((s) => s.pickupDate === prog.dateString && !s.isHidden)
          .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
          
        shiftsToday.forEach((shift, idx) => {
          const assignments = sortAssignments(prog.assignments.filter(a => a.shiftId === shift.id)).filter((a, index, self) => self.findIndex(t => t.staffId === a.staffId) === index);
          
          let staffTokens: {text: string, type: string, hasNote?: boolean, isExtension?: boolean}[] = [];
          assignments.forEach(a => {
             const s = getStaff(a.staffId);
             if (s) {
                 const type = s.isDriver ? 'driver' : s.isLabour ? 'labour' : s.isSecurity ? 'sec' : s.isAccountant ? 'acc' : 'reg';
                 let label = s.initials;
                 const isOriginalShiftOfExtension = prog.assignments.some(
                   otherA => otherA.staffId === a.staffId && otherA.isExtension && otherA.initialShiftId === shift.id
                 );
                 const isAnyExtended = a.isExtension || isOriginalShiftOfExtension;

                 if (a.customStartTime && a.releaseTime) {
                   label = `${s.initials}${a.note ? ` (${a.note})` : ""}(From ${a.customStartTime}) (till ${a.releaseTime})`;
                 } else if (a.customStartTime) {
                   label = `${s.initials}${a.note ? ` (${a.note})` : ""}(From ${a.customStartTime})`;
                 } else if (a.releaseTime) {
                   label = `${s.initials}${a.note ? ` (${a.note})` : ""} (till ${a.releaseTime})`;
                 } else if (a.note) {
                   label = `${s.initials} (${a.note})`;
                 }
                 staffTokens.push({ text: label, type, hasNote: !!a.note, isExtension: !!isAnyExtended });
             }
          });
          
          const flightIds = shift.flightIds || [];
          let fObjs = flightIds.map(fid => getFlight(fid)).filter(Boolean) as Flight[];
          fObjs.sort((a, b) => {
            const getFlightTime = (f: any) => {
              if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
                return f.sta;
              }
              if (f?.std && f.std.trim() !== "" && f.std !== "---") {
                return f.std;
              }
              return "";
            };
            const getMinutes = (fTime: string) => {
              if (!fTime || fTime.toUpperCase().includes("NS") || fTime.includes("---")) return 9999;
              const parts = fTime.split(":");
              const fh = parseInt(parts[0]) || 0;
              const fm = parseInt(parts[1]) || 0;
              const ph = parseInt(shift.pickupTime.split(":")[0]) || 0;
              let totalMins = fh * 60 + fm;
              if (ph >= 12 && fh < 12) {
                totalMins += 24 * 60;
              }
              return totalMins;
            };
            return getMinutes(getFlightTime(a)) - getMinutes(getFlightTime(b));
          });
          if (fObjs.length === 0) fObjs = [{} as Flight];
          
          const startRowNo = sheet.rowCount + 1;
          const addedRows: any[] = [];
          
          fObjs.forEach((f, fIndex) => {
             const rt = sheet.addRow([
                fIndex === 0 ? (idx + 1).toString() : "",
                f.flightNumber ? f.flightNumber.replace("/", " / ") : "",
                f.from || "",
                f.sta || "NS",
                f.std || "---",
                f.to || "",
                fIndex === 0 ? (shift.pickupTime || "N.S") : "",
                "" // staff will be added later
             ]);
             addedRows.push(rt);
             
             let flightBgColor = 'FFFFFFFF';
             if (f.flightNumber) {
                 const fnUpper = f.flightNumber.toUpperCase();
                 if (fnUpper.includes("SM")) flightBgColor = 'FFC9DAF8'; // Light Blue (Aircairo)
                 else if (fnUpper.includes("KNE") || fnUpper.includes("XY")) flightBgColor = 'FFD9EAD3'; // Light Green (Flynas)
                 else if (fnUpper.includes("SV")) flightBgColor = 'FFFCE5CD'; // Soft Peach/Sand
                 else if (fnUpper.includes("FZ")) flightBgColor = 'FFF4CCCC'; // Soft Orange
                 else if (fnUpper.includes("J9") || fnUpper.includes("JZR")) flightBgColor = 'FFEFEFEF'; // Light Gray
                 else if (fnUpper.includes("RB")) flightBgColor = 'FFEAD1DC'; // Soft Pink/Purple
                 else if (fnUpper.includes("G9") || fnUpper.includes("ABY")) flightBgColor = 'FFD0E0E3'; // Soft Teal
                 else {
                     const match = fnUpper.match(/([A-Z]{2,3})\s*\d/);
                     if (match) {
                         const prefix = match[1];
                         const hash = prefix.charCodeAt(0) + (prefix.charCodeAt(1) || 0) * 17;
                         const colors = ['FFF2F2F2', 'FFFFF2CC', 'FFE6B8AF', 'FFD9D2E9', 'FFD0E0E3', 'FFC9DAF8'];
                         flightBgColor = colors[hash % colors.length];
                     }
                 }
             }

             // Shift columns: If there's only 1 flight in this shift, inherit its color. 
             // If multiple flights, use a soft neutral gray/beige to tie them together.
             const shiftBgColor = fObjs.length === 1 ? flightBgColor : 'FFF2F2F2'; // Light Gray for multi-flight shifts

             rt.eachCell((cell, colNumber) => {
                 cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                 cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
                 cell.font = { bold: true, size: 10 };
                 
                 if (colNumber >= 2 && colNumber <= 6) {
                     // Flight columns (2 to 6)
                     if (flightBgColor !== 'FFFFFFFF') {
                         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: flightBgColor } };
                     }
                 } else {
                     // Shift columns (1, 7, 8)
                     if (shiftBgColor !== 'FFFFFFFF') {
                         cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: shiftBgColor } };
                     }
                 }
             });
             
              // CKI Open Time calculation
              const ckiConf = activeCkiConfig;
              let ckiText = "";
              if (ckiConf?.enabled && !f.isFerry && f.std && f.std !== "---" && f.std.includes(":")) {
                const destCode = (f.to || "").toUpperCase().trim();
                const domList = (ckiConf.domesticCodes || []).map((c) => c.toUpperCase().trim());
                const isDomestic = domList.includes(destCode);
                const override = (ckiConf.overrides || []).find((o) => o.code.toUpperCase().trim() === destCode);
                const minsBefore = override
                  ? override.minutesBefore
                  : isDomestic
                  ? ckiConf.domMinutesBefore
                  : ckiConf.intlMinutesBefore;

                const [stdH, stdM] = f.std.split(":").map(Number);
                if (!isNaN(stdH) && !isNaN(stdM)) {
                  const totalMins = stdH * 60 + stdM - (minsBefore || 0);
                  const ckiH = String(Math.floor((((totalMins % 1440) + 1440) % 1440) / 60)).padStart(2, "0");
                  const ckiM = String((((totalMins % 60) + 60) % 60)).padStart(2, "0");
                  ckiText = `CKI: ${ckiH}:${ckiM}`;
                }
              }

              if (f.eta) {
                 const cell = sheet.getCell(`D${rt.number}`);
                 cell.value = {
                   richText: [
                     { text: (f.sta || "NS") + "\n" },
                     { text: `ETA ${f.eta}`, font: { color: { argb: 'FFFF0000' }, bold: true, size: 9 } }
                   ]
                 };
              }
              
              if (f.etd && ckiText) {
                 const cell = sheet.getCell(`E${rt.number}`);
                 cell.value = {
                   richText: [
                     { text: (f.std || "---") + "\n" },
                     { text: `ETD ${f.etd}\n`, font: { color: { argb: 'FFFF0000' }, bold: true, size: 9 } },
                     { text: ckiText, font: { color: { argb: 'FFFF0000' }, bold: true, size: 8 } }
                   ]
                 };
              } else if (f.etd) {
                 const cell = sheet.getCell(`E${rt.number}`);
                 cell.value = {
                   richText: [
                     { text: (f.std || "---") + "\n" },
                     { text: `ETD ${f.etd}`, font: { color: { argb: 'FFFF0000' }, bold: true, size: 9 } }
                   ]
                 };
              } else if (ckiText) {
                 const cell = sheet.getCell(`E${rt.number}`);
                 cell.value = {
                   richText: [
                     { text: (f.std || "---") + "\n" },
                     { text: ckiText, font: { color: { argb: 'FFFF0000' }, bold: true, size: 8 } }
                   ]
                 };
              }
             
             if (fIndex === 0) {
                 const pickupCell = sheet.getCell(`G${rt.number}`);
                 pickupCell.font = { bold: true, size: 10 };
                 pickupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
             }
          });
          
          const endRowNo = sheet.rowCount;
          
          if (fObjs.length > 1) {
              sheet.mergeCells(`A${startRowNo}:A${endRowNo}`);
              sheet.mergeCells(`G${startRowNo}:G${endRowNo}`);
              sheet.mergeCells(`H${startRowNo}:H${endRowNo}`);
          }
          
          const staffCell = sheet.getCell(`H${startRowNo}`);
          const richText: any[] = [];
          
          const normalTokens = staffTokens.filter(t => t.type === 'reg');
          const accountantTokens = staffTokens.filter(t => t.type === 'acc');
          const labourTokens = staffTokens.filter(t => t.type === 'labour');
          const line1Tokens = [...normalTokens, ...accountantTokens, ...labourTokens];

          const securityTokens = staffTokens.filter(t => t.type === 'sec');
          const driverTokens = staffTokens.filter(t => t.type === 'driver');
          const line2Tokens = [...securityTokens, ...driverTokens];

          const addTokensToRichText = (tokens: typeof staffTokens) => {
              tokens.forEach((t, i) => {
                  let color = 'FF000000';
                  if (t.type === 'driver') color = 'FF15803D';
                  if (t.type === 'labour') color = 'FFB91C1C';
                  if (t.type === 'sec') color = 'FF7E22CE';
                  if (t.type === 'acc') color = 'FF1D4ED8';
                  
                  if (t.hasNote) color = 'FFEA580C'; // Orange for notes
                  
                  if (i > 0) richText.push({ text: " - ", font: { color: { argb: 'FF000000' }, bold: true } });
                  richText.push({ text: t.text, font: { color: { argb: color }, bold: true, underline: t.isExtension ? true : false } });
              });
          };

          if (line1Tokens.length > 0) {
              addTokensToRichText(line1Tokens);
          }
          if (line2Tokens.length > 0) {
              if (line1Tokens.length > 0) {
                  richText.push({ text: "\n", font: { bold: true } });
              }
              addTokensToRichText(line2Tokens);
          }
          
          const shiftNote = prog.notes?.[shift.id] || shift.description || "";
          if (shiftNote) {
              if (richText.length > 0) richText.push({ text: "\n" });
              richText.push({ text: shiftNote, font: { color: { argb: 'FFFF0000' }, bold: true } });
          }

          const shiftDriverId = prog.shiftDrivers?.[shift.id];
          if (shiftDriverId) {
              const dObj = staff.find(s => s.id === shiftDriverId);
              if (dObj) {
                  if (richText.length > 0) richText.push({ text: "\n" });
                  richText.push({ text: dObj.initials, font: { color: { argb: 'FF15803D' }, bold: true } });
              }
          }
          
          if (richText.length > 0) {
              staffCell.value = { richText };
          }
          staffCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          staffCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

          let line1Text = line1Tokens.map(t => t.text).join(" - ");
          let line2Text = line2Tokens.map(t => t.text).join(" - ");
          
          let estimatedLines = 0;
          if (line1Text) estimatedLines += Math.ceil(line1Text.length / 40);
          if (line2Text) estimatedLines += Math.ceil(line2Text.length / 40);
          if (shiftNote) estimatedLines += Math.ceil(shiftNote.length / 40);
          
          let minLines = 1;
          if (line1Text && line2Text) minLines += 1;
          if (shiftNote) minLines += 1;
          estimatedLines = Math.max(minLines, estimatedLines);

          const totalHeightNeeded = Math.max(30, estimatedLines * 22 + 15);
          const perRowHeight = totalHeightNeeded / Math.max(1, fObjs.length);
          
          addedRows.forEach(row => {
              row.height = Math.max(30, perRowHeight);
          });
        });

        let absStartRow = -1;
        let absEndRow = -1;

        // Add absence/leave rows right below the day's physical shifts (Option B - Beside Day Shift)
        absenceRowsData.forEach((absItem, idx) => {
          const note = prog.notes?.[`ABSENCE_${absItem.category}`];
          const fullStaffText = `${absItem.formattedText}${note ? `\n(${note})` : ""}`;

          const mergedLabel = idx === 0 ? `${dayName} ${dateFormatted}` : "";
          let actualLabel = "";
          if (absItem.label === "DAY OFF") actualLabel = "Days Off";
          else if (absItem.label === "ANNUAL LEAVE") actualLabel = "Annual leave";
          else if (absItem.label === "ROSTER LEAVE") actualLabel = "Roster Leave";
          else if (absItem.label === "SICK LEAVE") actualLabel = "Sick Leave";
          else actualLabel = absItem.label;

          const absRow = sheet.addRow([
            mergedLabel,       // Merged A-F
            "",                // Flight No/Day
            "",                // From
            "",                // STA
            "",                // STD
            "",                // To
            actualLabel,       // Pickup Time -> "Days Off" etc.
            fullStaffText      // SDU Staff Assignment
          ]);

          if (idx === 0) absStartRow = absRow.number;
          absEndRow = absRow.number;

          absRow.eachCell((cell, colNumber) => {
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            
            // Pale Amber / Warning background
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // amber-100
            
            if (colNumber === 1) {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 }; // amber-900
            } else if (colNumber === 2) {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 10 };
            } else if (colNumber === 4 || colNumber === 5) {
              cell.font = { bold: true, color: { argb: 'FFB45309' }, size: 9 }; // amber-700
            } else if (colNumber === 7) {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 };
              // Highlight the OFF-DUTY cell slightly darker amber
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; // amber-200
            } else if (colNumber === 8) {
              cell.font = { bold: true, color: { argb: 'FF78350F' }, size: 10 }; // amber-950
            } else {
              cell.font = { bold: true, color: { argb: 'FF92400E' }, size: 9 };
            }
          });
          
          // Dynamic row height for the absence row
          const estimatedLines = Math.max(1, Math.ceil(fullStaffText.length / 55));
          absRow.height = Math.max(28, estimatedLines * 22 + 10);
        });

        if (absStartRow !== -1 && absEndRow !== -1) {
          sheet.mergeCells(absStartRow, 1, absEndRow, 6);
        }
      });
      
      sheet.addRow([]);
      const fRow1 = sheet.addRow(["Prepared By: " + (periodPreparedBy || "")]);
      const fRow2 = sheet.addRow(["Revised By: " + (periodRevisedBy || "")]);
      
      fRow1.getCell(1).font = { bold: true, size: 10 };
      fRow2.getCell(1).font = { bold: true, size: 10 };

      // --- D.S Sheet ---
      const dsSheet = workbook.addWorksheet("D.S", { properties: { tabColor: { argb: 'FF10B981' } } });
      
      dsSheet.columns = [
        { header: "SN", key: "sn", width: 8 },
        { header: "Name", key: "name", width: 35 },
        { header: "DS", key: "ds", width: 10 },
        { header: "ID", key: "id", width: 20 },
      ];
      
      // Helper to apply nice styling
      const applyDSHeaderStyle = (sheet: any) => {
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } }; // Slate 900
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;
      };
      
      const applyDSBorders = (sheet: any) => {
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
      
      applyDSHeaderStyle(dsSheet);
      
      const getSortWeight = (s: any) => {
        if (s.isAccountant) return 2;
        if (s.isSecurity) return 3;
        if (s.isLabour) return 4;
        if (s.isDriver) return 5;
        return 1; // Traffic staff (default)
      };
      
      const sortedStaff = [...staff].sort((a, b) => {
        const weightA = getSortWeight(a);
        const weightB = getSortWeight(b);
        if (weightA !== weightB) return weightA - weightB;
        return a.name.localeCompare(b.name);
      });
      
      sortedStaff.forEach((s, i) => {
        const row = dsSheet.addRow({
          sn: i + 1,
          name: s.name,
          ds: s.initials,
          id: s.staffId || "",
        });
        
        if (i % 2 === 0) {
          row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; // Slate 50
        }
        
        row.getCell('sn').font = { bold: true, color: { argb: 'FF64748B' } }; // Slate 500
        row.getCell('name').font = { bold: true, color: { argb: 'FF0F172A' } }; // Slate 900
        row.getCell('ds').font = { bold: true, color: { argb: 'FF0F172A' } }; // Slate 900
        row.getCell('id').font = { color: { argb: 'FF334155' } }; // Slate 700
      });
      
      applyDSBorders(dsSheet);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `SkyOPS_Staff_Program_${startDate}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Failed to export Excel report.");
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const generateStaffPdfReport = async () => {
    setIsGeneratingStaffPdf(true);
    try {
      const profile = await db.getUserProfile();
      const preparedBy = profile?.preparedBy || "";
      const revisedBy = profile?.revisedBy || "";
      
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF("l", "mm", "a3"); // Changed from a4 to a3
      
      doc.setFontSize(14); // Increased font size
      doc.setFont("helvetica", "bold");
      const title = `ASE SDU Weekly Program From ${startDate} Till ${endDate}`;
      doc.text(title, 210, 10, { align: "center" }); // Centered for A3 (420 width / 2)

      try {
        if (profile?.companyLogo) doc.addImage(profile.companyLogo, "PNG", 5, 2, 15, 15);
        if (profile?.skyopsLogo) doc.addImage(profile.skyopsLogo, "PNG", 400, 2, 15, 15);
      } catch (e) { }
      
      const tableRows: any[] = [];
      
      activePrograms.forEach(prog => {
        const d = new Date(`${prog.dateString || startDate}T12:00:00Z`);
        const dayName = DAYS_OF_WEEK_FULL[d.getUTCDay()];
        const dateFormatted = `${d.getUTCDate()}-${d.toLocaleString('default', { month: 'short' }).toUpperCase()}-${d.getUTCFullYear().toString().substr(2)}`;
        
        const shiftsToday = shifts
          .filter((s) => s.pickupDate === prog.dateString && !s.isHidden)
          .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

        // Group absence data
        const categories = {
          "Day off": [] as { initials: string, isSecurity: boolean }[],
          "Annual": [] as { initials: string, isSecurity: boolean }[],
          "Lieu": [] as { initials: string, isSecurity: boolean }[],
          "Sick Leave": [] as { initials: string, isSecurity: boolean }[],
          "SSH Support": [] as { initials: string, isSecurity: boolean }[]
        };

        const workingIds = new Set(prog.assignments.map((a) => a.staffId));
        const offStaff = activeStaff.filter((s) => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!) && isOffDutyVisible(s));

        offStaff.forEach((s) => {
          const leave = leaveMapByStaff[s.id]?.find(
            (l) => l.startDate <= prog.dateString! && l.endDate >= prog.dateString!
          );
          
          let isRosterOutOfContract = false;
          if (s.type === "Roster") {
            if (s.workFromDate && s.workFromDate > prog.dateString!) isRosterOutOfContract = true;
            if (s.workToDate && s.workToDate < prog.dateString!) isRosterOutOfContract = true;
          }

          let mappedCat = "";
          if (leave) {
            if (leave.type === "Annual leave") mappedCat = "Annual";
            else if (leave.type === "Roster leave") mappedCat = "Lieu";
            else if (leave.type === "Sick leave") mappedCat = "Sick Leave";
            else mappedCat = "Day off";
          } else if (isRosterOutOfContract) {
            mappedCat = "Lieu";
          } else {
            if (s.type === "Local") mappedCat = "Day off";
          }

          if (mappedCat === "Day off") {
             // Treat all as "Day off" without mentioning labour or worker
             mappedCat = "Day off";
          }

          if (mappedCat && (categories as any)[mappedCat]) {
            (categories as any)[mappedCat].push({ initials: s.initials, isSecurity: s.isSecurity });
          }
        });

        const absenceTextLines: string[] = [];
        Object.entries(categories).forEach(([k, v]) => {
           if (v.length > 0) {
              const note = prog.notes?.[`ABSENCE_${k}`];
              const regular = v.filter(s => !s.isSecurity).map(s => s.initials);
              const security = v.filter(s => s.isSecurity).map(s => s.initials);
              let parts = [];
              if (regular.length > 0) parts.push(regular.join(" - "));
              if (security.length > 0) parts.push(`SEC : ${security.join(" - ")}`);
              absenceTextLines.push(`${k}:\n${parts.join("\n")}${note ? `\n(${note})` : ''}`);
           }
        });
        
        const combinedAbsenceText = absenceTextLines.join(" | ");
        
        let headerText = `${dayName} ${dateFormatted}`;

        tableRows.push([
          { content: headerText, colSpan: 3, styles: { fillColor: [79, 129, 189], textColor: [255,255,255], fontStyle: "bold", halign: "left" } },
          { content: combinedAbsenceText || "", colSpan: 5, styles: { fillColor: [79, 129, 189], textColor: [255,255,255], fontStyle: "bold", halign: "right" } }
        ]);
          
        if (shiftsToday.length === 0) {
           tableRows.push([
             { content: "No shifts", colSpan: 8, styles: { halign: "center" } }
           ]);
        } else {
             shiftsToday.forEach((shift, idx) => {
             const assignments = sortAssignmentsForPDF(prog.assignments.filter(a => a.shiftId === shift.id)).filter((a, index, self) => self.findIndex(t => t.staffId === a.staffId) === index);
             const staffTokens = assignments.map(a => {
                 const s = getStaff(a.staffId);
                 if (!s) return null;
                 let type = "traffic";
                 if (s.isSecurity) type = "sec";
                 else if (s.isLabour) type = "labour";
                 else if (s.isDriver) type = "driver";
                 
                 let label = s.initials;
                  if (a.customStartTime && a.releaseTime) {
                    label = `${s.initials}${a.note ? ` (${a.note})` : ""}(From ${a.customStartTime}) (till ${a.releaseTime})`;
                  } else if (a.customStartTime) {
                    label = `${s.initials}${a.note ? ` (${a.note})` : ""}(From ${a.customStartTime})`;
                  } else if (a.releaseTime) {
                    label = `${s.initials}${a.note ? ` (${a.note})` : ""} (till ${a.releaseTime})`;
                  } else if (a.note) {
                    label = `${s.initials} (${a.note})`;
                  }
                 
                 return { text: label, type };
             }).filter(Boolean) as {text: string, type: string}[];
             
             const normalTokens = staffTokens.filter(t => t.type === 'traffic');
             const labourTokens = staffTokens.filter(t => t.type === 'labour');
             const line1Tokens = [...normalTokens, ...labourTokens];

             const securityTokens = staffTokens.filter(t => t.type === 'sec');
             const driverTokens = staffTokens.filter(t => t.type === 'driver');
             const line2Tokens = [...securityTokens, ...driverTokens];

             const orderedStaffTokens = [...line1Tokens, ...line2Tokens];

             let pureInitialsLines: string[] = [];
             if (line1Tokens.length > 0) {
                 pureInitialsLines.push(line1Tokens.map(t => t.text).join("-"));
             }
             if (line2Tokens.length > 0) {
                 pureInitialsLines.push(line2Tokens.map(t => t.text).join("-"));
             }
             let pureInitials = pureInitialsLines.join("\n");
             
             const shiftNote = prog.notes?.[shift.id] || shift.description || "";
             if (shiftNote) {
                 if (pureInitials) pureInitials += `\n`;
                 pureInitials += `${shiftNote}`;
             }

             const shiftDriverId = prog.shiftDrivers?.[shift.id];
             if (shiftDriverId) {
                 const dObj = staff.find(s => s.id === shiftDriverId);
                 if (dObj) {
                     if (pureInitials) pureInitials += `\n`;
                     pureInitials += `[${dObj.initials}]`;
                     orderedStaffTokens.push({ text: `[${dObj.initials}]`, type: 'driverDropdown' });
                 }
             }
             
             const flightIds = shift.flightIds || [];
             let fObjs = flightIds.map(fid => getFlight(fid)).filter(Boolean) as Flight[];
             fObjs.sort((a, b) => {
               const getFlightTime = (f: any) => {
                 if (f?.sta && f.sta.trim() !== "" && f.sta.toUpperCase() !== "NS") {
                   return f.sta;
                 }
                 if (f?.std && f.std.trim() !== "" && f.std !== "---") {
                   return f.std;
                 }
                 return "";
               };
               const getMinutes = (fTime: string) => {
                 if (!fTime || fTime.toUpperCase().includes("NS") || fTime.includes("---")) return 9999;
                 const parts = fTime.split(":");
                 const fh = parseInt(parts[0]) || 0;
                 const fm = parseInt(parts[1]) || 0;
                 const ph = parseInt(shift.pickupTime.split(":")[0]) || 0;
                 let totalMins = fh * 60 + fm;
                 if (ph >= 12 && fh < 12) {
                   totalMins += 24 * 60;
                 }
                 return totalMins;
               };
               return getMinutes(getFlightTime(a)) - getMinutes(getFlightTime(b));
             });
             if (fObjs.length === 0) {
                 fObjs = [{ flightNumber: "", from: "", to: "", sta: "NS", std: "---" } as Flight];
             }
             
             const shiftColor = idx % 2 === 0 ? [255, 255, 255] : [245, 248, 255];
             const shiftBorder = 0.6;
             const flightBorder = 0.1;
             
             fObjs.forEach((f, fIdx) => {
                 const isFirstFlight = fIdx === 0;
                 const isLastFlight = fIdx === fObjs.length - 1;
                 
                 const rowStyles = { 
                    fillColor: shiftColor, 
                    lineWidth: { top: flightBorder, bottom: isLastFlight ? shiftBorder : flightBorder, left: flightBorder, right: flightBorder },
                    valign: "middle" as const
                 };
                 
                 if (isFirstFlight) {
                     tableRows.push([
                         { content: (idx + 1).toString(), rowSpan: fObjs.length, styles: { ...rowStyles, lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } } },
                         { content: f.flightNumber || "", styles: rowStyles },
                         { content: f.from || "", styles: rowStyles },
                         { content: f.sta || "NS", styles: rowStyles },
                         { content: f.std || "---", styles: rowStyles },
                         { content: f.to || "", styles: rowStyles },
                         { content: shift.pickupTime || "N.S", rowSpan: fObjs.length, styles: { ...rowStyles, fontStyle: "bold", fontSize: 9, fillColor: [248, 250, 252], lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } } },
                         { content: pureInitials, rowSpan: fObjs.length, styles: { ...rowStyles, fontStyle: "bold", lineWidth: { top: flightBorder, bottom: shiftBorder, left: flightBorder, right: flightBorder } }, customInitials: orderedStaffTokens, customNote: shiftNote } as any
                     ]);
                 } else {
                     tableRows.push([
                         { content: f.flightNumber || "", styles: rowStyles },
                         { content: f.from || "", styles: rowStyles },
                         { content: f.sta || "NS", styles: rowStyles },
                         { content: f.std || "---", styles: rowStyles },
                         { content: f.to || "", styles: rowStyles }
                     ]);
                 }
             });
           });
        }
      });
      
      autoTable(doc, {
        startY: 18,
        head: [["S/N", "Flight No/Day", "From", "STA", "STD", "To", "Pick up Time", "SDU Staff Assignment\n(staff initials)"]],
        body: tableRows,
        theme: "grid",
        margin: { top: 2, right: 3, bottom: 2, left: 3 },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", lineColor: [0,0,0], lineWidth: 0.1, fontSize: 9 },
        styles: { fontSize: 9, fontStyle: "bold", cellPadding: 1, valign: "middle", halign: "center", lineColor: [150,150,150], lineWidth: 0.1, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 45 },
            2: { cellWidth: 20 },
            3: { cellWidth: 20 },
            4: { cellWidth: 20 },
            5: { cellWidth: 20 },
            6: { cellWidth: 35 },
            7: { cellWidth: 'auto' }
        },
        willDrawCell: (data) => {
            if (data.column.index === 7 && data.cell.section === 'body') {
                if (!data.cell.raw || typeof data.cell.raw !== 'object' || !(data.cell.raw as any).customInitials) return;
                // Save lines generated by autoTable's height calculation
                (data.cell.raw as any)._lines = [...data.cell.text];
                // Clear text so we draw it manually in didDrawCell
                data.cell.text = [];
            }
        },
        didDrawCell: (data) => {
            if (data.column.index === 7 && data.cell.section === 'body') {
                const raw = data.cell.raw as any;
                if (!raw || !raw._lines) return;
                
                const lines = raw._lines as string[];
                const customInitials = raw.customInitials as { text: string, type: string }[] || [];
                const customNote = raw.customNote as string;
                
                doc.setFontSize(data.cell.styles.fontSize);
                const lineHeight = doc.getLineHeight() * ((data.cell.styles as any).lineHeightFactor || 1.15);
                const contentHeight = lines.length * lineHeight;
                
                // padding properties are part of the cell object in jspdf-autotable
                const topPadding = typeof data.cell.padding === 'function' ? data.cell.padding('top') : (data.cell.padding as any).top || 0;
                const leftPadding = typeof data.cell.padding === 'function' ? data.cell.padding('left') : (data.cell.padding as any).left || 0;
                
                let cursorY = data.cell.y + topPadding;
                if (data.cell.styles.valign === 'middle') {
                    cursorY = data.cell.y + (data.cell.height / 2) - (contentHeight / 2) + (lineHeight / 2);
                } else {
                    cursorY += (lineHeight / 2);
                }
                
                let reachedNoteRegion = false;
                
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    
                    const normalizedLine = line.replace(/[\s\(\)]/g, '');
                    const normalizedNote = customNote ? customNote.replace(/[\s\(\)]/g, '') : '';
                    if (normalizedLine.length > 0 && normalizedNote && normalizedNote.includes(normalizedLine)) {
                        reachedNoteRegion = true;
                    }

                    const textWidth = doc.getTextWidth(line);
                    let startX = data.cell.x + leftPadding;
                    if (data.cell.styles.halign === 'center') {
                        startX = data.cell.x + (data.cell.width / 2) - (textWidth / 2);
                    }
                    
                    let cursorX = startX;
                    const words = line.split(/(\s+|-|\(|\))/g);
                    
                    for (const word of words) {
                        if (!word) continue;
                        
                        let color = [0, 0, 0];
                        let isBold = true;
                        
                        if (reachedNoteRegion) {
                            color = [255, 0, 0];
                            isBold = true;
                        } else {
                            const token = customInitials.find(t => t.text === word);
                            if (token) {
                                switch(token.type) {
                                    case 'driver': color = [21, 128, 61]; break; // Dark Green
                                    case 'labour': color = [185, 28, 28]; break; // Dark Red
                                    case 'sec': color = [126, 34, 206]; break; // Dark Purple
                                    case 'driverDropdown': color = [21, 128, 61]; break; // Dark Green
                                    default: color = [0, 0, 0]; break;
                                }
                            }
                        }
                        
                        doc.setFont("helvetica", isBold ? "bold" : "normal");
                        doc.setTextColor(color[0], color[1], color[2]);
                        doc.text(word, cursorX, cursorY, { baseline: 'middle' });
                        cursorX += doc.getTextWidth(word);
                    }
                    cursorY += lineHeight;
                }
            }
        }
      });
      
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      if (finalY > doc.internal.pageSize.getHeight() - 12) {
          doc.addPage();
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Prepared By : ${preparedBy}`, 14, 15);
          doc.text(`Revised By : ${revisedBy}`, 14, 22);
      } else {
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Prepared By : ${preparedBy}`, 14, finalY + 6);
          doc.text(`Revised By : ${revisedBy}`, 14, finalY + 12);
      }
      
      doc.save(`SkyOPS_Staff_Program_${startDate}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to export PDF report.");
    } finally {
      setIsGeneratingStaffPdf(false);
    }
  };

  const [shiftEditModal, setShiftEditModal] = React.useState<{dateString: string, shiftId: string} | null>(null);
  const [isShiftBulkEditMode, setIsShiftBulkEditMode] = React.useState(false);
  const [shiftBulkEditText, setShiftBulkEditText] = React.useState("");

  const handleDragStart = (
    e: React.DragEvent,
    staffId: string,
    currentShiftId: string,
    date: string,
    role: string,
  ) => {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ staffId, currentShiftId, date, role }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleUpdateNote = (
    dateString: string,
    targetId: string,
    note: string
  ) => {
    if (!onUpdatePrograms) return;
    const newPrograms = programs.map((p) => {
      if (p.dateString === dateString) {
        return {
          ...p,
          notes: {
            ...(p.notes || {}),
            [targetId]: note,
          },
        };
      }
      return p;
    });

    onUpdatePrograms(newPrograms, [dateString]);
  };

  const handleUpdateDriver = (
    dateString: string,
    shiftId: string,
    driverId: string
  ) => {
    if (!onUpdatePrograms) return;
    const newPrograms = programs.map((p) => {
      if (p.dateString === dateString) {
        const newDrivers = { ...(p.shiftDrivers || {}) };
        if (driverId) {
          newDrivers[shiftId] = driverId;
        } else {
          delete newDrivers[shiftId];
        }
        return {
          ...p,
          shiftDrivers: newDrivers,
        };
      }
      return p;
    });
    onUpdatePrograms(newPrograms, [dateString]);
  };

  
  const executeExtend = (
    staffId: string,
    initialShiftId: string,
    date: string,
    role: string,
    targetShiftId: string,
    releaseTime: string
  ) => {
    // Find initial shift
    const initialShift = shifts.find(s => s.id === initialShiftId);
    if (!initialShift) return;

    let targetShift = targetShiftId ? shifts.find(s => s.id === targetShiftId) : undefined;
    
    // If no target shift selected but releaseTime is provided, find the shift covering or ending at releaseTime
    const initialDate = initialShift.pickupDate || date;
    const sameDayShifts = shifts.filter(s => s.pickupDate === initialDate && !s.isHidden).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
    const initIdx = sameDayShifts.findIndex(s => s.id === initialShiftId);
    
    // Next day first shift if applicable
    const currDateObj = new Date(`${initialDate}T12:00:00Z`);
    currDateObj.setUTCDate(currDateObj.getUTCDate() + 1);
    const nextDateStr = currDateObj.toISOString().split("T")[0];
    const nextDayShifts = shifts.filter(s => s.pickupDate === nextDateStr && !s.isHidden).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

    if (!targetShift) {
      if (releaseTime) {
        // Find best target shift based on release time
        if (sameDayShifts.length > 0) {
          targetShift = sameDayShifts[sameDayShifts.length - 1];
        }
      }
    }

    if (!targetShift) return;

    // Collect all shifts in the sequence from initialShift up to targetShift
    const shiftsToExtend: ShiftConfig[] = [];
    if (targetShift.pickupDate === initialDate) {
      const targetIdx = sameDayShifts.findIndex(s => s.id === targetShift!.id);
      if (targetIdx !== -1 && initIdx !== -1) {
        for (let i = initIdx + 1; i <= targetIdx; i++) {
          shiftsToExtend.push(sameDayShifts[i]);
        }
      } else if (targetShift.id !== initialShiftId) {
        shiftsToExtend.push(targetShift);
      }
    } else {
      // Crosses into next day
      if (initIdx !== -1) {
        for (let i = initIdx + 1; i < sameDayShifts.length; i++) {
          shiftsToExtend.push(sameDayShifts[i]);
        }
      }
      const targetNextIdx = nextDayShifts.findIndex(s => s.id === targetShift!.id);
      if (targetNextIdx !== -1) {
        for (let i = 0; i <= targetNextIdx; i++) {
          shiftsToExtend.push(nextDayShifts[i]);
        }
      } else {
        shiftsToExtend.push(targetShift);
      }
    }

    if (shiftsToExtend.length === 0) {
      // If user is just setting a release time on the current shift
      shiftsToExtend.push(targetShift);
    }

    const newPrograms = [...programs];
    const datesToUpdate = new Set<string>([date]);

    // Apply extension across all target/intermediate shifts
    shiftsToExtend.forEach((sh, idx) => {
      const isLastInSequence = idx === shiftsToExtend.length - 1;
      const shDate = sh.pickupDate || date;
      datesToUpdate.add(shDate);

      const progIndex = newPrograms.findIndex(p => p.dateString === shDate);
      if (progIndex === -1) return;

      const prog = { ...newPrograms[progIndex], assignments: [...newPrograms[progIndex].assignments] };
      const existingAssignIdx = prog.assignments.findIndex(a => a.staffId === staffId && a.shiftId === sh.id);

      const isLastShiftOfDay = (sh.pickupDate === initialDate && sameDayShifts.length > 0 && sameDayShifts[sameDayShifts.length - 1].id === sh.id) ||
                               (sh.pickupDate === nextDateStr && nextDayShifts.length > 0 && nextDayShifts[nextDayShifts.length - 1].id === sh.id);
      
      const assignedReleaseTime = isLastInSequence ? (releaseTime || (isLastShiftOfDay ? "06:30" : sh.endTime)) : undefined;

      if (existingAssignIdx !== -1) {
        prog.assignments[existingAssignIdx] = {
          ...prog.assignments[existingAssignIdx],
          isExtension: sh.id !== initialShiftId,
          initialShiftId: sh.id !== initialShiftId ? initialShiftId : undefined,
          releaseTime: assignedReleaseTime || prog.assignments[existingAssignIdx].releaseTime,
        };
      } else {
        const maxSort = Math.max(0, ...prog.assignments.map((a: any) => a.manualSortIndex || 0));
        prog.assignments.push({
          id: crypto.randomUUID(),
          staffId,
          shiftId: sh.id,
          flightId: "",
          role,
          manualSortIndex: maxSort + 1,
          isExtension: true,
          initialShiftId,
          releaseTime: assignedReleaseTime,
        });
      }

      newPrograms[progIndex] = prog;
    });

    if (onUpdatePrograms) {
      onUpdatePrograms(newPrograms, Array.from(datesToUpdate));

      // Log extension / action
      const staffObj = activeStaff.find(s => s.id === staffId);
      logRosterUpdate({
        change_type: "SHIFT_CHANGE",
        staff_id: staffId,
        staff_name: staffObj?.name,
        staff_initials: staffObj?.initials,
        affected_date: date,
        to_shift_id: targetShift.id,
        to_shift_name: `Extended to Shift ${targetShift.pickupTime || ""}-${targetShift.endTime || ""}`,
        from_value: initialShift ? `Shift at ${initialShift.pickupTime}` : "None",
        to_value: `Shift at ${targetShift.pickupTime} (${releaseTime || "Full"})`,
      }, currentUser);
    }
    setStaffActionModal(null);
    setExtendReleaseTime("");
    setExtendTargetShiftId("");
  };

  const executeMove = (
    staffId: string,
    currentShiftId: string,
    date: string,
    role: string,
    targetShiftId: string,
    targetDate: string,
  ) => {
    const latestPrograms = getLatestPrograms ? getLatestPrograms() : programs;
    const newPrograms = [...latestPrograms];
    const sourceProgIndex = newPrograms.findIndex((p) => p.dateString === date);
    const targetProgIndex = newPrograms.findIndex((p) => p.dateString === targetDate);
    if (sourceProgIndex === -1 || targetProgIndex === -1) return;
    
    const sourceProg = { ...newPrograms[sourceProgIndex], assignments: [...newPrograms[sourceProgIndex].assignments] };
    newPrograms[sourceProgIndex] = sourceProg;
    
    let targetProg = sourceProg;
    if (sourceProgIndex !== targetProgIndex) {
        targetProg = { ...newPrograms[targetProgIndex], assignments: [...newPrograms[targetProgIndex].assignments] };
        newPrograms[targetProgIndex] = targetProg;
    }

    const isTargetAbsence = targetShiftId.startsWith("ABSENCE");
    const latestLeaves = getLatestLeaveRequests ? getLatestLeaveRequests() : leaveRequests;
    let currentLeaves = [...latestLeaves];
    let leavesChanged = false;
    let programsChanged = false;

    if (!currentShiftId.startsWith("ABSENCE")) {
      // If dropped onto the same shift it was already in, move to front
      if (currentShiftId === targetShiftId && date === targetDate) {
        const oldIdx = sourceProg.assignments.findIndex(
          (a) => a.staffId === staffId && a.shiftId === currentShiftId,
        );
        if (oldIdx !== -1) {
          const shiftAssignments = sourceProg.assignments.filter(a => a.shiftId === currentShiftId);
          const minSort = Math.min(0, ...shiftAssignments.map(a => a.manualSortIndex || 0));
          sourceProg.assignments[oldIdx] = { ...sourceProg.assignments[oldIdx], manualSortIndex: minSort - 1 };
          onUpdatePrograms(newPrograms, [date]);
        }
        return;
      }

      const oldIdx = sourceProg.assignments.findIndex(
        (a) => a.staffId === staffId && a.shiftId === currentShiftId,
      );
      if (oldIdx !== -1) {
        sourceProg.assignments.splice(oldIdx, 1);
        programsChanged = true;
      }
    } else if (currentShiftId.startsWith("ABSENCE_") && targetShiftId !== currentShiftId) {
      // Dragging out of a leave category into either a working shift OR another leave category
      const leavesToDelete = currentLeaves.filter(l => 
        l.staffId === staffId && l.startDate <= targetDate && l.endDate >= targetDate
      );
      if (leavesToDelete.length > 0) {
        leavesToDelete.forEach(l => db.deleteLeave(l.id).catch(e => console.warn(e)));
        currentLeaves = currentLeaves.filter(l => !leavesToDelete.includes(l));
        leavesChanged = true;
      }
    }
    
    if (!isTargetAbsence && targetShiftId !== "OFFDUTY") {
      const exists = targetProg.assignments.some(
        (a) => a.staffId === staffId && a.shiftId === targetShiftId,
      );
      if (!exists) {
        const staffObj = activeStaff.find(s => s.id === staffId);
        let assignedRole = role || "AGT";
        if (!role && staffObj) {
          if (staffObj.isShiftLeader || staffObj.initials.toUpperCase() === "SK-ATZ") assignedRole = "SL";
          else if (staffObj.isLoadControl) assignedRole = "LC";
          else if (staffObj.isRamp) assignedRole = "RMP";
          else if (staffObj.isLostFound) assignedRole = "LF";
          else if (staffObj.isLabour) assignedRole = "LBR";
          else if (staffObj.isSecurity) assignedRole = "SEC";
          else if (staffObj.isDriver) assignedRole = "DRV";
          else if (staffObj.isOps) assignedRole = "OPS";
        }
        const maxSort = Math.max(0, ...targetProg.assignments.map(a => a.manualSortIndex || 0));
        targetProg.assignments.push({
          id: crypto.randomUUID(),
          staffId,
          shiftId: targetShiftId,
          flightId: "",
          role: assignedRole,
          manualSortIndex: maxSort + 1
        });
        programsChanged = true;
      }
    } else if (isTargetAbsence && targetShiftId !== "ABSENCE") {
      // Handle dropping into a specific absence category
      const cat = targetShiftId.replace("ABSENCE_", "");
      let type: any = null;
      if (cat === "ANNUAL LEAVE") type = "Annual leave";
      if (cat === "SICK LEAVE") type = "Sick leave";
      if (cat === "ROSTER LEAVE") type = "Roster leave";
      if (cat === "DAYS OFF") type = null; // Do not lock/create leave when dragging to Days Off
      
      const st = activeStaff.find(s => s.id === staffId);
      if (type === "Roster leave" && st?.type === "Local") {
        return;
      }
      
      if (type) {
        const newLeaveId = crypto.randomUUID();
        const req = {
          id: newLeaveId,
          staffId,
          type,
          startDate: targetDate,
          endDate: targetDate,
          notes: "Assigned visually",
          createdAt: new Date().toISOString()
        };
        db.upsertLeave(req as any).catch(e => console.warn(e));
        // Remove previous overlapping leaves from same day to prevent duplicates
        currentLeaves = currentLeaves.filter(l => !(l.staffId === staffId && l.startDate <= targetDate && l.endDate >= targetDate));
        currentLeaves.push(req as any);
        leavesChanged = true;
      }
    }

    if (leavesChanged && onUpdateLeaves) {
        onUpdateLeaves(currentLeaves);
    }
    if (programsChanged) {
        const changedDates = date === targetDate ? [targetDate] : [date, targetDate];
        onUpdatePrograms(newPrograms, changedDates);

        // Auto audit log entry
        const staffObj = activeStaff.find(s => s.id === staffId);
        const fromShift = shifts.find(s => s.id === currentShiftId);
        const toShift = shifts.find(s => s.id === targetShiftId);

        if (!currentShiftId.startsWith("ABSENCE") && currentShiftId !== "OFFDUTY") {
          if (!isTargetAbsence && targetShiftId !== "OFFDUTY") {
            if (currentShiftId !== targetShiftId || date !== targetDate) {
              logRosterUpdate({
                change_type: "SHIFT_CHANGE",
                staff_id: staffId,
                staff_name: staffObj?.name,
                staff_initials: staffObj?.initials,
                affected_date: targetDate,
                from_shift_id: currentShiftId,
                to_shift_id: targetShiftId,
                from_shift_name: fromShift ? `Shift at ${fromShift.pickupTime}` : currentShiftId,
                to_shift_name: toShift ? `Shift at ${toShift.pickupTime}` : targetShiftId,
                from_value: fromShift ? `Shift at ${fromShift.pickupTime}` : currentShiftId,
                to_value: toShift ? `Shift at ${toShift.pickupTime}` : targetShiftId,
              }, currentUser);
            }
          } else {
            const destName = targetShiftId.startsWith("ABSENCE_") ? targetShiftId.replace("ABSENCE_", "") : "OFF";
            logRosterUpdate({
              change_type: "WORK_TO_DAY_OFF",
              staff_id: staffId,
              staff_name: staffObj?.name,
              staff_initials: staffObj?.initials,
              affected_date: date,
              from_shift_id: currentShiftId,
              from_shift_name: fromShift ? `Shift at ${fromShift.pickupTime}` : currentShiftId,
              from_value: fromShift ? `Shift at ${fromShift.pickupTime}` : "WORK",
              to_value: destName,
            }, currentUser);
          }
        } else if (!isTargetAbsence && targetShiftId !== "OFFDUTY") {
          const srcName = currentShiftId.startsWith("ABSENCE_") ? currentShiftId.replace("ABSENCE_", "") : "OFF";
          logRosterUpdate({
            change_type: "DAY_OFF_TO_WORK",
            staff_id: staffId,
            staff_name: staffObj?.name,
            staff_initials: staffObj?.initials,
            affected_date: targetDate,
            to_shift_id: targetShiftId,
            to_shift_name: toShift ? `Shift at ${toShift.pickupTime}` : targetShiftId,
            from_value: srcName,
            to_value: toShift ? `Shift at ${toShift.pickupTime}` : "WORK",
          }, currentUser);
        }
    }
  };

  const handleDrop = (
    e: React.DragEvent,
    targetShiftId: string,
    targetDate: string,
  ) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;

    try {
      const { staffId, currentShiftId, date, role } = JSON.parse(data);
      executeMove(staffId, currentShiftId, date, role, targetShiftId, targetDate);
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleTargetContainerTap = (targetShiftId: string, targetDate: string) => {
    if (!targetShiftId.startsWith("ABSENCE") && targetShiftId !== "OFFDUTY") {
      setShiftEditModal({ dateString: targetDate, shiftId: targetShiftId });
    }
  };

  const [extendReleaseTime, setExtendReleaseTime] = React.useState("");
  const [extendTargetShiftId, setExtendTargetShiftId] = React.useState("");
  const [staffActionModal, setStaffActionModal] = React.useState<{
    staffId: string;
    currentShiftId: string;
    date: string;
    role: string;
  } | null>(null);

  const handleStaffItemTap = (e: React.MouseEvent, staffId: string, currentShiftId: string, date: string, role: string) => {
    e.stopPropagation();
    setStaffActionModal({ staffId, currentShiftId, date, role });
  };

  const staffStats = React.useMemo(() => {
    const stats: Record<string, { daysWorked: number; excusedLeaves: number; target: number; targetOff: number }> = {};
    
    // Process leave requests into a faster lookup
    const leaveMap: Record<string, any[]> = {};
    leaveRequests.forEach(l => {
      if (!leaveMap[l.staffId]) leaveMap[l.staffId] = [];
      leaveMap[l.staffId].push(l);
    });

    const progAssignments: Record<string, string[]> = {};
    activePrograms.forEach(p => {
      progAssignments[p.dateString || ""] = p.assignments.map(a => a.staffId);
    });

    staff.forEach(s => {
      let daysWorked = 0;
      let excusedLeaves = 0;
      
      activePrograms.forEach(p => {
        const pDate = p.dateString || "";
        const worked = (progAssignments[pDate] || []).includes(s.id);
        if (worked) daysWorked++;
        
        const leaves = leaveMap[s.id] || [];
        const hasLeave = leaves.some(
          (l) => l.type !== "Day off" && l.startDate <= pDate && l.endDate >= pDate
        );
        if (hasLeave && !worked) {
            excusedLeaves++;
        }
      });
      
      let target = 5;
      let targetOff = 2;
      if (s.type === "Roster") {
        const progStart = new Date(`${startDate}T12:00:00Z`);
        const progEnd = new Date(`${endDate}T12:00:00Z`);
        const workFrom = s.workFromDate ? new Date(`${s.workFromDate}T12:00:00Z`) : progStart;
        const workTo = s.workToDate ? new Date(`${s.workToDate}T12:00:00Z`) : progEnd;
        const overlapStart = workFrom > progStart ? workFrom : progStart;
        const overlapEnd = workTo < progEnd ? workTo : progEnd;
        let potentialDays = 0;
        if (overlapStart <= overlapEnd) {
          potentialDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }
        const allowance = calculateStaffLeaveAllowance(excusedLeaves, leavePolicy, "Roster", potentialDays);
        target = allowance.workShifts;
        targetOff = allowance.offDays;
      } else {
        // Local Staff - use Leave & Rest customized matrix policy
        const allowance = calculateStaffLeaveAllowance(excusedLeaves, leavePolicy, "Local", 5);
        target = allowance.workShifts;
        targetOff = allowance.offDays;
      }
      
      stats[s.id] = { daysWorked, excusedLeaves, target, targetOff };
    });
    return stats;
  }, [activePrograms, staff, leaveRequests, startDate, endDate, leavePolicy]);

  const getStaffWorkload = (staffId: string) => {
    return staffStats[staffId]?.daysWorked || 0;
  };

  const hasDayOffBefore = (staffId: string, currentDateString: string): boolean => {
    const d = new Date(`${currentDateString}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const prevDateString = d.toISOString().split("T")[0];
    
    // Check in all loaded database programs (including prior weeks/days)
    const prevProg = programs.find(p => p.dateString === prevDateString);
    if (prevProg) {
      const workedPrevDay = prevProg.assignments.some(a => {
        const ts = getShift(a.shiftId || "");
        return a.staffId === staffId && ts && !ts.isHidden;
      });
      return !workedPrevDay;
    }
    
    // Check in leave requests
    const isOffInLeave = leaveRequests.some(
      lr => lr.staffId === staffId && lr.startDate <= prevDateString && lr.endDate >= prevDateString
    );
    if (isOffInLeave) return true;

    // Check in incoming duties
    const staffIncoming = incomingDutiesByStaff[staffId] || [];
    const prevIncoming = staffIncoming.find(d => (d.date || "") === prevDateString);
    if (prevIncoming) {
      return prevIncoming.shiftEndTime === "OFF" || !prevIncoming.shiftEndTime;
    }

    return false;
  };

  const getStaffColor = (
    s: Staff,
    daysWorked: number,
    restHours: number | null,
    isDayOffWarning: boolean = false,
    isRestWarning: boolean = false,
  ) => {
    if (isRestWarning || (restHours !== null && !isDayOffWarning && restHours < minRestHours)) {
      return "bg-orange-500 text-white border-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]";
    }

    if (isDayOffWarning) {
      return "bg-slate-200 border-slate-300 text-slate-800 hover:bg-slate-300 shadow-sm";
    }

    const target = staffStats[s.id]?.target ?? 5;

    const diff = daysWorked - target;
    if (diff >= 2)
      return "bg-gradient-to-br from-red-500 to-rose-700 text-white shadow-red-500/20";
    if (diff === 1)
      return "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-orange-500/20";
    if (diff === 0) {
      if (s.isLabour) return "bg-rose-50 border-rose-200 text-rose-900 shadow-sm";
      if (s.isSecurity) return "bg-purple-50 border-purple-200 text-purple-900 shadow-sm";
      if (s.isDriver) return "bg-emerald-50 border-emerald-200 text-emerald-900 shadow-sm";
      return "bg-white border-slate-200 text-slate-900 shadow-sm";
    }
    if (diff === -1)
      return "bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-blue-500/20";
    return "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-indigo-500/20";
  };

  const renderMatrixTab = () => {
    const dateHeaders = activePrograms.map((p) => {
      const d = new Date(`${p.dateString || startDate}T12:00:00Z`);
      return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    });
    const getStaffTypeRank = (s: Staff) => {
      if (s.isDriver) return 5;
      if (s.isLabour) return 4;
      if (s.isSecurity) return 3;
      if (s.isAccountant) return 2;
      return 1;
    };

    const sortedMatrixStaff = [...activeStaff].filter(s => isStaffActiveInPeriod(s, activePrograms))
      .map((s) => ({
        ...s,
        totalHours: getStaffTotalHours(s.id),
      }))
      .sort((a, b) => {
        const rankA = getStaffTypeRank(a);
        const rankB = getStaffTypeRank(b);
        if (rankA !== rankB) return rankA - rankB;
        return a.totalHours - b.totalHours;
      });

    return (
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4">
        <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6">
          Weekly Operations Matrix View
        </h3>
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 text-center border-r border-slate-800 rounded-tl-xl">
                S/N
              </th>
              <th className="px-4 py-3 border-r border-slate-800">Agent</th>
              {dateHeaders.map((dh, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-center border-r border-slate-800"
                >
                  {dh}
                </th>
              ))}
              <th className="px-4 py-3 text-center bg-indigo-600 border-l border-indigo-700 rounded-tr-xl">
                Audit
              </th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
            {sortedMatrixStaff.map((s, idx) => {
              let workedCount = 0;
              let excusedLeaves = 0;
              
              let rowClass = "transition-colors ";
              if (s.isDriver) rowClass += "bg-amber-100/50 hover:bg-amber-100/70";
              else if (s.isLabour) rowClass += "bg-orange-100/50 hover:bg-orange-100/70";
              else if (s.isSecurity) rowClass += "bg-green-100/50 hover:bg-green-100/70";
              else if (s.isAccountant) rowClass += "bg-purple-100/50 hover:bg-purple-100/70";
              else rowClass += "bg-blue-100/50 hover:bg-blue-100/70";
              
              if (idx % 2 !== 0) {
                if (s.isDriver) rowClass = "transition-colors bg-amber-200/40 hover:bg-amber-200/60";
                else if (s.isLabour) rowClass = "transition-colors bg-orange-200/40 hover:bg-orange-200/60";
                else if (s.isSecurity) rowClass = "transition-colors bg-green-200/40 hover:bg-green-200/60";
                else if (s.isAccountant) rowClass = "transition-colors bg-purple-200/40 hover:bg-purple-200/60";
                else rowClass = "transition-colors bg-blue-200/40 hover:bg-blue-200/60";
              }
              return (
                <tr key={s.id} className={rowClass}>
                  <td className="px-4 py-2 text-center border-r border-slate-100">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-2 font-bold border-r border-slate-100 whitespace-nowrap">
                    {s.name} ({s.initials})
                  </td>
                  {activePrograms.map((p, i) => {
                    const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
                    if (
                      hasLeave &&
                      !p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; })
                    )
                      excusedLeaves++;
                    const staffAssignsOnDate = p.assignments.filter((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; });
                    const assign = staffAssignsOnDate[0];

                    const refProg = referencePrograms.find(
                      (rp) => rp.dateString === p.dateString,
                    );
                    const refAssign = refProg?.assignments.find((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; });

                    const isCellModified =
                      assign?.shiftId !== refAssign?.shiftId ||
                      assign?.role !== refAssign?.role ||
                      !!assign !== !!refAssign;

                    let content: React.ReactNode = (
                      <span className="text-slate-300">-</span>
                    );
                    let cellClass = `px-4 py-2 text-center border-r border-slate-100 ${isCellModified ? "bg-indigo-100/50 shadow-inner" : ""}`;
                    if (!isStaffActiveOnDate(s, p.dateString!)) {
                       content = <span className="text-slate-200">/</span>;
                       cellClass = `px-4 py-2 text-center border-r border-slate-50 bg-slate-50`;
                    } else if (staffAssignsOnDate.length > 0) {
                      workedCount++;
                      const totalDailyHours = getStaffDayWorkingHours(s.id, p.dateString!, staffAssignsOnDate);
                      const shift = getShift(assign.shiftId || "");
                      if (shift) {
                        const shiftStart = getAssignmentStartDateTime(p.dateString!, shift.pickupTime, assign.customStartTime);
                        const rest = calculateRestHours(s.id, shiftStart);
                        const isDayOffPrev = hasDayOffBefore(s.id, p.dateString!);
                        const restWarning = isDayOffPrev
                          ? (rest !== null && rest < minOffDayHours)
                          : (rest !== null && rest < minRestHours);
                        const dayOffRestWarning = isDayOffPrev && rest !== null && rest >= minOffDayHours && rest <= maxOffDayHours;
                        if (restWarning) {
                          cellClass += " !bg-red-500 !text-white !border-red-600 shadow-inner";
                        } else if (dayOffRestWarning) {
                          cellClass += " !bg-slate-300 !text-slate-800 !border-slate-400 shadow-inner";
                        }
                        const firstStart = staffAssignsOnDate.reduce((earliest, a) => {
                          const ts = getShift(a.shiftId || "");
                          const t = a.customStartTime || ts?.pickupTime || "99:99";
                          return t.localeCompare(earliest) < 0 ? t : earliest;
                        }, assign.customStartTime || shift.pickupTime);
                        const latestEnd = staffAssignsOnDate.reduce((latest, a) => {
                          const ts = getShift(a.shiftId || "");
                          const t = a.releaseTime || ts?.endTime || "00:00";
                          return t.localeCompare(latest) > 0 ? t : latest;
                        }, "");
                        content = (
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-[9px] font-bold opacity-85 ${restWarning ? "text-white/90" : dayOffRestWarning ? "text-slate-700" : "text-slate-500"}`}>
                              {totalDailyHours.toFixed(1)}H
                            </span>
                            <span
                              className={`font-bold ${restWarning ? "text-white" : dayOffRestWarning ? "text-slate-800" : "text-slate-900"}`}
                            >
                              {firstStart}{latestEnd ? `-${latestEnd}` : ""}
                            </span>
                            {rest !== null && (
                              <span
                                className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${restWarning ? "bg-rose-500 text-white" : dayOffRestWarning ? "bg-slate-500 text-white" : "text-slate-500 bg-slate-100"}`}
                              >
                                {rest.toFixed(1)}H
                              </span>
                            )}
                          </div>
                        );
                      } else {
                        content = (
                          <span className="text-slate-300">-</span>
                        );
                      }

                    } else {
                      const leave = hasLeaveOnDate(s.id, p.dateString!);
                      if (leave) {
                        if (leave.type === "Day off") {
                          content = <span className="font-bold text-slate-900">-</span>;
                        } else if (leave.type === "Annual leave") {
                          content = <span className="font-bold text-yellow-900">Annual</span>;
                        } else if (leave.type === "Sick leave") {
                          content = <span className="font-bold text-red-900 bg-red-300 px-2 py-0.5 rounded">SL</span>;
                        } else if (leave.type === "Roster leave") {
                          content = <span className="font-bold text-purple-900 bg-purple-300 px-2 py-0.5 rounded">RL</span>;
                        } else {
                          content = <span className="font-bold text-slate-500">{leave.type}</span>;
                        }
                      }
                    }

                    return (
                      <td key={i} className={cellClass}>
                        {content}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-center border-l-2 border-indigo-100 bg-indigo-50/50">
                    <div className={`font-bold ${s.type === "Local" && workedCount > Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7)) ? "text-rose-600" : "text-indigo-900"}`}>
                      {workedCount}/{activePrograms.length}
                    </div>
                    <div className="text-[10px] text-indigo-600 font-bold mt-0.5 flex items-center justify-center gap-1">
                      <span>[{s.totalHours.toFixed(1)}H]</span>
                    </div>
                    {excusedLeaves > 0 && (
                      <div className="text-[9px] text-rose-500 font-bold mt-0.5">
                        (+{excusedLeaves} AL)
                      </div>
                    )}
                    {s.type === "Local" && workedCount > Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7)) && (
                      <div className="text-[9px] text-rose-600 font-bold mt-1 bg-rose-100 px-1 py-0.5 rounded inline-block">
                        ⚠️ MAX {Math.round(Math.max(0, activePrograms.length - excusedLeaves) * (5 / 7))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRolesTab = () => {
    return (
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4">
        <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6">
          Specialist Role Fulfillment Matrix
        </h3>
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 border-r border-slate-800 rounded-tl-xl w-24">
                Date
              </th>
              <th className="px-4 py-3 border-r border-slate-800 w-32">
                Shift
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                SL
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                LC
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                RMP
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                OPS
              </th>
              <th className="px-4 py-3 text-center rounded-tr-xl">LF</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
            {activePrograms.map((p, pIdx) => {
              const d = new Date(`${p.dateString || startDate}T12:00:00Z`);
              const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
              const shiftsToday = shifts
                .filter((s) => s.pickupDate === p.dateString && !s.isHidden)
                .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
              return shiftsToday.map((s, sIdx) => {
                const assignments = p.assignments.filter(
                  (a) => a.shiftId === s.id,
                );
                const coversRole = (a: any, targetRole: string) => {
                  const st = getStaff(a.staffId);
                  if (!st) return false;
                  const roleCode =
                    targetRole === "Shift Leader"
                      ? "SL"
                      : targetRole === "Load Control"
                        ? "LC"
                        : targetRole === "Ramp"
                          ? "RMP"
                          : targetRole === "Operations"
                            ? "OPS"
                            : targetRole === "Lost and Found"
                              ? "LF"
                              : targetRole;

                  // If looking for a specialist role, strictly enforce the profile flag
                  if (roleCode === "LC" && !(st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return false;
                  if (roleCode === "SL" && !(st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return false;
                  if (roleCode === "RMP" && !st.isRamp) return false;
                  if (roleCode === "OPS" && !st.isOps) return false;
                  if (roleCode === "LF" && !st.isLostFound) return false;
                  if ((roleCode === "Labour" || roleCode === "LBR") && !st.isLabour) return false;

                  if (a.role === roleCode || a.role === targetRole) return true;
                  
                  // Fallback if they are just on shift but not explicitly assigned to role, check if they can cover
                  if (roleCode === "LC" && (st.isLoadControl || st.initials.toUpperCase() === "SK-ATZ")) return true;
                  if (roleCode === "SL" && (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ")) return true;
                  if (roleCode === "RMP" && st.isRamp) return true;
                  if (roleCode === "OPS" && st.isOps) return true;
                  if (roleCode === "LF" && st.isLostFound) return true;
                  if ((roleCode === "Labour" || roleCode === "LBR") && st.isLabour) return true;
                  return false;
                };
                const getRoleCell = (role: string, reqFlag: boolean) => {
                  const agents = assignments
                    .filter((a) => coversRole(a, role))
                    .map((a) => getStaff(a.staffId)?.initials)
                    .filter(Boolean);
                  if (agents.length > 0) {
                    return (
                      <td className="px-4 py-2 border-r border-slate-100 text-center">
                        <span className="bg-emerald-500 text-white font-black px-2 py-1 rounded-lg text-[10px] break-words inline-block">
                          {agents.join(", ")}
                        </span>
                      </td>
                    );
                  } else if (reqFlag) {
                    return (
                      <td className="px-4 py-2 border-r border-slate-100 text-center">
                        <span className="bg-rose-500 text-white font-black px-2 py-1 rounded-lg text-[10px]">
                          MISSING
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td className="px-4 py-2 border-r border-slate-100 text-center text-slate-300">
                      -
                    </td>
                  );
                };

                const meta = {
                  slReq:
                    ((s.roleCounts?.["Shift Leader"] ||
                      (s.roleCounts as any)?.["SL"] ||
                      0) as number) > 0,
                  lcReq:
                    ((s.roleCounts?.["Load Control"] ||
                      (s.roleCounts as any)?.["LC"] ||
                      0) as number) > 0,
                  rmpReq:
                    ((s.roleCounts?.["Ramp"] ||
                      (s.roleCounts as any)?.["RMP"] ||
                      0) as number) > 0,
                  opsReq:
                    ((s.roleCounts?.["Operations"] ||
                      (s.roleCounts as any)?.["OPS"] ||
                      0) as number) > 0,
                  lfReq:
                    ((s.roleCounts?.["Lost and Found"] ||
                      (s.roleCounts as any)?.["LF"] ||
                      0) as number) > 0,
                };

                return (
                  <tr
                    key={`${pIdx}-${sIdx}`}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2 font-bold border-r border-slate-100">
                      {dateLabel}
                    </td>
                    <td className="px-4 py-2 font-bold border-r border-slate-100 whitespace-nowrap">
                      {s.pickupTime}-{s.endTime}
                    </td>
                    {getRoleCell("Shift Leader", meta.slReq)}
                    {getRoleCell("Load Control", meta.lcReq)}
                    {getRoleCell("Ramp", meta.rmpReq)}
                    {getRoleCell("Operations", meta.opsReq)}
                    {getRoleCell("Lost and Found", meta.lfReq)}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderStaffCheckTab = () => {
    const localStaff = activeStaff.filter((s) => s.type === "Local" && isStaffActiveInPeriod(s, activePrograms));
    const rosterStaff = activeStaff.filter((s) => s.type === "Roster" && isStaffActiveInPeriod(s, activePrograms));

    const renderLocalTable = () => (
      <div className="mb-10 min-w-[800px]">
        <h4 className="text-lg font-black uppercase italic text-slate-800 mb-4">
          Weekly Personnel Utilization Audit (Local)
        </h4>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 border-r border-slate-800 rounded-tl-xl w-16 text-center">
                S/N
              </th>
              <th className="px-4 py-3 border-r border-slate-800">NAME</th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                INIT
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                WORK SHIFTS
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                OFF DAYS
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                LEAVES
              </th>
              <th className="px-4 py-3 text-center rounded-tr-xl">STATUS</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium divide-y divide-slate-100">
            {localStaff.map((s, idx) => {
              const shiftsWorked = activePrograms.reduce(
                (acc, p) =>
                  acc + (p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }) ? 1 : 0),
                0,
              );

              let excusedLeaves = 0;
              activePrograms.forEach((p) => {
                const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
                if (hasLeave && !p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }))
                  excusedLeaves++;
              });

              const daysOff =
                activePrograms.length - shiftsWorked - excusedLeaves;
              const targetShifts = 5 - excusedLeaves;
              const targetOff = 2;
              const isMatch =
                shiftsWorked === targetShifts && daysOff === targetOff;

              return (
                <tr
                  key={s.id}
                  className={
                    isMatch
                      ? "bg-emerald-50 text-emerald-900 border-b border-white"
                      : "bg-rose-50 text-rose-900 border-b border-white"
                  }
                >
                  <td className="px-4 py-2 text-center">{idx + 1}</td>
                  <td className="px-4 py-2 font-bold">{s.name}</td>
                  <td className="px-4 py-2 text-center">{s.initials}</td>
                  <td className="px-4 py-2 text-center">{shiftsWorked}</td>
                  <td className="px-4 py-2 text-center">{daysOff}</td>
                  <td className="px-4 py-2 text-center font-bold text-slate-700">
                    {excusedLeaves > 0 ? excusedLeaves : "-"}
                  </td>
                  <td className="px-4 py-2 text-center font-bold">
                    {isMatch ? "MATCH" : "CHECK"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    const renderRosterTable = () => (
      <div className="mb-10 min-w-[800px]">
        <h4 className="text-lg font-black uppercase italic text-slate-800 mb-4">
          Weekly Personnel Utilization Audit (Roster)
        </h4>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
              <th className="px-4 py-3 border-r border-slate-800 rounded-tl-xl w-16 text-center">
                S/N
              </th>
              <th className="px-4 py-3 border-r border-slate-800">NAME</th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                INIT
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                WORK FROM
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                WORK TO
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                POTENTIAL
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                ACTUAL
              </th>
              <th className="px-4 py-3 border-r border-slate-800 text-center">
                LEAVES
              </th>
              <th className="px-4 py-3 text-center rounded-tr-xl">STATUS</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium divide-y divide-slate-100">
            {rosterStaff.map((s, idx) => {
              const shiftsWorked = activePrograms.reduce(
                (acc, p) =>
                  acc + (p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; }) ? 1 : 0),
                0,
              );
              const progStart = new Date(`${startDate}T12:00:00Z`);
              const progEnd = new Date(`${endDate}T12:00:00Z`);
              const workFrom = s.workFromDate
                ? new Date(`${s.workFromDate}T12:00:00Z`)
                : progStart;
              const workTo = s.workToDate ? new Date(`${s.workToDate}T12:00:00Z`) : progEnd;
              const overlapStart = workFrom > progStart ? workFrom : progStart;
              const overlapEnd = workTo < progEnd ? workTo : progEnd;
              let potential = 0;
              if (overlapStart <= overlapEnd) {
                potential =
                  Math.floor(
                    (overlapEnd.getTime() - overlapStart.getTime()) /
                      (1000 * 60 * 60 * 24),
                  ) + 1;
              }

              let excusedLeaves = 0;
              activePrograms.forEach((p) => {
                const d = new Date(`${p.dateString!}T12:00:00Z`);
                if (d >= overlapStart && d <= overlapEnd) {
                  const hasLeave = hasLeaveOnDate(s.id, p.dateString!, true);
                  if (
                    hasLeave &&
                    !p.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; })
                  )
                    excusedLeaves++;
                }
              });

              const isMatch = shiftsWorked === potential - excusedLeaves;

              return (
                <tr
                  key={s.id}
                  className={
                    isMatch
                      ? "bg-emerald-50 text-emerald-900 border-b border-white"
                      : "bg-rose-50 text-rose-900 border-b border-white"
                  }
                >
                  <td className="px-4 py-2 text-center">{idx + 1}</td>
                  <td className="px-4 py-2 font-bold">{s.name}</td>
                  <td className="px-4 py-2 text-center">{s.initials}</td>
                  <td className="px-4 py-2 text-center">
                    {s.workFromDate || "N/A"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {s.workToDate || "N/A"}
                  </td>
                  <td className="px-4 py-2 text-center">{potential}</td>
                  <td className="px-4 py-2 text-center">{shiftsWorked}</td>
                  <td className="px-4 py-2 text-center font-bold text-slate-700">
                    {excusedLeaves > 0 ? excusedLeaves : "-"}
                  </td>
                  <td className="px-4 py-2 text-center font-bold">
                    {isMatch ? "MATCH" : "CHECK"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    return (
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto p-6 md:p-10 mb-8 animate-in slide-in-from-bottom-4">
        <h3 className="text-xl md:text-2xl font-black uppercase italic text-slate-900 mb-6 flex items-center gap-3">
          <ShieldCheck className="text-emerald-500 w-6 h-6 md:w-8 md:h-8" />
          Staff Matrix Checks
        </h3>
        {renderLocalTable()}
        {renderRosterTable()}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-500">

      {/* ── VERSION NAME MODAL ── */}
      {versionNameModal.open && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={() => setVersionNameModal({open:false,name:""})}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black uppercase italic text-slate-900 mb-1">Save Version</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-5">Give this snapshot a name</p>
            <input
              autoFocus
              type="text"
              value={versionNameModal.name}
              onChange={e => setVersionNameModal(v => ({...v, name: e.target.value}))}
              onKeyDown={e => { if (e.key === "Enter") confirmSaveVersion(versionNameModal.name); if (e.key === "Escape") setVersionNameModal({open:false,name:""}); }}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 mb-4"
              placeholder="e.g. Draft 1, Final Approval…"
            />
            <div className="flex gap-3">
              <button onClick={() => setVersionNameModal({open:false,name:""})} className="flex-1 py-3 rounded-2xl font-black uppercase text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={() => confirmSaveVersion(versionNameModal.name)} className="flex-1 py-3 rounded-2xl font-black uppercase text-xs text-white bg-blue-600 hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"><Save size={14}/> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="bg-slate-950 text-white px-6 py-5 md:px-10 md:py-7 rounded-3xl shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Title */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <CalendarDays size={22} />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white leading-none">Master Roster</h3>
              <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1">Program View & Export · {startDate} → {endDate}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 active:scale-95 ${showHistory ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}
            >
              <History size={15} /><span className="hidden sm:inline">History</span>
            </button>
            <button
              onClick={saveVersion}
              className="px-4 py-3 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-400 transition-all flex items-center gap-2 active:scale-95"
            >
              <Save size={15} /><span className="hidden sm:inline">Save</span>
            </button>
            <button
              onClick={() => {
                setTempPrep(periodPreparedBy); setTempRev(periodRevisedBy);
                setTempMinOff(minOffDayHours.toString()); setTempMaxOff(maxOffDayHours.toString());
                setTempHideDrivers(hideDriversOffDuty); setTempHideLabour(hideLabourOffDuty);
                setTempHideSecurity(hideSecurityOffDuty); setTempHideAccountants(hideAccountantsOffDuty);
                setTempCkiEnabled(activeCkiConfig.enabled);
                setTempCkiIntlMins(activeCkiConfig.intlMinutesBefore.toString());
                setTempCkiDomMins(activeCkiConfig.domMinutesBefore.toString());
                setTempCkiDomCodes((activeCkiConfig.domesticCodes || []).join(", "));
                setTempCkiOverrides([...(activeCkiConfig.overrides || [])]);
                setShowSettingsModal(true);
              }}
              className="px-4 py-3 bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-400 transition-all flex items-center gap-2 active:scale-95"
            >
              <Settings size={15} /><span className="hidden sm:inline">Settings</span>
            </button>
            {/* PDF export button */}
            <button
              onClick={generateFullReport}
              disabled={isGeneratingPdf || activePrograms.length === 0}
              className="px-4 py-3 bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-white/20 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-40"
              title="Export Internal PDF"
            >
              {isGeneratingPdf ? <Printer size={15} className="animate-spin" /> : <FileDown size={15} />}
              <span className="hidden sm:inline">PDF</span>
            </button>
            {/* Staff Excel — always visible, prominent green */}
            <button
              onClick={generateStaffExcelReport}
              disabled={isGeneratingExcel || activePrograms.length === 0}
              className="px-4 py-3 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-40"
              title="Export Staff Excel"
            >
              {isGeneratingExcel ? <Printer size={15} className="animate-spin" /> : <FileDown size={15} />}
              <span>Staff Excel</span>
            </button>
            {/* placeholder to remove unused state warning */}
            {false && showExportMenu && <span/>}
          </div>
        </div>
      </div>

      {/* ── STICKY TAB BAR ── */}
      <div className="sticky top-[68px] z-[400] bg-slate-50/90 backdrop-blur-md pt-2 pb-3 -mx-2 px-2 md:-mx-4 md:px-4">
        <div className="flex gap-1.5 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm overflow-x-auto no-scrollbar">
          {([
            { id: "Daily",         icon: CalendarDays,   label: "Daily"   },
            { id: "Program Check", icon: CheckCircle2,   label: "Check"   },
            { id: "Matrix",        icon: Users,          label: "Matrix"  },
            { id: "Roles",         icon: ShieldCheck,    label: "Roles"   },
            { id: "Staff Checks",  icon: AlertTriangle,  label: "Staff"   },
            { id: "Updates Logs",  icon: History,        label: "Updates Logs" },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-1 justify-center ${
                activeTab === id
                  ? "bg-slate-950 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* Date jump pills — only on Daily tab */}
        {activeTab === "Daily" && activePrograms.length > 1 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar pb-0.5">
            {activePrograms.map((p) => {
              const d = new Date(`${p.dateString || startDate}T12:00:00Z`);
              const dayNames = ["Su","Mo","Tu","We","Th","Fr","Sa"];
              const dayName = dayNames[d.getUTCDay()];
              const dateNum = d.getUTCDate();
              const isActive = jumpDate === p.dateString;
              const workCount = new Set(p.assignments.map(a => a.staffId)).size;
              return (
                <button
                  key={p.dateString}
                  onClick={() => {
                    setJumpDate(p.dateString || null);
                    const el = jumpRefs.current[p.dateString || ""];
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl text-[9px] font-black uppercase transition-all shrink-0 border ${
                    isActive
                      ? "bg-slate-950 text-white border-slate-950 shadow-md"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                  }`}
                >
                  <span className="tracking-wider">{dayName}</span>
                  <span className="text-sm leading-none font-black">{dateNum}</span>
                  <span className={`mt-0.5 ${isActive ? "text-emerald-400" : "text-slate-400"}`}>{workCount}w</span>
                </button>
              );
            })}
          </div>
        )}
      </div>



      {showHistory && (
        <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] p-8 shadow-xl animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black uppercase italic text-slate-900 flex items-center gap-3">
              <History className="text-emerald-500" />
              Roster Time Machine
            </h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase"
            >
              Close
            </button>
          </div>

          {versions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 italic">
              No saved versions found. Save your first snapshot!
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400 font-black text-xs border border-slate-100">
                      v{v.versionNumber}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        {v.name}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                          <Clock size={10} />{" "}
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                          {v.periodStart} → {v.periodEnd}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => restoreVersion(v)}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-400 shadow-sm flex items-center gap-2"
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                    <button
                      onClick={() => deleteVersion(v.id)}
                      className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {totalAssignments === 0 && activePrograms.length > 0 && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-[2.5rem] p-8 md:p-12 text-center animate-in zoom-in-95 shadow-xl mb-12">
          <h3 className="text-2xl font-black uppercase italic text-indigo-900 tracking-tighter mb-2">
            Empty Roster
          </h3>
          <p className="text-indigo-700 font-bold max-w-lg mx-auto">
            No shifts are currently assigned for this period. You can build the roster manually below or use the AI to generate it.
          </p>
        </div>
      )}

      {true && (
        <div className="space-y-12">
          {activePrograms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-300 gap-4 bg-white rounded-[2.5rem] border border-slate-100">
              <AlertTriangle size={48} />
              <span className="text-xl font-black uppercase italic">
                No Program Data for Selected Period
              </span>
            </div>
          ) : (
            <>
              {activeTab === "Matrix" && renderMatrixTab()}
              {activeTab === "Roles" && renderRolesTab()}
              {activeTab === "Staff Checks" && renderStaffCheckTab()}
              {activeTab === "Updates Logs" && (
                <UpdatesTab
                  staff={staff}
                  shifts={shifts}
                  startDate={startDate}
                  endDate={endDate}
                  currentUser={currentUser}
                />
              )}
              {activeTab === "Program Check" && (
                <ProgramCheck
                  staff={staff}
                  shifts={shifts}
                  programs={activePrograms}
                  leaveRequests={leaveRequests}
                  flights={flights}
                  startDate={startDate}
                  endDate={endDate}
                />
              )}
              {activeTab === "Daily" &&
                activePrograms.map((prog, i) => {
                  const d = new Date(`${prog.dateString || startDate}T12:00:00Z`);
                  const dateLabel = `${DAYS_OF_WEEK_FULL[d.getUTCDay()].toUpperCase()} - ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;

                  const workingIds = new Set(
                    prog.assignments.map((a) => a.staffId),
                  );
                  const offStaff = activeStaff.filter((s) => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!));
                  const categories: Record<
                    string,
                    {
                      staff: Staff;
                      count: number;
                      isLeave?: boolean;
                      isRequestedDayOff?: boolean;
                    }[]
                  > = {
                    "DAYS OFF": [],
                    "ROSTER LEAVE": [],
                    "ANNUAL LEAVE": [],
                    "SICK LEAVE": [],
                    "STANDBY (RESERVE)": [],
                  };

                  offStaff.forEach((s) => {
                    const leave = hasLeaveOnDate(s.id, prog.dateString!);
                    let count = 1;
                    if (leave) {
                      const start = new Date(`${leave.startDate}T12:00:00Z`);
                      const current = new Date(`${prog.dateString!}T12:00:00Z`);
                      count =
                        Math.floor(
                          (current.getTime() - start.getTime()) /
                            (1000 * 60 * 60 * 24),
                        ) + 1;
                    } else {
                      for (let idx = i - 1; idx >= 0; idx--) {
                        const prevProg = activePrograms[idx];
                        const worked = prevProg.assignments.some((a) => { const ts = getShift(a.shiftId || ""); return a.staffId === s.id && ts && !ts.isHidden; });
                        const prevLeave = hasLeaveOnDate(s.id, prevProg.dateString!);
                        if (!worked && !prevLeave) count++;
                        else break;
                      }
                    }

                    let isRosterOutOfContract = false;
                    if (s.type === "Roster") {
                      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                        isRosterOutOfContract = !s.rosterPeriods.some(
                          (p) =>
                            prog.dateString! >= p.start &&
                            prog.dateString! <= p.end,
                        );
                      } else {
                        if (s.workFromDate && prog.dateString! < s.workFromDate) isRosterOutOfContract = true;
                        if (s.workToDate && prog.dateString! > s.workToDate) isRosterOutOfContract = true;
                      }
                    }
                    const item = {
                      staff: s,
                      count,
                      isLeave: !!leave,
                      isRequestedDayOff: leave?.type === "Day off",
                    };

                    if (leave) {
                      if (leave.type === "Annual leave")
                        categories["ANNUAL LEAVE"].push(item);
                      else if (leave.type === "Roster leave")
                        categories["ROSTER LEAVE"].push(item);
                      else if (leave.type === "Sick leave")
                        categories["SICK LEAVE"].push(item);
                      else categories["DAYS OFF"].push(item);
                    } else if (isRosterOutOfContract) {
                      categories["ROSTER LEAVE"].push(item);
                    } else {
                      if (s.type === "Local") {
                        categories["DAYS OFF"].push(item);
                      } else {
                        categories["STANDBY (RESERVE)"].push(item);
                      }
                    }
                  });

                  const refProg = referencePrograms.find(
                    (p) => p.dateString === prog.dateString,
                  ) || {
                    assignments: [] as typeof prog.assignments,
                    dateString: prog.dateString,
                  };
                  const refWorkingIds = new Set(
                    refProg.assignments.map((a) => a.staffId),
                  );
                  const refOffStaff = activeStaff.filter(
                    (s) => !refWorkingIds.has(s.id) && isStaffActiveOnDate(s, refProg.dateString!),
                  );
                  const refCategories: Record<string, string[]> = {
                    "DAYS OFF": [],
                    "ROSTER LEAVE": [],
                    "ANNUAL LEAVE": [],
                    "SICK LEAVE": [],
                    "STANDBY (RESERVE)": [],
                  };
                  refOffStaff.forEach((s) => {
                    const leave = hasLeaveOnDate(s.id, refProg.dateString!);
                    let isRosterOutOfContract = false;
                    if (s.type === "Roster") {
                      if (s.rosterPeriods && s.rosterPeriods.length > 0) {
                        isRosterOutOfContract = !s.rosterPeriods.some(
                          (p) =>
                            refProg.dateString! >= p.start &&
                            refProg.dateString! <= p.end,
                        );
                      } else {
                        if (s.workFromDate && refProg.dateString! < s.workFromDate) isRosterOutOfContract = true;
                        if (s.workToDate && refProg.dateString! > s.workToDate) isRosterOutOfContract = true;
                      }
                    }
                    if (leave) {
                      if (leave.type === "Annual leave")
                        refCategories["ANNUAL LEAVE"].push(s.id);
                      else if (leave.type === "Roster leave")
                        refCategories["ROSTER LEAVE"].push(s.id);
                      else if (leave.type === "Sick leave")
                        refCategories["SICK LEAVE"].push(s.id);
                      else refCategories["DAYS OFF"].push(s.id);
                    } else if (isRosterOutOfContract) {
                      refCategories["ROSTER LEAVE"].push(s.id);
                    } else {
                      if (s.type === "Local")
                        refCategories["DAYS OFF"].push(s.id);
                      else refCategories["STANDBY (RESERVE)"].push(s.id);
                    }
                  });

                  const shiftsTodaySorted = shifts
                    .filter((s) => s.pickupDate === prog.dateString && !s.isHidden)
                    .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));

                  return (
                    <div
                      key={i}
                      ref={el => { jumpRefs.current[prog.dateString || ""] = el; }}
                      className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <h3 className="text-base font-black uppercase italic text-white tracking-tight">
                          {dateLabel}
                        </h3>
                        <div className="flex flex-wrap gap-1.5 text-[8px] font-black uppercase tracking-widest">
                          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg border border-emerald-500/30">
                            ✦ {workingIds.size} Working
                          </span>
                          {categories["DAYS OFF"].length > 0 && (
                            <span className="px-2.5 py-1 bg-slate-500/30 text-slate-300 rounded-lg border border-slate-500/30">
                              ◎ {categories["DAYS OFF"].length} Day Off
                            </span>
                          )}
                          {(categories["ANNUAL LEAVE"].length + categories["SICK LEAVE"].length) > 0 && (
                            <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg border border-indigo-500/30">
                              ✈ {categories["ANNUAL LEAVE"].length + categories["SICK LEAVE"].length} Leave
                            </span>
                          )}
                          {categories["ANNUAL LEAVE"].length > 0 && (
                            <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded-lg border border-yellow-500/30">
                              AL·{categories["ANNUAL LEAVE"].length}
                            </span>
                          )}
                          {categories["SICK LEAVE"].length > 0 && (
                            <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 rounded-lg border border-rose-500/30">
                              SL·{categories["SICK LEAVE"].length}
                            </span>
                          )}
                          {categories["STANDBY (RESERVE)"].length > 0 && (
                            <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/30">
                              ⏸ {categories["STANDBY (RESERVE)"].length} SBY
                            </span>
                          )}
                          {categories["ROSTER LEAVE"].length > 0 && (
                            <span className="px-2.5 py-1 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-500/30">
                              RL·{categories["ROSTER LEAVE"].length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Side-by-side layout: shifts (left 65%) | absence registry (right 35%) */}
                      <div className="flex flex-col md:flex-row md:items-start">
                      <div className="overflow-x-auto w-full md:w-[65%] md:border-r border-slate-200">
                        <table className="w-full min-w-[850px] text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-950 text-white text-[10px] font-black uppercase tracking-wider">
                              <th className="px-4 py-3 w-12 text-center">
                                S/N
                              </th>
                              <th className="px-4 py-3 w-24">Pickup</th>
                              <th className="px-4 py-3 w-24">Release</th>
                              <th className="px-4 py-3 w-32">Flights</th>
                              <th className="px-4 py-3 w-24 text-center">
                                HC / Max
                              </th>
                              <th className="px-4 py-3 text-center min-w-[120px]">Rates</th>
                              <th className="px-4 py-3">
                                Personnel & Assigned Roles
                              </th>
                            </tr>
                          </thead>
                          <tbody className="text-xs font-medium text-slate-700 divide-y divide-slate-100">
                            {shiftsTodaySorted.map(
                              (shift, idx, shiftsToday) => {
                                const assignments = sortAssignments(prog.assignments.filter(
                                  (a) => a.shiftId === shift.id,
                                )).filter((a, index, self) => self.findIndex(t => t.staffId === a.staffId) === index);
                                const flightStrs = sortFlightsByTime(shift.flightIds || [], shift.pickupTime);
                                const nonLabourCount = assignments.filter((a) => {
                                  const st = getStaff(a.staffId);
                                  return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
                                }).length;
                                const isFull = nonLabourCount >= shift.maxStaff;
                                const isOver = nonLabourCount > shift.maxStaff;

                                const hasSL = assignments.some(
                                  (a) =>
                                    a.role === "SL" ||
                                    a.role === "Shift Leader" ||
                                    getStaff(a.staffId)?.isShiftLeader ||
                                    getStaff(
                                      a.staffId,
                                    )?.initials.toUpperCase() === "SK-ATZ",
                                );
                                const hasLC = assignments.some(
                                  (a) =>
                                    a.role === "LC" ||
                                    a.role === "Load Control" ||
                                    getStaff(a.staffId)?.isLoadControl ||
                                    getStaff(
                                      a.staffId,
                                    )?.initials.toUpperCase() === "SK-ATZ",
                                );
                                const isCriticalMissing =
                                  (!hasSL &&
                                    (shift.roleCounts?.["Shift Leader"] || 0) >
                                      0) ||
                                  (!hasLC &&
                                    (shift.roleCounts?.["Load Control"] || 0) >
                                      0);

                                const curShiftAssig = assignments
                                  .map((a) => a.staffId)
                                  .sort()
                                  .join(",");
                                const refShiftAssig = refProg.assignments
                                  .filter((a) => a.shiftId === shift.id)
                                  .map((a) => a.staffId)
                                  .sort()
                                  .join(",");
                                const isShiftModified =
                                  curShiftAssig !== refShiftAssig;

                                const assignedTraffic = assignments.filter((a) => {
                                  const st = getStaff(a.staffId);
                                  return st && !st.isLabour && !st.isSecurity && !st.isAccountant && !st.isDriver;
                                });
                                const avgRating = assignedTraffic.length > 0
                                  ? Math.round(
                                      assignedTraffic.reduce((sum, a) => {
                                        const st = getStaff(a.staffId);
                                        return sum + getStaffCgRate(st);
                                      }, 0) / assignedTraffic.length
                                    )
                                  : 0;

                                const getShiftMaxRating = (key: 'ratingRamp' | 'ratingOps' | 'ratingSL', roleKey: 'isRamp' | 'isOps' | 'isShiftLeader') => {
                                  const eligibleStaff = assignedTraffic.filter(a => {
                                    const st = getStaff(a.staffId);
                                    return st && (st[roleKey] || (a.role && (
                                      (roleKey === 'isRamp' && (a.role === 'RMP' || a.role === 'Ramp')) ||
                                      (roleKey === 'isOps' && (a.role === 'OPS' || a.role === 'Operations')) ||
                                      (roleKey === 'isShiftLeader' && (a.role === 'SL' || a.role === 'Shift Leader'))
                                    )));
                                  });
                                  if (eligibleStaff.length === 0) return 0;
                                  return eligibleStaff.reduce((max, a) => {
                                    const st = getStaff(a.staffId);
                                    if (!st) return max;
                                    const roleSpecificRate = st[key];
                                    const rate = roleSpecificRate !== undefined && roleSpecificRate !== null
                                      ? Number(roleSpecificRate)
                                      : getStaffCgRate(st);
                                    return Math.max(max, rate);
                                  }, 0);
                                };

                                const rampRate = getShiftMaxRating('ratingRamp', 'isRamp');
                                const opsRate = getShiftMaxRating('ratingOps', 'isOps');
                                const slRate = getShiftMaxRating('ratingSL', 'isShiftLeader');

                                return (
                                  <tr
                                    key={shift.id}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) =>
                                      handleDrop(e, shift.id, prog.dateString!)
                                    }
                                    onClick={() => handleTargetContainerTap(shift.id, prog.dateString!)}
                                    className={`hover:bg-slate-50 transition-colors ${isShiftModified ? "bg-indigo-50/70 border-l-4 border-indigo-400" : isCriticalMissing ? "bg-rose-50/50" : ""} ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-indigo-50" : ""}`}
                                  >
                                    <td
                                      className={`px-4 py-3 text-center font-bold ${isCriticalMissing ? "text-rose-500" : "text-slate-400"}`}
                                    >
                                      {idx + 1}
                                    </td>
                                    <td className="px-4 py-3 font-mono">
                                      {shift.pickupTime}
                                    </td>
                                    <td className="px-4 py-3 font-mono">
                                      {shift.endTime}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-blue-600">
                                      {flightStrs}
                                    </td>
                                    <td
                                      className={`px-4 py-3 text-center font-bold ${isOver ? "text-rose-500" : isFull ? "text-emerald-500" : "text-amber-500"}`}
                                    >
                                      {nonLabourCount} / {shift.maxStaff}
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold">
                                      {assignedTraffic.length > 0 ? (
                                        <div className="flex flex-col gap-1 items-center justify-center">
                                          <div className="flex items-center gap-1 text-[10px]">
                                            <span className="text-slate-500 w-6 text-right">C&G:</span>
                                            <span className={`inline-block px-1.5 py-0.5 rounded-sm ${
                                              avgRating >= 85 ? "bg-emerald-100 text-emerald-800" :
                                              avgRating >= 70 ? "bg-blue-100 text-blue-800" :
                                              avgRating >= 50 ? "bg-amber-100 text-amber-800" :
                                              "bg-rose-100 text-rose-800"
                                            }`}>
                                              {avgRating}%
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 text-[10px]">
                                            <span className="text-slate-500 w-6 text-right">RMP:</span>
                                            <span className={`inline-block px-1.5 py-0.5 rounded-sm ${
                                              rampRate >= 85 ? "bg-emerald-100 text-emerald-800" :
                                              rampRate >= 70 ? "bg-blue-100 text-blue-800" :
                                              rampRate >= 50 ? "bg-amber-100 text-amber-800" :
                                              "bg-rose-100 text-rose-800"
                                            }`}>
                                              {rampRate}%
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 text-[10px]">
                                            <span className="text-slate-500 w-6 text-right">OPS:</span>
                                            <span className={`inline-block px-1.5 py-0.5 rounded-sm ${
                                              opsRate >= 85 ? "bg-emerald-100 text-emerald-800" :
                                              opsRate >= 70 ? "bg-blue-100 text-blue-800" :
                                              opsRate >= 50 ? "bg-amber-100 text-amber-800" :
                                              "bg-rose-100 text-rose-800"
                                            }`}>
                                              {opsRate}%
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 text-[10px]">
                                            <span className="text-slate-500 w-6 text-right">SL:</span>
                                            <span className={`inline-block px-1.5 py-0.5 rounded-sm ${
                                              slRate >= 85 ? "bg-emerald-100 text-emerald-800" :
                                              slRate >= 70 ? "bg-blue-100 text-blue-800" :
                                              slRate >= 50 ? "bg-amber-100 text-amber-800" :
                                              "bg-rose-100 text-rose-800"
                                            }`}>
                                              {slRate}%
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex flex-wrap gap-2">
                                          {assignments.map((a) => {
                                            const st = getStaff(a.staffId);
                                            if (!st) return null;

                                            const shiftStart = getAssignmentStartDateTime(
                                              prog.dateString!,
                                              shift.pickupTime,
                                              a.customStartTime,
                                            );

                                            const rest = calculateRestHours(
                                              st.id,
                                              shiftStart,
                                            );
                                            const daysWorked = getStaffWorkload(
                                              st.id,
                                            );
                                            const isDayOffPrev = hasDayOffBefore(st.id, prog.dateString!);
                                            const restWarning = isDayOffPrev
                                              ? (rest !== null && rest < minOffDayHours)
                                              : (rest !== null && rest < minRestHours);
                                            const dayOffRestWarning = isDayOffPrev && rest !== null && rest >= minOffDayHours && rest <= maxOffDayHours;
                                            const colorClassBase = getStaffColor(
                                              st,
                                              daysWorked,
                                              rest,
                                              dayOffRestWarning,
                                              restWarning,
                                            );
                                            const colorClass = a.isExtension
                                              ? "bg-emerald-100 text-emerald-800 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                              : colorClassBase;
                                            
                                            let extText = st.initials;
                                            if (a.customStartTime && a.releaseTime) {
                                              extText = `${st.initials}(From ${a.customStartTime}) (till ${a.releaseTime})`;
                                            } else if (a.customStartTime) {
                                              extText = `${st.initials}(From ${a.customStartTime})`;
                                            } else if (a.releaseTime) {
                                              extText = `${st.initials} (till ${a.releaseTime})`;
                                            }

                                            let target = 5;
                                            if (st.type === "Roster") {
                                              const progStart = new Date(
                                                startDate,
                                              );
                                              const progEnd = new Date(`${endDate}T12:00:00Z`);
                                              const workFrom = st.workFromDate
                                                ? new Date(`${st.workFromDate}T12:00:00Z`)
                                                : progStart;
                                              const workTo = st.workToDate
                                                ? new Date(`${st.workToDate}T12:00:00Z`)
                                                : progEnd;
                                              const overlapStart =
                                                workFrom > progStart
                                                  ? workFrom
                                                  : progStart;
                                              const overlapEnd =
                                                workTo < progEnd
                                                  ? workTo
                                                  : progEnd;
                                              if (overlapStart <= overlapEnd) {
                                                target =
                                                  Math.floor(
                                                    (overlapEnd.getTime() -
                                                      overlapStart.getTime()) /
                                                      (1000 * 60 * 60 * 24),
                                                  ) + 1;
                                              } else {
                                                target = 0;
                                              }
                                            }
                                            const showDays =
                                              daysWorked !== target;

                                            const isLastShiftOfDay =
                                              !shiftsToday
                                                .slice(idx + 1)
                                                .some((futureShift) =>
                                                  prog.assignments.some(
                                                    (ass) =>
                                                      ass.shiftId ===
                                                        futureShift.id &&
                                                      ass.staffId === st.id,
                                                  ),
                                                );
                                            let nextDayShiftTime:
                                              | string
                                              | null = null;
                                            const nextProg =
                                              activePrograms[i + 1];
                                            if (isLastShiftOfDay && nextProg) {
                                              const shiftsTomorrow = shifts
                                                .filter(
                                                  (s) =>
                                                    s.pickupDate ===
                                                    nextProg.dateString,
                                                )
                                                .sort((a, b) =>
                                                  a.pickupTime.localeCompare(
                                                    b.pickupTime,
                                                  ),
                                                );
                                              for (const tomorrowShift of shiftsTomorrow) {
                                                const nextAssignment =
                                                  nextProg.assignments.find(
                                                    (ass) =>
                                                      ass.shiftId ===
                                                        tomorrowShift.id &&
                                                      ass.staffId === st.id,
                                                  );
                                                if (nextAssignment) {
                                                  try {
                                                    const currentEnd = new Date(
                                                      `${shift.endDate || prog.dateString}T${shift.endTime}:00`,
                                                    );
                                                    const nextStart = new Date(
                                                      `${tomorrowShift.pickupDate || nextProg.dateString}T${tomorrowShift.pickupTime}:00`,
                                                    );
                                                    const diffHours =
                                                      (nextStart.getTime() - currentEnd.getTime()) /
                                                      (1000 * 60 * 60);

                                                    if (diffHours < 12) {
                                                      nextDayShiftTime = tomorrowShift.pickupTime;
                                                    }
                                                  } catch (e) {
                                                    nextDayShiftTime = tomorrowShift.pickupTime;
                                                  }
                                                  break;
                                                }
                                              }
                                            }

                                            return (
                                              <div
                                                key={a.id}
                                                draggable={
                                                  !(
                                                    manualAssignments &&
                                                    manualAssignments.some(
                                                      (ma) =>
                                                        ma.staffId === st.id &&
                                                        ma.shiftId === shift.id,
                                                    )
                                                  )
                                                }
                                                onDragStart={(e) => {
                                                  if (
                                                    manualAssignments &&
                                                    manualAssignments.some(
                                                      (ma) =>
                                                        ma.staffId === st.id &&
                                                        ma.shiftId === shift.id,
                                                    )
                                                  ) {
                                                    e.preventDefault();
                                                    return;
                                                  }
                                                  handleDragStart(
                                                    e,
                                                    st.id,
                                                    shift.id,
                                                    prog.dateString!,
                                                    a.role,
                                                  );
                                                }}
                                                onClick={(e) => {
                                                  if (
                                                    manualAssignments &&
                                                    manualAssignments.some(
                                                      (ma) =>
                                                        ma.staffId === st.id &&
                                                        ma.shiftId === shift.id,
                                                    )
                                                  ) return;
                                                  handleStaffItemTap(e, st.id, shift.id, prog.dateString!, a.role);
                                                }}
                                                className={`px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase transition-all flex items-center gap-1 group ${colorClass} ${staffActionModal?.staffId === st.id && staffActionModal?.currentShiftId === shift.id && staffActionModal?.date === prog.dateString ? "ring-2 ring-offset-1 ring-indigo-600 scale-105" : ""} ${manualAssignments && manualAssignments.some((ma) => ma.staffId === st.id && ma.shiftId === shift.id) ? "opacity-80 cursor-not-allowed border-indigo-200" : "cursor-move hover:scale-105"}`}
                                              >
                                                <span>{extText}{a.note ? ` (${a.note})` : ""}</span>
                                                {manualAssignments &&
                                                manualAssignments.some(
                                                  (ma) =>
                                                    ma.staffId === st.id &&
                                                    ma.shiftId === shift.id,
                                                ) ? (
                                                  <Lock
                                                    size={8}
                                                    className="text-slate-500 opacity-70 -ml-0.5"
                                                  />
                                                ) : null}
                                                {rest !== null &&
                                                  restWarning && !a.isExtension && (
                                                    <span className="ml-1 px-1 bg-white text-orange-600 rounded text-[8px]">
                                                      {rest}H
                                                    </span>
                                                  )}
                                                {dayOffRestWarning && !restWarning && !a.isExtension && (
                                                  <span className="ml-1 px-1 bg-slate-500 text-white rounded text-[8px] font-bold">
                                                    {rest}H
                                                  </span>
                                                )}
                                                {showDays && (
                                                  <span className="ml-1 px-1 bg-black/20 rounded text-[8px]">
                                                    {daysWorked}
                                                  </span>
                                                )}
                                                {nextDayShiftTime && (
                                                  <span className="ml-1 px-1 bg-slate-400 text-white rounded text-[8px] font-mono">
                                                    → {nextDayShiftTime}
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {assignments.length === 0 && (
                                            <span className="text-[10px] italic text-slate-300">
                                              Drag staff here...
                                            </span>
                                          )}
                                        </div>

                                        <div className="mt-1 flex gap-1">
                                          {/* Note Button */}
                                          <button 
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  setNoteModal({ dateString: prog.dateString!, shiftId: shift.id, currentNote: prog.notes?.[shift.id] || '' });
                                              }}
                                              className={`flex-1 min-w-0 flex items-center justify-center gap-1 text-[9px] p-1 border rounded transition-colors font-bold ${
                                                  prog.notes?.[shift.id] 
                                                  ? "bg-indigo-100 text-indigo-800 border-indigo-300" 
                                                  : "bg-slate-50 border-slate-200 border-dashed text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200"
                                              }`}
                                              title={prog.notes?.[shift.id] ? "Edit Note" : "Add Note"}
                                          >
                                              <MessageSquare size={10} />
                                              Note
                                          </button>
                                        </div>

                                        {prog.notes?.[shift.id] && (
                                            <div className="mt-1 text-[9px] text-red-600 font-bold p-1 bg-red-50 border border-red-100 rounded break-words whitespace-pre-wrap leading-tight">
                                                {prog.notes[shift.id]}
                                            </div>
                                        )}

                                        {Object.entries(
                                          shift.roleCounts || {},
                                        ).filter(([k, count]) => count > 0 && !k.startsWith("__"))
                                          .length > 0 && (
                                          <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2 mt-1">
                                            {Object.entries(
                                              shift.roleCounts || {},
                                            )
                                              .filter(([k, count]) => count > 0 && !k.startsWith("__"))
                                              .map(([role, count]) => {
                                                let roleKey = role;
                                                if (role === "Load Control")
                                                  roleKey = "LC";
                                                if (role === "Shift Leader")
                                                  roleKey = "SL";
                                                if (role === "Ramp")
                                                  roleKey = "RMP";
                                                if (role === "Operations")
                                                  roleKey = "OPS";
                                                if (role === "Lost and Found")
                                                  roleKey = "LF";
                                                if (role === "Labour")
                                                  roleKey = "LBR";
                                                if (role === "Security")
                                                  roleKey = "SEC";
                                                if (role === "Driver")
                                                  roleKey = "DRV";

                                                const fulfilledCount =
                                                  assignments.filter((a) => {
                                                    const st = getStaff(
                                                      a.staffId,
                                                    );
                                                    if (!st) return false;
                                                    if (
                                                      a.role === roleKey ||
                                                      a.role === role
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "LC" &&
                                                      (st.isLoadControl ||
                                                        st.initials.toUpperCase() ===
                                                          "SK-ATZ")
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "SL" &&
                                                      (st.isShiftLeader ||
                                                        st.initials.toUpperCase() ===
                                                          "SK-ATZ")
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "RMP" &&
                                                      st.isRamp
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "OPS" &&
                                                      st.isOps
                                                    )
                                                      return true;
                                                    if (
                                                      roleKey === "LF" &&
                                                      st.isLostFound
                                                    )
                                                      return true;
                                                    if (
                                                      (roleKey === "LBR" ||
                                                        roleKey === "Labour") &&
                                                      st.isLabour
                                                    )
                                                      return true;
                                                    if (
                                                      (roleKey === "SEC" ||
                                                        roleKey === "Security") &&
                                                      st.isSecurity
                                                    )
                                                      return true;
                                                    if (
                                                      (roleKey === "DRV" ||
                                                        roleKey === "Driver") &&
                                                      st.isDriver
                                                    )
                                                      return true;
                                                    return false;
                                                  }).length;
                                                const isFulfilled =
                                                  fulfilledCount >= count;

                                                return (
                                                  <span
                                                    key={roleKey}
                                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 ${isFulfilled ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}
                                                  >
                                                    {roleKey}{" "}
                                                    {isFulfilled ? "✅" : "❌"}
                                                  </span>
                                                );
                                              })}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              },
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div
                        className={`border-t-4 md:border-t-0 md:border-l-0 border-slate-100 md:w-[35%] md:flex-shrink-0 md:sticky md:top-[160px] md:self-start transition-colors ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-slate-50" : ""}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) =>
                          handleDrop(e, "ABSENCE", prog.dateString!)
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTargetContainerTap("ABSENCE", prog.dateString!);
                        }}
                      >
                        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest">
                              Absence and Rest Registry
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setUnlockAbsences(!unlockAbsences);
                              }}
                              className={`p-1 rounded ${unlockAbsences ? "bg-rose-100 text-rose-600" : "bg-slate-200 text-slate-500"} hover:opacity-80 transition-all`}
                              title={unlockAbsences ? "Lock absences" : "Unlock absences to reassign"}
                            >
                              {unlockAbsences ? <Unlock size={12} /> : <Lock size={12} />}
                            </button>
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 italic">
                            Drag or tap here to unassign
                          </span>
                        </div>
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-2 w-48">
                                Status Category
                              </th>
                              <th className="px-4 py-2">Personnel Initials</th>
                            </tr>
                          </thead>
                          <tbody className="text-[10px] font-medium text-slate-600 divide-y divide-slate-100">
                            {Object.entries(categories).map(([cat, items]) => {
                              const curCatIds = items
                                .map((i: any) => i.staff.id)
                                .sort()
                                .join(",");
                              const refCatIds = (refCategories[cat] || [])
                                .sort()
                                .join(",");
                              const isCatModified = curCatIds !== refCatIds;

                              const sortedItems = [...items].sort((a: any, b: any) => {
                                const stA = a.staff;
                                const stB = b.staff;
                                if (!stA && !stB) return 0;
                                if (!stA) return 1;
                                if (!stB) return -1;

                                const getGroupRank = (st: any) => {
                                  if (st.isLabour) return 3;
                                  if (st.isSecurity) return 2;
                                  return 1; // Traffic staff (includes other non-labour/non-security roles)
                                };

                                const rankA = getGroupRank(stA);
                                const rankB = getGroupRank(stB);
                                if (rankA !== rankB) {
                                  return rankA - rankB;
                                }

                                return (stA.initials || "").localeCompare(stB.initials || "");
                              });

                              return (
                                <tr
                                  key={cat}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                  }}
                                  onDrop={(e) => {
                                    e.stopPropagation();
                                    handleDrop(e, `ABSENCE_${cat}`, prog.dateString!);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTargetContainerTap(`ABSENCE_${cat}`, prog.dateString!);
                                  }}
                                  className={`transition-colors ${isCatModified ? "bg-indigo-50/70 border-l-4 border-indigo-400" : ""} ${staffActionModal?.date === prog.dateString ? "cursor-pointer hover:bg-indigo-50" : ""}`}
                                >
                                  <td className="px-4 py-3 font-bold align-top">
                                    {cat}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col gap-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {sortedItems.map((item, idx) => {
                                          const {
                                            staff: s,
                                            count,
                                            isRequestedDayOff,
                                          } = item as any;
                                          const daysWorked = getStaffWorkload(
                                            s.id,
                                          );
                                          const colorClass = getStaffColor(
                                            s,
                                            daysWorked,
                                            null,
                                          );
                                          const isLocked = !unlockAbsences && (item as any).isLeave;
                                          const isHiddenRole = !isOffDutyVisible(s);
                                          const _dummy =
                                            !unlockAbsences && (
                                              cat === "ROSTER LEAVE" ||
                                              cat === "ANNUAL LEAVE" ||
                                              isRequestedDayOff
                                            );
                                          return (
                                            <React.Fragment key={s.id}>
                                              <div
                                                draggable={!isLocked}
                                                onDragStart={(e) => {
                                                  if (isLocked) {
                                                    e.preventDefault();
                                                    return;
                                                  }
                                                  handleDragStart(
                                                    e,
                                                    s.id,
                                                    `ABSENCE_${cat}`,
                                                    prog.dateString!,
                                                    s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ" ? "SL" :
                                                    s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ" ? "LC" :
                                                    s.isRamp ? "RMP" :
                                                    s.isLostFound ? "LF" :
                                                    s.isLabour ? "LBR" :
                                                    s.isSecurity ? "SEC" :
                                                    s.isDriver ? "DRV" :
                                                    s.isOps ? "OPS" :
                                                    "AGT"
                                                  );
                                                }}
                                                onClick={(e) => {
                                                  if (isLocked) return;
                                                  handleStaffItemTap(e, s.id, `ABSENCE_${cat}`, prog.dateString!, s.isShiftLeader || s.initials.toUpperCase() === "SK-ATZ" ? "SL" :
                                                    s.isLoadControl || s.initials.toUpperCase() === "SK-ATZ" ? "LC" :
                                                    s.isRamp ? "RMP" :
                                                    s.isLostFound ? "LF" :
                                                    s.isLabour ? "LBR" :
                                                    s.isSecurity ? "SEC" :
                                                    s.isDriver ? "DRV" :
                                                    s.isOps ? "OPS" :
                                                    "AGT"
                                                  );
                                                }}
                                                className={`px-2 py-1 border rounded shadow-sm text-[10px] font-bold uppercase transition-all flex items-center gap-1 group ${colorClass} ${isHiddenRole ? "opacity-30 saturate-50 border-dashed hover:opacity-100" : ""} ${staffActionModal?.staffId === s.id && staffActionModal?.currentShiftId === ("ABSENCE_" + cat) && staffActionModal?.date === prog.dateString ? "ring-2 ring-offset-1 ring-indigo-600 scale-105" : ""} ${isLocked ? "opacity-80 cursor-not-allowed border-slate-200 text-slate-500" : "cursor-move hover:scale-105"}`}
                                              >
                                                <span>{s.initials}</span>
                                                {isLocked ? (
                                                  <Lock
                                                    size={8}
                                                    className="opacity-70 ml-0.5"
                                                  />
                                                ) : null}
                                              </div>
                                            </React.Fragment>
                                          );
                                        })}
                                        {items.length === 0 && (
                                          <span className="text-[10px] text-slate-300 italic">
                                            None
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      </div>{/* end flex-row side-by-side */}
                    </div>
                  );
                })}
            </>
          )}
        </div>
      )}

      {shiftEditModal && (() => {
        const progIdx = programs.findIndex(p => p.dateString === shiftEditModal.dateString);
        if (progIdx === -1) return null;
        const prog = programs[progIdx];
        const shift = shifts.find(s => s.id === shiftEditModal.shiftId);
        if (!shift) return null;

        const currentAssignments = prog.assignments.filter(a => a.shiftId === shift.id);
        const nonLabourWorkerCount = currentAssignments.filter(a => {
           const st = activeStaff.find(s => s.id === a.staffId);
           return st && !st.isLabour && !st.isDriver && !st.isSecurity && !st.isAccountant;
        }).length;
        const workingIds = new Set(prog.assignments.map(a => a.staffId));
        const offStaff = activeStaff.filter(s => !workingIds.has(s.id) && isStaffActiveOnDate(s, prog.dateString!));

        const addStaff = (staffId: string) => {
          const newPrograms = [...programs];
          const maxSort = Math.max(0, ...prog.assignments.map(a => a.manualSortIndex || 0));
          const newProg = { ...newPrograms[progIdx], assignments: [...newPrograms[progIdx].assignments] };
          const staffObj = activeStaff.find(s => s.id === staffId);
          let assignedRole = "AGT";
          if (staffObj) {
            if (staffObj.isShiftLeader || staffObj.initials.toUpperCase() === "SK-ATZ") assignedRole = "SL";
            else if (staffObj.isLoadControl) assignedRole = "LC";
            else if (staffObj.isRamp) assignedRole = "RMP";
            else if (staffObj.isLostFound) assignedRole = "LF";
            else if (staffObj.isLabour) assignedRole = "LBR";
            else if (staffObj.isSecurity) assignedRole = "SEC";
            else if (staffObj.isDriver) assignedRole = "DRV";
            else if (staffObj.isOps) assignedRole = "OPS";
          }

          newProg.assignments.push({
            id: crypto.randomUUID(),
            staffId,
            shiftId: shift.id,
            flightId: "",
            role: assignedRole,
            manualSortIndex: maxSort + 1
          });
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms, [programs[progIdx].dateString as string]);
        };

        const removeStaff = (staffId: string) => {
          const newPrograms = [...programs];
          const newProg = { ...newPrograms[progIdx] };
          newProg.assignments = newProg.assignments.filter(
            a => !(a.staffId === staffId && a.shiftId === shift.id)
          );
          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms, [programs[progIdx].dateString as string]);
        };

        const handleSaveBulkEdit = () => {
          const initialsArray = shiftBulkEditText.split(/[\s,-]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
          const matchedStaffIds = [...new Set(initialsArray.map(initial => {
            const st = activeStaff.find(s => s.initials.toUpperCase() === initial);
            return st ? st.id : null;
          }).filter(Boolean) as string[])];

          const newPrograms = [...programs];
          const newProg = { ...newPrograms[progIdx], assignments: [...newPrograms[progIdx].assignments] };
          
          // Remove everyone from the current shift since we are replacing the entire shift
          newProg.assignments = newProg.assignments.filter(a => a.shiftId !== shift.id);
          
          // Ensure the newly assigned staff are removed from any *other* shifts on this day
          newProg.assignments = newProg.assignments.filter(a => !matchedStaffIds.includes(a.staffId));
          
          const maxSort = Math.max(0, ...newProg.assignments.map(a => a.manualSortIndex || 0));
          matchedStaffIds.forEach((staffId, i) => {
            const staffObj = activeStaff.find(s => s.id === staffId);
            let assignedRole = "AGT";
            if (staffObj) {
              if (staffObj.isShiftLeader || staffObj.initials.toUpperCase() === "SK-ATZ") assignedRole = "SL";
              else if (staffObj.isLoadControl) assignedRole = "LC";
              else if (staffObj.isRamp) assignedRole = "RMP";
              else if (staffObj.isLostFound) assignedRole = "LF";
              else if (staffObj.isLabour) assignedRole = "LBR";
              else if (staffObj.isSecurity) assignedRole = "SEC";
              else if (staffObj.isDriver) assignedRole = "DRV";
              else if (staffObj.isOps) assignedRole = "OPS";
            }
            newProg.assignments.push({
              id: crypto.randomUUID(),
              staffId,
              shiftId: shift.id,
              flightId: "",
              role: assignedRole,
              manualSortIndex: maxSort + 1 + i
            });
          });

          newPrograms[progIdx] = newProg;
          onUpdatePrograms(newPrograms, [programs[progIdx].dateString as string]);
          setIsShiftBulkEditMode(false);
          setShiftBulkEditText("");
        };

        return (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
              <div className="bg-indigo-600 p-4 flex items-center justify-between">
                <h3 className="font-black italic uppercase tracking-widest text-white leading-none">
                  Shift at {shift.pickupTime} <span className="text-indigo-200">({nonLabourWorkerCount}/{shift.maxStaff})</span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!isShiftBulkEditMode) {
                        const currentInitials = currentAssignments.map(a => {
                          const st = activeStaff.find(s => s.id === a.staffId);
                          return st ? st.initials : "";
                        }).filter(Boolean).join(" - ");
                        setShiftBulkEditText(currentInitials);
                      }
                      setIsShiftBulkEditMode(!isShiftBulkEditMode);
                    }}
                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isShiftBulkEditMode ? "bg-white text-indigo-600" : "bg-indigo-500 hover:bg-indigo-400 text-white"}`}
                    title="Bulk Edit Initials"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setShiftEditModal(null);
                      setIsShiftBulkEditMode(false);
                      setShiftBulkEditText("");
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto">
                {isShiftBulkEditMode ? (
                  <div className="flex flex-col gap-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Edit Staff Initials
                    </label>
                    <p className="text-[10px] text-slate-500 mb-1 leading-tight">
                      Type staff initials separated by spaces, commas, or dashes (e.g. <span className="font-mono text-slate-700">mz - MH - mk</span>).<br/>
                      This will replace the entire shift assignment.
                    </p>
                    <textarea
                      value={shiftBulkEditText}
                      onChange={e => setShiftBulkEditText(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 resize-none h-32 uppercase"
                      placeholder="e.g. mz - MH - mk"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setIsShiftBulkEditMode(false)}
                        className="flex-1 p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveBulkEdit}
                        className="flex-1 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-indigo-200"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Currently Assigned</h4>
                    {currentAssignments.length === 0 ? (
                      <p className="text-sm text-slate-400 italic mb-4">No staff assigned.</p>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {currentAssignments.map(a => {
                          const st = activeStaff.find(s => s.id === a.staffId);
                          if (!st) return null;
                          return (
                            <div key={a.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl">
                              <span className="font-bold text-sm text-slate-700">{st.name} <span className="text-slate-400 text-xs font-mono ml-1">({st.initials}) - {a.role} [{getStaffRoleRating(st, a.role)}%]</span></span>
                              <button
                                onClick={() => removeStaff(st.id)}
                                className="bg-rose-50 text-rose-500 p-2 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pt-4 border-t border-slate-100">Add Staff</h4>
                    <select
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20"
                      onChange={(e) => {
                        if (e.target.value) {
                          addStaff(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Select available staff...</option>
                      {offStaff.map(st => {
                        let assignedRole = "AGT";
                        if (st.isShiftLeader || st.initials.toUpperCase() === "SK-ATZ") assignedRole = "SL";
                        else if (st.isLoadControl) assignedRole = "LC";
                        else if (st.isRamp) assignedRole = "RMP";
                        else if (st.isLostFound) assignedRole = "LF";
                        else if (st.isOps) assignedRole = "OPS";
                        else if (st.isLabour) assignedRole = "LBR";
                        else if (st.isSecurity) assignedRole = "SEC";
                        else if (st.isDriver) assignedRole = "DRV";
                        
                        const roleRating = getStaffRoleRating(st, assignedRole);
                        return { st, assignedRole, roleRating };
                      }).sort((a, b) => {
                        if (a.assignedRole !== b.assignedRole) return a.assignedRole.localeCompare(b.assignedRole);
                        return b.roleRating - a.roleRating;
                      }).map(({st, assignedRole, roleRating}) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.initials}) - {assignedRole} [{roleRating}%]
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {staffActionModal && (() => {
        const progIdx = programs.findIndex(p => p.dateString === staffActionModal.date);
        const st = activeStaff.find(s => s.id === staffActionModal.staffId);
        if (progIdx === -1 || !st) return null;
        
        return (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
              <div className="bg-indigo-600 p-4 flex items-center justify-between">
                <h3 className="font-black italic uppercase tracking-widest text-white leading-none">
                  Move Staff
                </h3>
                <button
                  onClick={() => setStaffActionModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg">
                    {st.initials}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{st.name}</h4>
                    <p className="text-xs text-slate-500 font-medium">
                      Current: {staffActionModal.currentShiftId.startsWith("ABSENCE_") 
                        ? staffActionModal.currentShiftId.replace("ABSENCE_", "") 
                        : (shifts.find(s => s.id === staffActionModal.currentShiftId)?.pickupTime ? `Shift at ${shifts.find(s => s.id === staffActionModal.currentShiftId)?.pickupTime}` : staffActionModal.currentShiftId)}
                    </p>
                  </div>
                </div>

                {!staffActionModal.currentShiftId.startsWith("ABSENCE_") && (
                  <>
                    <div className="mb-4">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Note (Appears in Excel)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. LL" 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20"
                        defaultValue={programs[progIdx].assignments.find(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId)?.note || ""}
                        onBlur={(e) => {
                          if (onUpdatePrograms) {
                            const newProgs = [...programs];
                            const currentProg = { ...newProgs[progIdx], assignments: [...newProgs[progIdx].assignments] };
                            const aIdx = currentProg.assignments.findIndex(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId);
                            if (aIdx !== -1) {
                              currentProg.assignments[aIdx] = { ...currentProg.assignments[aIdx], note: e.target.value };
                              newProgs[progIdx] = currentProg;
                              onUpdatePrograms(newProgs, [programs[progIdx].dateString as string]);
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Custom Start Duty Time (HH:MM)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 14:30" 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20"
                        defaultValue={programs[progIdx].assignments.find(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId)?.customStartTime || ""}
                        onBlur={(e) => {
                          if (onUpdatePrograms) {
                            const val = e.target.value.trim();
                            const newProgs = [...programs];
                            const currentProg = { ...newProgs[progIdx], assignments: [...newProgs[progIdx].assignments] };
                            const aIdx = currentProg.assignments.findIndex(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId);
                            if (aIdx !== -1) {
                              currentProg.assignments[aIdx] = { ...currentProg.assignments[aIdx], customStartTime: val || undefined };
                              newProgs[progIdx] = currentProg;
                              onUpdatePrograms(newProgs, [programs[progIdx].dateString as string]);
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Release / End Duty Time (HH:MM)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 06:30" 
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20"
                        defaultValue={programs[progIdx].assignments.find(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId)?.releaseTime || ""}
                        onBlur={(e) => {
                          if (onUpdatePrograms) {
                            const val = e.target.value.trim();
                            const newProgs = [...programs];
                            const currentProg = { ...newProgs[progIdx], assignments: [...newProgs[progIdx].assignments] };
                            const aIdx = currentProg.assignments.findIndex(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId);
                            if (aIdx !== -1) {
                              currentProg.assignments[aIdx] = { ...currentProg.assignments[aIdx], releaseTime: val || undefined };
                              newProgs[progIdx] = currentProg;
                              onUpdatePrograms(newProgs, [programs[progIdx].dateString as string]);
                            }
                          }
                        }}
                      />
                    </div>
                  </>
                )}

                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Move To</label>
                <select
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 mb-4"
                  onChange={(e) => {
                    executeMove(
                      staffActionModal.staffId,
                      staffActionModal.currentShiftId,
                      staffActionModal.date,
                      staffActionModal.role,
                      e.target.value,
                      staffActionModal.date
                    );
                    setStaffActionModal(null);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select destination...</option>
                  <optgroup label="Shifts">
                    {shifts.filter((s) => s.pickupDate === staffActionModal.date && !s.isHidden)
                      .sort((a, b) => a.pickupTime.localeCompare(b.pickupTime))
                      .map(s => (
                      <option key={s.id} value={s.id} disabled={s.id === staffActionModal.currentShiftId}>Shift at {s.pickupTime}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Absences">
                    <option value="ABSENCE_ANNUAL LEAVE" disabled={staffActionModal.currentShiftId === "ABSENCE_ANNUAL LEAVE"}>Annual Leave</option>
                    <option value="ABSENCE_SICK LEAVE" disabled={staffActionModal.currentShiftId === "ABSENCE_SICK LEAVE"}>Sick Leave</option>
                    <option value="ABSENCE_ROSTER LEAVE" disabled={staffActionModal.currentShiftId === "ABSENCE_ROSTER LEAVE" || st.type === "Local"}>Roster Leave</option>
                    <option value="ABSENCE_STANDBY (RESERVE)" disabled={staffActionModal.currentShiftId === "ABSENCE_STANDBY (RESERVE)"}>Standby (Reserve)</option>
                  </optgroup>
                  
                  <optgroup label="Action">
                    <option value="OFFDUTY" disabled={staffActionModal.currentShiftId === "OFFDUTY"}>Remove from Shift / Send Off-Duty</option>
                  </optgroup>
                </select>

                {!staffActionModal.currentShiftId.startsWith("ABSENCE_") && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Extend To Shift</label>
                    <div className="flex gap-2">
                      <select
                        value={extendTargetShiftId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExtendTargetShiftId(val);
                          const targetShift = shifts.find((s) => s.id === val);
                          if (targetShift) {
                            const dayShifts = shifts.filter((s) => s.pickupDate === targetShift.pickupDate && !s.isHidden).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
                            const isLast = dayShifts.length > 0 && dayShifts[dayShifts.length - 1].id === val;
                            if (isLast) {
                              setExtendReleaseTime("06:30");
                            }
                          }
                        }}
                        className="w-2/3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/20"
                      >
                        <option value="" disabled>Select shift...</option>
                        {(() => {
                          const dayShifts = shifts.filter((s) => s.pickupDate === staffActionModal.date && !s.isHidden).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
                          const currIdx = dayShifts.findIndex(s => s.id === staffActionModal.currentShiftId);
                          const sameDayShifts = currIdx !== -1 ? (currIdx < dayShifts.length - 1 ? dayShifts.slice(currIdx + 1) : [dayShifts[currIdx]]) : [];

                          const currDateObj = new Date(`${staffActionModal.date}T12:00:00Z`);
                          currDateObj.setDate(currDateObj.getDate() + 1);
                          const nextDateStr = currDateObj.toISOString().split("T")[0];
                          const nextDayShifts = shifts.filter((s) => s.pickupDate === nextDateStr && !s.isHidden).sort((a, b) => a.pickupTime.localeCompare(b.pickupTime));
                          const nextDayFirstShift = nextDayShifts.length > 0 ? nextDayShifts[0] : null;

                          return (
                            <>
                              {sameDayShifts.map(s => (
                                <option key={s.id} value={s.id}>Shift at {s.pickupTime} {s.id === dayShifts[dayShifts.length - 1]?.id ? "(Till 06:30)" : ""}</option>
                              ))}
                              {nextDayFirstShift && !sameDayShifts.some(s => s.id === nextDayFirstShift.id) && (
                                <option key={nextDayFirstShift.id} value={nextDayFirstShift.id}>
                                  Next Day ({nextDateStr}) First Shift at {nextDayFirstShift.pickupTime} {nextDayShifts.length === 1 ? "(Till 06:30)" : ""}
                                </option>
                              )}
                            </>
                          );
                        })()}
                      </select>
                      <input 
                        type="time"
                        value={extendReleaseTime}
                        onChange={(e) => setExtendReleaseTime(e.target.value)}
                        className="w-1/3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700 focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/20"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (extendTargetShiftId || extendReleaseTime) {
                          const currentAssignment = programs[progIdx].assignments.find(a => a.staffId === staffActionModal.staffId && a.shiftId === staffActionModal.currentShiftId);
                          const trueInitialShiftId = currentAssignment?.isExtension && currentAssignment.initialShiftId ? currentAssignment.initialShiftId : staffActionModal.currentShiftId;
                          executeExtend(staffActionModal.staffId, trueInitialShiftId, staffActionModal.date, staffActionModal.role, extendTargetShiftId, extendReleaseTime);
                        }
                      }}
                      disabled={!extendTargetShiftId && !extendReleaseTime}
                      className="mt-3 w-full p-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      Confirm Extension
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {noteModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 p-4 flex items-center justify-between">
              <h3 className="font-black italic uppercase tracking-widest text-white leading-none flex items-center gap-2">
                <MessageSquare size={16} />
                Shift Note
              </h3>
            </div>
            <div className="p-5">
              <textarea
                autoFocus
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 placeholder:text-slate-300 transition-all resize-none h-32"
                placeholder="Enter shift note here..."
                value={noteModal.currentNote}
                onChange={(e) => setNoteModal({ ...noteModal, currentNote: e.target.value })}
              />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => setNoteModal(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleUpdateNote(noteModal.dateString, noteModal.shiftId, noteModal.currentNote);
                  setNoteModal(null);
                }}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest italic transition-colors text-sm"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 p-5 flex items-center justify-between">
              <h3 className="font-black italic uppercase tracking-widest text-white leading-none flex items-center gap-2 text-base">
                <Settings size={20} />
                Program Settings
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Signatures Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-black uppercase tracking-wider text-xs text-indigo-600">
                    Signatures (Staff Excel) — Linked to Active Program
                  </h4>
                  <span className="text-[11px] font-black text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                    {startDate} to {endDate}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Prepared By</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 transition-all font-bold"
                      placeholder="e.g. Operation Control"
                      value={tempPrep}
                      onChange={(e) => setTempPrep(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Revised By</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 transition-all font-bold"
                      placeholder="e.g. Duty Manager"
                      value={tempRev}
                      onChange={(e) => setTempRev(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  These signature names are strictly saved for this specific program period ({startDate} to {endDate}) and printed at the bottom of the exported Staff Excel sheet.
                </p>
              </div>

              {/* Global Settings Notice */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs text-slate-600 font-bold">
                <span>🌐 System Settings (Synced across all devices & users)</span>
              </div>

              {/* Day-Off Rest Section */}
              <div className="space-y-4">
                <h4 className="font-black uppercase tracking-wider text-xs text-slate-400 border-b border-slate-100 pb-2">
                  Day-Off Rest limits (Gray Highlighting)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Min Off-Day Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 transition-all font-bold"
                      value={tempMinOff}
                      onChange={(e) => setTempMinOff(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Max Off-Day Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20 transition-all font-bold"
                      value={tempMaxOff}
                      onChange={(e) => setTempMaxOff(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  If rest after a day off is within this range, the cell will be highlighted in gray. If it falls below the minimum limit, it will trigger a warning.
                </p>
              </div>

              {/* Off-Duty Staff Visibility */}
              <div className="space-y-4">
                <h4 className="font-black uppercase tracking-wider text-xs text-slate-400 border-b border-slate-100 pb-2">
                  Off-Duty Staff Visibility
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      checked={tempHideDrivers}
                      onChange={(e) => setTempHideDrivers(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">Hide Drivers</span>
                      <span className="text-[10px] text-slate-400">Do not display drivers on off-duty days</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      checked={tempHideLabour}
                      onChange={(e) => setTempHideLabour(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">Hide Labourers</span>
                      <span className="text-[10px] text-slate-400">Do not display labourers on off-duty days</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      checked={tempHideSecurity}
                      onChange={(e) => setTempHideSecurity(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">Hide Security</span>
                      <span className="text-[10px] text-slate-400">Do not display security on off-duty days</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      checked={tempHideAccountants}
                      onChange={(e) => setTempHideAccountants(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">Hide Accountants</span>
                      <span className="text-[10px] text-slate-400">Do not display accountants on off-duty days</span>
                    </div>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Toggle which staff groups/roles are hidden from the Off-Duty / Days Off lists on the Daily tab, PDF exports, and Excel sheets.
                </p>
              </div>

              {/* CKI Open Time in Staff Excel */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black uppercase tracking-wider text-xs text-slate-700">
                      CKI Open Time (Staff Excel)
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Show counter opening time in red under STD in Staff Excel
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={tempCkiEnabled}
                      onChange={(e) => setTempCkiEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {tempCkiEnabled && (
                  <div className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          International (Min before STD)
                        </label>
                        <input
                          type="number"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-400"
                          value={tempCkiIntlMins}
                          onChange={(e) => setTempCkiIntlMins(e.target.value)}
                          placeholder="e.g. 150 (2h30m)"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                          Domestic (Min before STD)
                        </label>
                        <input
                          type="number"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-400"
                          value={tempCkiDomMins}
                          onChange={(e) => setTempCkiDomMins(e.target.value)}
                          placeholder="e.g. 90 (1h30m)"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                        Domestic Airport Codes (Comma-separated)
                      </label>
                      <input
                        type="text"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 uppercase outline-none focus:border-indigo-400"
                        value={tempCkiDomCodes}
                        onChange={(e) => setTempCkiDomCodes(e.target.value)}
                        placeholder="CAI, LXR, HBE, SSH, ASW, HRG, MUH"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">
                        Flights with destinations matching these codes will use the Domestic open time. All others use International.
                      </p>
                    </div>

                    {/* Per-Destination Overrides */}
                    <div className="space-y-2 pt-2 border-t border-slate-200">
                      <label className="block text-[10px] font-black uppercase text-slate-600">
                        Per-Destination Overrides
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="DEST (e.g. DXB)"
                          className="w-1/2 p-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-800 outline-none"
                          value={newOverrideCode}
                          onChange={(e) => setNewOverrideCode(e.target.value.toUpperCase())}
                        />
                        <input
                          type="number"
                          placeholder="Minutes (e.g. 180)"
                          className="w-1/2 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                          value={newOverrideMins}
                          onChange={(e) => setNewOverrideMins(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!newOverrideCode.trim()) return;
                            const mins = parseInt(newOverrideMins) || 120;
                            const filtered = tempCkiOverrides.filter(
                              (o) => o.code.toUpperCase() !== newOverrideCode.trim().toUpperCase()
                            );
                            setTempCkiOverrides([...filtered, { code: newOverrideCode.trim().toUpperCase(), minutesBefore: mins }]);
                            setNewOverrideCode("");
                          }}
                          className="px-3 py-2 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-800 flex items-center gap-1 shrink-0"
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>

                      {tempCkiOverrides.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {tempCkiOverrides.map((ov) => (
                            <span
                              key={ov.code}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 shadow-sm"
                            >
                              <span>{ov.code}: <span className="text-emerald-600 font-black">{ov.minutesBefore}m</span></span>
                              <button
                                type="button"
                                onClick={() => setTempCkiOverrides(tempCkiOverrides.filter((o) => o.code !== ov.code))}
                                className="text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-xl font-bold transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const minVal = parseFloat(tempMinOff) || 23;
                  const maxVal = parseFloat(tempMaxOff) || 27;
                  const ckiConfToSave: CkiConfig = {
                    enabled: tempCkiEnabled,
                    intlMinutesBefore: parseInt(tempCkiIntlMins) || 150,
                    domMinutesBefore: parseInt(tempCkiDomMins) || 90,
                    domesticCodes: tempCkiDomCodes
                      .split(",")
                      .map((c) => c.trim().toUpperCase())
                      .filter(Boolean),
                    overrides: tempCkiOverrides,
                  };
                  handleSaveSettings(tempPrep, tempRev, minVal, maxVal, ckiConfToSave);
                }}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest italic transition-colors text-sm shadow-md shadow-indigo-600/10"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
