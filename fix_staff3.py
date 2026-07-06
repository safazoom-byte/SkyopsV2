with open("components/StaffManager.tsx", "r") as f:
    lines = f.read().split("\n")

for i, line in enumerate(lines):
    if "stat.stats.inactive > 0" in line:
        print(f"Found at line {i+1}")
        for j in range(i, i+15):
            print(f"{j+1}: {lines[j]}")

