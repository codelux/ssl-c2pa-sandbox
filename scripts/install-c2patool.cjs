#!/usr/bin/env node

/**
 * Auto-install c2patool binary if not found
 * Downloads the appropriate version for the current platform
 */

const {
  existsSync,
  mkdirSync,
  chmodSync,
  createWriteStream,
  accessSync,
  constants,
  readdirSync,
  renameSync,
  unlinkSync,
  readFileSync,
  writeFileSync
} = require('fs');
const { join, dirname } = require('path');
const { get } = require('https');
const { execSync } = require('child_process');

const GITHUB_RELEASE_URL = 'https://api.github.com/repos/contentauth/c2patool/releases/latest';
const BIN_DIR = join(process.cwd(), 'bin');
const BINARY_NAME = process.platform === 'win32' ? 'c2patool.exe' : 'c2patool';
const LOCAL_C2PATOOL_PATH = join(BIN_DIR, BINARY_NAME);

function hasExecutePermission(binaryPath) {
  if (!binaryPath || !existsSync(binaryPath)) {
    return false;
  }

  try {
    accessSync(binaryPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function ensureExecutable(binaryPath) {
  if (!binaryPath || !existsSync(binaryPath)) {
    return false;
  }

  if (hasExecutePermission(binaryPath)) {
    return true;
  }

  try {
    chmodSync(binaryPath, 0o755);
    if (hasExecutePermission(binaryPath)) {
      console.log(`🔧 Updated permissions on ${binaryPath}`);
      return true;
    }
  } catch (err) {
    console.warn(`⚠️  Unable to mark ${binaryPath} as executable: ${err.message}`);
  }

  return hasExecutePermission(binaryPath);
}

function findBinaryInDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findBinaryInDir(entryPath);
      if (found) {
        return found;
      }
    } else if (/^c2patool(\.exe)?$/i.test(entry.name)) {
      return entryPath;
    }
  }
  return null;
}

function ensureEnvValue(filePath, key, value) {
  const line = `${key}=${value}`;
  try {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${line}\n`);
      console.log(`   Created ${filePath} with ${line}`);
      return;
    }

    const content = readFileSync(filePath, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const match = content.match(regex);
    if (match) {
      const currentValue = match[0].split('=')[1].trim();
      if (currentValue && currentValue !== value) {
        if (hasExecutePermission(currentValue)) {
          console.log(`   ${filePath} already sets ${key}=${currentValue}`);
          return;
        }
        console.log(`   ${filePath} has ${key} pointing to non-executable path (${currentValue}), updating...`);
      }

      if (match[0] !== line) {
        const updated = content.replace(regex, line);
        writeFileSync(filePath, updated);
        console.log(`   Updated ${filePath} with ${line}`);
      }
      return;
    }

    const suffix = content.endsWith('\n') ? '' : '\n';
    writeFileSync(filePath, `${content}${suffix}${line}\n`);
    console.log(`   Added ${line} to ${filePath}`);
  } catch (err) {
    console.warn(`⚠️  Unable to update ${filePath}: ${err.message}`);
  }
}

function ensureC2patoolEnv(binaryPath) {
  if (!binaryPath) {
    return;
  }

  const envFiles = ['.env.production', '.env.local'];
  for (const file of envFiles) {
    ensureEnvValue(join(process.cwd(), file), 'C2PATOOL_PATH', binaryPath);
  }

  process.env.C2PATOOL_PATH = binaryPath;
  console.log(`✅ C2PATOOL_PATH set to ${binaryPath}`);
}

function resolveSystemC2patool() {
  try {
    const whichCmd = process.platform === 'win32' ? 'where c2patool' : 'which c2patool';
    const output = execSync(whichCmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    if (output.length > 0) {
      return output[0];
    }
  } catch {}
  return null;
}

// Check if c2patool already exists
function findExistingC2patool() {
  if (existsSync(LOCAL_C2PATOOL_PATH)) {
    if (ensureExecutable(LOCAL_C2PATOOL_PATH)) {
      console.log(`✓ c2patool found at ${LOCAL_C2PATOOL_PATH}`);
    }
    return LOCAL_C2PATOOL_PATH;
  }

  const systemBinary = resolveSystemC2patool();
  if (systemBinary) {
    console.log(`✓ c2patool found in system PATH: ${systemBinary}`);
    ensureExecutable(systemBinary);
    return systemBinary;
  }

  return null;
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

  const existing = findExistingC2patool();
  if (existing) {
    ensureC2patoolEnv(existing);
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

    let extractedBinary = findBinaryInDir(BIN_DIR);
    if (!extractedBinary) {
      throw new Error('Binary extracted but not found');
    }

    if (extractedBinary !== LOCAL_C2PATOOL_PATH) {
      mkdirSync(BIN_DIR, { recursive: true });
      renameSync(extractedBinary, LOCAL_C2PATOOL_PATH);
      extractedBinary = LOCAL_C2PATOOL_PATH;
    }

    try { unlinkSync(archivePath); } catch {}

    if (!ensureExecutable(extractedBinary)) {
      console.warn('⚠️  Installed c2patool but could not verify it is executable');
    }

    console.log('✅ c2patool installed successfully!');
    console.log(`   Location: ${extractedBinary}`);
    ensureC2patoolEnv(extractedBinary);

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
