import re

with open("services/supabaseService.ts", "r") as f:
    content = f.read()

# Fix the audit logs
old_logs = """        if (data && data.length > 0) {
          const filteredData = data.filter((d) => d.user_email?.toLowerCase() !== "safazoom@gmail.com");
          return filteredData.map((d: any) => ({"""

new_logs = """        if (data && data.length > 0) {
          const { data: { user: currentUser } } = await client.auth.getUser();
          const filteredData = data.filter((d) => {
             if (d.user_email?.toLowerCase() === "safazoom@gmail.com") {
                return currentUser?.email?.toLowerCase() === "safazoom@gmail.com";
             }
             return true;
          });
          return filteredData.map((d: any) => ({"""

if old_logs in content:
    content = content.replace(old_logs, new_logs)
    print("Patched logs fetch")
else:
    print("Logs fetch not found")

with open("services/supabaseService.ts", "w") as f:
    f.write(content)
