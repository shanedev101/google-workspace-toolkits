import fs from 'fs';
import { execSync } from 'child_process';

try {
  // Read package.json
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const zipName = `${pkg.name}-v${pkg.version}.zip`;

  console.log(`Building production extension...`);
  execSync('npm run build', { stdio: 'inherit' });

  console.log(`Packaging extension into ${zipName}...`);

  // Delete old zip if it exists to prevent appending to a stale archive
  if (fs.existsSync(zipName)) {
    fs.unlinkSync(zipName);
  }

  execSync(`npx bestzip ${zipName} dist/*`, { stdio: 'inherit' });
  console.log(`Done: ${zipName}`);
} catch (error) {
  console.error('Packaging failed:', error);
  process.exit(1);
}
