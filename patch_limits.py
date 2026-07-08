import re

with open("index.tsx", "r") as f:
    content = f.read()

# AI limits
old_ai_limits = """      const dailyCount = await db.getAIGenerationCount(userProfile.id, "daily");
      if (dailyCount >= userProfile.aiDailyLimit) {
        alert(
          `Quota Reached: You have hit your daily limit of ${userProfile.aiDailyLimit} AI generations. Please contact your Master User to increase your limits.`,
        );
        return;
      }
      const weeklyCount = await db.getAIGenerationCount(
        userProfile.id,
        "weekly",
      );
      if (weeklyCount >= userProfile.aiWeeklyLimit) {
        alert(
          `Quota Reached: You have hit your weekly limit of ${userProfile.aiWeeklyLimit} AI generations.`,
        );
        return;
      }
      const monthlyCount = await db.getAIGenerationCount(
        userProfile.id,
        "monthly",
      );
      if (monthlyCount >= userProfile.aiMonthlyLimit) {
        alert(
          `Quota Reached: You have hit your monthly limit of ${userProfile.aiMonthlyLimit} AI generations.`,
        );
        return;
      }"""

new_ai_limits = """      if (userProfile.role !== "super_admin" && userProfile.email !== "safazoom@gmail.com") {
        const dailyCount = await db.getAIGenerationCount(userProfile.id, "daily");
        if (dailyCount >= userProfile.aiDailyLimit) {
          alert(
            `Quota Reached: You have hit your daily limit of ${userProfile.aiDailyLimit} AI generations. Please contact your Master User to increase your limits.`,
          );
          return;
        }
        const weeklyCount = await db.getAIGenerationCount(
          userProfile.id,
          "weekly",
        );
        if (weeklyCount >= userProfile.aiWeeklyLimit) {
          alert(
            `Quota Reached: You have hit your weekly limit of ${userProfile.aiWeeklyLimit} AI generations.`,
          );
          return;
        }
        const monthlyCount = await db.getAIGenerationCount(
          userProfile.id,
          "monthly",
        );
        if (monthlyCount >= userProfile.aiMonthlyLimit) {
          alert(
            `Quota Reached: You have hit your monthly limit of ${userProfile.aiMonthlyLimit} AI generations.`,
          );
          return;
        }
      }"""

if old_ai_limits in content:
    content = content.replace(old_ai_limits, new_ai_limits)
    print("Patched AI limits")
else:
    print("AI limits block not found")

# Staff limit
old_staff_limit = """              if (
                isNew &&
                userProfile &&
                staff.length >= userProfile.maxStaff
              ) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxStaff} staff members.`,
                );
                return;
              }"""

new_staff_limit = """              if (
                isNew &&
                userProfile &&
                userProfile.role !== "super_admin" &&
                userProfile.email !== "safazoom@gmail.com" &&
                staff.length >= userProfile.maxStaff
              ) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxStaff} staff members.`,
                );
                return;
              }"""

if old_staff_limit in content:
    content = content.replace(old_staff_limit, new_staff_limit)
    print("Patched staff limit")
else:
    print("Staff limit block not found")

# Shift limit
old_shift_limit = """              if (userProfile && shifts.length >= userProfile.maxShifts) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxShifts} shifts.`,
                );
                return;
              }"""

new_shift_limit = """              if (userProfile && userProfile.role !== "super_admin" && userProfile.email !== "safazoom@gmail.com" && shifts.length >= userProfile.maxShifts) {
                alert(
                  `Quota Reached: You have hit your limit of ${userProfile.maxShifts} shifts.`,
                );
                return;
              }"""

if old_shift_limit in content:
    content = content.replace(old_shift_limit, new_shift_limit)
    print("Patched shift limit")
else:
    print("Shift limit block not found")

with open("index.tsx", "w") as f:
    f.write(content)
