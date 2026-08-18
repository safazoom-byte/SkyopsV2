import React, { useState, useEffect, useMemo } from "react";
import {
  Staff,
  CgConfig,
  CgRating,
  StaffCgRating,
  DEFAULT_CG_CONFIG,
  calcCgScore,
  getCgLevel,
  getExpScore,
  getThrScore,
  getAccScore,
} from "../types";
import { db } from "../services/supabaseService";
import {
  Sliders,
  Award,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  RefreshCw,
  Sparkles,
  Save,
  Check,
  Shield,
  Layers,
  BarChart3,
  Percent,
  Clock,
  Target,
  AlertCircle,
  HelpCircle,
  Lock,
  Unlock,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

interface CGRatingModuleProps {
  staffList?: Staff[];
  onStaffUpdated?: () => void;
  currentUserRole?: string;
}

export const CGRatingModule: React.FC<CGRatingModuleProps> = ({
  staffList: propStaffList,
  onStaffUpdated,
  currentUserRole,
}) => {
  // State
  const [internalStaff, setInternalStaff] = useState<Staff[]>([]);
  const [config, setConfig] = useState<CgConfig>(DEFAULT_CG_CONFIG);
  const [draftConfig, setDraftConfig] = useState<CgConfig>(DEFAULT_CG_CONFIG);
  const [ratings, setRatings] = useState<Record<string, CgRating>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Effective staff list
  const staffList = propStaffList || internalStaff;

  // Collapsible control panel sections
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [openSection, setOpenSection] = useState<"weights" | "exp" | "thr" | "acc" | null>("weights");

  // Live test preview state for weights
  const [testYears, setTestYears] = useState<number>(1.5);
  const [testPax, setTestPax] = useState<number>(50);
  const [testErrors, setTestErrors] = useState<number>(1);

  // Weight Slider Locks & Auto-Balance Mode
  const [lockedWeights, setLockedWeights] = useState<{ exp: boolean; thr: boolean; acc: boolean }>({
    exp: false,
    thr: false,
    acc: false,
  });
  const [isAutoBalanceEnabled, setIsAutoBalanceEnabled] = useState<boolean>(true);

  // Active editing state for staff rows
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedConfig, fetchedRatings] = await Promise.all([
        db.getCgConfig(),
        db.getCgRatings(),
      ]);

      setConfig(fetchedConfig);
      setDraftConfig(fetchedConfig);

      const ratingMap: Record<string, CgRating> = {};
      fetchedRatings.forEach((r) => {
        ratingMap[r.staff_id] = r;
      });
      setRatings(ratingMap);
    } catch (err) {
      console.error("Failed to load C&G Rating data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Merge staff with ratings (Traffic staff only - exclude security, driver, labour, accountant)
  const activeStaff = useMemo(() => {
    return staffList.filter(
      (s) =>
        s.isActive !== false &&
        !s.isLabour &&
        !s.isSecurity &&
        !s.isAccountant &&
        !s.isDriver
    );
  }, [staffList]);

  const mergedStaff: StaffCgRating[] = useMemo(() => {
    return activeStaff.map((s) => {
      const r = ratings[s.id];
      const years = r ? r.years_exp : 0;
      const pax = r ? r.pax_per_flight : 0;
      const err = r ? r.errors_per_150 : 0;
      const { expS, thrS, accS, cg } = calcCgScore(years, pax, err, config);

      return {
        ...s,
        years_exp: years,
        pax_per_flight: pax,
        errors_per_150: err,
        score_exp: expS,
        score_thr: thrS,
        score_acc: accS,
        cg_score: cg,
        rating_id: r?.id,
        rating_updated_at: r?.updated_at,
      };
    });
  }, [activeStaff, ratings, config]);

  // Filtered staff
  const filteredStaff = useMemo(() => {
    return mergedStaff.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.initials.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.staffId && s.staffId.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (levelFilter === "all") return true;
      const lvl = getCgLevel(s.cg_score).label.toLowerCase();
      return lvl === levelFilter.toLowerCase();
    });
  }, [mergedStaff, searchQuery, levelFilter]);

  // Team Summary Stats
  const teamStats = useMemo(() => {
    if (mergedStaff.length === 0) {
      return {
        avgScore: 0,
        excellentCount: 0,
        goodCount: 0,
        moderateCount: 0,
        weakCount: 0,
        topPerformer: null as StaffCgRating | null,
        lowestPerformer: null as StaffCgRating | null,
        distribution: [] as { name: string; count: number; color: string }[],
      };
    }

    let totalScore = 0;
    let excellent = 0;
    let good = 0;
    let moderate = 0;
    let weak = 0;

    let top: StaffCgRating | null = null;
    let lowest: StaffCgRating | null = null;

    mergedStaff.forEach((s) => {
      totalScore += s.cg_score;
      if (s.cg_score >= 90) excellent++;
      else if (s.cg_score >= 70) good++;
      else if (s.cg_score >= 50) moderate++;
      else weak++;

      if (!top || s.cg_score > top.cg_score) top = s;
      if (!lowest || s.cg_score < lowest.cg_score) lowest = s;
    });

    const avg = Math.round(totalScore / mergedStaff.length);

    return {
      avgScore: avg,
      excellentCount: excellent,
      goodCount: good,
      moderateCount: moderate,
      weakCount: weak,
      topPerformer: top,
      lowestPerformer: lowest,
      distribution: [
        { name: "Weak (<50)", count: weak, color: "#f43f5e" },
        { name: "Moderate (50-69)", count: moderate, color: "#f59e0b" },
        { name: "Good (70-89)", count: good, color: "#6366f1" },
        { name: "Excellent (≥90)", count: excellent, color: "#10b981" },
      ],
    };
  }, [mergedStaff]);

  // Weight validation
  const totalWeight =
    (Number(draftConfig.weight_exp) || 0) +
    (Number(draftConfig.weight_thr) || 0) +
    (Number(draftConfig.weight_acc) || 0);
  const isWeightValid = totalWeight === 100;

  // Real, Foolproof Weight Adjustment: Guaranteeing Sum is ALWAYS Exactly 100%
  const handleWeightSliderChange = (
    changedKey: "weight_exp" | "weight_thr" | "weight_acc",
    desiredVal: number
  ) => {
    const keyMap = {
      weight_exp: "exp",
      weight_thr: "thr",
      weight_acc: "acc",
    } as const;

    const otherKeys = (["weight_exp", "weight_thr", "weight_acc"] as const).filter(
      (k) => k !== changedKey
    );

    // Sum of locked weights among other sliders
    const lockedOtherSum = otherKeys
      .filter((k) => lockedWeights[keyMap[k]])
      .reduce((acc, k) => acc + (draftConfig[k] || 0), 0);

    // Maximum that changed slider can take without violating locked values
    const maxPossible = Math.max(0, 100 - lockedOtherSum);
    const targetVal = Math.min(maxPossible, Math.max(0, desiredVal));

    const delta = targetVal - (draftConfig[changedKey] || 0);
    if (delta === 0) return;

    const unlockedOtherKeys = otherKeys.filter((k) => !lockedWeights[keyMap[k]]);

    if (unlockedOtherKeys.length === 0) {
      return; // Cannot move if all other sliders are locked
    }

    if (unlockedOtherKeys.length === 1) {
      // One unlocked slider absorbs the full remainder
      const otherKey = unlockedOtherKeys[0];
      const otherVal = Math.max(0, 100 - targetVal - lockedOtherSum);
      setDraftConfig({
        ...draftConfig,
        [changedKey]: targetVal,
        [otherKey]: otherVal,
      });
      return;
    }

    // Both other sliders are unlocked: distribute delta proportionally
    const k1 = unlockedOtherKeys[0];
    const k2 = unlockedOtherKeys[1];
    const current1 = draftConfig[k1] || 0;
    const current2 = draftConfig[k2] || 0;
    const availableForBoth = 100 - targetVal - lockedOtherSum;

    let next1: number;
    let next2: number;

    const unlockedSum = current1 + current2;
    if (unlockedSum === 0) {
      next1 = Math.floor(availableForBoth / 2);
      next2 = availableForBoth - next1;
    } else {
      const ratio1 = current1 / unlockedSum;
      next1 = Math.round(availableForBoth * ratio1);
      next2 = availableForBoth - next1;
    }

    setDraftConfig({
      ...draftConfig,
      [changedKey]: targetVal,
      [k1]: Math.max(0, next1),
      [k2]: Math.max(0, next2),
    });
  };

  // 1-Click Normalize to exactly 100%
  const handleNormalizeWeights = () => {
    const sum =
      (draftConfig.weight_exp || 0) +
      (draftConfig.weight_thr || 0) +
      (draftConfig.weight_acc || 0);

    if (sum === 0) {
      setDraftConfig({
        ...draftConfig,
        weight_exp: 35,
        weight_thr: 35,
        weight_acc: 30,
      });
      return;
    }

    const exp = Math.round(((draftConfig.weight_exp || 0) / sum) * 100);
    const thr = Math.round(((draftConfig.weight_thr || 0) / sum) * 100);
    const acc = 100 - (exp + thr);

    setDraftConfig({
      ...draftConfig,
      weight_exp: Math.max(0, exp),
      weight_thr: Math.max(0, thr),
      weight_acc: Math.max(0, acc),
    });
  };

  // Preset Application
  const applyPreset = (exp: number, thr: number, acc: number) => {
    setLockedWeights({ exp: false, thr: false, acc: false });
    setDraftConfig({
      ...draftConfig,
      weight_exp: exp,
      weight_thr: thr,
      weight_acc: acc,
    });
  };

  // Toggle Lock for a slider with safety check
  const toggleWeightLock = (key: "exp" | "thr" | "acc") => {
    const currentlyLockedCount = Object.values(lockedWeights).filter(Boolean).length;
    if (!lockedWeights[key] && currentlyLockedCount >= 2) {
      // Cannot lock all 3 sliders, keep at least 1 dynamic balance slider
      return;
    }

    // When locking, ensure the current weights are strictly 100%
    if (!lockedWeights[key] && totalWeight !== 100) {
      handleNormalizeWeights();
    }

    setLockedWeights((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Live preview test score
  const liveTestResult = useMemo(() => {
    return calcCgScore(testYears, testPax, testErrors, draftConfig);
  }, [testYears, testPax, testErrors, draftConfig]);

  // Handle local staff rating change
  const handleRatingChange = (
    staffId: string,
    field: "years_exp" | "pax_per_flight" | "errors_per_150",
    val: number
  ) => {
    const safeVal = Math.max(0, isNaN(val) ? 0 : val);
    const existing = ratings[staffId] || {
      staff_id: staffId,
      years_exp: 0,
      pax_per_flight: 0,
      errors_per_150: 0,
      score_exp: 0,
      score_thr: 0,
      score_acc: 0,
      cg_score: 0,
    };

    const updated: CgRating = {
      ...existing,
      [field]: safeVal,
    };

    // Calculate score
    const { expS, thrS, accS, cg } = calcCgScore(
      updated.years_exp,
      updated.pax_per_flight,
      updated.errors_per_150,
      config
    );
    updated.score_exp = expS;
    updated.score_thr = thrS;
    updated.score_acc = accS;
    updated.cg_score = cg;

    setRatings((prev) => ({
      ...prev,
      [staffId]: updated,
    }));
  };

  // Auto-save rating on blur
  const handleBlurSave = async (staffId: string) => {
    const r = ratings[staffId];
    if (!r) return;
    try {
      await db.upsertCgRating(r);
      showToast("Saved rating for " + (staffList.find((s) => s.id === staffId)?.name || "staff"));
      if (onStaffUpdated) onStaffUpdated();
    } catch (e) {
      console.error("Failed to auto-save rating:", e);
    }
  };

  // Save config section
  const handleSaveConfig = async () => {
    if (!isWeightValid) {
      alert("Weights must sum exactly to 100% before saving.");
      return;
    }
    try {
      const saved = await db.upsertCgConfig(draftConfig);
      if (saved) {
        setConfig(saved);
        setDraftConfig(saved);
        showToast("Manager configuration updated successfully!");
      }
    } catch (err) {
      console.error("Failed to save config:", err);
      alert("Failed to save configuration.");
    }
  };

  const showToast = (msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => {
      setSaveStatus(null);
    }, 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      {/* Toast feedback */}
      {saveStatus && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800 animate-in slide-in-from-top-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-bold">{saveStatus}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Award size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Counter & Gate Staff Rating
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Objective performance benchmarking & skills rating across Check-in and Boarding operations
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfigPanel(!showConfigPanel)}
            className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm ${
              showConfigPanel
                ? "bg-slate-900 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            }`}
          >
            <Sliders size={16} />
            <span>Control Panel & Weights</span>
            {showConfigPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all"
            title="Refresh Ratings"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Module 1: Control Panel (Collapsible Manager Settings) */}
      {showConfigPanel && (
        <div className="bg-white rounded-3xl border border-indigo-100 p-6 shadow-sm space-y-6 animate-in slide-in-from-top-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Shield size={18} className="text-indigo-600" />
                Manager Rating Rules & Thresholds
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure formula component weights, experience tiers, throughput bands, and error tolerances.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setDraftConfig(DEFAULT_CG_CONFIG)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Reset Defaults
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={!isWeightValid}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md hover:shadow-indigo-200 transition-all flex items-center gap-2"
              >
                <Save size={15} />
                Save Settings
              </button>
            </div>
          </div>

          {/* Section Selector Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "weights", label: "A) Formula Weights", icon: Sliders },
              { id: "exp", label: "B) Experience Thresholds", icon: Clock },
              { id: "thr", label: "C) Throughput Thresholds", icon: Target },
              { id: "acc", label: "D) Accuracy Thresholds", icon: AlertCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = openSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setOpenSection(tab.id as any)}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab A: Weights */}
          {openSection === "weights" && (
            <div className="space-y-6 pt-2">
              {/* Auto-Balance Toolbar & Presets */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAutoBalanceEnabled(!isAutoBalanceEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isAutoBalanceEnabled
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                        : "bg-white text-slate-600 border border-slate-200"
                    }`}
                  >
                    <Zap size={14} className={isAutoBalanceEnabled ? "text-yellow-300" : "text-slate-400"} />
                    <span>Live Auto-Balance: {isAutoBalanceEnabled ? "ON" : "OFF"}</span>
                  </button>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    (Lock 🔒 sliders to hold exact values like 40%)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyPreset(35, 35, 30)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition-colors"
                  >
                    35/35/30 (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(20, 50, 30)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition-colors"
                  >
                    20/50/30 (Throughput)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(25, 25, 50)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition-colors"
                  >
                    25/25/50 (Accuracy)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Exp Slider */}
                <div className={`p-5 rounded-2xl border transition-all space-y-3 ${
                  lockedWeights.exp ? "bg-amber-50/60 border-amber-300 shadow-sm" : "bg-slate-50 border-slate-200/70"
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Experience Weight
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleWeightLock("exp")}
                        className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-[10px] font-black uppercase ${
                          lockedWeights.exp
                            ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/40"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                        title={lockedWeights.exp ? "Locked: value will not change when moving other sliders" : "Unlocked"}
                      >
                        {lockedWeights.exp ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>{lockedWeights.exp ? "LOCKED" : "LOCK"}</span>
                      </button>
                      <span className="text-base font-black text-indigo-600 font-mono w-12 text-right">
                        {draftConfig.weight_exp}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={lockedWeights.exp || draftConfig.weight_exp <= 0}
                      onClick={() => handleWeightSliderChange("weight_exp", (draftConfig.weight_exp || 0) - 5)}
                      className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center justify-center text-slate-700"
                    >
                      -5
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      disabled={lockedWeights.exp}
                      value={draftConfig.weight_exp}
                      onChange={(e) =>
                        handleWeightSliderChange("weight_exp", parseInt(e.target.value) || 0)
                      }
                      className={`w-full accent-indigo-600 cursor-pointer ${
                        lockedWeights.exp ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    />
                    <button
                      type="button"
                      disabled={lockedWeights.exp || draftConfig.weight_exp >= 100}
                      onClick={() => handleWeightSliderChange("weight_exp", (draftConfig.weight_exp || 0) + 5)}
                      className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center justify-center text-slate-700"
                    >
                      +5
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tenure and station operational familiarity
                  </p>
                </div>

                {/* Throughput Slider */}
                <div className={`p-5 rounded-2xl border transition-all space-y-3 ${
                  lockedWeights.thr ? "bg-amber-50/60 border-amber-300 shadow-sm" : "bg-slate-50 border-slate-200/70"
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Throughput Weight
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleWeightLock("thr")}
                        className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-[10px] font-black uppercase ${
                          lockedWeights.thr
                            ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/40"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                        title={lockedWeights.thr ? "Locked: value will not change when moving other sliders" : "Unlocked"}
                      >
                        {lockedWeights.thr ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>{lockedWeights.thr ? "LOCKED" : "LOCK"}</span>
                      </button>
                      <span className="text-base font-black text-indigo-600 font-mono w-12 text-right">
                        {draftConfig.weight_thr}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={lockedWeights.thr || draftConfig.weight_thr <= 0}
                      onClick={() => handleWeightSliderChange("weight_thr", (draftConfig.weight_thr || 0) - 5)}
                      className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center justify-center text-slate-700"
                    >
                      -5
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      disabled={lockedWeights.thr}
                      value={draftConfig.weight_thr}
                      onChange={(e) =>
                        handleWeightSliderChange("weight_thr", parseInt(e.target.value) || 0)
                      }
                      className={`w-full accent-indigo-600 cursor-pointer ${
                        lockedWeights.thr ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    />
                    <button
                      type="button"
                      disabled={lockedWeights.thr || draftConfig.weight_thr >= 100}
                      onClick={() => handleWeightSliderChange("weight_thr", (draftConfig.weight_thr || 0) + 5)}
                      className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center justify-center text-slate-700"
                    >
                      +5
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Pax checked-in and processed per flight
                  </p>
                </div>

                {/* Accuracy Slider */}
                <div className={`p-5 rounded-2xl border transition-all space-y-3 ${
                  lockedWeights.acc ? "bg-amber-50/60 border-amber-300 shadow-sm" : "bg-slate-50 border-slate-200/70"
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Accuracy Weight
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleWeightLock("acc")}
                        className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-[10px] font-black uppercase ${
                          lockedWeights.acc
                            ? "bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/40"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                        title={lockedWeights.acc ? "Locked: value will not change when moving other sliders" : "Unlocked"}
                      >
                        {lockedWeights.acc ? <Lock size={12} /> : <Unlock size={12} />}
                        <span>{lockedWeights.acc ? "LOCKED" : "LOCK"}</span>
                      </button>
                      <span className="text-base font-black text-indigo-600 font-mono w-12 text-right">
                        {draftConfig.weight_acc}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={lockedWeights.acc || draftConfig.weight_acc <= 0}
                      onClick={() => handleWeightSliderChange("weight_acc", (draftConfig.weight_acc || 0) - 5)}
                      className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center justify-center text-slate-700"
                    >
                      -5
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      disabled={lockedWeights.acc}
                      value={draftConfig.weight_acc}
                      onChange={(e) =>
                        handleWeightSliderChange("weight_acc", parseInt(e.target.value) || 0)
                      }
                      className={`w-full accent-indigo-600 cursor-pointer ${
                        lockedWeights.acc ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    />
                    <button
                      type="button"
                      disabled={lockedWeights.acc || draftConfig.weight_acc >= 100}
                      onClick={() => handleWeightSliderChange("weight_acc", (draftConfig.weight_acc || 0) + 5)}
                      className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-black flex items-center justify-center text-slate-700"
                    >
                      +5
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Error rate (DCS infractions, bag mismatches per 150 pax)
                  </p>
                </div>
              </div>

              {/* Total & Live Preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Weight Total Status */}
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isWeightValid
                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                      : "bg-rose-50/70 border-rose-200 text-rose-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isWeightValid ? (
                      <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle size={20} className="text-rose-600 shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider">
                        Total Weight: {totalWeight}%
                      </div>
                      <div className="text-[11px] opacity-80">
                        {isWeightValid
                          ? "Formula weights are balanced and ready to save."
                          : "Formula weights must sum exactly to 100% to save."}
                      </div>
                    </div>
                  </div>

                  {!isWeightValid && (
                    <button
                      type="button"
                      onClick={handleNormalizeWeights}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold tracking-wide transition-colors shadow-sm shrink-0 flex items-center gap-1.5"
                    >
                      <Zap size={14} /> Auto-Balance (100%)
                    </button>
                  )}
                </div>

                {/* Live Preview Tester */}
                <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 flex flex-col justify-between">
                  <div className="text-xs font-black text-indigo-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" />
                    Live Formula Preview:
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block">Years Exp</label>
                      <input
                        type="number"
                        step="0.5"
                        value={testYears}
                        onChange={(e) => setTestYears(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block">Pax / Flt</label>
                      <input
                        type="number"
                        value={testPax}
                        onChange={(e) => setTestPax(parseInt(e.target.value) || 0)}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block">Err / 150</label>
                      <input
                        type="number"
                        step="0.25"
                        value={testErrors}
                        onChange={(e) => setTestErrors(parseFloat(e.target.value) || 0)}
                        className="w-full bg-white border border-indigo-200 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="text-xs font-bold text-indigo-950 flex items-center justify-between pt-1 border-t border-indigo-200/50">
                    <span>
                      Exp: {liveTestResult.expS}% | Thr: {liveTestResult.thrS}% | Acc: {liveTestResult.accS}%
                    </span>
                    <span className="font-mono text-sm font-black px-2 py-0.5 bg-indigo-600 text-white rounded-lg">
                      Score: {liveTestResult.cg}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab B: Experience Thresholds */}
          {openSection === "exp" && (
            <div className="space-y-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-2xl overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Tier</th>
                      <th className="px-4 py-3">Condition (Years of Experience)</th>
                      <th className="px-4 py-3">Score %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 1</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          step="0.5"
                          value={draftConfig.exp_t1_years}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t1_years: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        years
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.exp_t1_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t1_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 2</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          step="0.5"
                          value={draftConfig.exp_t2_years}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t2_years: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        years
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.exp_t2_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t2_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 3</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          step="0.5"
                          value={draftConfig.exp_t3_years}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t3_years: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        years
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.exp_t3_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t3_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 4</td>
                      <td className="px-4 py-2.5">
                        &le;{" "}
                        <input
                          type="number"
                          step="0.5"
                          value={draftConfig.exp_t4_years}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t4_years: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        years
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.exp_t4_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t4_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr className="bg-indigo-50/30">
                      <td className="px-4 py-2.5 font-bold text-indigo-700">Tier 5 (Top)</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        &gt; {draftConfig.exp_t4_years} years
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.exp_t5_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, exp_t5_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-white border border-indigo-200 rounded-lg font-mono font-bold text-indigo-700"
                        />{" "}
                        %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab C: Throughput Thresholds */}
          {openSection === "thr" && (
            <div className="space-y-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-2xl overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Tier</th>
                      <th className="px-4 py-3">Condition (Pax / Flight)</th>
                      <th className="px-4 py-3">Score %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 1</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          value={draftConfig.thr_t1_pax}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t1_pax: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        pax
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.thr_t1_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t1_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 2</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          value={draftConfig.thr_t2_pax}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t2_pax: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        pax
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.thr_t2_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t2_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 3</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          value={draftConfig.thr_t3_pax}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t3_pax: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        pax
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.thr_t3_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t3_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 4</td>
                      <td className="px-4 py-2.5">
                        &lt;{" "}
                        <input
                          type="number"
                          value={draftConfig.thr_t4_pax}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t4_pax: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        pax
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.thr_t4_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t4_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr className="bg-indigo-50/30">
                      <td className="px-4 py-2.5 font-bold text-indigo-700">Tier 5 (Peak)</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        &ge; {draftConfig.thr_t4_pax} pax
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.thr_t5_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, thr_t5_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-white border border-indigo-200 rounded-lg font-mono font-bold text-indigo-700"
                        />{" "}
                        %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab D: Accuracy Thresholds */}
          {openSection === "acc" && (
            <div className="space-y-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-2xl overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Tier</th>
                      <th className="px-4 py-3">Condition (Errors per 150 Pax)</th>
                      <th className="px-4 py-3">Score %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    <tr className="bg-emerald-50/30">
                      <td className="px-4 py-2.5 font-bold text-emerald-700">Tier 1 (Flawless)</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        &le;{" "}
                        <input
                          type="number"
                          step="0.05"
                          value={draftConfig.acc_t1_err}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t1_err: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-white border border-emerald-200 rounded-lg font-mono font-bold"
                        />{" "}
                        errors
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.acc_t1_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t1_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-white border border-emerald-200 rounded-lg font-mono font-bold text-emerald-700"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 2</td>
                      <td className="px-4 py-2.5">
                        &le;{" "}
                        <input
                          type="number"
                          step="0.05"
                          value={draftConfig.acc_t2_err}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t2_err: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        errors
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.acc_t2_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t2_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 3</td>
                      <td className="px-4 py-2.5">
                        &le;{" "}
                        <input
                          type="number"
                          step="0.05"
                          value={draftConfig.acc_t3_err}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t3_err: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        errors
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.acc_t3_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t3_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 4</td>
                      <td className="px-4 py-2.5">
                        &le;{" "}
                        <input
                          type="number"
                          step="0.1"
                          value={draftConfig.acc_t4_err}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t4_err: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        errors
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.acc_t4_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t4_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr>
                      <td className="px-4 py-2.5 font-bold text-slate-500">Tier 5</td>
                      <td className="px-4 py-2.5">
                        &le;{" "}
                        <input
                          type="number"
                          step="0.5"
                          value={draftConfig.acc_t5_err}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t5_err: parseFloat(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold"
                        />{" "}
                        errors
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.acc_t5_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t5_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-slate-50 border rounded-lg font-mono font-bold text-indigo-600"
                        />{" "}
                        %
                      </td>
                    </tr>

                    <tr className="bg-rose-50/30">
                      <td className="px-4 py-2.5 font-bold text-rose-700">Tier 6 (High Error)</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        &gt; {draftConfig.acc_t5_err} errors
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono">
                        <input
                          type="number"
                          value={draftConfig.acc_t6_score}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, acc_t6_score: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 bg-white border border-rose-200 rounded-lg font-mono font-bold text-rose-700"
                        />{" "}
                        %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Module 3: Team Summary Metrics & Distribution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Metric Cards */}
        <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
              Avg Station Score
            </span>
            <div className="my-2 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 font-mono">
                {teamStats.avgScore}%
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getCgLevel(teamStats.avgScore).bg} ${getCgLevel(teamStats.avgScore).text}`}>
                {getCgLevel(teamStats.avgScore).label}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              Across {activeStaff.length} active agents
            </span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={13} />
              Excellent (≥90)
            </span>
            <div className="my-2">
              <span className="text-3xl font-black text-emerald-600 font-mono">
                {teamStats.excellentCount}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {activeStaff.length ? Math.round((teamStats.excellentCount / activeStaff.length) * 100) : 0}% of workforce
            </span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider">
              Good (70-89)
            </span>
            <div className="my-2">
              <span className="text-3xl font-black text-indigo-600 font-mono">
                {teamStats.goodCount}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {activeStaff.length ? Math.round((teamStats.goodCount / activeStaff.length) * 100) : 0}% of workforce
            </span>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-black text-rose-600 uppercase tracking-wider">
              Weak (&lt;50)
            </span>
            <div className="my-2">
              <span className="text-3xl font-black text-rose-600 font-mono">
                {teamStats.weakCount}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              Need refresher training
            </span>
          </div>

          {/* Top & Lowest Performer Bar */}
          <div className="col-span-2 md:col-span-4 bg-slate-900 text-white p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xs">
                ★
              </div>
              <div>
                <div className="text-[10px] uppercase font-black text-emerald-400 tracking-wider">
                  Top Station Performer
                </div>
                <div className="text-sm font-bold flex items-center gap-2">
                  {teamStats.topPerformer?.name || "None"}
                  <span className="font-mono bg-emerald-500/30 text-emerald-300 text-xs px-2 py-0.5 rounded font-black">
                    {teamStats.topPerformer?.cg_score || 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-px h-px md:h-8 bg-slate-800" />

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs">
                ▲
              </div>
              <div>
                <div className="text-[10px] uppercase font-black text-amber-400 tracking-wider">
                  Lowest Benchmarked
                </div>
                <div className="text-sm font-bold flex items-center gap-2">
                  {teamStats.lowestPerformer?.name || "None"}
                  <span className="font-mono bg-amber-500/30 text-amber-300 text-xs px-2 py-0.5 rounded font-black">
                    {teamStats.lowestPerformer?.cg_score || 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Score Distribution Chart */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <BarChart3 size={15} className="text-indigo-600" />
              Rating Distribution
            </span>
            <span className="text-[10px] font-bold text-slate-400">Headcount</span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={teamStats.distribution}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white text-xs p-2 rounded-xl shadow-lg border border-slate-800">
                          <p className="font-bold">{data.name}</p>
                          <p className="text-emerald-400 font-mono font-black">{data.count} Staff members</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {teamStats.distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Module 2: Staff C&G Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Table Controls */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-black text-xs">
              {filteredStaff.length}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Staff Counter & Gate Scorecard
              </h3>
              <p className="text-[11px] text-slate-400">
                Click input cells to edit inline — scores recalculate live and auto-save on blur
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 w-48"
              />
            </div>

            {/* Level Filter */}
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Performance Levels</option>
              <option value="excellent">Excellent (≥90)</option>
              <option value="good">Good (70-89)</option>
              <option value="moderate">Moderate (50-69)</option>
              <option value="weak">Weak (&lt;50)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-black uppercase text-[10px] tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 w-12 text-center">#</th>
                <th className="px-4 py-3">Staff Member</th>
                <th className="px-3 py-3 text-center">Initials</th>
                <th className="px-3 py-3 text-center bg-indigo-50/30">
                  Exp (yrs)
                </th>
                <th className="px-3 py-3 text-center bg-indigo-50/30">
                  Pax / Flt
                </th>
                <th className="px-3 py-3 text-center bg-indigo-50/30">
                  Err / 150
                </th>
                <th className="px-3 py-3 text-center text-slate-400">Exp%</th>
                <th className="px-3 py-3 text-center text-slate-400">Thr%</th>
                <th className="px-3 py-3 text-center text-slate-400">Acc%</th>
                <th className="px-4 py-3 w-48 text-center">C&G Score</th>
                <th className="px-4 py-3 text-center">Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-semibold">
                    No active staff found matching your search.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff, idx) => {
                  const level = getCgLevel(staff.cg_score);
                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Name & ID */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-700">
                            {staff.initials}
                          </div>
                          <div>
                            <span className="font-black text-slate-800 block text-xs">
                              {staff.name}
                            </span>
                            {staff.staffId && (
                              <span className="text-[10px] font-mono text-slate-400">
                                ID: {staff.staffId}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Initials */}
                      <td className="px-3 py-3 text-center font-bold font-mono text-slate-600">
                        {staff.initials}
                      </td>

                      {/* Input: Years Exp */}
                      <td className="px-3 py-2 text-center bg-indigo-50/20">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={staff.years_exp || ""}
                          placeholder="0"
                          onChange={(e) =>
                            handleRatingChange(
                              staff.id,
                              "years_exp",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          onFocus={() => setEditingStaffId(staff.id)}
                          onBlur={() => handleBlurSave(staff.id)}
                          className="w-16 px-2 py-1 text-center font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
                        />
                      </td>

                      {/* Input: Pax per Flight */}
                      <td className="px-3 py-2 text-center bg-indigo-50/20">
                        <input
                          type="number"
                          min="0"
                          value={staff.pax_per_flight || ""}
                          placeholder="0"
                          onChange={(e) =>
                            handleRatingChange(
                              staff.id,
                              "pax_per_flight",
                              parseInt(e.target.value) || 0
                            )
                          }
                          onFocus={() => setEditingStaffId(staff.id)}
                          onBlur={() => handleBlurSave(staff.id)}
                          className="w-16 px-2 py-1 text-center font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
                        />
                      </td>

                      {/* Input: Errors per 150 pax */}
                      <td className="px-3 py-2 text-center bg-indigo-50/20">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          value={staff.errors_per_150 !== undefined ? staff.errors_per_150 : ""}
                          placeholder="0"
                          onChange={(e) =>
                            handleRatingChange(
                              staff.id,
                              "errors_per_150",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          onFocus={() => setEditingStaffId(staff.id)}
                          onBlur={() => handleBlurSave(staff.id)}
                          className="w-16 px-2 py-1 text-center font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
                        />
                      </td>

                      {/* Read-Only: Exp % */}
                      <td className="px-3 py-3 text-center font-mono text-slate-500 text-[11px]">
                        {staff.score_exp}%
                      </td>

                      {/* Read-Only: Thr % */}
                      <td className="px-3 py-3 text-center font-mono text-slate-500 text-[11px]">
                        {staff.score_thr}%
                      </td>

                      {/* Read-Only: Acc % */}
                      <td className="px-3 py-3 text-center font-mono text-slate-500 text-[11px]">
                        {staff.score_acc}%
                      </td>

                      {/* C&G Score with Colored Progress Bar */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-black text-slate-900 font-mono">
                              {staff.cg_score}%
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              Target 85%+
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${level.barColor}`}
                              style={{ width: `${Math.min(100, Math.max(0, staff.cg_score))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Level Badge */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${level.bg} ${level.border} ${level.text}`}
                        >
                          {level.label}
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
};
