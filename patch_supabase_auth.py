import re

with open("services/supabaseService.ts", "r") as f:
    content = f.read()

old_auth_users = """        if (data) {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          const filteredData = data.filter((d) => {"""

new_auth_users = """        if (data) {
          const session = await auth.getSession();
          const currentUser = session?.user;
          const filteredData = data.filter((d) => {"""

if old_auth_users in content:
    content = content.replace(old_auth_users, new_auth_users)
    print("Patched users auth")
else:
    print("Users auth not found")


old_auth_logs = """        if (data && data.length > 0) {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          const filteredData = data.filter((d) => {"""

new_auth_logs = """        if (data && data.length > 0) {
          const session = await auth.getSession();
          const currentUser = session?.user;
          const filteredData = data.filter((d) => {"""

if old_auth_logs in content:
    content = content.replace(old_auth_logs, new_auth_logs)
    print("Patched logs auth")
else:
    print("Logs auth not found")

with open("services/supabaseService.ts", "w") as f:
    f.write(content)
