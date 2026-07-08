import re

with open("server.ts", "r") as f:
    content = f.read()

old_update = """      if (!isSelf && !isSuperAdmin && !isAdmin) {
         return res.status(403).json({ error: "Forbidden" });
      }"""

new_update = """      if (!isSelf && !isSuperAdmin && !isAdmin) {
         return res.status(403).json({ error: "Forbidden" });
      }
      if (profile.email === "safazoom@gmail.com" && caller.email !== "safazoom@gmail.com") {
         return res.status(403).json({ error: "Cannot modify master user" });
      }"""

if old_update in content:
    content = content.replace(old_update, new_update)
    print("Patched server.ts update endpoint")
else:
    print("Update endpoint not found in server.ts")

with open("server.ts", "w") as f:
    f.write(content)
