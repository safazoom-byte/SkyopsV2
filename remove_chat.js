const fs = require('fs');
let code = fs.readFileSync('index.tsx', 'utf8');

code = code.replace(/import \{ ProgramChat \} from "\.\/components\/ProgramChat";\n/g, '');
code = code.replace(/<ProgramChat[\s\S]*?\/>/g, '');
// Increase bottom padding
code = code.replace('pb-32', 'pb-48');

fs.writeFileSync('index.tsx', code);
console.log("Chat removed and padding increased");
