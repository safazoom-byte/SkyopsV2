import re

with open("index.tsx", "r") as f:
    content = f.read()

# Fix 1744
old_1 = """              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.staffId !== id),
                }));
                if (supabase) db.savePrograms(updated);
                return updated;
              });"""

new_1 = """              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.staffId !== id),
                }));
                const changed = updated.filter((prog, i) => JSON.stringify(prog.assignments) !== JSON.stringify(prev[i].assignments));
                if (supabase && changed.length > 0) db.savePrograms(changed);
                return updated;
              });"""

# Fix 1766
old_2 = """              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: [],
                }));
                if (supabase) db.savePrograms(updated);
                return updated;
              });"""

new_2 = """              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: [],
                }));
                const changed = updated.filter((prog, i) => prev[i].assignments.length > 0);
                if (supabase && changed.length > 0) db.savePrograms(changed);
                return updated;
              });"""

# Fix 1849
old_3 = """              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.shiftId !== id),
                }));
                if (supabase) db.savePrograms(updated);
                return updated;
              });"""

new_3 = """              setPrograms((prev) => {
                const updated = prev.map((prog) => ({
                  ...prog,
                  assignments: prog.assignments.filter((a) => a.shiftId !== id),
                }));
                const changed = updated.filter((prog, i) => JSON.stringify(prog.assignments) !== JSON.stringify(prev[i].assignments));
                if (supabase && changed.length > 0) db.savePrograms(changed);
                return updated;
              });"""

if old_1 in content: content = content.replace(old_1, new_1)
if old_2 in content: content = content.replace(old_2, new_2)
if old_3 in content: content = content.replace(old_3, new_3)

with open("index.tsx", "w") as f:
    f.write(content)
print("Patched index.tsx save logic")
