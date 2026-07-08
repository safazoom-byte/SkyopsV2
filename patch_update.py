import re

with open("api/users/update.ts", "r") as f:
    content = f.read()

# Fix the audit logs
old_update = """    if (!isSelf && !isSuperAdmin && !isAdmin) return res.status(403).json({ error: "Forbidden" });"""

new_update = """    if (!isSelf && !isSuperAdmin && !isAdmin) return res.status(403).json({ error: "Forbidden" });
    if (profile.email === "safazoom@gmail.com" && caller.email !== "safazoom@gmail.com") {
        return res.status(403).json({ error: "Cannot modify master user" });
    }"""

if old_update in content:
    content = content.replace(old_update, new_update)
    print("Patched update endpoint")
else:
    print("Update endpoint not found")

with open("api/users/update.ts", "w") as f:
    f.write(content)
