const fs = require('fs');

const path = 'services/supabaseService.ts';
let code = fs.readFileSync(path, 'utf8');

// Hide from user list
code = code.replace(
  'const filteredData = data.filter((d) => d.email?.toLowerCase() === "safazoom@gmail.com" ? profile?.email?.toLowerCase() === "safazoom@gmail.com" : true);',
  'const filteredData = data.filter((d) => d.email?.toLowerCase() !== "safazoom@gmail.com");'
);

// Prevent deletion
code = code.replace(
  'async deleteUserProfile(id: string, email: string) {',
  'async deleteUserProfile(id: string, email: string) {\n    if (email?.toLowerCase() === "safazoom@gmail.com") {\n      console.warn("Cannot delete master account.");\n      return;\n    }'
);

fs.writeFileSync(path, code);
console.log('Done');
