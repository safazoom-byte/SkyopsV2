import re

with open("index.tsx", "r") as f:
    content = f.read()

old_warn = """const origWarn = console.warn;
console.warn = (...args) => {
  const isMatch = (a: any) => 
    (typeof a === 'string' && (a.includes('Invalid Refresh Token') || a.includes('Refresh Token Not Found') || a.includes('session from storage is not valid'))) ||
    (a instanceof Error && (a.message.includes('Invalid Refresh Token') || a.message.includes('Refresh Token Not Found') || a.message.includes('session from storage is not valid')));
  if (args.some(isMatch)) {
    return;
  }
  origWarn(...args);
};"""

new_warn = """const origWarn = console.warn;
console.warn = (...args) => {
  const isMatch = (a: any) => 
    (typeof a === 'string' && (a.includes('Invalid Refresh Token') || a.includes('Refresh Token Not Found') || a.includes('session from storage is not valid') || a.includes('Failed to fetch'))) ||
    (a instanceof Error && (a.message.includes('Invalid Refresh Token') || a.message.includes('Refresh Token Not Found') || a.message.includes('session from storage is not valid') || a.message.includes('Failed to fetch')));
  if (args.some(isMatch)) {
    return;
  }
  origWarn(...args);
};"""

content = content.replace(old_warn, new_warn)

with open("index.tsx", "w") as f:
    f.write(content)
