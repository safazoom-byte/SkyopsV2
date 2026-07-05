with open("components/ShiftManager.tsx", "r") as f:
    code = f.read()

code = code.replace("import {\n  ChevronDown, ShiftConfig,", "import {\n  ShiftConfig,")
code = code.replace("import {\n  Clock,\n  Trash2,", "import {\n  ChevronDown,\n  Clock,\n  Trash2,")

with open("components/ShiftManager.tsx", "w") as f:
    f.write(code)

