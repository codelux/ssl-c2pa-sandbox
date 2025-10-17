#!/usr/bin/env node

/**
 * Auto-install c2patool binary if not found
 * Downloads the appropriate version for the current platform
 */

const { existsSync, mkdirSync, chmodSync, createWriteStream } = require('fs');
const { join } = require('path');
const { get } = require('https');
const { execSync } = require('child_process');

const GITHUB_RELEASE_URL = 'https://api.github.com/repos/contentauth/c2patool/releases/latest';
const BIN_DIR = join(process.cwd(), 'bin');
const C2PATOOL_PATH = join(BIN_DIR, 'c2patool');

// Check if c2patool already exists
function isC2patoolInstalled() {
  // Check in local bin directory
  if (existsSync(C2PATOOL_PATH)) {
    console.log('✓ c2patool found in ./bin/c2patool');
    return true;
  }

  // Check if available in PATH
  try {
    execSync('c2patool --version', { stdio: 'ignore' });
    console.log('✓ c2patool found in system PATH');
    return true;
  } catch {
    return false;
  }
}

// Detect platform and return pattern to match asset names
function getPlatformInfo() {
  const platform = process.platform;
  const arch = process.arch;

  let assetPattern = null;
  let isZip = false;

  if (platform === 'darwin') {
    // macOS - universal binary
    assetPattern = 'universal-apple-darwin';
    isZip = true;
  } else if (platform === 'linux') {
    // Linux
    assetPattern = 'x86_64-unknown-linux-gnu';
    isZip = false;
  } else if (platform === 'win32') {
    // Windows
    assetPattern = 'x86_64-pc-windows-msvc';
    isZip = true;
  }

  return { platform, arch, assetPattern, isZip };
}

// Fetch latest release info
function getLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'c2pa-developer-tool'
      }
    };

    get(GITHUB_RELEASE_URL, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Download file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);

    get(url, { headers: { 'User-Agent': 'c2pa-developer-tool' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

// Extract archive
function extractArchive(archivePath, isZip) {
  try {
    if (isZip) {
      // Windows/macOS zip
      execSync(`unzip -o "${archivePath}" -d "${BIN_DIR}"`, { stdio: 'inherit' });
    } else {
      // Linux tar.gz
      execSync(`tar -xzf "${archivePath}" -C "${BIN_DIR}"`, { stdio: 'inherit' });
    }
    return true;
  } catch (e) {
    console.error('Failed to extract archive:', e.message);
    return false;
  }
}

// Main install function
async function installC2patool() {
  console.log('🔍 Checking for c2patool...');

  if (isC2patoolInstalled()) {
    return;
  }

  console.log('📦 c2patool not found, attempting to install...');

  const { platform, arch, assetPattern, isZip } = getPlatformInfo();

  if (!assetPattern) {
    console.warn(`⚠️  Auto-install not supported for ${platform}-${arch}`);
    console.log('Please install c2patool manually: https://github.com/contentauth/c2patool');
    return;
  }

  try {
    console.log(`🌐 Fetching latest release info...`);
    const release = await getLatestRelease();

    // Find asset matching the pattern (assets are named like: c2patool-v0.9.12-universal-apple-darwin.zip)
    const asset = release.assets.find(a => a.name.includes(assetPattern));

    if (!asset) {
      throw new Error(`No asset found matching pattern: ${assetPattern}`);
    }

    console.log(`📥 Downloading c2patool ${release.tag_name} for ${platform}-${arch}...`);
    console.log(`   Asset: ${asset.name}`);

    // Create bin directory
    if (!existsSync(BIN_DIR)) {
      mkdirSync(BIN_DIR, { recursive: true });
    }

    const archivePath = join(BIN_DIR, asset.name);
    await downloadFile(asset.browser_download_url, archivePath);

    console.log('📂 Extracting...');
    if (!extractArchive(archivePath, isZip)) {
      throw new Error('Extraction failed');
    }

    // The binary might be in a subdirectory after extraction
    const extractedBinary = join(BIN_DIR, 'c2patool');
    if (existsSync(extractedBinary)) {
      // Make executable on Unix systems
      if (platform !== 'win32') {
        chmodSync(extractedBinary, 0o755);
      }

      console.log('✅ c2patool installed successfully!');
      console.log(`   Location: ${extractedBinary}`);
      console.log(`   Set C2PATOOL_PATH=${extractedBinary} in your .env if needed`);
    } else {
      console.log('⚠️  Binary extracted but location unclear. Check ./bin/ directory');
    }

  } catch (error) {
    console.error('❌ Failed to install c2patool:', error.message);
    console.log('\nPlease install manually:');
    console.log('1. Visit: https://github.com/contentauth/c2patool/releases/latest');
    console.log('2. Download the appropriate binary for your platform');
    console.log('3. Place it in ./bin/c2patool or add to your PATH');
  }
}

// Run if called directly
if (require.main === module) {
  installC2patool().catch(console.error);
}

module.exports = { installC2patool };
