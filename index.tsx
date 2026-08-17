import React, { useState, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import "./style.css";
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
import "mobile-drag-drop/default.css";

// Initialize mobile drag-and-drop polyfill
polyfill({
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
});



window.addEventListener("unhandledrejection", (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes("Failed to fetch")) {
    event.preventDefault();
  }
});

const origError = console.error;
console.error = (...args) => {
  const isMatch = (a: any) => 
    (typeof a === 'string' && (a.includes('Invalid Refresh Token') || a.includes('Refresh Token Not Found') || a.includes('session from storage is not valid') || a.includes('Failed to fetch'))) ||
    (a instanceof Error && (a.message.includes('Invalid Refresh Token') || a.message.includes('Refresh Token Not Found') || a.message.includes('session from storage is not valid') || a.message.includes('Failed to fetch')));
  if (args.some(isMatch)) {
    return;
  }
  origError(...args);
};

const origWarn = console.warn;
console.warn = (...args) => {
  const isMatch = (a: any) => 
    (typeof a === 'string' && (a.includes('Invalid Refresh Token') || a.includes('Refresh Token Not Found') || a.includes('session from storage is not valid') || a.includes('Failed to fetch'))) ||
    (a instanceof Error && (a.message.includes('Invalid Refresh Token') || a.message.includes('Refresh Token Not Found') || a.message.includes('session from storage is not valid') || a.message.includes('Failed to fetch')));
  if (args.some(isMatch)) {
    return;
  }
  origWarn(...args);
};


// Prevent scrolling while dragging on mobile
window.addEventListener("touchmove", function () {}, { passive: false });

// Global error handlers for Supabase Invalid Refresh Token stuck state
window.addEventListener("error", (e) => {
  if (e.message?.includes("Invalid Refresh Token")) {
    e.preventDefault();
    localStorage.clear();
    
  }
});
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.message?.includes("Invalid Refresh Token") || e.reason?.message?.includes("Refresh Token Not Found")) {
    e.preventDefault();
    localStorage.clear();
    
  }
});

import {
  Plane,
  Users,
  Clock,
  LayoutDashboard,
  X,
  Activity,
  CalendarDays,
  Zap,
  Loader2,
  LogOut,
  Compass,
  Terminal,
  Trash2,
  Plus,
  Briefcase,
  Moon,
  Lock,
  Search,
  Calendar as CalendarIcon,
  ChevronRight,
  ShieldAlert,
  Eraser,
  Sparkles,
  Shield,
  Settings,
  Cloud,
  Layers,
  Timer,
  CheckCircle2,
  PieChart,
  ClipboardList,
  PlaneTakeoff,
  Check,
  Award,
  Menu,
} from "lucide-react";
import "./style.css";

import {
  Flight,
  Staff,
  DailyProgram,
  ShiftConfig,
  LeaveRequest,
  LeaveType,
  IncomingDuty,
  ProgramVersion,
  UserProfile,
  normalizeFlightNumber,
  Assignment,
  Airport,
} from "./types";
import { FlightManager } from "./components/FlightManager";
import { StaffManager } from "./components/StaffManager";
import { CGRatingModule } from "./components/CGRatingModule";
import { ShiftManager } from "./components/ShiftManager";
import { ProgramDisplay } from "./components/ProgramDisplay";
import { ProgramScanner } from "./components/ProgramScanner";
import { GithubSync } from "./components/GithubSync";
import { CapacityForecast } from "./components/CapacityForecast";
import { StationStatistics } from "./components/StationStatistics";
import { ReportsDisplay } from "./components/ReportsDisplay";
import { CommandCenter } from "./components/CommandCenter";
import { AirlineManager } from "./components/AirlineManager";
import { Auth } from "./components/Auth";
import { SkyOpsLogo } from "./components/Logo";
import { PreRosterModal } from "./components/PreRosterModal";
import { generateAIProgram } from "./services/geminiService";
import { db, supabase, auth } from "./services/supabaseService";
import { Session } from "@supabase/supabase-js";
import { ManualAssignment } from "./types";

