import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const getPath = (p) => resolve(rootDir, p);

async function run() {
  console.log('Building sidepanel using standard config...');
  // 1. Build the sidepanel using standard vite.config.ts
  await build({
    configFile: getPath('vite.config.ts'),
  });

  const targets = [
    { name: 'content-drive', entry: 'src/content/drive/index.ts', output: 'content-drive.js' },
    {
      name: 'content-drive-iframe',
      entry: 'src/content/drive/iframe.ts',
      output: 'content-drive-iframe.js',
    },
    { name: 'content-docs', entry: 'src/content/docs/index.ts', output: 'content-docs.js' },
    { name: 'content-sheets', entry: 'src/content/sheets/index.ts', output: 'content-sheets.js' },
    { name: 'background', entry: 'src/background/background.ts', output: 'background.js' },
  ];

  for (const target of targets) {
    console.log(`Building self-contained ${target.name}...`);
    await build({
      configFile: false, // Skip vite.config.ts to avoid configuration merging conflicts
      build: {
        lib: {
          entry: getPath(target.entry),
          name: target.name.replace(/-/g, ''),
          formats: ['iife'],
          fileName: () => target.output,
        },
        outDir: getPath('dist'),
        emptyOutDir: false, // Retain previously built files
        sourcemap: false,
        minify: true, // Enable minification
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    });
  }

  // 3. Post-process all output files in dist to force pure ASCII escaping
  const outputFiles = [
    'sidepanel.js',
    'content-drive.js',
    'content-drive-iframe.js',
    'content-docs.js',
    'content-sheets.js',
    'background.js',
  ];

  for (const file of outputFiles) {
    const filePath = getPath(`dist/${file}`);
    if (fs.existsSync(filePath)) {
      console.log(`Forcing safe ASCII escapes for ${file}...`);
      escapeToAscii(filePath);
    }
  }

  console.log('Copying static assets (manifest, styles, katex)...');
  fs.copyFileSync(getPath('manifest.json'), getPath('dist/manifest.json'));
  if (!fs.existsSync(getPath('dist/assets'))) {
    fs.mkdirSync(getPath('dist/assets'), { recursive: true });
  }
  const icons = ['icon_16.png', 'icon_48.png', 'icon_128.png'];
  for (const icon of icons) {
    if (fs.existsSync(getPath(`assets/${icon}`))) {
      fs.copyFileSync(getPath(`assets/${icon}`), getPath(`dist/assets/${icon}`));
    }
  }
  fs.copyFileSync(getPath('node_modules/katex/dist/katex.min.css'), getPath('dist/katex.min.css'));
  fs.cpSync(getPath('node_modules/katex/dist/fonts'), getPath('dist/fonts'), { recursive: true });

  console.log('All standalone IIFE bundles compiled successfully!');
}

function escapeToAscii(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let escapedContent = '';
  for (let i = 0; i < content.length; i++) {
    const charCode = content.charCodeAt(i);
    if (charCode > 127) {
      const hex = charCode.toString(16).padStart(4, '0');
      escapedContent += '\\u' + hex;
    } else {
      escapedContent += content[i];
    }
  }
  fs.writeFileSync(filePath, escapedContent, 'utf8');
}

run().catch((err) => {
  console.error('Build process failed:', err);
  process.exit(1);
});
