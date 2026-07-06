import re

with open("components/CommandCenter.tsx", "r") as f:
    code = f.read()

# Replace onChange for maxStaff
code = code.replace(
"""                            <input
                              type="number"
                              value={user.maxStaff}
                              onChange={(e) =>
                                handleUpdateUser({
                                  ...user,
                                  maxStaff: parseInt(e.target.value) || 0,
                                })
                              }""",
"""                            <input
                              type="number"
                              value={user.maxStaff}
                              onChange={(e) =>
                                setUsers(users.map((u) => u.id === user.id ? { ...u, maxStaff: parseInt(e.target.value) || 0 } : u))
                              }
                              onBlur={() => handleUpdateUser(user)}""")

# Replace onChange for maxShifts
code = code.replace(
"""                            <input
                              type="number"
                              value={user.maxShifts}
                              onChange={(e) =>
                                handleUpdateUser({
                                  ...user,
                                  maxShifts: parseInt(e.target.value) || 0,
                                })
                              }""",
"""                            <input
                              type="number"
                              value={user.maxShifts}
                              onChange={(e) =>
                                setUsers(users.map((u) => u.id === user.id ? { ...u, maxShifts: parseInt(e.target.value) || 0 } : u))
                              }
                              onBlur={() => handleUpdateUser(user)}""")

# Replace onChange for aiDailyLimit
code = code.replace(
"""                        <input
                          type="number"
                          value={user.aiDailyLimit}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              aiDailyLimit: parseInt(e.target.value) || 0,
                            })
                          }""",
"""                        <input
                          type="number"
                          value={user.aiDailyLimit}
                          onChange={(e) =>
                            setUsers(users.map((u) => u.id === user.id ? { ...u, aiDailyLimit: parseInt(e.target.value) || 0 } : u))
                          }
                          onBlur={() => handleUpdateUser(user)}""")

# Replace onChange for aiWeeklyLimit
code = code.replace(
"""                        <input
                          type="number"
                          value={user.aiWeeklyLimit}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              aiWeeklyLimit: parseInt(e.target.value) || 0,
                            })
                          }""",
"""                        <input
                          type="number"
                          value={user.aiWeeklyLimit}
                          onChange={(e) =>
                            setUsers(users.map((u) => u.id === user.id ? { ...u, aiWeeklyLimit: parseInt(e.target.value) || 0 } : u))
                          }
                          onBlur={() => handleUpdateUser(user)}""")

# Replace onChange for aiMonthlyLimit
code = code.replace(
"""                        <input
                          type="number"
                          value={user.aiMonthlyLimit}
                          onChange={(e) =>
                            handleUpdateUser({
                              ...user,
                              aiMonthlyLimit: parseInt(e.target.value) || 0,
                            })
                          }""",
"""                        <input
                          type="number"
                          value={user.aiMonthlyLimit}
                          onChange={(e) =>
                            setUsers(users.map((u) => u.id === user.id ? { ...u, aiMonthlyLimit: parseInt(e.target.value) || 0 } : u))
                          }
                          onBlur={() => handleUpdateUser(user)}""")

with open("components/CommandCenter.tsx", "w") as f:
    f.write(code)
