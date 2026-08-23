import { createClient } from "@supabase/supabase-js";
import {
  Flight,
  Staff,
  ShiftConfig,
  DailyProgram,
  LeaveRequest,
  IncomingDuty,
  ProgramVersion,
  UserProfile,
  AuditLog,
  Airport,
  CgConfig,
  CgRating,
  DEFAULT_CG_CONFIG,
  RosterUpdate,
  UpdateLogEntry,
} from "../types";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://hldvxfurkstqhmmktxsz.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_E9StxaACROyElt3UQ8qVYw_C0zsUQzy";

const isConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 5;

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const auth = {
  async signUp(email: string, pass: string) {
    const client = supabase;
    if (!client) return { error: new Error("Cloud Uplink Not Configured") };
    return await client.auth.signUp({ email, password: pass });
  },
  async signIn(email: string, pass: string) {
    const client = supabase;
    if (!client) return { error: new Error("Cloud Uplink Not Configured") };
    return await client.auth.signInWithPassword({ email, password: pass });
  },
  async signOut() {
    const client = supabase;
    if (!client) return;
    return await client.auth.signOut();
  },
  async getSession(timeoutMs = 0): Promise<any> {
    const client = supabase;
    if (!client) return null;
    try {
      const getSessionPromise = client.auth.getSession();
      
      let data, error;
      if (timeoutMs > 0) {
        const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
          setTimeout(() => {
            resolve({
              data: { session: null },
              error: { message: "Network connection timed out (possible adblocker/VPN interference)" },
            });
          }, timeoutMs)
        );
        const result = await Promise.race([getSessionPromise, timeoutPromise]);
        data = result.data;
        error = result.error;
      } else {
        const result = await getSessionPromise;
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.warn("Session fetch error:", error.message);
        await client.auth.signOut().catch(() => {});
        if (typeof window !== "undefined") {
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
                localStorage.removeItem(key);
              }
            }
          } catch (e) {}
        }
        return null;
      }

      const session = data?.session || null;
      if (session) {
        const expiresAt = session.expires_at;
        const nowInSec = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt <= nowInSec) {
          try {
            const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
            if (refreshError || !refreshData?.session) {
              await client.auth.signOut().catch(() => {});
              if (typeof window !== "undefined") {
                try {
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
                      localStorage.removeItem(key);
                    }
                  }
                } catch (e) {}
              }
              return null;
            }
            return refreshData.session;
          } catch (refErr) {
            await client.auth.signOut().catch(() => {});
            return null;
          }
        }
      }

      return session;
    } catch (e) {
      console.warn("getSession exception:", e);
      await client.auth.signOut().catch(() => {});
      if (typeof window !== "undefined") {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
              localStorage.removeItem(key);
            }
          }
        } catch (err) {}
      }
      return null;
    }
  },
  onAuthStateChange(callback: (event: string, session: any) => void) {
    const client = supabase;
    if (!client) return () => {};
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
    return () => subscription.unsubscribe();
  },
};

let saveProgramsQueue: Promise<void> | null = null;

let cachedProfile: UserProfile | null = null;
let profileFetchTime = 0;

