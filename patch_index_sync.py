import re

with open("index.tsx", "r") as f:
    content = f.read()

old_code = """    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && supabase) {
        const s = await auth.getSession();
        if (s) syncCloudData();
      }
    };"""

new_code = """    let lastVisibilitySync = 0;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && supabase) {
        const now = Date.now();
        if (now - lastVisibilitySync > 5 * 60 * 1000) { // 5 minutes
          lastVisibilitySync = now;
          const s = await auth.getSession();
          if (s) syncCloudData();
        }
      }
    };"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open("index.tsx", "w") as f:
        f.write(content)
    print("Patched index.tsx successfully")
else:
    print("Could not find the target code block in index.tsx")
