with open("components/ShiftManager.tsx", "r") as f:
    shift_code = f.read()
shift_code = shift_code.replace('className="flex-[2] py-5 bg-slate-950 text-white rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl hover:bg-blue-600 transition-all text-xs active:scale-95 leading-none"', 'className="flex-[2] py-3 bg-slate-950 text-white rounded-xl font-black uppercase italic tracking-widest shadow-lg hover:bg-blue-600 transition-all text-[10px] active:scale-95 leading-none"')
with open("components/ShiftManager.tsx", "w") as f:
    f.write(shift_code)

with open("components/StaffManager.tsx", "r") as f:
    staff_code = f.read()
staff_code = staff_code.replace('className="w-full py-5 md:py-6 bg-slate-950 text-white rounded-2xl md:rounded-[2.5rem] font-black uppercase italic tracking-[0.2em] md:tracking-[0.3em] shadow-2xl hover:bg-blue-600 text-[10px] md:text-xs transition-all active:scale-95"', 'className="w-full py-3 md:py-4 bg-slate-950 text-white rounded-xl md:rounded-2xl font-black uppercase italic tracking-widest shadow-xl hover:bg-blue-600 text-[10px] transition-all active:scale-95"')
with open("components/StaffManager.tsx", "w") as f:
    f.write(staff_code)
