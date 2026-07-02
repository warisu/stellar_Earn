const fs = require('fs');
const path = require('path');

function validateEnvParity() {
  const rootDir = path.resolve(__dirname, '..');
  const envExamplePath = path.join(rootDir, '.env.example');

  if (!fs.existsSync(envExamplePath)) {
    console.error('❌ Error: .env.example file was not found at the root level.');
    process.exit(1);
  }

  // 1. Parse keys defined in .env.example
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  const definedKeys = new Set(
    envExampleContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => line.split('=')[0].trim())
  );

  // 2. Scan code files recursively for process.env usage
  const targetDirs = ['app', 'components', 'context', 'lib'];
  const usedKeys = new Set();
  const envRegex = /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g;

  function scanDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.next') {
          scanDirectory(fullPath);
        }
      } else if (/\.(js|ts|tsx|jsx)$/.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        let match;
        while ((match = envRegex.exec(content)) !== null) {
          usedKeys.add(match[1]);
        }
      }
    });
  }

  targetDirs.forEach(dir => {
    const absolutePath = path.join(rootDir, dir);
    if (fs.existsSync(absolutePath)) {
      scanDirectory(absolutePath);
    }
  });

  // 3. Find missing keys
  const missingInExample = [...usedKeys].filter(key => !definedKeys.has(key));

  if (missingInExample.length > 0) {
    console.error('\n❌ CI Parity Validation Failed!');
    console.error('The following environment variables are used in the codebase but missing from .env.example:\n');
    missingInExample.forEach(key => console.error(`   👉 ${key}`));
    console.error('\nAction Required: Please append these keys to .env.example to restore pipeline alignment.\n');
    process.exit(1);
  }

  console.log('✅ CI Success: .env.example parity match completely synchronized.');
  process.exit(0);
}

validateEnvParity();