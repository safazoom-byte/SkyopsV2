import re

with open("index.tsx", "r") as f:
    content = f.read()

old_err = """const origError = console.error;
console.error = (...args) => {
  const isMatch = (a: any) => 
    (typeof a === 'string' && (a.includes('Invalid Refresh Token') || a.includes('Refresh Token Not Found') || a.includes('session from storage is not valid'))) ||
    (a instanceof Error && (a.message.includes('Invalid Refresh Token') || a.message.includes('Refresh Token Not Found') || a.message.includes('session from storage is not valid')));
  if (args.some(isMatch)) {
    return;
  }
  origError(...args);
};"""

new_err = """window.addEventListener("unhandledrejection", (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes("Failed to fetch")) {
    event.preventDefault();
  }
});

const origError = console.error;
console.error = (...args) => {
  const isMatch = (a: any) => 
    (typeof a === 'string' && (a.includes('Invalid Refresh Token') || a.includes('Refresh Token Not Found') || a.includes('session from storage is not valid') || a.includes('Failed to fetch'))) ||
    (a instanceof Error && (a.message.includes('Invalid Refresh Token') || a.message.includes('Refresh Token Not Found') || a.message.includes('session from storage is not valid') || a.message.includes('Failed to fetch')));
  if (args.some(isMatch)) {
    return;
  }
  origError(...args);
};"""

content = content.replace(old_err, new_err)

with open("index.tsx", "w") as f:
    f.write(content)