export const db = {
  clearProfileCache() {
    cachedProfile = null;
    profileFetchTime = 0;
  },

  async getMutationContext() {
    const session = await auth.getSession();
    if (!session) return null;
    const profile = await this.getUserProfile();
    
    // Super admin must have an airport selected to mutate data
    if (profile?.role === 'super_admin' && !profile?.airport_id) {
       return null;
    }

    return {
      userId: session.user.id,
      airportId: profile?.airport_id || null,
      matchCol: profile?.airport_id ? "airport_id" : "user_id",
      matchVal: profile?.airport_id ? profile.airport_id : session.user.id,
      role: profile?.role
    };
  },

  async migrateUnassignedData(airportId: string) {
    const client = supabase;
    if (!client) return { success: false, error: "No DB client" };
    try {
      const tables = ["flights", "staff", "shifts", "programs", "leave_requests", "incoming_duties"];
      for (const table of tables) {
        // fetch rows where airport_id is null or global, for this user
        const { data: nullRows } = await client.from(table).select("id").is("airport_id", null);
        const { data: globalRows } = await client.from(table).select("id").eq("airport_id", "GLOBAL");
        
        const allIds = [...(nullRows || []).map(r => r.id), ...(globalRows || []).map(r => r.id)];
        
        if (allIds.length > 0) {
          // split into chunks of 100
          for (let i = 0; i < allIds.length; i += 100) {
            const batch = allIds.slice(i, i + 100);
            await client.from(table).update({ airport_id: airportId }).in("id", batch);
          }
        }
      }
      return { success: true };
    } catch (e: any) {
      console.warn("Migration failed", e);
      return { success: false, error: e.message };
    }
  },

  async fetchAll(airportIdOverride?: string) {
    const client = supabase;
    if (!client) throw new Error("Supabase client not initialized");
    try {
      const session = await auth.getSession();
      if (!session) return null;
      
      const profile = await this.getUserProfile();
      const currentAirportId = airportIdOverride !== undefined ? airportIdOverride : profile?.airport_id;
      
      // If super_admin has no airport selected, allow global visibility by fetching all
      let matchCol = currentAirportId ? "airport_id" : "user_id";
      let matchVal = currentAirportId ? currentAirportId : session.user.id;
      
      let fQuery = client.from("flights").select("*");
      let sQuery = client.from("staff").select("*");
      let shQuery = client.from("shifts").select("*");
      let pQuery = client.from("programs").select("*");
      let lQuery = client.from("leave_requests").select("*");
      let iQuery = client.from("incoming_duties").select("*");

      if (profile?.role === "super_admin" && !currentAirportId) {
        // Global view: do not apply .eq filter
      } else {
        fQuery = fQuery.eq(matchCol, matchVal);
        sQuery = sQuery.eq(matchCol, matchVal);
        shQuery = shQuery.eq(matchCol, matchVal);
        pQuery = pQuery.eq(matchCol, matchVal);
        lQuery = lQuery.eq(matchCol, matchVal);
        iQuery = iQuery.eq(matchCol, matchVal);
      }

      const [fRes, sRes, shRes, pRes, lRes, iRes] = await Promise.all([
        fQuery,
        sQuery,
        shQuery,
        pQuery,
        lQuery,
        iQuery,
      ]);

      const errs = [fRes.error, sRes.error, shRes.error, pRes.error, lRes.error, iRes.error].filter(Boolean);
      if (errs.length > 0) {
        throw new Error(errs[0]?.message || "Failed to fetch one or more tables");
      }

      return {
        flights: (fRes.data || []).map((f: any) => ({
          id: f.id,
          flightNumber: f.flight_number,
          from: f.origin,
          to: f.destination,
          sta: f.sta,
          std: f.std,
          eta: f.eta,
          etd: f.etd,
          date: f.flight_date,
          type: f.flight_type || "Turnaround",
          day: f.day || 0,
          priority: "Standard" as "High" | "Standard" | "Low",
        })),
        staff: (sRes.data || []).map((s: any) => {
          let workPattern = s.work_pattern;
          let rosterPeriods = undefined;
          if (workPattern && workPattern.includes("|")) {
            const parts = workPattern.split("|");
            workPattern = parts[0];
            try {
              rosterPeriods = JSON.parse(parts[1]);
            } catch (e) {}
          }
          return {
            id: s.id,
            name: s.name,
            initials: s.initials,
            type: s.type,
            workPattern: workPattern,
            isRamp: !!s.is_ramp,
            isShiftLeader: !!s.is_shift_leader,
            isOps: !!s.is_operations,
            isLoadControl: !!s.is_load_control,
            isLostFound: !!s.is_lost_found,
            isLabour: !!s.is_labour,
            isSecurity: !!s.is_security,
            isDriver: !!s.is_driver,
            isAccountant: !!s.is_accountant,
            powerRate: s.power_rate || 75,
            maxShiftsPerWeek: s.max_shifts_per_week || 5,
            workFromDate: s.work_from_date,
            workToDate: s.work_to_date,
            rosterPeriods,
            isActive: s.is_active !== false,
            rating: s.skill_ratings?.rating !== undefined && s.skill_ratings.rating !== null ? s.skill_ratings.rating : 100,
            ratingSL: s.skill_ratings?.ratingSL,
            ratingOps: s.skill_ratings?.ratingOps,
            ratingLF: s.skill_ratings?.ratingLF,
            ratingRamp: s.skill_ratings?.ratingRamp,
            ratingLC: s.skill_ratings?.ratingLC,
            staffId: s.skill_ratings?.staffId,
          };
        }),
        shifts: (shRes.data || []).map((s: any) => {
          const rc = { ...(s.role_counts || {}) };
          const isHidden = !!rc.__is_hidden;
          delete rc.__is_hidden;
          return {
            id: s.id,
            day: s.day || 0,
            pickupDate: s.pickup_date,
            pickupTime: s.pickup_time,
            endDate: s.end_date,
            endTime: s.end_time,
            minStaff: s.min_staff ?? 1,
            maxStaff: s.max_staff ?? 10,
            roleCounts: rc,
            flightIds: s.flight_ids || [],
            isHidden,
          };
        }),
        programs: (pRes.data || []).map((p: any) => {
          const rawOffDuty = p.off_duty || [];
          const notesHacks = rawOffDuty.filter((od: any) => od.staffId === "NOTES_HACK");
          const driversHacks = rawOffDuty.filter((od: any) => od.staffId === "DRIVERS_HACK");
          const settingsHacks = rawOffDuty.filter((od: any) => od.staffId === "SETTINGS_HACK");
          const actualOffDuty = rawOffDuty.filter(
            (od: any) =>
              od.staffId !== "NOTES_HACK" &&
              od.staffId !== "DRIVERS_HACK" &&
              od.staffId !== "SETTINGS_HACK"
          );
          
          let notes = p.notes || {};
          if (notesHacks.length > 0) {
             notes = notesHacks[0].data || notes;
          }

          let shiftDrivers = {};
          if (driversHacks.length > 0) {
             shiftDrivers = driversHacks[0].data || {};
          }

          return {
            day: p.day,
            dateString: p.date_string,
            assignments: p.assignments || [],
            offDuty: actualOffDuty,
            notes: notes,
            shiftDrivers: shiftDrivers,
            periodSettings: settingsHacks.length > 0 ? settingsHacks[0].data : undefined,
          };
        }),
        leaveRequests: (lRes.data || []).map((l: any) => ({
          id: l.id,
          staffId: l.staff_id,
          startDate: l.start_date,
          endDate: l.end_date,
          type: l.leave_type,
        })),
        incomingDuties: (iRes.data || []).map((i: any) => ({
          id: i.id,
          staffId: i.staff_id,
          date: i.date,
          shiftEndTime: i.shift_end_time,
        })),
      };
    } catch (e: any) {
      throw e;
    }
  },

  async upsertFlights(flights: Flight[]) {
    const client = supabase;
    if (!client || flights.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("flights").upsert(
        flights.map(f => ({
          id: f.id,
          user_id: ctx.userId,
          airport_id: ctx.airportId,
          flight_number: f.flightNumber,
          origin: f.from,
          destination: f.to,
          sta: f.sta || null,
          std: f.std || null,
          eta: f.eta || null,
          etd: f.etd || null,
          flight_date: f.date,
          flight_type: f.type,
          day: f.day,
        }))
      );
    } catch (e) {
      console.warn("Failed to upsert flights:", e);
    }
  },

  async upsertFlight(f: Flight) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("flights").upsert({
        id: f.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        flight_number: f.flightNumber,
        origin: f.from,
        destination: f.to,
        sta: f.sta || null,
        std: f.std || null,
        eta: f.eta || null,
        etd: f.etd || null,
        flight_date: f.date,
        flight_type: f.type,
        day: f.day,
      });
    } catch (e) {
      console.warn("Failed to upsert flight:", e);
    }
  },

  async upsertStaffBatch(staffArray: Staff[]) {
    const client = supabase;
    if (!client || staffArray.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("staff").upsert(
        staffArray.map(s => ({
          id: s.id,
          user_id: ctx.userId,
          airport_id: ctx.airportId,
          name: s.name,
          initials: s.initials,
          type: s.type,
          work_pattern:
            s.type === "Roster" && s.rosterPeriods
              ? `${s.workPattern}|${JSON.stringify(s.rosterPeriods)}`
              : s.workPattern,
          is_ramp: s.isRamp,
          is_shift_leader: s.isShiftLeader,
          is_operations: s.isOps,
          is_load_control: s.isLoadControl,
          is_lost_found: s.isLostFound,
          is_labour: s.isLabour,
          is_security: s.isSecurity,
          is_driver: s.isDriver,
          is_accountant: s.isAccountant,
          power_rate: s.powerRate,
          max_shifts_per_week: s.maxShiftsPerWeek,
          work_from_date: s.workFromDate || null,
          work_to_date: s.workToDate || null,
          is_active: s.isActive !== false,
          skill_ratings: {
            rating: s.rating !== undefined ? s.rating : 100,
            ratingSL: s.ratingSL,
            ratingOps: s.ratingOps,
            ratingLF: s.ratingLF,
            ratingRamp: s.ratingRamp,
            ratingLC: s.ratingLC,
            staffId: s.staffId,
          },
        }))
      );
    } catch (e) {
      console.warn("Failed to upsert staff batch:", e);
    }
  },

  async upsertStaff(s: Staff) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("staff").upsert({
        id: s.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        name: s.name,
        initials: s.initials,
        type: s.type,
        work_pattern:
          s.type === "Roster" && s.rosterPeriods
            ? `${s.workPattern}|${JSON.stringify(s.rosterPeriods)}`
            : s.workPattern,
        is_ramp: s.isRamp,
        is_shift_leader: s.isShiftLeader,
        is_operations: s.isOps,
        is_load_control: s.isLoadControl,
        is_lost_found: s.isLostFound,
        is_labour: s.isLabour,
        is_security: s.isSecurity,
        is_driver: s.isDriver,
        is_accountant: s.isAccountant,
        power_rate: s.powerRate,
        max_shifts_per_week: s.maxShiftsPerWeek,
        work_from_date: s.workFromDate || null,
        work_to_date: s.workToDate || null,
        is_active: s.isActive !== false,
        skill_ratings: {
          rating: s.rating !== undefined ? s.rating : 100,
          ratingSL: s.ratingSL,
          ratingOps: s.ratingOps,
          ratingLF: s.ratingLF,
          ratingRamp: s.ratingRamp,
          ratingLC: s.ratingLC,
            staffId: s.staffId,
        },
      });
    } catch (e) {
      console.warn("Failed to upsert staff:", e);
    }
  },

  async upsertShiftsBatch(shifts: ShiftConfig[]) {
    const client = supabase;
    if (!client || shifts.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("shifts").upsert(
        shifts.map(s => {
          const rc = { ...(s.roleCounts || {}) };
          if (s.isHidden) {
            rc.__is_hidden = true as any;
          } else {
            delete rc.__is_hidden;
          }
          return {
            id: s.id,
            user_id: ctx.userId,
            airport_id: ctx.airportId,
            day: s.day,
            pickup_date: s.pickupDate,
            pickup_time: s.pickupTime,
            end_date: s.endDate,
            end_time: s.endTime,
            min_staff: s.minStaff ?? 1,
            max_staff: s.maxStaff ?? 10,
            role_counts: rc,
            flight_ids: s.flightIds || [],
          };
        })
      );
    } catch (e) {
      console.warn("Failed to upsert shifts batch:", e);
    }
  },

  async upsertShift(s: ShiftConfig) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      const rc = { ...(s.roleCounts || {}) };
      if (s.isHidden) {
        rc.__is_hidden = true as any;
      } else {
        delete rc.__is_hidden;
      }
      await client.from("shifts").upsert({
        id: s.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        day: s.day,
        pickup_date: s.pickupDate,
        pickup_time: s.pickupTime,
        end_date: s.endDate,
        end_time: s.endTime,
        min_staff: s.minStaff ?? 1,
        max_staff: s.maxStaff ?? 10,
        role_counts: rc,
        flight_ids: s.flightIds || [],
      });
    } catch (e) {
      console.warn("Failed to upsert shift:", e);
    }
  },

  async upsertLeave(l: LeaveRequest) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("leave_requests").upsert({
        id: l.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        staff_id: l.staffId,
        start_date: l.startDate,
        end_date: l.endDate,
        leave_type: l.type,
      });
    } catch (e) {
      console.warn("Failed to upsert leave:", e);
    }
  },

  async upsertLeaves(leaves: LeaveRequest[]) {
    const client = supabase;
    if (!client || leaves.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("leave_requests").upsert(
        leaves.map((l) => ({
          id: l.id,
          user_id: ctx.userId,
        airport_id: ctx.airportId,
          staff_id: l.staffId,
          start_date: l.startDate,
          end_date: l.endDate,
          leave_type: l.type,
        })),
      );
    } catch (e) {
      console.warn("Failed to upsert leaves:", e);
    }
  },

  async upsertIncomingDuty(d: IncomingDuty) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("incoming_duties").upsert({
        id: d.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        staff_id: d.staffId,
        date: d.date,
        shift_end_time: d.shiftEndTime,
      });
    } catch (e) {
      console.warn("Failed to upsert incoming duty:", e);
    }
  },

  async upsertIncomingDuties(duties: IncomingDuty[]) {
    const client = supabase;
    if (!client || duties.length === 0) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      await client.from("incoming_duties").upsert(
        duties.map((d) => ({
          id: d.id,
          user_id: ctx.userId,
        airport_id: ctx.airportId,
          staff_id: d.staffId,
          date: d.date,
          shift_end_time: d.shiftEndTime,
        })),
      );
    } catch (e) {
      console.warn("Failed to upsert incoming duties:", e);
    }
  },

  async savePrograms(programs: DailyProgram[]) {
    const execute = async () => {
      const client = supabase;
      if (!client || programs.length === 0) return;
      const ctx = await this.getMutationContext();
      if (!ctx) return;

      const datesToOverwrite = programs.map((p) => p.dateString).filter(Boolean);

      try {
        // Query ALL rows for these dates belonging to the current scope (airport_id or user_id) to find any duplicate/stale records
        const { data: existingData, error: fetchError } = await client
          .from("programs")
          .select("id, date_string, airport_id")
          .eq(ctx.matchCol, ctx.matchVal)
          .in("date_string", datesToOverwrite);
        
        if (fetchError) {
           console.warn("Failed to fetch old programs:", fetchError);
           return;
        }
        
        const existingMap = new Map();
        const duplicateIdsToDelete: any[] = [];

        if (existingData) {
           const groups: Record<string, any[]> = {};
           existingData.forEach((row: any) => {
              if (!groups[row.date_string]) {
                 groups[row.date_string] = [];
              }
              groups[row.date_string].push(row);
           });
           
           Object.entries(groups).forEach(([dateStr, rows]) => {
              // Sort to prefer row matching current airportId, otherwise keep the most recent/largest ID
              rows.sort((a, b) => {
                 if (a.airport_id === ctx.airportId && b.airport_id !== ctx.airportId) return -1;
                 if (b.airport_id === ctx.airportId && a.airport_id !== ctx.airportId) return 1;
                 return b.id - a.id;
              });
              
              const primary = rows[0];
              existingMap.set(dateStr, primary.id);
              
              // Any other records for this date are duplicates!
              const duplicates = rows.slice(1);
              duplicates.forEach((dRow: any) => {
                 duplicateIdsToDelete.push(dRow.id);
              });
           });
        }

        if (duplicateIdsToDelete.length > 0) {
           console.log(`Self-healing savePrograms: deleting ${duplicateIdsToDelete.length} duplicate rows`);
           await client.from("programs").delete().in("id", duplicateIdsToDelete);
        }

        const { error: insError } = await client.from("programs").upsert(
          programs.map((p) => {
            const cleanOffDuty = (p.offDuty || []).filter(
              (od: any) =>
                od.staffId !== "NOTES_HACK" &&
                od.staffId !== "DRIVERS_HACK" &&
                od.staffId !== "SETTINGS_HACK"
            );
            const offDutyToSave: any[] = [
                ...cleanOffDuty,
                { staffId: "NOTES_HACK", type: "NIL", data: p.notes || {} },
                { staffId: "DRIVERS_HACK", type: "NIL", data: p.shiftDrivers || {} }
            ];
            if (p.periodSettings) {
              offDutyToSave.push({ staffId: "SETTINGS_HACK", type: "NIL", data: p.periodSettings });
            }
            
            const existingId = existingMap.get(p.dateString);

            const payload: any = {
              user_id: ctx.userId,
              airport_id: ctx.airportId,
              day: p.day,
              date_string: p.dateString || "",
              assignments: p.assignments || [],
              off_duty: offDutyToSave,
            };
            if (existingId) {
              payload.id = existingId;
            }
            return payload;
          })
        );
        if (insError) {
           console.warn("Failed to upsert programs:", insError);
        }
      } catch (e) {
        console.warn("Failed to save programs:", e);
      }
    };
    if (saveProgramsQueue) {
       saveProgramsQueue = saveProgramsQueue.then(() => execute()).catch(() => execute());
    } else {
       saveProgramsQueue = execute();
    }
    await saveProgramsQueue;
  },

  async deleteFlight(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("flights").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete flight:", e);
      }
    }
  },
  async deleteStaff(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("staff").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete staff:", e);
      }
    }
  },
  
  async deleteAllStaff() {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("staff").delete().eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete all staff:", e);
      }
    }
  },
  async deleteShift(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("shifts").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete shift:", e);
      }
    }
  },
  async deleteLeave(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("leave_requests").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete leave:", e);
      }
    }
  },
  async deleteIncomingDuty(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("incoming_duties").delete().eq("id", id).eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete incoming duty:", e);
      }
    }
  },

  async deleteAllIncomingDuties() {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client.from("incoming_duties").delete().eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete all incoming duties:", e);
      }
    }
  },

  async saveProgramVersion(v: ProgramVersion) {
    const client = supabase;
    if (!client) return;
    const ctx = await this.getMutationContext();
    if (!ctx) return;
    try {
      const { error } = await client.from("program_versions").upsert({
        id: v.id,
        user_id: ctx.userId,
        airport_id: ctx.airportId,
        version_number: v.versionNumber,
        name: v.name,
        created_at: v.createdAt,
        period_start: v.periodStart,
        period_end: v.periodEnd,
        programs: v.programs,
        station_health: v.stationHealth,
        is_auto_save: v.isAutoSave || false,
      });
      if (error) {
         console.warn("Failed to save program version:", error);
      }
    } catch (e) {
      console.warn("Failed to save program version:", e);
    }
  },

  async getProgramVersions(): Promise<ProgramVersion[]> {
    const client = supabase;
    if (!client) return [];
    
    // For reads, we can use the regular context or fallback if super admin
    const profile = await this.getUserProfile();
    let query = client.from("program_versions").select("*").order("created_at", { ascending: false }).limit(50);
    
    if (profile?.role === "super_admin" && !profile?.airport_id) {
       // Global view: no filters
    } else {
       const ctx = await this.getMutationContext();
       if (!ctx) return [];
       query = query.eq(ctx.matchCol, ctx.matchVal);
    }

    const { data } = await query;
    if (!data) return [];
    return data.map((v: any) => ({
      id: v.id,
      versionNumber: v.version_number,
      name: v.name,
      createdAt: v.created_at,
      periodStart: v.period_start,
      periodEnd: v.period_end,
      programs: v.programs,
      stationHealth: v.station_health,
      isAutoSave: v.is_auto_save,
    }));
  },

  async deleteProgramVersion(id: string) {
    const client = supabase;
    const ctx = await this.getMutationContext();
    if (client && ctx) {
      try {
        await client
          .from("program_versions")
          .delete()
          .eq("id", id)
          .eq(ctx.matchCol, ctx.matchVal);
      } catch (e) {
        console.warn("Failed to delete program version:", e);
      }
    }
  },

  async getUserProfile(forceRefresh = false): Promise<UserProfile | null> {
    let session;
    try {
      session = await auth.getSession();
    } catch (e) {
      console.warn("Failed to get session for profile fetch:", e);
      return null;
    }
    if (!session || !supabase) return null;

    if (!forceRefresh && cachedProfile && Date.now() - profileFetchTime < 5 * 60 * 1000) {
      return cachedProfile;
    }

    let profile: UserProfile | null = null;
    try {
      const { data, error: selectError } = await supabase
        .from("user_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (selectError) console.warn("Fetch profile error:", JSON.stringify(selectError));
        if (data) {
          profile = {
            id: data.id,
            email: data.email,
            role: data.role || "planner",
            airport_id: data.airport_id,
            aiDailyLimit: data.ai_daily_limit ?? 5,
            aiWeeklyLimit: data.ai_weekly_limit ?? 20,
            aiMonthlyLimit: data.ai_monthly_limit ?? 50,
            maxStaff: data.max_staff ?? 50,
            maxShifts: data.max_shifts ?? 20,
            isActive: data.is_active ?? true,
            companyLogo: data.company_logo ?? "",
            skyopsLogo: data.skyops_logo ?? "",
            preparedBy: data.prepared_by ?? "",
            revisedBy: data.revised_by ?? "",
          };
          cachedProfile = profile;
          profileFetchTime = Date.now();
        } else {
          // Check if a profile was pre-created by email
          const { data: emailData } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("email", session.user.email)
            .single();
          if (emailData) {
            // Update the ID to match the real auth ID
            await supabase
              .from("user_profiles")
              .delete()
              .eq("id", emailData.id); // Delete the temp one
            await supabase.from("user_profiles").insert({
              ...emailData,
              id: session.user.id, // Insert with real ID
            });
            profile = {
              id: session.user.id,
              email: emailData.email,
              role: emailData.role || "planner",
              airport_id: emailData.airport_id,
              aiDailyLimit: emailData.ai_daily_limit ?? 5,
              aiWeeklyLimit: emailData.ai_weekly_limit ?? 20,
              aiMonthlyLimit: emailData.ai_monthly_limit ?? 50,
              maxStaff: emailData.max_staff ?? 50,
              maxShifts: emailData.max_shifts ?? 20,
              isActive: emailData.is_active ?? true,
              companyLogo: emailData.company_logo ?? "",
              skyopsLogo: emailData.skyops_logo ?? "",
              preparedBy: emailData.prepared_by ?? "",
              revisedBy: emailData.revised_by ?? "",
            };
          }
        }
      } catch (e) {
        console.warn("Could not fetch profile from DB", e);
      }

    // If no profile exists, create a default one
    if (!profile) {
      profile = {
        id: session.user.id,
        email: session.user.email,
        role: "planner",
        aiDailyLimit: 5,
        aiWeeklyLimit: 20,
        aiMonthlyLimit: 50,
        maxStaff: 50,
        maxShifts: 20,
        isActive: true,
        companyLogo: "",
        skyopsLogo: "",
        preparedBy: "Operation Control Center",
        revisedBy: "",
      };

      try {
        const { error } = await supabase.from("user_profiles").insert({
          id: profile.id,
          email: profile.email,
          role: profile.role,
          ai_daily_limit: profile.aiDailyLimit,
          ai_weekly_limit: profile.aiWeeklyLimit,
          ai_monthly_limit: profile.aiMonthlyLimit,
          max_staff: profile.maxStaff,
          max_shifts: profile.maxShifts,
          is_active: profile.isActive,
          company_logo: profile.companyLogo,
          skyops_logo: profile.skyopsLogo,
          prepared_by: profile.preparedBy,
          revised_by: profile.revisedBy,
        });
        if (error) {
          if (error.code === '23505') {
            console.warn("Profile already exists (concurrent insert)");
          } else {
            console.warn("Could not insert profile to DB:", JSON.stringify(error));
          }
        }
      } catch (e) {
        console.warn("Exception during default profile creation:", e);
      }
    }

    cachedProfile = profile;
    profileFetchTime = Date.now();
    return profile;
  },

  async getAllUserProfiles(): Promise<UserProfile[]> {
    if (supabase) {
      try {
        const profile = await this.getUserProfile();
        let query = supabase.from("user_profiles").select("*");
        if (profile?.role === "super_admin") {
          // Allow all
        } else if (profile?.role === "admin") {
          if (profile.airport_id) {
            query = query.eq("airport_id", profile.airport_id);
          }
        } else {
          const session = await auth.getSession();
          query = query.eq("id", session?.user?.id || "");
        }
        
        const { data, error } = await query;
        if (error) {
          console.warn("Supabase select error:", error);
        }
        if (data) {
          const session = await auth.getSession();
          const currentUser = session?.user;
          console.log("Current User Email in getAuditLogs:", currentUser?.email);
          const filteredData = data.filter((d) => {
             if (d.email?.toLowerCase() === "safazoom@gmail.com") {
                return currentUser?.email?.toLowerCase() === "safazoom@gmail.com";
             }
             return true;
          });
          return filteredData.map((d: any) => ({
            id: d.id,
            email: d.email,
            role: d.role,
            airport_id: d.airport_id,
            aiDailyLimit: d.ai_daily_limit,
            aiWeeklyLimit: d.ai_weekly_limit,
            aiMonthlyLimit: d.ai_monthly_limit,
            maxStaff: d.max_staff,
            maxShifts: d.max_shifts,
            isActive: d.is_active,
            companyLogo: d.company_logo ?? "",
            skyopsLogo: d.skyops_logo ?? "",
            preparedBy: d.prepared_by ?? "",
            revisedBy: d.revised_by ?? "",
          }));
        }
      } catch (e) {
        console.warn("Could not fetch profiles from DB", e);
      }
    }
    return [];
  },

    async updateUserProfile(profile: UserProfile) {
    if (supabase) {
      try {
        const session = await auth.getSession();
        if (!session) throw new Error("No session");
        const token = session.access_token;
        
        const response = await fetch("/api/users/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ profile })
        });
        
        if (!response.ok) {
           const err = await response.json();
           throw new Error(err.error || "Failed to update profile");
        }
        
        cachedProfile = { ...profile };
        profileFetchTime = Date.now();
      } catch (e) {
        console.warn("Exception updating profile:", e);
      }
    }
  },

  async deleteUserProfile(id: string, email: string) {
    if (email?.toLowerCase() === "safazoom@gmail.com") {
      console.warn("Cannot delete master account.");
      return;
    }
    let session;
    try {
      session = await auth.getSession();
    } catch (e) {
      console.warn("Could not get session for delete:", e);
      return;
    }
    if (!session) return;
    try {
      const res = await fetch("/api/users/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id, email }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete user");
      }
    } catch (e) {
      console.warn("Could not delete profile via API", e);
    }
  },

  async createUserProfile(profile: UserProfile) {
    if (supabase) {
      try {
        const { error } = await supabase.from("user_profiles").insert({
          id: profile.id,
          email: profile.email,
          role: profile.role,
          airport_id: profile.airport_id,
          ai_daily_limit: profile.aiDailyLimit,
          ai_weekly_limit: profile.aiWeeklyLimit,
          ai_monthly_limit: profile.aiMonthlyLimit,
          max_staff: profile.maxStaff,
          max_shifts: profile.maxShifts,
          is_active: profile.isActive,
          company_logo: profile.companyLogo,
          skyops_logo: profile.skyopsLogo,
          prepared_by: profile.preparedBy,
          revised_by: profile.revisedBy,
        });
        if (error) {
          if (error.code === '23505') {
            console.warn("Profile already exists (concurrent insert in createUserProfile)");
          } else {
            console.warn("Could not create user profile in DB:", JSON.stringify(error));
          }
        }
      } catch (e) {
        console.warn("Exception during create profile:", e);
      }
    }
  },

  async logAction(
    actionType: AuditLog["actionType"],
    entityType: AuditLog["entityType"],
    entityId: string,
    details: string,
  ) {
    let session;
    try {
      session = await auth.getSession();
    } catch (e) {
      console.warn("Could not get session for logAction:", e);
      return;
    }
    if (!session) return;
    const profile = await this.getUserProfile();

    const log: AuditLog = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      userEmail: session.user.email,
      actionType,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };

    if (supabase) {
      try {
        await supabase.from("audit_logs").insert({
          id: log.id,
          user_id: log.userId,
          airport_id: profile?.airport_id,
          user_email: log.userEmail,
          action_type: log.actionType,
          entity_type: log.entityType,
          entity_id: log.entityId,
          details: log.details,
          created_at: log.createdAt,
        });
      } catch (e) {
        console.warn("Could not insert audit log to DB");
      }
    }
  },

  async getAirports(): Promise<Airport[]> {
    if (!supabase) return [];
    try {
      const profile = await this.getUserProfile();
      let query = supabase.from("airports").select("*").order("name");
      if (profile?.role !== "super_admin") {
        if (profile?.airport_id) {
          query = query.eq("id", profile.airport_id);
        } else {
          return [];
        }
      }
      const { data } = await query;
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async getAirlines(): Promise<import("../types").Airline[]> {
    if (!supabase) return [];
    try {
      const profile = await this.getUserProfile();
      let query = supabase.from("airlines").select("*").order("name");
      if (profile?.role !== "super_admin") {
         if (profile?.airport_id) {
           query = query.eq("airport_id", profile.airport_id);
         } else {
           // If they have no airport assigned and they are not a super admin, they should see no airlines
           return [];
         }
      }
      const { data } = await query;
      return data || [];
    } catch (e) {
      return [];
    }
  },

  async addAirline(airline: Omit<import("../types").Airline, "id">): Promise<void> {
    if (!supabase) return;
    try {
      const profile = await this.getUserProfile();
      await supabase.from("airlines").insert({
        name: airline.name,
        iata_code: airline.iata_code,
        airport_id: profile?.airport_id,
      });
    } catch (e) {
      console.warn("Could not insert airline");
    }
  },

  async updateAirline(id: string, airline: Partial<import("../types").Airline>): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from("airlines").update(airline).eq("id", id);
    } catch (e) {
      console.warn("Could not update airline");
    }
  },

  async deleteAirline(id: string): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from("airlines").delete().eq("id", id);
    } catch (e) {
      console.warn("Could not delete airline");
    }
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    if (supabase) {
      try {
        const profile = await this.getUserProfile();
        let query = supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000);
          
        if (profile?.role !== "super_admin" && profile?.airport_id) {
          query = query.eq("airport_id", profile.airport_id);
        } else if (profile?.role !== "super_admin") {
          const session = await auth.getSession();
          query = query.eq("user_id", session?.user?.id || "");
        }

        const { data } = await query;
        if (data && data.length > 0) {
          const session = await auth.getSession();
          const currentUser = session?.user;
          return data.map((d: any) => ({
            id: d.id,
            userId: d.user_id,
            userEmail: d.user_email,
            actionType: d.action_type,
            entityType: d.entity_type,
            entityId: d.entity_id,
            details: d.details,
            createdAt: d.created_at,
          }));
        }
      } catch (e) {
        console.warn("Could not fetch audit logs from DB");
      }
    }
    return [];
  },

  async getAIGenerationCount(
    userId: string,
    period: "daily" | "weekly" | "monthly",
  ): Promise<number> {
    const logs = await this.getAuditLogs();
    const now = new Date();
    let startDate = new Date();

    if (period === "daily") {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "weekly") {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    }

    return logs.filter(
      (l) =>
        l.userId === userId &&
        l.actionType === "GENERATE_AI" &&
        new Date(l.createdAt) >= startDate,
    ).length;
  },

  async logRosterUpdate(
    entry: UpdateLogEntry,
    currentUser?: { id?: string; name?: string; email?: string } | null
  ): Promise<void> {
    if (!supabase) return;
    try {
      const session = await auth.getSession();
      const profile = await this.getUserProfile();
      const userId = currentUser?.id || session?.user?.id || profile?.id || null;
      const userName =
        currentUser?.name ||
        currentUser?.email ||
        profile?.email ||
        session?.user?.email ||
        "System";
      const airportId = entry.airport_id || profile?.airport_id || null;

      const affectedDate =
        entry.affected_date || new Date().toISOString().split("T")[0];
      const weekStart = entry.week_start || getMonday(affectedDate);

      await supabase.from("roster_updates").insert({
        change_type: entry.change_type,
        staff_id: entry.staff_id || null,
        staff_name: entry.staff_name || null,
        staff_initials: entry.staff_initials || null,
        from_value: entry.from_value || null,
        to_value: entry.to_value || null,
        affected_date: affectedDate,
        from_shift_id: entry.from_shift_id || null,
        to_shift_id: entry.to_shift_id || null,
        from_shift_name: entry.from_shift_name || null,
        to_shift_name: entry.to_shift_name || null,
        changed_by_id: userId,
        changed_by_name: userName,
        changed_at: new Date().toISOString(),
        week_start: weekStart,
        airport_id: airportId,
      });
    } catch (err) {
      console.warn("Could not insert roster update to DB:", err);
    }
  },

  async fetchRosterUpdates(params?: {
    weekStart?: string;
    staffId?: string;
    changeType?: string;
    airportId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: RosterUpdate[]; count: number }> {
    if (!supabase) return { data: [], count: 0 };
    try {
      const profile = await this.getUserProfile();
      const currentAirportId = params?.airportId || profile?.airport_id;

      let query = supabase
        .from("roster_updates")
        .select("*", { count: "exact" })
        .order("changed_at", { ascending: false });

      if (profile?.role !== "super_admin" && currentAirportId) {
        query = query.eq("airport_id", currentAirportId);
      } else if (params?.airportId) {
        query = query.eq("airport_id", params.airportId);
      }

      if (params?.weekStart && params.weekStart !== "ALL") {
        query = query.eq("week_start", params.weekStart);
      }

      if (params?.staffId && params.staffId !== "ALL") {
        query = query.eq("staff_id", params.staffId);
      }

      if (params?.changeType && params.changeType !== "ALL") {
        query = query.eq("change_type", params.changeType);
      }

      const limit = params?.limit || 50;
      const offset = params?.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        console.warn("Could not fetch roster updates:", error.message);
        return { data: [], count: 0 };
      }

      return {
        data: (data || []).map((d: any) => ({
          id: d.id,
          change_type: d.change_type,
          staff_id: d.staff_id,
          staff_name: d.staff_name,
          staff_initials: d.staff_initials,
          from_value: d.from_value,
          to_value: d.to_value,
          affected_date: d.affected_date,
          from_shift_id: d.from_shift_id,
          to_shift_id: d.to_shift_id,
          from_shift_name: d.from_shift_name,
          to_shift_name: d.to_shift_name,
          changed_by_id: d.changed_by_id,
          changed_by_name: d.changed_by_name,
          changed_at: d.changed_at,
          week_start: d.week_start,
          airport_id: d.airport_id,
        })),
        count: count || 0,
      };
    } catch (err) {
      console.warn("Error in fetchRosterUpdates:", err);
      return { data: [], count: 0 };
    }
  },

  subscribeRosterUpdates(onInsert: (update: RosterUpdate) => void) {
    if (!supabase) return () => {};
    const channel = supabase
      .channel("roster_updates_channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "roster_updates",
        },
        (payload) => {
          if (payload.new) {
            onInsert(payload.new as RosterUpdate);
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  },


  async getCgConfig(): Promise<CgConfig> {
    if (!supabase) {
      try {
        const stored = localStorage.getItem("cg_config");
        return stored ? JSON.parse(stored) : DEFAULT_CG_CONFIG;
      } catch {
        return DEFAULT_CG_CONFIG;
      }
    }
    try {
      const { data, error } = await supabase
        .from("cg_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return DEFAULT_CG_CONFIG;
      }
      return {
        id: data.id,
        weight_exp: Number(data.weight_exp ?? DEFAULT_CG_CONFIG.weight_exp),
        weight_thr: Number(data.weight_thr ?? DEFAULT_CG_CONFIG.weight_thr),
        weight_acc: Number(data.weight_acc ?? DEFAULT_CG_CONFIG.weight_acc),
        exp_t1_years: Number(data.exp_t1_years ?? DEFAULT_CG_CONFIG.exp_t1_years),
        exp_t1_score: Number(data.exp_t1_score ?? DEFAULT_CG_CONFIG.exp_t1_score),
        exp_t2_years: Number(data.exp_t2_years ?? DEFAULT_CG_CONFIG.exp_t2_years),
        exp_t2_score: Number(data.exp_t2_score ?? DEFAULT_CG_CONFIG.exp_t2_score),
        exp_t3_years: Number(data.exp_t3_years ?? DEFAULT_CG_CONFIG.exp_t3_years),
        exp_t3_score: Number(data.exp_t3_score ?? DEFAULT_CG_CONFIG.exp_t3_score),
        exp_t4_years: Number(data.exp_t4_years ?? DEFAULT_CG_CONFIG.exp_t4_years),
        exp_t4_score: Number(data.exp_t4_score ?? DEFAULT_CG_CONFIG.exp_t4_score),
        exp_t5_score: Number(data.exp_t5_score ?? DEFAULT_CG_CONFIG.exp_t5_score),
        thr_t1_pax: Number(data.thr_t1_pax ?? DEFAULT_CG_CONFIG.thr_t1_pax),
        thr_t1_score: Number(data.thr_t1_score ?? DEFAULT_CG_CONFIG.thr_t1_score),
        thr_t2_pax: Number(data.thr_t2_pax ?? DEFAULT_CG_CONFIG.thr_t2_pax),
        thr_t2_score: Number(data.thr_t2_score ?? DEFAULT_CG_CONFIG.thr_t2_score),
        thr_t3_pax: Number(data.thr_t3_pax ?? DEFAULT_CG_CONFIG.thr_t3_pax),
        thr_t3_score: Number(data.thr_t3_score ?? DEFAULT_CG_CONFIG.thr_t3_score),
        thr_t4_pax: Number(data.thr_t4_pax ?? DEFAULT_CG_CONFIG.thr_t4_pax),
        thr_t4_score: Number(data.thr_t4_score ?? DEFAULT_CG_CONFIG.thr_t4_score),
        thr_t5_score: Number(data.thr_t5_score ?? DEFAULT_CG_CONFIG.thr_t5_score),
        acc_t1_err: Number(data.acc_t1_err ?? DEFAULT_CG_CONFIG.acc_t1_err),
        acc_t1_score: Number(data.acc_t1_score ?? DEFAULT_CG_CONFIG.acc_t1_score),
        acc_t2_err: Number(data.acc_t2_err ?? DEFAULT_CG_CONFIG.acc_t2_err),
        acc_t2_score: Number(data.acc_t2_score ?? DEFAULT_CG_CONFIG.acc_t2_score),
        acc_t3_err: Number(data.acc_t3_err ?? DEFAULT_CG_CONFIG.acc_t3_err),
        acc_t3_score: Number(data.acc_t3_score ?? DEFAULT_CG_CONFIG.acc_t3_score),
        acc_t4_err: Number(data.acc_t4_err ?? DEFAULT_CG_CONFIG.acc_t4_err),
        acc_t4_score: Number(data.acc_t4_score ?? DEFAULT_CG_CONFIG.acc_t4_score),
        acc_t5_err: Number(data.acc_t5_err ?? DEFAULT_CG_CONFIG.acc_t5_err),
        acc_t5_score: Number(data.acc_t5_score ?? DEFAULT_CG_CONFIG.acc_t5_score),
        acc_t6_score: Number(data.acc_t6_score ?? DEFAULT_CG_CONFIG.acc_t6_score),
        updated_at: data.updated_at,
      };
    } catch (e) {
      console.warn("Failed to fetch cg_config from Supabase:", e);
      return DEFAULT_CG_CONFIG;
    }
  },

  async upsertCgConfig(config: Partial<CgConfig>): Promise<CgConfig | null> {
    const payload = {
      ...config,
      updated_at: new Date().toISOString(),
    };
    if (!supabase) {
      try {
        localStorage.setItem("cg_config", JSON.stringify(payload));
        return payload as CgConfig;
      } catch {
        return null;
      }
    }
    try {
      const { data, error } = await supabase
        .from("cg_config")
        .upsert(payload)
        .select()
        .single();
      if (error) {
        console.warn("Error upserting cg_config:", error);
        // Fallback local save
        localStorage.setItem("cg_config", JSON.stringify(payload));
        return payload as CgConfig;
      }
      this.logAction("UPDATE", "USER_PROFILE", data.id || "config", "Updated C&G rating configuration");
      return data as CgConfig;
    } catch (e) {
      console.warn("Exception upserting cg_config:", e);
      localStorage.setItem("cg_config", JSON.stringify(payload));
      return payload as CgConfig;
    }
  },

  async getCgRatings(): Promise<CgRating[]> {
    if (!supabase) {
      try {
        const stored = localStorage.getItem("cg_ratings");
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    try {
      const { data, error } = await supabase
        .from("cg_ratings")
        .select("*");
      if (error) {
        console.warn("Error fetching cg_ratings:", error);
        const stored = localStorage.getItem("cg_ratings");
        return stored ? JSON.parse(stored) : [];
      }
      return (data || []).map((r: any) => ({
        id: r.id,
        staff_id: r.staff_id,
        years_exp: Number(r.years_exp ?? 0),
        pax_per_flight: Number(r.pax_per_flight ?? 0),
        errors_per_150: Number(r.errors_per_150 ?? 0),
        score_exp: Number(r.score_exp ?? 0),
        score_thr: Number(r.score_thr ?? 0),
        score_acc: Number(r.score_acc ?? 0),
        cg_score: Number(r.cg_score ?? 0),
        updated_at: r.updated_at,
      }));
    } catch (e) {
      console.warn("Exception fetching cg_ratings:", e);
      const stored = localStorage.getItem("cg_ratings");
      return stored ? JSON.parse(stored) : [];
    }
  },

  async upsertCgRating(rating: CgRating): Promise<boolean> {
    const payload = {
      staff_id: rating.staff_id,
      years_exp: rating.years_exp,
      pax_per_flight: rating.pax_per_flight,
      errors_per_150: rating.errors_per_150,
      score_exp: rating.score_exp,
      score_thr: rating.score_thr,
      score_acc: rating.score_acc,
      cg_score: rating.cg_score,
      updated_at: new Date().toISOString(),
    };

    // Always update local cache
    try {
      const stored = localStorage.getItem("cg_ratings");
      const list: CgRating[] = stored ? JSON.parse(stored) : [];
      const idx = list.findIndex(r => r.staff_id === rating.staff_id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...payload };
      } else {
        list.push({ ...payload, id: `local-${Date.now()}` });
      }
      localStorage.setItem("cg_ratings", JSON.stringify(list));
    } catch {}

    if (!supabase) return true;

    try {
      const { error } = await supabase
        .from("cg_ratings")
        .upsert(payload, { onConflict: "staff_id" });
      if (error) {
        console.warn("Error upserting cg_rating to Supabase:", error);
      }
      // Also sync rating score directly to staff table
      const { data: staffData } = await supabase
        .from("staff")
        .select("skill_ratings")
        .eq("id", rating.staff_id)
        .maybeSingle();

      const currentSkills = staffData?.skill_ratings || {};
      await supabase
        .from("staff")
        .update({
          skill_ratings: {
            ...currentSkills,
            rating: rating.cg_score,
          },
        })
        .eq("id", rating.staff_id);

      return true;
    } catch (e) {
      console.warn("Exception upserting cg_rating:", e);
      return false;
    }
  },

  async exportDatabase() {
    const data = await this.fetchAll();
    if (!data) return null;
    const versions = await this.getProgramVersions();
    
    const exportData = {
      ...data,
      program_versions: versions,
      exportDate: new Date().toISOString()
    };
    return exportData;
  },

  async importDatabase(jsonData: string) {
    try {
      const data = JSON.parse(jsonData);
      
      // If there are flights, shifts, etc. save them
      if (data.flights && data.flights.length > 0) {
        for (const f of data.flights) await this.upsertFlight(f);
      }
      if (data.staff && data.staff.length > 0) {
        for (const s of data.staff) await this.upsertStaff(s);
      }
      if (data.shifts && data.shifts.length > 0) {
        for (const s of data.shifts) await this.upsertShift(s);
      }
      if (data.leave_requests && data.leave_requests.length > 0) {
        await this.upsertLeaves(data.leave_requests);
      }
      if (data.incoming_duties && data.incoming_duties.length > 0) {
        await this.upsertIncomingDuties(data.incoming_duties);
      }
      if (data.programs && data.programs.length > 0) {
        await this.savePrograms(data.programs);
      }
      if (data.program_versions && data.program_versions.length > 0) {
        for (const v of data.program_versions) await this.saveProgramVersion(v);
      }
      
      this.logAction("IMPORT", "DATABASE", "all", "Imported full database backup");
      return true;
    } catch (e) {
      console.warn("Failed to import database", e);
      return false;
    }
  }
};

export function getMonday(dateStr: string): string {
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00Z`);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    return d.toISOString().split("T")[0];
  } catch {
    return dateStr;
  }
}

export async function logRosterUpdate(
  entry: UpdateLogEntry,
  currentUser?: { id?: string; name?: string; email?: string } | null
): Promise<void> {
  return db.logRosterUpdate(entry, currentUser);
}

