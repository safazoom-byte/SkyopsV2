import re

with open("services/supabaseService.ts", "r") as f:
    content = f.read()

# Fix the user fetch condition
old_users = """          const filteredData = data.filter((d) => d.email?.toLowerCase() !== "safazoom@gmail.com");
          
          return filteredData.map(
"""

new_users = """          // Only filter out safazoom if the current user is not safazoom
          const { data: { user: currentUser } } = await client.auth.getUser();
          const filteredData = data.filter((d) => {
             if (d.email?.toLowerCase() === "safazoom@gmail.com") {
                return currentUser?.email?.toLowerCase() === "safazoom@gmail.com";
             }
             return true;
          });
          
          return filteredData.map(
"""

if old_users in content:
    content = content.replace(old_users, new_users)
    print("Patched users fetch")
else:
    print("Users fetch not found")

# Fix audit logs
old_logs = """          const filteredData = data.filter((d) => d.user_email?.toLowerCase() !== "safazoom@gmail.com");
          
          return filteredData.map(
"""

new_logs = """          const { data: { user: currentUser } } = await client.auth.getUser();
          const filteredData = data.filter((d) => {
             if (d.user_email?.toLowerCase() === "safazoom@gmail.com") {
                return currentUser?.email?.toLowerCase() === "safazoom@gmail.com";
             }
             return true;
          });
          
          return filteredData.map(
"""

if old_logs in content:
    content = content.replace(old_logs, new_logs)
    print("Patched audit logs")
else:
    print("Audit logs not found")

with open("services/supabaseService.ts", "w") as f:
    f.write(content)
