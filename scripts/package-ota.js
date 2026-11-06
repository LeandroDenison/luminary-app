import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const version = process.argv[2] || '1.0.6';
const distDir = path.join(rootDir, 'dist');
const deployDir = path.join(rootDir, 'deploy_pages');

if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist! Run npm run build first.');
  process.exit(1);
}

if (!fs.existsSync(deployDir)) {
  fs.mkdirSync(deployDir, { recursive: true });
}

const zip = new JSZip();

function addFilesRecursively(currentDir, baseDir) {
  const entries = fs.readdirSync(currentDir);
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry);
    const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addFilesRecursively(fullPath, baseDir);
    } else {
      zip.file(relPath, fs.readFileSync(fullPath));
    }
  }
}

console.log(`Packaging dist for version ${version}...`);
addFilesRecursively(distDir, distDir);

const zipName = `dist-${version}.zip`;
const zipPath = path.join(deployDir, zipName);

const content = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 }
});

fs.writeFileSync(zipPath, content);
console.log(`Created ${zipName} (${(content.length / 1024 / 1024).toFixed(2)} MB)`);

const hash = crypto.createHash('sha256').update(content).digest('hex').toLowerCase();
console.log(`SHA-256 Checksum: ${hash}`);

const manifest = {
  version: version,
  url: `https://leandrodenison.github.io/luminary-app/${zipName}`,
  checksum: hash
};

const manifestPath = path.join(deployDir, 'version.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Updated version.json ->`, manifest);
