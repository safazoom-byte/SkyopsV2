import re

with open("index.tsx", "r") as f:
    content = f.read()

# Fix maxShifts check
old_shift = """              if (userProfile && userProfile.role !== "super_admin" && userProfile.email !== "safazoom@gmail.com" && shifts.length >= userProfile.maxShifts) {"""
new_shift = """              if (userProfile && userProfile.role !== "super_admin" && userProfile.email !== "safazoom@gmail.com" && userProfile.email !== "safazoom@gmail.com" && shifts.length >= userProfile.maxShifts) {"""

if old_shift in content:
    content = content.replace(old_shift, new_shift)
    print("Patched shift condition 1")

with open("index.tsx", "w") as f:
    f.write(content)
