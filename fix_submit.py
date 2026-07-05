with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

code = code.replace("resetForm();\n  };", "resetForm();\n    setIsFormOpen(false);\n  };")

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)
