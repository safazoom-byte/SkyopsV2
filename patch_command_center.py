import re

with open("components/CommandCenter.tsx", "r") as f:
    content = f.read()

# Fix the filter condition
old_filter = """.filter(u => currentUser.role === "super_admin" || u.role !== "super_admin")
    .filter(u => u.email?.toLowerCase() !== "safazoom@gmail.com")"""

new_filter = """.filter(u => currentUser.role === "super_admin" || u.role !== "super_admin")
    .filter(u => {
      if (u.email?.toLowerCase() === "safazoom@gmail.com") {
        return currentUser?.email?.toLowerCase() === "safazoom@gmail.com";
      }
      return true;
    })"""

if old_filter in content:
    content = content.replace(old_filter, new_filter)
    print("Patched filter condition")
else:
    print("Filter condition not found")

with open("components/CommandCenter.tsx", "w") as f:
    f.write(content)
