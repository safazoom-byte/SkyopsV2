import re

with open("services/supabaseService.ts", "r") as f:
    content = f.read()

# Fix the user fetch condition
old_users = """          const filteredData = data.filter((d) => d.email?.toLowerCase() !== "safazoom@gmail.com");

          return filteredData.map((d: any) => ({"""

new_users = """          // Only filter out safazoom if the current user is not safazoom
          const { data: { user: currentUser } } = await client.auth.getUser();
          const filteredData = data.filter((d) => {
             if (d.email?.toLowerCase() === "safazoom@gmail.com") {
                return currentUser?.email?.toLowerCase() === "safazoom@gmail.com";
             }
             return true;
          });

          return filteredData.map((d: any) => ({"""

if old_users in content:
    content = content.replace(old_users, new_users)
    print("Patched users fetch")
else:
    print("Users fetch not found")

with open("services/supabaseService.ts", "w") as f:
    f.write(content)
