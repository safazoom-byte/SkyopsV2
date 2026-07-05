with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

code = code.replace("import { X,   ShiftConfig,", "import { ShiftConfig,")

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)