const UI_PREF_KEYS = {
  START_DATE: "skyops_pref_start_date",
  END_DATE: "skyops_pref_end_date",
  REST_HOURS: "skyops_pref_min_rest",
  DURATION: "skyops_pref_duration",
};

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "flights"
    | "staff"
    | "cg_rating"
    | "shifts"
    | "program"
    | "reports"
    | "statistics"
    | "command"
  >("dashboard");
  const [cloudStatus, setCloudStatus] = useState<
    "connected" | "offline" | "unconfigured" | "error" | "connecting"
  >("connecting");
  const [cloudError, setCloudError] = useState<string>("");
  const [airports, setAirports] = useState<Airport[]>([]);

  const [startDate, setStartDate] = useState<string>(
    () =>
      localStorage.getItem(UI_PREF_KEYS.START_DATE) ||
      new Date().toISOString().split("T")[0],
  );
  const [programDuration, setProgramDuration] = useState<number>(() =>
    parseInt(localStorage.getItem(UI_PREF_KEYS.DURATION) || "7"),
  );
  const [endDate, setEndDate] = useState<string>(
    () =>
      localStorage.getItem(UI_PREF_KEYS.END_DATE) ||
      new Date().toISOString().split("T")[0],
  );
  const [minRestHours, setMinRestHours] = useState<number>(() =>
    parseInt(localStorage.getItem(UI_PREF_KEYS.REST_HOURS) || "12"),
  );

  // Initialize data
  const [flights, setFlights] = useState<Flight[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<ShiftConfig[]>([]);
  const [programs, setPrograms] = useState<DailyProgram[]>([]);
  const [manualAssignments, setManualAssignments] = useState<
    ManualAssignment[]
  >([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [incomingDuties, setIncomingDuties] = useState<IncomingDuty[]>([]);

  const programsRef = useRef<DailyProgram[]>([]);
  const leaveRequestsRef = useRef<LeaveRequest[]>([]);

  useEffect(() => {
    programsRef.current = programs;
  }, [programs]);

  useEffect(() => {
    leaveRequestsRef.current = leaveRequests;
  }, [leaveRequests]);

  const [stationHealth, setStationHealth] = useState<number>(100);
  const [alerts, setAlerts] = useState<
    { type: "danger" | "warning"; message: string }[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreRosterModalOpen, setIsPreRosterModalOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<
    "flights" | "staff" | "shifts" | "all"
  >("all");
  const [notification, setNotification] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changePasswordMessage, setChangePasswordMessage] = useState("");

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setChangePasswordMessage("Password must be at least 6 characters.");
      return;
    }
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setChangePasswordMessage(error.message);
      } else {
        setChangePasswordMessage("Password updated successfully!");
        setTimeout(() => setIsChangePasswordOpen(false), 2000);
      }
    }
  };

  // Incoming Duties Logic (Rest Log)
  const [incomingSelectedStaffIds, setIncomingSelectedStaffIds] = useState<
    string[]
  >([]);
  const [incomingHour, setIncomingHour] = useState("06");
  const [incomingMin, setIncomingMin] = useState("00");
  const [incomingDate, setIncomingDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [incomingSearchTerm, setIncomingSearchTerm] = useState("");
  const [showIncomingShifts, setShowIncomingShifts] = useState(false);

  // Leave Registry Logic (Off-Duty)
  const [quickLeaveStaffIds, setQuickLeaveStaffIds] = useState<string[]>([]);
  const [quickLeaveType, setQuickLeaveType] = useState<LeaveType>("Day off");
  const [quickLeaveSearchTerm, setQuickLeaveSearchTerm] = useState("");
  const [quickLeaveSelectedDates, setQuickLeaveSelectedDates] = useState<string[]>([]);
  const [quickLeaveCustomDate, setQuickLeaveCustomDate] = useState("");
  const [quickLeaveRangeFrom, setQuickLeaveRangeFrom] = useState("");
  const [quickLeaveRangeTo, setQuickLeaveRangeTo] = useState(""); 

  const nonHiddenShifts = shifts.filter(s => !s.isHidden);
  // --- PREFERENCE PERSISTENCE EFFECTS ---
  useEffect(() => {
    const start = new Date(`${startDate}T12:00:00Z`);
    if (!isNaN(start.getTime())) {
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + (programDuration - 1));
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, programDuration]);

  useEffect(() => {
    if (!programs.length || !startDate || !endDate) return;
    
    // Check if we need to backfill missing dates (e.g., if AI skipped a day)
    let hasMissing = false;
    const start = new Date(`${startDate}T12:00:00Z`);
    const end = new Date(`${endDate}T12:00:00Z`);
    const dateSet = new Set(programs.map(p => p.dateString));
    
    let current = new Date(start);
    while (current <= end) {
      const dStr = current.toISOString().split("T")[0];
      if (!dateSet.has(dStr)) {
        hasMissing = true;
        break;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }
    
    if (hasMissing) {
      setPrograms(prev => {
        const newPrograms = [...prev];
        let d = new Date(start);
        let idx = 0;
        while (d <= end) {
          const dStr = d.toISOString().split("T")[0];
          if (!newPrograms.some(p => p.dateString === dStr)) {
            newPrograms.push({
              day: idx,
              dateString: dStr,
              assignments: []
            });
          }
          d.setUTCDate(d.getUTCDate() + 1);
          idx++;
        }
        return newPrograms.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
      });
    }
  }, [programs, startDate, endDate]);

  useEffect(() => {
    localStorage.setItem(UI_PREF_KEYS.START_DATE, startDate);
    localStorage.setItem(UI_PREF_KEYS.END_DATE, endDate);
    localStorage.setItem(UI_PREF_KEYS.REST_HOURS, minRestHours.toString());
    localStorage.setItem(UI_PREF_KEYS.DURATION, programDuration.toString());
  }, [startDate, endDate, minRestHours, programDuration]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    let mounted = true;
    const syncCloudData = async () => {
      if (!supabase) {
        setCloudStatus("unconfigured");
        return;
      }
      try {
        const cloudData = await db.fetchAll();
        const airportsData = await db.getAirports();
        if (mounted) {
          if (airportsData) setAirports(airportsData);
          if (cloudData) {
            if (cloudData.flights?.length) setFlights(cloudData.flights);
            if (cloudData.staff?.length) setStaff(cloudData.staff);
            if (cloudData.shifts?.length) setShifts(cloudData.shifts);
            if (cloudData.programs?.length) {
              const deduped: DailyProgram[] = [];
              const seen = new Set<string>();
              const sortedProgs = [...cloudData.programs].sort((a, b) => {
                const lenA = a.assignments?.length || 0;
                const lenB = b.assignments?.length || 0;
                return lenB - lenA;
              });
              sortedProgs.forEach((p) => {
                if (p.dateString) {
                  if (!seen.has(p.dateString)) {
                    seen.add(p.dateString);
                    deduped.push(p);
                  }
                }
              });
              setPrograms(deduped.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || "")));
            }
            if (cloudData.leaveRequests?.length)
              setLeaveRequests(cloudData.leaveRequests);
            if (cloudData.incomingDuties?.length)
              setIncomingDuties(cloudData.incomingDuties);
            setCloudStatus("connected");
          } else {
            setCloudStatus("error");
            setCloudError("Authentication session missing or sync failed");
          }
        }
      } catch (e: any) {
        if (mounted) {
          setCloudStatus("error");
          if (e.message && e.message.includes("Failed to fetch")) {
            setCloudError("Network Error: Adblocker/VPN blocking connection");
          } else {
            setCloudError(e.message || "Unknown error");
          }
        }
      }
    };
    const checkAuth = async () => {
      if (!supabase) {
        setIsInitializing(false);
        setCloudStatus("unconfigured");
        return;
      }
      try {
        const s = await auth.getSession(6000);
        if (mounted) {
          setSession(s);
          if (s) {
            db.getUserProfile().then((profile) => {
              if (mounted) setUserProfile(profile);
            });
            syncCloudData(); // Run in background without blocking initialization
          } else {
            setCloudStatus("unconfigured"); // Default to unconfigured instead of offline if logged out
          }
          setIsInitializing(false);
        }
      } catch (e: any) {
        if (mounted) {
          setCloudStatus("error");
          if (e.message && e.message.includes("Failed to fetch")) {
            setCloudError("Network Error: Could not connect to Supabase. This is usually caused by an Adblocker (like Brave Shields), VPN, or your network blocking access. Please disable your adblocker or try a different network.");
          } else {
            setCloudError(e.message || "Session fetch failed");
          }
          setIsInitializing(false);
        }
      }
    };
    checkAuth();

    let unsubscribe = () => {};
    if (supabase) {
      unsubscribe = auth.onAuthStateChange(async (event, s) => {
        if (event === "INITIAL_SESSION") return; // Handled by checkAuth
        if (mounted) {
          setSession(s);
          if (s) {
            db.getUserProfile().then((profile) => {
              if (mounted) setUserProfile(profile);
            });
            syncCloudData();
          } else {
            setUserProfile(null);
            setCloudStatus("unconfigured");
          }
        }
      });
    }

    let lastVisibilitySync = 0;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && supabase) {
        const now = Date.now();
        if (now - lastVisibilitySync > 5 * 60 * 1000) { // 5 minutes
          lastVisibilitySync = now;
          const s = await auth.getSession();
          if (s) syncCloudData();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);


  useEffect(() => {
    let channel: any = null;
    if (supabase && cloudStatus === "connected") {
       channel = supabase.channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'programs' },
          (payload) => {
             if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
               const p = payload.new;
               let notes = {};
               let shiftDrivers = {};
               let actualOffDuty: any[] = [];
               
               if (Array.isArray(p.off_duty)) {
                 const notesHack = p.off_duty.find((o: any) => o.staffId === "NOTES_HACK");
                 const driversHack = p.off_duty.find((o: any) => o.staffId === "DRIVERS_HACK");
                 if (notesHack) notes = notesHack.data;
                 if (driversHack) shiftDrivers = driversHack.data;
                 actualOffDuty = p.off_duty.filter((o: any) => o.staffId !== "NOTES_HACK" && o.staffId !== "DRIVERS_HACK");
               }
               
               const mappedProg = {
                 day: p.day,
                 dateString: p.date_string,
                 assignments: p.assignments || [],
                 offDuty: actualOffDuty,
                 notes: notes,
                 shiftDrivers: shiftDrivers,
               };
               
               setPrograms(prev => {
                  const newProgs = [...prev];
                  const idx = newProgs.findIndex(prog => prog.dateString === mappedProg.dateString);
                  
                  if (idx !== -1) {
                    // Check if anything actually changed to avoid unnecessary re-renders
                    if (JSON.stringify(newProgs[idx]) === JSON.stringify(mappedProg)) {
                      return prev;
                    }
                    newProgs[idx] = mappedProg;
                  } else {
                    newProgs.push(mappedProg);
                  }
                  return newProgs.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
               });
             } else if (payload.eventType === 'DELETE') {
               if (payload.old && payload.old.date_string) {
                 setPrograms(prev => prev.filter(prog => prog.dateString !== payload.old.date_string));
               }
             }
          }
        )
        .subscribe();
    }
    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [supabase, cloudStatus]);

  const confirmGenerateProgram = async (
    manualAssignments: ManualAssignment[] = [],
  ) => {
    setIsPreRosterModalOpen(false);

    if (userProfile) {
      if (!userProfile.isActive) {
        alert(
          "Your account has been frozen by the Master User. You cannot generate programs.",
        );
        return;
      }
      if (userProfile.role !== "super_admin" && userProfile.email !== "safazoom@gmail.com") {
        const dailyCount = await db.getAIGenerationCount(userProfile.id, "daily");
        if (dailyCount >= userProfile.aiDailyLimit) {
          alert(
            `Quota Reached: You have hit your daily limit of ${userProfile.aiDailyLimit} AI generations. Please contact your Master User to increase your limits.`,
          );
          return;
        }
        const weeklyCount = await db.getAIGenerationCount(
          userProfile.id,
          "weekly",
        );
        if (weeklyCount >= userProfile.aiWeeklyLimit) {
          alert(
            `Quota Reached: You have hit your weekly limit of ${userProfile.aiWeeklyLimit} AI generations.`,
          );
          return;
        }
        const monthlyCount = await db.getAIGenerationCount(
          userProfile.id,
          "monthly",
        );
        if (monthlyCount >= userProfile.aiMonthlyLimit) {
          alert(
            `Quota Reached: You have hit your monthly limit of ${userProfile.aiMonthlyLimit} AI generations.`,
          );
          return;
        }
      }
    }

    const activeShifts = nonHiddenShifts.filter(
      (s) => s.pickupDate >= startDate && s.pickupDate <= endDate,
    );
    const eligibleStaff = staff.filter((s) => {
      if (s.type === "Local") return true;
      if (Array.isArray(s.rosterPeriods) && s.rosterPeriods.length > 0) {
        return s.rosterPeriods.some(
          (p) => p.start <= endDate && p.end >= startDate,
        );
      }
      return (
        !s.workFromDate ||
        !s.workToDate ||
        (s.workFromDate <= endDate && s.workToDate >= startDate)
      );
    });
    if (activeShifts.length === 0) {
      alert(`No shifts found for period.`);
      return;
    }
    setIsGenerating(true);
    try {
      setManualAssignments(manualAssignments);
      const result = await generateAIProgram(
        {
          flights,
          staff: eligibleStaff,
          shifts: activeShifts,
          programs, // Pass full old programs so engine can auto-detect previous shifts & day-offs
          leaveRequests,
          incomingDuties,
          manualAssignments,
        },
        "",
        { numDays: programDuration, minRestHours, startDate },
      );

      // Save current program as a version before overwriting if it has assignments
      if (programs.some((p) => p.assignments.length > 0)) {
        let versions: ProgramVersion[] = [];
        if (supabase) {
          try {
             versions = await db.getProgramVersions() || [];
          } catch(e) {}
        }
        
        const newVersion: ProgramVersion = {
          id: crypto.randomUUID(),
          versionNumber: versions.length + 1,
          name: `Auto-Save before AI Gen (${new Date().toLocaleTimeString()})`,
          createdAt: new Date().toISOString(),
          periodStart: startDate,
          periodEnd: endDate,
          programs: JSON.parse(JSON.stringify(programs)),
          stationHealth,
          isAutoSave: true,
        };
        let updatedVersions = [newVersion, ...versions];
        const versionsToDelete = updatedVersions.slice(10);
        
        if (updatedVersions.length > 10) {
          updatedVersions = updatedVersions.slice(0, 10);
        }
        
        if (supabase) {
          await db.saveProgramVersion(newVersion);
          for (const old of versionsToDelete) {
            await db.deleteProgramVersion(old.id);
          }
        }
      }

      setPrograms(prev => {
        const merged = [...prev];
        result.programs.forEach((newP: any) => {
           const idx = merged.findIndex(p => p.dateString === newP.dateString);
           if (idx !== -1) merged[idx] = newP;
           else merged.push(newP);
        });
        return merged.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
      });
      setStationHealth(result.stationHealth);
      setAlerts(result.alerts || []);
      if (supabase) {
        await db.savePrograms(result.programs);
        await db.logAction(
          "GENERATE_AI",
          "PROGRAM",
          "AI_GEN",
          `Generated ${programDuration}-day program for ${activeShifts.length} shifts`,
        );
      }
      setActiveTab("program");
    } catch (err: any) {
      console.warn("Generation Error:", err);
      let msg = err.message || "Engine failure.";
      if (msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        msg =
          "Network Error: Could not connect to the AI service. This is usually caused by an Adblocker, VPN, or your network blocking access to Google's API. Please disable your adblocker or try a different network.";
      } else if (
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("UNAVAILABLE")
      ) {
        msg =
          "Google's AI servers are currently overloaded due to high demand. The system tried to reconnect multiple times but the servers are still busy. Please wait a minute or two and try generating again.";
      }
      alert(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDataExtracted = async (data: any) => {
    setShowScanner(false);

    try {
      if (data.flights && data.flights.length > 0) {
        const newFlights: Flight[] = [];
        setFlights((prev) => {
          const updated = [...prev];
          data.flights.forEach((f: Flight) => {
            const idx = updated.findIndex((existing) => existing.id === f.id);
            if (idx >= 0) updated[idx] = f;
            else updated.push(f);
            newFlights.push(f);
          });
          return updated;
        });
        if (supabase) {
          await db.upsertFlights(newFlights);
        }
      }

      if (data.staff && data.staff.length > 0) {
        const newStaff: Staff[] = [];
        setStaff((prev) => {
          const updated = [...prev];
          data.staff.forEach((s: Staff) => {
            const idx = updated.findIndex((existing) => existing.id === s.id);
            if (idx >= 0) updated[idx] = s;
            else updated.push(s);
            newStaff.push(s);
          });
          return updated;
        });
        if (supabase) {
          await db.upsertStaffBatch(newStaff);
        }
      }

      if (data.shifts && data.shifts.length > 0) {
        const newShifts: ShiftConfig[] = [];
        setShifts((prev) => {
          const updated = [...prev];
          data.shifts.forEach((s: ShiftConfig) => {
            const idx = updated.findIndex((existing) => existing.id === s.id);
            if (idx >= 0) updated[idx] = s;
            else updated.push(s);
            newShifts.push(s);
          });
          return updated;
        });
        if (supabase) {
          await db.upsertShiftsBatch(newShifts);
        }
      }
    } catch (e) {
      console.error("Failed to save extracted data:", e);
    }

    setNotification(`AI Sync Complete: ${data.flights?.length || 0} flights, ${data.staff?.length || 0} staff added/updated. (Check your date filters if they don't appear)`);
    setTimeout(() => setNotification(null), 3000);
  };

  // Case-insensitive staff token matcher (handles small/capital letters, suffixes e.g. mz, MZ, ms-atz, etc.)
  const matchStaffToken = (token: string, staffList: Staff[]) => {
    if (!token) return null;
    const cleanToken = token.trim().toUpperCase();
    if (!cleanToken) return null;

    // 1. Exact Match on Initials (case-insensitive)
    const exact = staffList.find(
      (s) => s.initials && s.initials.trim().toUpperCase() === cleanToken,
    );
    if (exact) return exact.id;

    // 2. Exact Match on Staff Name (case-insensitive)
    const nameMatch = staffList.find(
      (s) => s.name && s.name.trim().toUpperCase() === cleanToken,
    );
    if (nameMatch) return nameMatch.id;

    // 3. Prefix Match on Initials (Handling "ms" matching "MS-ATZ" or "MS-Atz" matching "MS-ATZ")
    const tokenPrefix = cleanToken.split(/[-_\s]/)[0];
    if (tokenPrefix) {
      const prefixMatch = staffList.find(
        (s) => s.initials && s.initials.trim().toUpperCase().split(/[-_\s]/)[0] === tokenPrefix,
      );
      if (prefixMatch) return prefixMatch.id;
    }

    // 4. Normalized Alphanumeric match (ignoring dashes/spaces)
    const normToken = cleanToken.replace(/[^A-Z0-9]/g, "");
    if (normToken) {
      const normMatch = staffList.find(
        (s) => s.initials && s.initials.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") === normToken,
      );
      if (normMatch) return normMatch.id;
    }

    return null;
  };

  const handleIncomingSearchChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    if (val.includes(" ") || val.includes(",") || val.includes(";") || val.includes("\n") || val.includes("\t")) {
      const tokens = val.split(/[\s,;\n\t]+/);
      const idsToAdd: string[] = [];
      const remaining: string[] = [];

      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) {
          idsToAdd.push(matchedId);
        } else {
          remaining.push(token);
        }
      });

      if (idsToAdd.length > 0) {
        setIncomingSelectedStaffIds((prev) =>
          Array.from(new Set([...prev, ...idsToAdd])),
        );
        setIncomingSearchTerm(remaining.join(" "));
        return;
      }
    }
    setIncomingSearchTerm(val);
  };

  const handleQuickLeaveSearchChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    if (val.includes(" ") || val.includes(",") || val.includes(";") || val.includes("\n") || val.includes("\t")) {
      const tokens = val.split(/[\s,;\n\t]+/);
      const idsToAdd: string[] = [];
      const remaining: string[] = [];

      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) {
          idsToAdd.push(matchedId);
        } else {
          remaining.push(token);
        }
      });

      if (idsToAdd.length > 0) {
        setQuickLeaveStaffIds((prev) =>
          Array.from(new Set([...prev, ...idsToAdd])),
        );
        setQuickLeaveSearchTerm(remaining.join(" "));
        return;
      }
    }
    setQuickLeaveSearchTerm(val);
  };

  const addIncomingDuties = async () => {
    const finalTime = `${incomingHour}:${incomingMin}`;
    const hr = parseInt(incomingHour);
    let endDateStr = incomingDate;
    if (hr < 12) {
      const dateObj = new Date(`${incomingDate}T12:00:00Z`);
      dateObj.setUTCDate(dateObj.getUTCDate() + 1);
      endDateStr = dateObj.toISOString().split("T")[0];
    }

    // Process input text on button click
    let finalIds = [...incomingSelectedStaffIds];
    if (incomingSearchTerm.trim()) {
      const tokens = incomingSearchTerm.split(/[\\s,\n]+/);
      const remaining: string[] = [];
      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) finalIds.push(matchedId);
        else remaining.push(token);
      });
      // Clear processed tokens
      if (remaining.length === 0) setIncomingSearchTerm("");
      else setIncomingSearchTerm(remaining.join(" "));
    }
    finalIds = Array.from(new Set(finalIds));

    if (finalIds.length === 0) return;

    const newDuties: IncomingDuty[] = finalIds.map((sid) => ({
      id: crypto.randomUUID(),
      staffId: sid,
      date: endDateStr,
      shiftEndTime: finalTime,
    }));

    setIncomingDuties((prev) => [...prev, ...newDuties]);
    if (supabase) {
      await db.upsertIncomingDuties(newDuties);
      await db.logAction(
        "CREATE",
        "LEAVE",
        "BULK",
        `Added ${newDuties.length} rest log entries`,
      );
    }

    setIncomingSelectedStaffIds([]);
    setNotification(`${newDuties.length} Rest Log Entries Added`);
  };

  const getShiftsForIncomingDate = () => {
    const programForDate = programs.find((p) => p.dateString === incomingDate);
    if (!programForDate) return [];

    const shiftIds = Array.from(
      new Set(programForDate.assignments.map((a) => a.shiftId).filter(Boolean))
    ) as string[];

    return shiftIds
      .map((shiftId) => {
        const shift = shifts.find((s) => s.id === shiftId);
        if (!shift) return null;
        const assignments = programForDate.assignments.filter(
          (a) => a.shiftId === shiftId
        );
        const staffInitials = assignments
          .map((a) => staff.find((s) => s.id === a.staffId)?.initials)
          .filter(Boolean);
        return {
          shiftId,
          shift,
          staffInitials,
          assignments,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  };

  const handleAddShiftStaff = (assignments: Assignment[], shift: ShiftConfig) => {
    const idsToAdd = assignments.map((a) => a.staffId).filter(Boolean);
    if (idsToAdd.length > 0) {
      const newDuties: IncomingDuty[] = [];
      const startHr = parseInt(shift.pickupTime.split(":")[0]) || 0;
      const endHr = parseInt(shift.endTime.split(":")[0]) || 0;
      let endDateStr = incomingDate;
      if (endHr < startHr || (endHr < 12 && startHr > 12)) {
         // Overnight shift
         const dateObj = new Date(`${incomingDate}T12:00:00Z`);
         dateObj.setUTCDate(dateObj.getUTCDate() + 1);
         endDateStr = dateObj.toISOString().split("T")[0];
      }

      for (const sid of idsToAdd) {
        const alreadyExists = incomingDuties.some(d => d.staffId === sid && d.date === endDateStr && d.shiftEndTime === shift.endTime);
        if (!alreadyExists && !newDuties.some(d => d.staffId === sid && d.date === endDateStr && d.shiftEndTime === shift.endTime)) {
          newDuties.push({
            id: crypto.randomUUID(),
            staffId: sid,
            date: endDateStr,
            shiftEndTime: shift.endTime,
          });
        }
      }

      if (newDuties.length > 0) {
        setIncomingDuties((prev) => [...prev, ...newDuties]);
        if (supabase) {
          db.upsertIncomingDuties(newDuties);
          db.logAction(
            "CREATE",
            "LEAVE",
            "BULK",
            `Added ${newDuties.length} rest log entries`
          );
        }
        setNotification(`${newDuties.length} Rest Log Entries Added`);
      } else {
        setNotification("Staff already in Rest Log for this shift.");
      }
    }
  };

  const toggleQuickLeaveDate = (dateStr: string) => {
    setQuickLeaveSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr]
    );
  };

  const addQuickLeaveDateRange = (fromStr: string, toStr: string) => {
    if (!fromStr || !toStr) return;
    const startMs = new Date(`${fromStr}T00:00:00Z`).getTime();
    const endMs = new Date(`${toStr}T00:00:00Z`).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) return;
    const dayMs = 24 * 60 * 60 * 1000;
    const rangeDates: string[] = [];
    for (let ms = startMs; ms <= endMs; ms += dayMs) {
      rangeDates.push(new Date(ms).toISOString().split("T")[0]);
    }
    setQuickLeaveSelectedDates((prev) => Array.from(new Set([...prev, ...rangeDates])));
  };

  const addQuickLeave = async () => {
    // Process input text on button click
    let finalIds = [...quickLeaveStaffIds];
    if (quickLeaveSearchTerm.trim()) {
      const tokens = quickLeaveSearchTerm.split(/[\s,\n]+/);
      const remaining: string[] = [];
      tokens.forEach((token) => {
        if (!token) return;
        const matchedId = matchStaffToken(token, staff);
        if (matchedId) finalIds.push(matchedId);
        else remaining.push(token);
      });
      // Clear processed tokens
      if (remaining.length === 0) setQuickLeaveSearchTerm("");
      else setQuickLeaveSearchTerm(remaining.join(" "));
    }
    finalIds = Array.from(new Set(finalIds));

    if (finalIds.length === 0) {
      alert("Please select staff members first.");
      return;
    }

    const datesToApply = Array.from(new Set(quickLeaveSelectedDates)).filter(Boolean).sort();
    if (datesToApply.length === 0) {
      alert("Please select at least one date.");
      return;
    }

    // Validation: Check for overlapping leaves across all selected dates
    const overlappingStaff: string[] = [];
    finalIds.forEach((id) => {
      for (const dateStr of datesToApply) {
        const hasOverlap = leaveRequests.some(
          (l) =>
            l.staffId === id &&
            l.startDate <= dateStr &&
            l.endDate >= dateStr,
        );
        if (hasOverlap) {
          const st = staff.find((s) => s.id === id);
          if (st) {
            const entryStr = `${st.initials} (${dateStr})`;
            if (!overlappingStaff.includes(entryStr)) overlappingStaff.push(entryStr);
          }
        }
      }
    });

    if (overlappingStaff.length > 0) {
      alert(
        `Cannot add absence records. The following staff already have overlapping leave records:\n${overlappingStaff.join(", ")}`,
      );
      return;
    }

    // Build leave requests: one LeaveRequest per staff per selected date
    const newLeaves: LeaveRequest[] = [];
    for (const sid of finalIds) {
      for (const dateStr of datesToApply) {
        newLeaves.push({
          id: crypto.randomUUID(),
          staffId: sid,
          startDate: dateStr,
          endDate: dateStr,
          type: quickLeaveType,
        });
      }
    }

    setLeaveRequests((prev) => [...prev, ...newLeaves]);
    if (supabase) {
      await db.upsertLeaves(newLeaves);
      await db.logAction(
        "CREATE",
        "LEAVE",
        "BULK",
        `Added ${newLeaves.length} ${quickLeaveType} entries`,
      );
    }

    setQuickLeaveSelectedDates([]);
    setNotification(`Added ${newLeaves.length} ${quickLeaveType} entries successfully`);
  };

  const deleteIncomingDuty = async (id: string) => {
    if (userProfile && !userProfile.isActive) {
      alert("Your account is frozen.");
      return;
    }
    setIncomingDuties((prev) => prev.filter((d) => d.id !== id));
    if (supabase) {
      await db.deleteIncomingDuty(id);
      await db.logAction("DELETE", "LEAVE", id, `Deleted rest log entry`);
    }
  };

  const deleteLeaveRequest = async (id: string) => {
    if (userProfile && !userProfile.isActive) {
      alert("Your account is frozen.");
      return;
    }
    setLeaveRequests((prev) => prev.filter((l) => l.id !== id));
    if (supabase) {
      await db.deleteLeave(id);
      await db.logAction("DELETE", "LEAVE", id, `Deleted absence entry`);
    }
  };

  if (isInitializing)
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="text-blue-500 animate-spin" size={64} />
      </div>
    );
  if (!session && supabase) return <Auth error={cloudError} />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-xs font-black uppercase tracking-widest">
            {notification}
          </span>
        </div>
      )}

      <header className="sticky top-0 z-[500] bg-white border-b border-slate-200 py-4 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SkyOpsLogo size={42} />
          <div>
            <h1 className="text-base md:text-lg font-black italic text-slate-900 uppercase leading-none">
              SkyOPS <span className="text-blue-600 font-light">AI</span>
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <div
                className={`w-2 h-2 rounded-full ${cloudStatus === "connected" ? "bg-emerald-500 animate-pulse" : cloudStatus === "connecting" ? "bg-amber-400 animate-pulse" : "bg-rose-500"}`}
              ></div>
              <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">
                {cloudStatus === "connected"
                  ? "AI Sync Active"
                  : cloudStatus === "connecting"
                  ? "Connecting..."
                  : cloudError
                    ? `Error: ${cloudError}`
                    : "Not Connected"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {/* Top Desktop & Tablet Nav — visible on 768px and above */}
          <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
            {[
              { id: "dashboard", label: "Dashboard" },
              { id: "flights", label: "Flights" },
              { id: "staff", label: "Staff" },
              { id: "shifts", label: "Shifts" },
              { id: "program", label: "Program" },
              { id: "reports", label: "Reports" },
              { id: "statistics", label: "Statistics" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 lg:px-5 py-2 lg:py-2.5 rounded-xl text-[9px] font-black uppercase italic transition-all ${
                  activeTab === tab.id
                    ? "bg-slate-950 text-white shadow-md scale-105"
                    : "text-slate-500 hover:text-slate-900 hover:bg-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {(userProfile?.role === "super_admin" || userProfile?.role === "admin") && (
              <button
                onClick={() => setActiveTab("command")}
                className={`px-3 lg:px-5 py-2 lg:py-2.5 rounded-xl text-[9px] font-black uppercase italic flex items-center gap-1.5 transition-all ${
                  activeTab === "command"
                    ? "bg-emerald-600 text-white shadow-md scale-105"
                    : "text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                <Shield size={12} /> Command
              </button>
            )}
          </nav>

          {/* Mobile Hamburger Toggle (under 768px) */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
            title="Toggle Menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button
            onClick={() => { setIsChangePasswordOpen(true); setChangePasswordMessage(""); setNewPassword(""); }}
            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-50 hover:text-blue-500 transition-colors"
            title="Change Password"
          >
            <Lock size={16} />
          </button>
          <button
            onClick={() => auth.signOut()}
            className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition-colors"
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
          {userProfile?.role === "super_admin" ? (
            <select 
              value={userProfile.airport_id || ""}
              onChange={async (e) => {
                const newId = e.target.value;
                const newProfile = { ...userProfile, airport_id: newId };
                await db.updateUserProfile(newProfile);
                setUserProfile(newProfile);
                
              }}
              className="ml-4 p-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold outline-none border border-slate-700"
            >
              <option value="" disabled>Select Airport</option>
              {airports.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
            </select>
          ) : userProfile?.airport_id ? (
            <div className="ml-4 p-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold border border-blue-700 tracking-wider shadow-sm flex items-center justify-center min-w-[3rem]">
              {airports.find(a => a.id === userProfile.airport_id)?.code || "UNK"}
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-2 sm:p-4 md:p-12 pb-48 xl:pb-12">
        {activeTab === "dashboard" && (() => {
          const activeFlights = flights.filter(f => f.date && f.date >= startDate && f.date <= endDate);
          const activeShifts = nonHiddenShifts.filter(s => s.pickupDate >= startDate && s.pickupDate <= endDate);
          const eligibleStaff = staff.filter((s) => {
            if (s.type === "Local") return true;
            if (Array.isArray(s.rosterPeriods) && s.rosterPeriods.length > 0) {
              return s.rosterPeriods.some(p => p.start <= endDate && p.end >= startDate);
            }
            return (!s.workFromDate || !s.workToDate || (s.workFromDate <= endDate && s.workToDate >= startDate));
          });
          
          return (
          <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
                        <CapacityForecast
              staff={staff}
              shifts={nonHiddenShifts}
              leaveRequests={leaveRequests}
              startDate={startDate}
              duration={programDuration}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
              {[
                {
                  label: "Flights",
                  val: activeFlights.length,
                  icon: Plane,
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  breakdown: Object.entries(
                    activeFlights.reduce((acc, f) => {
                      const match = String(f.flightNumber || "").toUpperCase().match(/([A-Z]{2,3})\s*\d/);
                      const prefix = match ? match[1] : "OTHER";
                      acc[prefix] = (acc[prefix] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).slice(0, 4), // keep top 4
                },
                {
                  label: "Staff",
                  val: eligibleStaff.length,
                  icon: Users,
                  color: "text-indigo-600",
                  bg: "bg-indigo-50",
                  breakdown: (() => {
                    let traffic = 0;
                    let security = 0;
                    let labour = 0;
                    let driver = 0;
                    let accountant = 0;
                    eligibleStaff.forEach(s => {
                      if (s.isSecurity) security++;
                      else if (s.isLabour) labour++;
                      else if (s.isDriver) driver++;
                      else if (s.isAccountant) accountant++;
                      else traffic++; // default others to Traffic
                    });
                    
                    const res: [string, number][] = [];
                    if (traffic > 0) res.push(["Traffic", traffic]);
                    if (security > 0) res.push(["Security", security]);
                    if (labour > 0) res.push(["Labour", labour]);
                    if (driver > 0) res.push(["Driver", driver]);
                    if (accountant > 0) res.push(["Accountant", accountant]);
                    return res;
                  })(),
                },
                {
                  label: "Shifts",
                  val: activeShifts.length,
                  icon: Clock,
                  color: "text-amber-500",
                  bg: "bg-amber-50",
                },
                {
                  label: "AI Health",
                  val: `${stationHealth}%`,
                  icon: Zap,
                  color: "text-blue-400",
                  bg: "bg-slate-900",
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className={`bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 md:h-40 isolate ${stat.bg === "bg-slate-900" ? "bg-slate-900 text-white" : "relative overflow-hidden"}`}
                >
                  <div className="flex justify-between items-start pointer-events-none">
                    <div
                      className={`w-8 h-8 md:w-10 md:h-10 ${stat.bg} rounded-lg md:rounded-xl flex items-center justify-center ${stat.color} z-10 relative`}
                    >
                      <stat.icon size={16} />
                    </div>
                    {stat.breakdown && (
                      <div className="flex flex-col items-end z-10 relative mt-1">
                        {stat.breakdown.map(([prefix, count]) => (
                          <div key={prefix} className="text-[9px] md:text-xs font-bold text-slate-500">
                            {prefix} <span className="text-slate-700">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="z-10 relative pointer-events-none">
                    <h2 className="text-xl md:text-3xl font-black italic leading-none">
                      {stat.val}
                    </h2>
                    <p className="text-[7px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1">
                      {stat.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>




            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              <div className="lg:col-span-2 space-y-6 md:space-y-8 order-2 lg:order-1">
                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                      <Moon size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">
                        Staff Rest Log
                      </h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                        Fatigue Prevention Engine
                      </p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="relative">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-2">
                        <Zap size={10} className="text-blue-500" /> Group
                        Personnel Feed (Paste List)
                      </label>
                      <div className="w-full min-h-[56px] px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                        {incomingSelectedStaffIds.map((id) => (
                          <span
                            key={id}
                            className="px-2 py-1 bg-slate-950 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2"
                          >
                            {staff.find((st) => st.id === id)?.initials}
                            <button
                              onClick={() =>
                                setIncomingSelectedStaffIds((prev) =>
                                  prev.filter((x) => x !== id),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          className="flex-1 bg-transparent text-sm font-bold outline-none"
                          placeholder={
                            staff.length === 0
                              ? "No staff registered yet..."
                              : "Paste initials like: MS-Atz ML-atz..."
                          }
                          value={incomingSearchTerm}
                          onChange={handleIncomingSearchChange}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                              e.preventDefault();
                              if (incomingSearchTerm.trim()) {
                                const tokens = incomingSearchTerm.split(/[\s,;\n\t]+/);
                                const idsToAdd: string[] = [];
                                const remaining: string[] = [];
                                tokens.forEach((tok) => {
                                  const mId = matchStaffToken(tok, staff);
                                  if (mId) idsToAdd.push(mId);
                                  else remaining.push(tok);
                                });
                                if (idsToAdd.length > 0) {
                                  setIncomingSelectedStaffIds((prev) =>
                                    Array.from(new Set([...prev, ...idsToAdd])),
                                  );
                                  setIncomingSearchTerm(remaining.join(" "));
                                }
                              }
                            }
                          }}
                          onBlur={() => {
                            if (incomingSearchTerm.trim()) {
                              const tokens = incomingSearchTerm.split(/[\s,;\n\t]+/);
                              const idsToAdd: string[] = [];
                              const remaining: string[] = [];
                              tokens.forEach((tok) => {
                                const mId = matchStaffToken(tok, staff);
                                if (mId) idsToAdd.push(mId);
                                else remaining.push(tok);
                              });
                              if (idsToAdd.length > 0) {
                                setIncomingSelectedStaffIds((prev) =>
                                  Array.from(new Set([...prev, ...idsToAdd])),
                                );
                                setIncomingSearchTerm(remaining.join(" "));
                              }
                            }
                          }}
                          disabled={staff.length === 0}
                        />
                      </div>
                      {staff.length === 0 && (
                        <p className="text-[9px] font-bold text-rose-500 mt-2 ml-1">
                          Warning: Register personnel in 'Staff' tab first.
                        </p>
                      )}
                      {programs.length > 0 && (
                        <button
                          onClick={() => setShowIncomingShifts(!showIncomingShifts)}
                          className="mt-3 text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Zap size={12} /> Load Past Shifts from Date
                        </button>
                      )}
                    </div>
                    
                    {showIncomingShifts && (
                      <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                            Shifts on {incomingDate}
                          </h5>
                          <button onClick={() => setShowIncomingShifts(false)} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
                        </div>
                        {getShiftsForIncomingDate().length === 0 ? (
                          <p className="text-xs text-slate-500 italic font-medium">No shifts found in saved programs for this date.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {getShiftsForIncomingDate().map((s) => (
                              <div key={s.shiftId} className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-xs font-black text-slate-800">{s.shift.pickupTime} - {s.shift.endTime}</span>
                                  <button
                                    onClick={() => handleAddShiftStaff(s.assignments, s.shift)}
                                    className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                                  >
                                    ADD ALL
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-500 leading-tight">
                                  {s.staffInitials.join(", ")}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <input
                        type="date"
                        className="h-[56px] w-full px-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm outline-none"
                        value={incomingDate}
                        onChange={(e) => setIncomingDate(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <select
                          className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-2"
                          value={incomingHour}
                          onChange={(e) => setIncomingHour(e.target.value)}
                        >
                          {Array.from({ length: 24 }).map((_, i) => (
                            <option key={i} value={String(i).padStart(2, "0")}>
                              {String(i).padStart(2, "0")}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-[56px] w-full bg-slate-50 border border-slate-200 rounded-2xl font-black text-sm px-2"
                          value={incomingMin}
                          onChange={(e) => setIncomingMin(e.target.value)}
                        >
                          {["00", "15", "30", "45"].map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={addIncomingDuties}
                        disabled={
                          incomingSelectedStaffIds.length === 0 &&
                          !incomingSearchTerm.trim()
                        }
                        className="h-[56px] bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-blue-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
                      >
                        <Lock size={16} /> Bulk Lock Registry
                      </button>
                    </div>

                    {/* Feedback List */}
                    <div className="pt-4 border-t border-slate-50">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Registered for {incomingDate}
                        </h5>
                        {(() => {
                          const nextDate = new Date(`${incomingDate}T12:00:00Z`);
                          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
                          const nextDateStr = nextDate.toISOString().split("T")[0];
                          const visibleDuties = incomingDuties.filter((d) => {
                            const hr = parseInt(d.shiftEndTime.split(":")[0]) || 0;
                            if (hr < 12) return d.date === nextDateStr;
                            return d.date === incomingDate;
                          });

                          return (
                            <>
                              {visibleDuties.length > 0 && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Clear all registered duties for ${incomingDate}?`)) {
                                      const idsToDelete = visibleDuties.map(d => d.id);
                                      const newDuties = incomingDuties.filter(d => !idsToDelete.includes(d.id));
                                      setIncomingDuties(newDuties);
                                      if (supabase) {
                                        visibleDuties.forEach(d => db.deleteIncomingDuty(d.id));
                                      }
                                    }
                                  }}
                                  className="text-[9px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded"
                                >
                                  CLEAR ALL
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const nextDate = new Date(`${incomingDate}T12:00:00Z`);
                          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
                          const nextDateStr = nextDate.toISOString().split("T")[0];
                          const visibleDuties = incomingDuties.filter((d) => {
                            const hr = parseInt(d.shiftEndTime.split(":")[0]) || 0;
                            if (hr < 12) return d.date === nextDateStr;
                            return d.date === incomingDate;
                          });

                          if (visibleDuties.length === 0) {
                            return (
                              <span className="text-[9px] italic text-slate-300">
                                No entries yet.
                              </span>
                            );
                          }

                          return visibleDuties.map((d) => {
                            const availDate = new Date(
                              `${d.date}T${d.shiftEndTime}`,
                            );
                            availDate.setHours(
                              availDate.getHours() + minRestHours,
                            );
                            const availStr = availDate.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            });
                            const isNextDay =
                              availDate.getUTCDate() !==
                              new Date(`${d.date}T12:00:00Z`).getUTCDate();
                            return (
                              <div
                                key={d.id}
                                className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-between gap-3 animate-in fade-in zoom-in group relative"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-black text-amber-700 uppercase">
                                    {
                                      staff.find((s) => s.id === d.staffId)
                                        ?.initials
                                    }
                                  </span>
                                  <span className="text-[10px] font-bold text-amber-600">
                                    ({d.shiftEndTime} - {availStr}{isNextDay ? "+1" : ""})
                                  </span>
                                </div>
                                <button
                                  onClick={() => deleteIncomingDuty(d.id)}
                                  className="text-amber-400 hover:text-amber-600"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500">
                      <Briefcase size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">
                        Off-Duty Registry
                      </h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                        Manual Absence Registry
                      </p>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="relative">
                      <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-2">
                        <Zap size={10} className="text-indigo-500" /> Group
                        Personnel Feed
                      </label>
                      <div className="w-full min-h-[56px] px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                        {quickLeaveStaffIds.map((id) => (
                          <span
                            key={id}
                            className="px-2 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-2"
                          >
                            {staff.find((st) => st.id === id)?.initials}
                            <button
                              onClick={() =>
                                setQuickLeaveStaffIds((prev) =>
                                  prev.filter((x) => x !== id),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          className="flex-1 bg-transparent text-sm font-bold outline-none"
                          placeholder={
                            staff.length === 0
                              ? "No staff registered yet..."
                              : "Search or paste group initials..."
                          }
                          value={quickLeaveSearchTerm}
                          onChange={handleQuickLeaveSearchChange}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                              e.preventDefault();
                              if (quickLeaveSearchTerm.trim()) {
                                const tokens = quickLeaveSearchTerm.split(/[\s,;\n\t]+/);
                                const idsToAdd: string[] = [];
                                const remaining: string[] = [];
                                tokens.forEach((tok) => {
                                  const mId = matchStaffToken(tok, staff);
                                  if (mId) idsToAdd.push(mId);
                                  else remaining.push(tok);
                                });
                                if (idsToAdd.length > 0) {
                                  setQuickLeaveStaffIds((prev) =>
                                    Array.from(new Set([...prev, ...idsToAdd])),
                                  );
                                  setQuickLeaveSearchTerm(remaining.join(" "));
                                }
                              }
                            }
                          }}
                          onBlur={() => {
                            if (quickLeaveSearchTerm.trim()) {
                              const tokens = quickLeaveSearchTerm.split(/[\s,;\n\t]+/);
                              const idsToAdd: string[] = [];
                              const remaining: string[] = [];
                              tokens.forEach((tok) => {
                                const mId = matchStaffToken(tok, staff);
                                if (mId) idsToAdd.push(mId);
                                else remaining.push(tok);
                              });
                              if (idsToAdd.length > 0) {
                                setQuickLeaveStaffIds((prev) =>
                                  Array.from(new Set([...prev, ...idsToAdd])),
                                );
                                setQuickLeaveSearchTerm(remaining.join(" "));
                              }
                            }
                          }}
                          disabled={staff.length === 0}
                        />
                      </div>
                    </div>
                    {(() => {
                      const quickLeavePeriodDates: string[] = [];
                      if (startDate) {
                        const start = new Date(`${startDate}T12:00:00Z`);
                        const days = programDuration || 7;
                        for (let i = 0; i < days; i++) {
                          const d = new Date(start);
                          d.setUTCDate(start.getUTCDate() + i);
                          quickLeavePeriodDates.push(d.toISOString().split("T")[0]);
                        }
                      }

                      const formatShortDate = (dStr: string) => {
                        const d = new Date(`${dStr}T12:00:00Z`);
                        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                        return `${dayNames[d.getUTCDay()]} ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
                      };

                      return (
                        <div className="space-y-6">
                          {/* 1. Absence Type Selector (Day off, Annual leave, Sick leave) */}
                          <div>
                            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block flex items-center gap-1.5">
                              <Briefcase size={11} className="text-indigo-500" />
                              Absence Type
                            </label>
                            <div className="grid grid-cols-3 gap-2.5">
                              {[
                                { type: "Day off" as LeaveType, label: "Day Off", icon: "🏖️", selectedBg: "bg-slate-900 text-white border-slate-900 shadow-md" },
                                { type: "Annual leave" as LeaveType, label: "Annual Leave", icon: "🌴", selectedBg: "bg-emerald-600 text-white border-emerald-600 shadow-md" },
                                { type: "Sick leave" as LeaveType, label: "Sick Leave", icon: "🤒", selectedBg: "bg-rose-600 text-white border-rose-600 shadow-md" },
                              ].map((item) => {
                                const isSelected = quickLeaveType === item.type;
                                return (
                                  <button
                                    key={item.type}
                                    type="button"
                                    onClick={() => setQuickLeaveType(item.type)}
                                    className={`px-3 py-3 rounded-2xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                                      isSelected
                                        ? item.selectedBg
                                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                                    }`}
                                  >
                                    <span className="text-sm">{item.icon}</span>
                                    <span>{item.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 2. Multi-Date Selector */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                                <CalendarIcon size={11} className="text-indigo-500" />
                                Select Dates ({quickLeaveSelectedDates.length} selected)
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setQuickLeaveSelectedDates(quickLeavePeriodDates)}
                                  className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                                >
                                  Select All Period
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setQuickLeaveSelectedDates([])}
                                  className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-wider"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            {/* Clickable Date Pills for Current Period */}
                            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                              {quickLeavePeriodDates.map((dateStr) => {
                                const isSelected = quickLeaveSelectedDates.includes(dateStr);
                                return (
                                  <button
                                    key={dateStr}
                                    type="button"
                                    onClick={() => toggleQuickLeaveDate(dateStr)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                      isSelected
                                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-black scale-[1.03]"
                                        : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                                    }`}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-white animate-pulse" : "bg-slate-300"}`} />
                                    {formatShortDate(dateStr)}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Additional Date Picker & Range Selector */}
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">Pick Specific Date:</span>
                                <input
                                  type="date"
                                  className="bg-transparent text-xs font-bold text-slate-800 outline-none flex-1"
                                  value={quickLeaveCustomDate}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setQuickLeaveCustomDate(val);
                                    if (val && !quickLeaveSelectedDates.includes(val)) {
                                      setQuickLeaveSelectedDates((prev) => [...prev, val]);
                                    }
                                  }}
                                />
                              </div>
                              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">Range:</span>
                                <input
                                  type="date"
                                  className="bg-transparent text-xs font-bold text-slate-800 outline-none w-28"
                                  value={quickLeaveRangeFrom}
                                  onChange={(e) => setQuickLeaveRangeFrom(e.target.value)}
                                />
                                <span className="text-slate-400 text-xs">→</span>
                                <input
                                  type="date"
                                  className="bg-transparent text-xs font-bold text-slate-800 outline-none w-28"
                                  value={quickLeaveRangeTo}
                                  onChange={(e) => setQuickLeaveRangeTo(e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => addQuickLeaveDateRange(quickLeaveRangeFrom, quickLeaveRangeTo)}
                                  disabled={!quickLeaveRangeFrom || !quickLeaveRangeTo}
                                  className="px-2 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-[10px] font-black uppercase disabled:opacity-40 whitespace-nowrap ml-auto"
                                >
                                  + Select
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* 3. Selected Dates Preview Chips */}
                          {quickLeaveSelectedDates.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mr-1">
                                Selected ({quickLeaveSelectedDates.length}):
                              </span>
                              {quickLeaveSelectedDates.slice().sort().map((dStr) => (
                                <span
                                  key={dStr}
                                  className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-[10px] font-bold flex items-center gap-1.5 shadow-sm"
                                >
                                  {dStr}
                                  <button
                                    type="button"
                                    onClick={() => toggleQuickLeaveDate(dStr)}
                                    className="text-indigo-400 hover:text-indigo-700 ml-0.5"
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* 4. Action Button */}
                          <button
                            type="button"
                            onClick={addQuickLeave}
                            disabled={
                              (quickLeaveStaffIds.length === 0 && !quickLeaveSearchTerm.trim()) ||
                              quickLeaveSelectedDates.length === 0
                            }
                            className="w-full h-[56px] bg-indigo-600 text-white rounded-2xl font-black uppercase italic tracking-widest hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
                          >
                            <Plus size={16} />
                            Add {quickLeaveSelectedDates.length || 0} {quickLeaveType} Record{quickLeaveSelectedDates.length > 1 ? "s" : ""}
                          </button>

                          {/* 5. Feedback List */}
                          <div className="pt-4 border-t border-slate-100">
                            <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">
                              Active Absences in Target Period ({startDate} to {endDate})
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {leaveRequests.filter(
                                (l) =>
                                  l.startDate <= (endDate || startDate) &&
                                  l.endDate >= startDate,
                              ).length === 0 && (
                                <span className="text-[9px] italic text-slate-300">
                                  No registered absences in this period.
                                </span>
                              )}
                              {leaveRequests
                                .filter(
                                  (l) =>
                                    l.startDate <= (endDate || startDate) &&
                                    l.endDate >= startDate,
                                )
                                .map((l) => (
                                  <div
                                    key={l.id}
                                    className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2 animate-in fade-in zoom-in"
                                  >
                                    <span className="text-[10px] font-black text-indigo-700 uppercase">
                                      {staff.find((s) => s.id === l.staffId)?.initials}
                                    </span>
                                    <span className="text-[10px] font-bold text-indigo-500">
                                      {l.type}
                                    </span>
                                    <span className="text-[8px] font-bold text-indigo-400 bg-indigo-100 px-1 rounded">
                                      {l.startDate === l.endDate
                                        ? l.startDate
                                        : `${l.startDate} - ${l.endDate}`}
                                    </span>
                                    <button
                                      onClick={() => deleteLeaveRequest(l.id)}
                                      className="text-indigo-400 hover:text-indigo-600"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col gap-10 sticky top-[100px] z-40 order-1 lg:order-2 self-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-blue-500 shadow-xl">
                    <Terminal size={24} />
                  </div>
                  <h4 className="text-xl font-black italic uppercase text-slate-900 leading-none">
                    AI Command Control
                  </h4>
                </div>
                <div className="space-y-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block">
                      Program Commencement
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-4 bg-white border border-slate-200 rounded-xl font-black text-sm outline-none focus:border-blue-600 transition-all"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest text-center italic mt-2">
                      Target Period: {startDate} &gt; {endDate}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 block">
                      Period Duration
                    </label>
                    <select
                      value={programDuration}
                      onChange={(e) => setProgramDuration(parseInt(e.target.value))}
                      className="w-full h-[48px] px-4 bg-white border border-slate-200 rounded-xl font-black text-sm text-blue-600 outline-none text-center cursor-pointer"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>{day} DAYS</option>
                      ))}
                    </select>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4 block flex items-center gap-2">
                      <Timer size={14} className="text-indigo-500" /> Rest
                      Threshold
                    </label>
                    <select
                      value={minRestHours}
                      onChange={(e) => setMinRestHours(parseInt(e.target.value))}
                      className="w-full h-[48px] px-4 bg-white border border-slate-200 rounded-xl font-black text-sm text-indigo-600 outline-none text-center cursor-pointer"
                    >
                      {Array.from({ length: 17 }, (_, i) => i + 8).map(hour => (
                        <option key={hour} value={hour}>{hour} HOURS</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setIsPreRosterModalOpen(true)}
                  disabled={isGenerating}
                  className="w-full py-8 bg-slate-950 text-white rounded-[2rem] font-black uppercase italic tracking-[0.2em] shadow-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <Sparkles size={24} className="text-blue-400" />
                  )}
                  {isGenerating ? "AI Analysis..." : "Build AI Program"}
                </button>
              </div>
            </div>

          </div>
          );
        })()}
        {activeTab === "flights" && (
          <FlightManager
            flights={flights}
            startDate={startDate}
            endDate={endDate}
            onAdd={async (f) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldFlights = [...flights];
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const duplicateIdx = flights.findIndex(
                (existing) =>
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (duplicateIdx !== -1) {
                const existing = flights[duplicateIdx];
                if (window.confirm(`Flight ${f.flightNumber} already exists on ${f.date}. Do you want to delete the old one and create the new one?`)) {
                  const newFlights = [...flights];
                  newFlights.splice(duplicateIdx, 1);
                  setFlights([...newFlights, f]);
                  try {
                    await db.deleteFlight(existing.id);
                    await db.upsertFlight(f);
                    await db.logAction("UPDATE", "FLIGHT", f.id, `Replaced existing flight ${f.flightNumber}`);
                  } catch (err) {
                    console.error("Failed to add flight, rolling back:", err);
                    setFlights(oldFlights);
                    setNotification("Database error: Failed to add flight.");
                  }
                }
                return;
              }
              
              setFlights((p) => [...p, f]);
              try {
                await db.upsertFlight(f);
                await db.logAction(
                  "CREATE",
                  "FLIGHT",
                  f.id,
                  `Added flight ${f.flightNumber}`,
                );
              } catch (err) {
                console.error("Failed to add flight, rolling back:", err);
                setFlights(oldFlights);
                setNotification("Database error: Failed to add flight.");
              }
            }}
            onUpdate={async (f) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldFlights = [...flights];
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const duplicateIdx = flights.findIndex(
                (existing) =>
                  existing.id !== f.id &&
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (duplicateIdx !== -1) {
                const existing = flights[duplicateIdx];
                if (window.confirm(`Flight ${f.flightNumber} already exists on ${f.date}. Do you want to delete the old one and replace it with this update?`)) {
                   const newFlights = [...flights].filter(fl => fl.id !== existing.id && fl.id !== f.id);
                   setFlights([...newFlights, f]);
                   try {
                     await db.deleteFlight(existing.id);
                     await db.upsertFlight(f);
                     await db.logAction("UPDATE", "FLIGHT", f.id, `Updated flight ${f.flightNumber} replacing duplicate`);
                   } catch (err) {
                     console.error("Failed to update flight, rolling back:", err);
                     setFlights(oldFlights);
                     setNotification("Database error: Failed to update flight.");
                   }
                }
                return;
              }

              setFlights((p) => p.map((o) => (o.id === f.id ? f : o)));
              try {
                await db.upsertFlight(f);
                await db.logAction(
                  "UPDATE",
                  "FLIGHT",
                  f.id,
                  `Updated flight ${f.flightNumber}`,
                );
              } catch (err) {
                console.error("Failed to update flight, rolling back:", err);
                setFlights(oldFlights);
                setNotification("Database error: Failed to update flight.");
              }
            }}
            onDelete={async (id) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldFlights = [...flights];
              setFlights((p) => p.filter((f) => f.id !== id));
              try {
                await db.deleteFlight(id);
                await db.logAction("DELETE", "FLIGHT", id, `Deleted flight`);
              } catch (err) {
                console.error("Failed to delete flight, rolling back:", err);
                setFlights(oldFlights);
                setNotification("Database error: Failed to delete flight.");
              }
            }}
            onOpenScanner={() => {
              setScannerTarget("flights");
              setShowScanner(true);
            }}
          />
        )}
        {activeTab === "staff" && (
          <StaffManager
            staff={staff}
            onUpdate={async (s) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldStaff = [...staff];
              const isNew = !staff.find((o) => o.id === s.id);
              if (
                isNew &&
                userProfile &&
                userProfile.role !== "super_admin" &&
                userProfile.email !== "safazoom@gmail.com" &&
                staff.length >= userProfile.maxStaff
              ) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxStaff} staff members.`,
                );
                return;
              }
              setStaff((p) =>
                p.find((o) => o.id === s.id)
                  ? p.map((o) => (o.id === s.id ? s : o))
                  : [...p, s],
              );
              try {
                await db.upsertStaff(s);
                await db.logAction(
                  isNew ? "CREATE" : "UPDATE",
                  "STAFF",
                  s.id,
                  `${isNew ? "Added" : "Updated"} staff ${s.initials}`,
                );
              } catch (err) {
                console.error("Failed to update staff, rolling back:", err);
                setStaff(oldStaff);
                setNotification("Database error: Failed to save staff.");
              }
            }}
            onDelete={async (id) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldStaff = [...staff];
              const oldPrograms = [...programsRef.current];
              
              setStaff((p) => p.filter((s) => s.id !== id));
              
              // Compute updated programs
              const updatedPrograms = programsRef.current.map((prog) => ({
                ...prog,
                assignments: prog.assignments.filter((a) => a.staffId !== id),
              }));
              const changedPrograms = updatedPrograms.filter((prog, i) => JSON.stringify(prog.assignments) !== JSON.stringify(programsRef.current[i].assignments));
              
              programsRef.current = updatedPrograms;
              setPrograms(updatedPrograms);

              try {
                await db.deleteStaff(id);
                await db.logAction("DELETE", "STAFF", id, `Deleted staff member`);
                if (supabase && changedPrograms.length > 0) {
                  await db.savePrograms(changedPrograms);
                }
              } catch (err) {
                console.error("Failed to delete staff, rolling back:", err);
                setStaff(oldStaff);
                programsRef.current = oldPrograms;
                setPrograms(oldPrograms);
                setNotification("Database error: Failed to delete staff.");
              }
            }}
            onClearAll={async () => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldStaff = [...staff];
              const oldPrograms = [...programsRef.current];

              setStaff([]);
              
              const updatedPrograms = programsRef.current.map((prog) => ({
                ...prog,
                assignments: [],
              }));
              const changedPrograms = updatedPrograms.filter((prog, i) => oldPrograms[i].assignments.length > 0);
              
              programsRef.current = updatedPrograms;
              setPrograms(updatedPrograms);

              try {
                await db.deleteAllStaff();
                await db.logAction(
                  "DELETE",
                  "STAFF",
                  "ALL",
                  `Cleared all staff members`,
                );
                if (supabase && changedPrograms.length > 0) {
                  await db.savePrograms(changedPrograms);
                }
              } catch (err) {
                console.error("Failed to clear staff, rolling back:", err);
                setStaff(oldStaff);
                programsRef.current = oldPrograms;
                setPrograms(oldPrograms);
                setNotification("Database error: Failed to clear all staff.");
              }
            }}
            onOpenScanner={() => {
              setScannerTarget("staff");
              setShowScanner(true);
            }}
            defaultMaxShifts={5}
          />
        )}
        {activeTab === "shifts" && (
          <ShiftManager
            shifts={shifts}
            flights={flights}
            staff={staff}
            leaveRequests={leaveRequests}
            startDate={startDate}
            endDate={endDate}
            onAdd={async (s) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              if (userProfile && userProfile.role !== "super_admin" && userProfile.email !== "safazoom@gmail.com" && shifts.length >= userProfile.maxShifts) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxShifts} shifts.`,
                );
                return;
              }
              const oldShifts = [...shifts];
              setShifts((p) => [...p, s]);
              try {
                await db.upsertShift(s);
                await db.logAction(
                  "CREATE",
                  "SHIFT",
                  s.id,
                  `Added shift on ${s.pickupDate} ${s.pickupTime}`,
                );
              } catch (err) {
                console.error("Failed to add shift, rolling back:", err);
                setShifts(oldShifts);
                setNotification("Database error: Failed to save shift.");
              }
            }}
            onUpdate={async (s) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldShifts = [...shifts];
              const oldPrograms = [...programsRef.current];

              setShifts((p) => p.map((o) => (o.id === s.id ? s : o)));
              
              let changedPrograms: DailyProgram[] = [];
              if (s.isHidden) {
                const updatedPrograms = programsRef.current.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.shiftId !== s.id),
                }));
                changedPrograms = updatedPrograms.filter((prog, i) => JSON.stringify(prog.assignments) !== JSON.stringify(programsRef.current[i].assignments));
                programsRef.current = updatedPrograms;
                setPrograms(updatedPrograms);
              }

              try {
                await db.upsertShift(s);
                await db.logAction(
                  "UPDATE",
                  "SHIFT",
                  s.id,
                  `Updated shift on ${s.pickupDate} ${s.pickupTime}`,
                );
                if (s.isHidden && changedPrograms.length > 0 && supabase) {
                  await db.savePrograms(changedPrograms);
                }
              } catch (err) {
                console.error("Failed to update shift, rolling back:", err);
                setShifts(oldShifts);
                programsRef.current = oldPrograms;
                setPrograms(oldPrograms);
                setNotification("Database error: Failed to update shift.");
              }
            }}
            onBulkUpdate={async (updatedShifts) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldShifts = [...shifts];
              setShifts((p) => {
                const newShifts = [...p];
                updatedShifts.forEach(us => {
                  const idx = newShifts.findIndex(o => o.id === us.id);
                  if (idx !== -1) newShifts[idx] = us;
                });
                return newShifts;
              });
              try {
                // Perform bulk DB update
                await db.upsertShiftsBatch(updatedShifts);
              } catch (err) {
                console.error("Failed to bulk update shifts, rolling back:", err);
                setShifts(oldShifts);
                setNotification("Database error: Failed to bulk update shifts.");
              }
            }}
            onDelete={async (id) => {
              if (userProfile && !userProfile.isActive) {
                alert("Your account is frozen.");
                return;
              }
              const oldShifts = [...shifts];
              const oldPrograms = [...programsRef.current];

              setShifts((p) => p.filter((s) => s.id !== id));
              
              // Compute updated programs
              const updatedPrograms = programsRef.current.map((prog) => ({
                ...prog,
                assignments: prog.assignments.filter((a) => a.shiftId !== id),
              }));
              const changedPrograms = updatedPrograms.filter((prog, i) => JSON.stringify(prog.assignments) !== JSON.stringify(programsRef.current[i].assignments));
              
              programsRef.current = updatedPrograms;
              setPrograms(updatedPrograms);

              try {
                await db.deleteShift(id);
                await db.logAction("DELETE", "SHIFT", id, `Deleted shift`);
                if (supabase && changedPrograms.length > 0) {
                  await db.savePrograms(changedPrograms);
                }
              } catch (err) {
                console.error("Failed to delete shift, rolling back:", err);
                setShifts(oldShifts);
                programsRef.current = oldPrograms;
                setPrograms(oldPrograms);
                setNotification("Database error: Failed to delete shift.");
              }
            }}
            onAddFlight={async (f) => {
              if (userProfile && !userProfile.isActive) return;
              const oldFlights = [...flights];
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const duplicateIdx = flights.findIndex(
                (existing) =>
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (duplicateIdx !== -1) {
                const existing = flights[duplicateIdx];
                if (window.confirm(`Flight ${f.flightNumber} already exists on ${f.date}. Do you want to delete the old one and create the new one?`)) {
                  const newFlights = [...flights];
                  newFlights.splice(duplicateIdx, 1);
                  setFlights([...newFlights, f]);
                  try {
                    await db.deleteFlight(existing.id);
                    await db.upsertFlight(f);
                    await db.logAction("UPDATE", "FLIGHT", f.id, `Replaced existing flight ${f.flightNumber}`);
                  } catch (err) {
                    console.error("Failed to add flight, rolling back:", err);
                    setFlights(oldFlights);
                    setNotification("Database error: Failed to add flight.");
                  }
                }
                return;
              }
              setFlights((p) => [...p, f]);
              try {
                await db.upsertFlight(f);
              } catch (err) {
                console.error("Failed to add flight, rolling back:", err);
                setFlights(oldFlights);
                setNotification("Database error: Failed to add flight.");
              }
            }}
            onUpdateFlight={async (f) => {
              if (userProfile && !userProfile.isActive) return;
              const oldFlights = [...flights];
              const normFNum = normalizeFlightNumber(f.flightNumber);
              const duplicateIdx = flights.findIndex(
                (existing) =>
                  existing.id !== f.id &&
                  existing.date === f.date &&
                  normalizeFlightNumber(existing.flightNumber) === normFNum
              );
              if (duplicateIdx !== -1) {
                const existing = flights[duplicateIdx];
                if (window.confirm(`Flight ${f.flightNumber} already exists on ${f.date}. Do you want to delete the old one and replace it with this update?`)) {
                    const newFlights = [...flights].filter(fl => fl.id !== existing.id && fl.id !== f.id);
                    setFlights([...newFlights, f]);
                    try {
                      await db.deleteFlight(existing.id);
                      await db.upsertFlight(f);
                      await db.logAction("UPDATE", "FLIGHT", f.id, `Updated flight ${f.flightNumber} replacing duplicate`);
                    } catch (err) {
                      console.error("Failed to update flight, rolling back:", err);
                      setFlights(oldFlights);
                      setNotification("Database error: Failed to update flight.");
                    }
                }
                return;
              }
              setFlights((p) => p.map((o) => (o.id === f.id ? f : o)));
              try {
                await db.upsertFlight(f);
              } catch (err) {
                console.error("Failed to update flight, rolling back:", err);
                setFlights(oldFlights);
                setNotification("Database error: Failed to update flight.");
              }
            }}
            onDeleteFlight={async (id) => {
              if (userProfile && !userProfile.isActive) return;
              const oldFlights = [...flights];
              setFlights((p) => p.filter((f) => f.id !== id));
              try {
                await db.deleteFlight(id);
              } catch (err) {
                console.error("Failed to delete flight, rolling back:", err);
                setFlights(oldFlights);
                setNotification("Database error: Failed to delete flight.");
              }
            }}
          />
        )}
        {activeTab === "program" && (
          <ProgramDisplay
            programs={programs}
            flights={flights}
            staff={staff}
            shifts={shifts}
            leaveRequests={leaveRequests}
            incomingDuties={incomingDuties}
            manualAssignments={manualAssignments}
            startDate={startDate}
            endDate={endDate}
            stationHealth={stationHealth}
            alerts={alerts}
            minRestHours={minRestHours}
            getLatestPrograms={() => programsRef.current}
            getLatestLeaveRequests={() => leaveRequestsRef.current}
            onUpdatePrograms={async (updated, changedDateStrings?: string[]) => {
              // Backup the old state in case we need to rollback
              const oldPrograms = [...programsRef.current];

              // If changedDateStrings is provided, use it directly
              let changedPrograms = updated;
              if (changedDateStrings && changedDateStrings.length > 0) {
                changedPrograms = updated.filter(u => changedDateStrings.includes(u.dateString as string));
              } else {
                changedPrograms = updated.filter(u => {
                  const prev = oldPrograms.find(p => p.dateString === u.dateString);
                  if (!prev) return true;
                  return JSON.stringify(prev) !== JSON.stringify(u);
                });
              }

              const newProgsComputed = programsRef.current.map(p => {
                if (changedDateStrings && changedDateStrings.length > 0) {
                  if (changedDateStrings.includes(p.dateString as string)) {
                    return updated.find(u => u.dateString === p.dateString) || p;
                  }
                  return p;
                }
                return updated.find(u => u.dateString === p.dateString) || p;
              });
              
              updated.forEach(u => {
                if (!newProgsComputed.find(p => p.dateString === u.dateString)) {
                  newProgsComputed.push(u);
                }
              });
              
              const sorted = newProgsComputed.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
              
              // Optimistically update local state & ref
              programsRef.current = sorted;
              setPrograms(sorted);

              if (supabase && changedPrograms.length > 0) {
                try {
                  await db.savePrograms(changedPrograms);
                } catch (err) {
                  console.error("Failed to save programs to database, rolling back.", err);
                  // Rollback state & ref
                  programsRef.current = oldPrograms;
                  setPrograms(oldPrograms);
                  setNotification("Failed to save roster changes. Connection error.");
                }
              }
            }}
            onRestoreVersion={async (v) => {
              const oldPrograms = [...programsRef.current];
              const merged = [...programsRef.current];
              v.programs.forEach(newP => {
                 const idx = merged.findIndex(p => p.dateString === newP.dateString);
                 if (idx !== -1) merged[idx] = newP;
                 else merged.push(newP);
              });
              const sorted = merged.sort((a, b) => (a.dateString || "").localeCompare(b.dateString || ""));
              
              programsRef.current = sorted;
              setPrograms(sorted);
              setStartDate(v.periodStart);
              setEndDate(v.periodEnd);
              setStationHealth(v.stationHealth);
              setNotification(`Restored version: ${v.name}`);
              if (supabase) {
                try {
                  await db.savePrograms(v.programs);
                } catch (err) {
                  console.error("Failed to save restored version:", err);
                  programsRef.current = oldPrograms;
                  setPrograms(oldPrograms);
                  setNotification("Failed to restore version on database. Connection error.");
                }
              }
            }}
            onUpdateLeaves={async (l: LeaveRequest[]) => {
              const oldLeaves = [...leaveRequestsRef.current];
              leaveRequestsRef.current = l;
              setLeaveRequests(l);
              if (supabase) {
                try {
                  await db.upsertLeaves(l);
                } catch (err) {
                  console.error("Failed to save leave requests, rolling back.", err);
                  leaveRequestsRef.current = oldLeaves;
                  setLeaveRequests(oldLeaves);
                  setNotification("Failed to update leave requests. Connection error.");
                }
              }
            }}
          />
        )}

        {activeTab === "command" && userProfile && (
          <CommandCenter
            currentUser={userProfile}
            flights={flights}
            shifts={shifts}
            startDate={startDate}
            endDate={endDate}
            staff={staff}
            onReloadStaff={async () => {
              try {
                const cloudData = await db.fetchAll();
                if (cloudData?.staff?.length) {
                  setStaff(cloudData.staff);
                }
              } catch (e) {
                console.warn("Failed to reload staff in command center:", e);
              }
            }}
            onUpdateStaff={async (s) => {
              const oldStaff = [...staff];
              setStaff((p) => p.map((o) => (o.id === s.id ? s : o)));
              try {
                await db.upsertStaff(s);
              } catch (err) {
                console.error("Failed to update staff rating:", err);
                setStaff(oldStaff);
              }
            }}
          />
        )}
        {activeTab === "reports" && (
          <ReportsDisplay
            programs={programs}
            shifts={shifts}
            staff={staff}
            leaveRequests={leaveRequests}
            startDate={startDate}
            endDate={endDate}
          />
        )}
        {activeTab === "statistics" && (

          <div className="max-w-6xl mx-auto space-y-6 md:space-y-12 animate-in fade-in duration-500">
            <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-black italic uppercase text-slate-900 tracking-tighter">
                  Station Analytics
                </h2>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-2">
                  <PieChart size={14} /> Comprehensive Manpower Report
                </p>
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Period Start
                  </label>
                  <input
                    type="date"
                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Period End
                  </label>
                  <input
                    type="date"
                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <StationStatistics
              staff={staff}
              shifts={nonHiddenShifts}
              leaveRequests={leaveRequests}
              startDate={startDate}
              endDate={endDate}
            />
          </div>
        )}
      </main>

      {/* Mobile Top Menu Overlay Dropdown */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[99998] bg-slate-950/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="bg-white border-b border-slate-200 shadow-2xl p-6 pt-24 space-y-2 rounded-b-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 px-2">Navigation</p>
            {[
              { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
              { id: "flights", icon: Plane, label: "Flights" },
              { id: "staff", icon: Users, label: "Staff" },
              { id: "shifts", icon: Clock, label: "Shifts" },
              { id: "program", icon: CalendarDays, label: "Master Roster" },
              { id: "reports", icon: ClipboardList, label: "Reports" },
              { id: "statistics", icon: PieChart, label: "Statistics" },
              ...((userProfile?.role === "super_admin" || userProfile?.role === "admin")
                ? [{ id: "command", icon: Shield, label: "Command Center" }]
                : []),
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl font-black uppercase text-xs tracking-wider transition-all ${
                  activeTab === item.id
                    ? item.id === "command"
                      ? "bg-emerald-600 text-white shadow-lg"
                      : "bg-slate-950 text-white shadow-lg"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Footer Navigation — rendered via portal to body */}
      {createPortal(
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.15)] z-[999999] select-none pb-safe">
          <nav className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            {[
              { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
              { id: "flights", icon: Plane, label: "Flights" },
              { id: "staff", icon: Users, label: "Staff" },
              { id: "shifts", icon: Clock, label: "Shifts" },
              { id: "program", icon: CalendarDays, label: "Master Roster" },
              { id: "reports", icon: ClipboardList, label: "Reports" },
              { id: "statistics", icon: PieChart, label: "Statistics" },
              ...((userProfile?.role === "super_admin" || userProfile?.role === "admin")
                ? [{ id: "command", icon: Shield, label: "Command" }]
                : []),
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                  activeTab === item.id
                    ? item.id === "command"
                      ? "text-emerald-600 bg-emerald-50 scale-105"
                      : "text-blue-600 bg-blue-50 scale-105 shadow-sm"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <item.icon
                  size={18}
                  strokeWidth={activeTab === item.id ? 2.5 : 2}
                />
                <span className="text-[9px] font-black uppercase tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            ))}
          </nav>
        </div>,
        document.body
      )}

      

      <PreRosterModal
        isOpen={isPreRosterModalOpen}
        onClose={() => setIsPreRosterModalOpen(false)}
        onConfirm={confirmGenerateProgram}
        staff={staff}
        shifts={nonHiddenShifts}
        startDate={startDate}
        endDate={endDate}
      />

      {showScanner && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[85vh] overflow-hidden shadow-2xl flex flex-col relative animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setShowScanner(false)}
              className="absolute top-6 right-6 z-10 p-3 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
            <ProgramScanner
              onDataExtracted={handleDataExtracted}
              startDate={startDate}
              numDays={programDuration}
              initialTarget={
                scannerTarget === "all" ? undefined : scannerTarget
              }
            />
          </div>
        </div>
      )}

      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[300] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">
                Change Password
              </h3>
              <button
                onClick={() => setIsChangePasswordOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              {changePasswordMessage && (
                <p className={`text-xs font-bold ${changePasswordMessage.includes("success") ? "text-emerald-500" : "text-rose-500"}`}>
                  {changePasswordMessage}
                </p>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button
                onClick={() => setIsChangePasswordOpen(false)}
                className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                className="px-6 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-600/20"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  // @ts-ignore
  const root = container._reactRootContainer || createRoot(container);
  // @ts-ignore
  container._reactRootContainer = root;
  root.render(<App />);
}
