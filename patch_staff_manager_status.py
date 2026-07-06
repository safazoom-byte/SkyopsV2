import re

with open("components/StaffManager.tsx", "r") as f:
    code = f.read()

old_status_ui = """              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 mb-6 mt-4">
                <label className="text-[10px] font-black text-slate-700 uppercase mb-4 block flex items-center gap-2">
                  <Power size={14} className="text-slate-400" />
                  Employment Status
                </label>
                
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingStaff({ ...editingStaff, isActive: true, workToDate: "" })}
                      className={`flex-1 py-3 px-4 rounded-xl font-black text-[10px] md:text-xs transition-all border ${editingStaff.isActive !== false && !editingStaff.workToDate ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
                    >
                      ACTIVE
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingStaff({ ...editingStaff, isActive: false })}
                      className={`flex-1 py-3 px-4 rounded-xl font-black text-[10px] md:text-xs transition-all border ${editingStaff.isActive === false ? "bg-rose-50 border-rose-200 text-rose-700 shadow-sm" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
                    >
                      DEACTIVATED NOW
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <label className="text-[9px] font-black text-slate-500 uppercase mb-3 block">
                      Or set a specific deactivation date (Staff will be unavailable after this date)
                    </label>
                    <input
                      type="date"
                      name="workToDate"
                      className={`w-full px-4 py-3 border rounded-xl font-bold text-xs outline-none transition-all ${editingStaff.workToDate ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-white border-slate-200 text-slate-900 focus:border-indigo-400"}`}
                      value={editingStaff.workToDate || ""}
                      onChange={(e) => {
                         setEditingStaff({ ...editingStaff, workToDate: e.target.value, isActive: true });
                      }}
                    />
                  </div>
                  {editingStaff.type === "Roster" && (
                    <div className="pt-4 border-t border-slate-200">
                      <label className="text-[9px] font-black text-slate-500 uppercase mb-3 block">
                        Contract Start Date (Roster only)
                      </label>
                      <input
                        type="date"
                        name="workFromDate"
                        className={`w-full px-4 py-3 border rounded-xl font-bold text-xs outline-none transition-all ${editingStaff.workFromDate ? "bg-indigo-50 border-indigo-200 text-indigo-900" : "bg-white border-slate-200 text-slate-900 focus:border-indigo-400"}`}
                        value={editingStaff.workFromDate || ""}
                        onChange={(e) => {
                           setEditingStaff({ ...editingStaff, workFromDate: e.target.value });
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>"""

new_status_ui = """              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 mb-6 mt-4">
                <label className="text-[10px] font-black text-slate-700 uppercase mb-4 block flex items-center gap-2">
                  <Power size={14} className="text-slate-400" />
                  Employment Status
                </label>
                
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingStaff({ ...editingStaff, isActive: true, workToDate: "" })}
                      className={`flex-1 py-3 px-4 rounded-xl font-black text-[10px] md:text-xs transition-all border ${editingStaff.isActive !== false && !editingStaff.workToDate ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
                    >
                      ACTIVE
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingStaff({ ...editingStaff, isActive: false })}
                      className={`flex-1 py-3 px-4 rounded-xl font-black text-[10px] md:text-xs transition-all border ${editingStaff.isActive === false ? "bg-rose-50 border-rose-200 text-rose-700 shadow-sm" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}
                    >
                      DEACTIVATED NOW
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <label className="text-[9px] font-black text-slate-500 uppercase mb-3 block">
                      Or set active period (e.g., Contract dates or Temporary Activation)
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1.5 block">
                          Active From
                        </label>
                        <input
                          type="date"
                          name="workFromDate"
                          className={`w-full px-4 py-3 border rounded-xl font-bold text-xs outline-none transition-all ${editingStaff.workFromDate ? "bg-indigo-50 border-indigo-200 text-indigo-900" : "bg-white border-slate-200 text-slate-900 focus:border-indigo-400"}`}
                          value={editingStaff.workFromDate || ""}
                          onChange={(e) => {
                             setEditingStaff({ ...editingStaff, workFromDate: e.target.value, isActive: true });
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase mb-1.5 block">
                          Active Until
                        </label>
                        <input
                          type="date"
                          name="workToDate"
                          className={`w-full px-4 py-3 border rounded-xl font-bold text-xs outline-none transition-all ${editingStaff.workToDate ? "bg-rose-50 border-rose-200 text-rose-900" : "bg-white border-slate-200 text-slate-900 focus:border-indigo-400"}`}
                          value={editingStaff.workToDate || ""}
                          onChange={(e) => {
                             setEditingStaff({ ...editingStaff, workToDate: e.target.value, isActive: true });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>"""

if old_status_ui in code:
    code = code.replace(old_status_ui, new_status_ui)
    print("UI replaced successfully")
else:
    print("Could not find old UI block exactly.")

with open("components/StaffManager.tsx", "w") as f:
    f.write(code)
