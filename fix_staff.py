with open("components/StaffManager.tsx", "r") as f:
    code = f.read()

code = code.replace("              )}\n              <div className=\"space-y-4 pt-6 border-t border-slate-50\">", "              <div className=\"space-y-4 pt-6 border-t border-slate-50\">")

with open("components/StaffManager.tsx", "w") as f:
    f.write(code)
