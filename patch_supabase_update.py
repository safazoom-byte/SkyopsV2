import re

with open("services/supabaseService.ts", "r") as f:
    code = f.read()

replacement = """  async updateUserProfile(profile: UserProfile) {
    if (supabase) {
      try {
        const session = await auth.getSession();
        if (!session) throw new Error("No session");
        const token = session.access_token;
        
        const response = await fetch("/api/users/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ profile })
        });
        
        if (!response.ok) {
           const err = await response.json();
           throw new Error(err.error || "Failed to update profile");
        }
      } catch (e) {
        console.warn("Exception updating profile:", e);
      }
    }
  },"""

# We need to find the `updateUserProfile` function and replace it.
import sys
start_idx = code.find("async updateUserProfile(profile: UserProfile) {")
if start_idx == -1:
    print("Could not find updateUserProfile")
    sys.exit(1)

# Find the end of the method by matching braces
open_braces = 0
end_idx = -1
for i in range(start_idx, len(code)):
    if code[i] == '{':
        open_braces += 1
    elif code[i] == '}':
        open_braces -= 1
        if open_braces == 0:
            end_idx = i + 1
            # Include the comma if it exists
            if end_idx < len(code) and code[end_idx] == ',':
                end_idx += 1
            break

if end_idx == -1:
    print("Could not find end of updateUserProfile")
    sys.exit(1)

code = code[:start_idx] + replacement + code[end_idx:]

with open("services/supabaseService.ts", "w") as f:
    f.write(code)
