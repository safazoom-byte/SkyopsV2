import re

with open("services/supabaseService.ts", "r") as f:
    content = f.read()

old_client = """          const { data: { user: currentUser } } = await client.auth.getUser();"""
new_client = """          const { data: { user: currentUser } } = await supabase.auth.getUser();"""

if old_client in content:
    content = content.replace(old_client, new_client)
    print("Patched client to supabase 2")
else:
    print("client to supabase not found 2")

with open("services/supabaseService.ts", "w") as f:
    f.write(content)
