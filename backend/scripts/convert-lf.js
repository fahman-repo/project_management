const fs = require('fs');
const path = require('path');

function convertDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        convertDir(fullPath);
      }
    } else if (/\.(js|jsx|json|sql|css|html|md)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('\r\n')) {
        fs.writeFileSync(fullPath, content.replace(/\r\n/g, '\n'), 'utf8');
        console.log(`Converted to LF: ${fullPath}`);
      }
    }
  }
}

convertDir(path.resolve(__dirname, '../src'));
convertDir(path.resolve(__dirname, '../../frontend/src'));

