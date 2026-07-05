with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

code = code.replace('py-32 text-center flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-100 rounded-[3rem]', 'py-16 text-center flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-100 rounded-[2rem]')

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)

