import express from 'express';
import cors from 'cors';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import yaml from 'yaml';
import fs from 'fs-extra';
import * as nodeFs from 'fs';
import path from 'path';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import ArmchairMCPServer from './mcp-server.mjs';
import {
  githubApiFetch,
  validatePat,
  listPullRequests,
  getPullRequest,
  getPullRequestDiff,
  detectGitHubRemotes,
  parsePrUrl,
  formatPrComment,
  postOrUpdatePrComment,
  checkPushAccess,
  getPrMergeBase
} from './github-service.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Recreate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argv = yargs(hideBin(process.argv))
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Path to agent output directory',
    demandOption: true
  })
  .option('root-dir', {
    type: 'string',
    description: 'Root directory - all repository paths must be under this directory',
    demandOption: true
  })
  .option('root-map', {
    type: 'string',
    description: 'Root mapping - paths shown as root-dir will be saved as root-map in config (default: same as root-dir)',
    demandOption: false
  })
  .option('enable-cache', {
    type: 'boolean',
    description: 'Enable repository cache (default: false)',
    default: false
  })
  .option('mcp', {
    type: 'boolean',
    description: 'Run as MCP server on stdio (default: false)',
    default: false
  })
  .help()
  .parseSync();

// Set up root directory and mapping
const ROOT_DIR = path.resolve(argv.rootDir);
const ROOT_MAP = argv.rootMap ? path.resolve(argv.rootMap) : ROOT_DIR;

console.log(`Root directory constraint enabled: ${ROOT_DIR}`);
if (ROOT_MAP && ROOT_MAP !== ROOT_DIR) {
  console.log(`Root path mapping enabled: ${ROOT_DIR} -> ${ROOT_MAP}`);
}

// Config file is now in .armchair directory within output
const SOURCE_CONFIG_PATH = path.join(argv.output, '.armchair', 'source.yaml');

// Helper functions for path mapping
function mapPathForDisplay(repoPath) {
  // Convert stored path (with ROOT_MAP) to display path (with ROOT_DIR)
  if (ROOT_DIR === ROOT_MAP) {
    return repoPath;
  }

  const resolvedPath = path.resolve(repoPath);
  if (resolvedPath.startsWith(ROOT_MAP)) {
    return resolvedPath.replace(ROOT_MAP, ROOT_DIR);
  }
  return repoPath;
}

function mapPathForStorage(displayPath) {
  // Convert display path (with ROOT_DIR) to storage path (with ROOT_MAP)
  if (ROOT_DIR === ROOT_MAP) {
    return displayPath;
  }

  const resolvedPath = path.resolve(displayPath);
  if (resolvedPath.startsWith(ROOT_DIR)) {
    return resolvedPath.replace(ROOT_DIR, ROOT_MAP);
  }
  return displayPath;
}

function validatePathUnderRoot(repoPath) {
  // Validate that the display path is under ROOT_DIR
  const resolvedPath = path.resolve(repoPath);
  if (!resolvedPath.startsWith(ROOT_DIR)) {
    return {
      valid: false,
      error: `Repository path must be under root directory: ${ROOT_DIR}`
    };
  }

  return { valid: true };
}

let config = {};
try {
  // Create .armchair directory if it doesn't exist
  const armchairDir = path.join(argv.output, '.armchair');
  if (!fs.existsSync(armchairDir)) {
    fs.mkdirSync(armchairDir, { recursive: true });
    console.log(`Created .armchair directory: ${armchairDir}`);
  }

  // Load source.yaml if it exists
  if (fs.existsSync(SOURCE_CONFIG_PATH)) {
    const configData = fs.readFileSync(SOURCE_CONFIG_PATH, 'utf8');
    config = yaml.parse(configData);
    console.log(`Loaded config from: ${SOURCE_CONFIG_PATH}`);
  } else {
    console.log(`No source.yaml found at ${SOURCE_CONFIG_PATH}, using empty config`);
    // Initialize with empty structure
    config = {
      source: {
        repositories: []
      }
    };
  }
} catch (error) {
  console.error(`Error loading config file: ${error.message}`);
  // Don't exit, continue with empty config
  config = {
    source: {
      repositories: []
    }
  };
}

// Load .armchair.json config if present and set environment variables
const ARMCHAIR_DIR = path.join(argv.output, '.armchair');
const ARMCHAIR_CONFIG_PATH = path.join(ARMCHAIR_DIR, '.armchair.json');
let armchairConfig = {};

// Create .armchair directory if it doesn't exist
function ensureArmchairDir() {
  try {
    if (!fs.existsSync(ARMCHAIR_DIR)) {
      fs.mkdirSync(ARMCHAIR_DIR, { recursive: true });
      console.log(`Created .armchair directory: ${ARMCHAIR_DIR}`);
    }
  } catch (error) {
    console.error(`Error creating .armchair directory: ${error.message}`);
  }
}

function loadArmchairConfig() {
  try {
    if (fs.existsSync(ARMCHAIR_CONFIG_PATH)) {
      const configData = fs.readFileSync(ARMCHAIR_CONFIG_PATH, 'utf8');
      armchairConfig = JSON.parse(configData);
      console.log(`Loaded .armchair.json config from: ${ARMCHAIR_CONFIG_PATH}`);

      // Set environment variables from config
      if (armchairConfig.ARMCHAIR_MODEL_API_KEY) {
        process.env.ARMCHAIR_MODEL_API_KEY = armchairConfig.ARMCHAIR_MODEL_API_KEY;
      }
      if (armchairConfig.ARMCHAIR_MODEL_API_BASE_URL) {
        process.env.ARMCHAIR_MODEL_API_BASE_URL = armchairConfig.ARMCHAIR_MODEL_API_BASE_URL;
      }
      if (armchairConfig.ARMCHAIR_MODEL_NAME) {
        process.env.ARMCHAIR_MODEL_NAME = armchairConfig.ARMCHAIR_MODEL_NAME;
      }
      if (armchairConfig.CODE_REVIEWER_PATH) {
        process.env.CODE_REVIEWER_PATH = armchairConfig.CODE_REVIEWER_PATH;
      }
      if (armchairConfig.CODE_REVIEWER_APP_CONFIG) {
        process.env.CODE_REVIEWER_APP_CONFIG = armchairConfig.CODE_REVIEWER_APP_CONFIG;
      }
      if (armchairConfig.SPLITTER_PATH) {
        process.env.SPLITTER_PATH = armchairConfig.SPLITTER_PATH;
      }
      if (armchairConfig.PYTHON_PATH) {
        process.env.PYTHON_PATH = armchairConfig.PYTHON_PATH;
      }
      if (armchairConfig.CACHE_REFRESH_INTERVAL_MS) {
        process.env.CACHE_REFRESH_INTERVAL_MS = armchairConfig.CACHE_REFRESH_INTERVAL_MS.toString();
      }
      // GitHub integration config is stored in armchairConfig but not set as env vars
      // Accessed directly via armchairConfig.GITHUB_PAT and armchairConfig.GITHUB_REPOS

      console.log('Environment variables updated from .armchair.json');
    } else {
      console.log('.armchair.json not found, using default environment variables');
    }
  } catch (error) {
    console.error(`Error loading .armchair.json: ${error.message}`);
    // Don't exit, continue with default env variables
  }
}

function saveArmchairConfig(newConfig) {
  try {
    // Ensure directory exists before saving
    ensureArmchairDir();
    fs.writeFileSync(ARMCHAIR_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
    console.log(`Saved .armchair.json config to: ${ARMCHAIR_CONFIG_PATH}`);

    // Update in-memory config
    armchairConfig = newConfig;

    // Update environment variables
    if (newConfig.ARMCHAIR_MODEL_API_KEY !== undefined) {
      process.env.ARMCHAIR_MODEL_API_KEY = newConfig.ARMCHAIR_MODEL_API_KEY;
    }
    if (newConfig.ARMCHAIR_MODEL_API_BASE_URL !== undefined) {
      process.env.ARMCHAIR_MODEL_API_BASE_URL = newConfig.ARMCHAIR_MODEL_API_BASE_URL;
    }
    if (newConfig.ARMCHAIR_MODEL_NAME !== undefined) {
      process.env.ARMCHAIR_MODEL_NAME = newConfig.ARMCHAIR_MODEL_NAME;
    }
    if (newConfig.CODE_REVIEWER_PATH !== undefined) {
      process.env.CODE_REVIEWER_PATH = newConfig.CODE_REVIEWER_PATH;
    }
    if (newConfig.CODE_REVIEWER_APP_CONFIG !== undefined) {
      process.env.CODE_REVIEWER_APP_CONFIG = newConfig.CODE_REVIEWER_APP_CONFIG;
    }
    if (newConfig.SPLITTER_PATH !== undefined) {
      process.env.SPLITTER_PATH = newConfig.SPLITTER_PATH;
    }
    if (newConfig.PYTHON_PATH !== undefined) {
      process.env.PYTHON_PATH = newConfig.PYTHON_PATH;
    }
    if (newConfig.CACHE_REFRESH_INTERVAL_MS !== undefined) {
      process.env.CACHE_REFRESH_INTERVAL_MS = newConfig.CACHE_REFRESH_INTERVAL_MS.toString();
    }

    console.log('Environment variables updated');
    return true;
  } catch (error) {
    console.error(`Error saving .armchair.json: ${error.message}`);
    return false;
  }
}

// Ensure .armchair directory exists and load config on startup
ensureArmchairDir();
loadArmchairConfig();

const app = express();
const PORT = process.env.PORT || 8787;

// Cache configuration
const CACHE_REFRESH_INTERVAL_MS = parseInt(process.env.CACHE_REFRESH_INTERVAL_MS) || 30 * 60 * 1000; // 30 minutes default
const CACHE_FILE_PATH = path.join(argv.output, '.repo-cache.json');
let repoCache = {
  timestamp: null,
  repositories: {}
};

app.use(cors());
// Increase JSON body size limit to support large patch content (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // Log request
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  if (Object.keys(req.query).length > 0) {
    console.log(`  Query:`, req.query);
  }
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`  Body:`, JSON.stringify(req.body).substring(0, 500));
  }

  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    originalSend.call(this, data);
  };

  next();
});

// Function to build repository cache
let CacheInProgress = false;

// Helper function to write cache progressively
async function writeCacheToFile(cacheData) {
  try {
    cacheData.timestamp = Math.floor(Date.now() / 1000); // UTC seconds
    await fs.writeJson(CACHE_FILE_PATH, cacheData, { spaces: 2 });
    repoCache = cacheData;
  } catch (err) {
    console.error('Error writing cache file:', err.message);
  }
}

async function buildRepositoryCache() {
  console.log('Building repository cache...');
  if (CacheInProgress) {
    console.log('Cache build in progress, skipping...');
    return;
  }
  CacheInProgress = true;
  const startTime = Date.now();
  const repositories = config.source?.repositories || [];
  const cacheData = {
    timestamp: Math.floor(Date.now() / 1000), // UTC seconds
    repositories: {}
  };

  for (const repo of repositories) {
    const repoName = repo.name;
    const repoPath = repo.path;

    console.log(`Caching repository: ${repoName}`);

    try {
      const gitRoot = await execGitCommand(['rev-parse', '--show-toplevel'], repoPath);

      if (!gitRoot) {
        cacheData.repositories[repoName] = {
          name: repoName,
          path: repo.path,
          gitRoot: null,
          language: repo.language,
          disabled: repo.disabled || false,
          commitOnly: repo.commitOnly || false,
          error: 'Not a git repository or path does not exist'
        };
        // Write to file immediately after error
        await writeCacheToFile(cacheData);
        continue;
      }

      // Get all branches
      const branchesOutput = await execGitCommand(['branch'], repoPath);
      const branches = [];

      if (branchesOutput) {
        const branchLines = branchesOutput.split('\n').filter(line => line.trim());
        const currentBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

        for (const line of branchLines) {
          const branchName = line.replace('*', '').trim();
          const isCurrent = branchName === currentBranch;

          // Get last 50 commits for this branch
          const commitLog = await execGitCommand(
            ['log', branchName, '-50', '--pretty=format:%H|%h|%an|%ae|%ar|%at|%s'],
            repoPath
          );

          const commits = [];
          if (commitLog) {
            commits.push(...commitLog.split('\n').map(line => {
              const [hash, shortHash, author, email, relativeDate, timestamp, message] = line.split('|');
              return {
                hash,
                shortHash,
                author,
                email,
                relativeDate,
                timestamp: parseInt(timestamp),
                message
              };
            }));
          }

          branches.push({
            name: branchName,
            isCurrent,
            commits
          });

          // For current branch, write git log information immediately
          if (isCurrent) {
            cacheData.repositories[repoName] = {
              name: repoName,
              path: repo.path,
              gitRoot: gitRoot !== repoPath ? gitRoot : null,
              language: repo.language,
              disabled: repo.disabled || false,
              commitOnly: repo.commitOnly || false,
              branchCount: branches.length,
              branches: branches.slice(), // Create a copy
              status: null // Status not available yet
            };
            await writeCacheToFile(cacheData);
            console.log(`Wrote git log for current branch ${branchName} of ${repoName}`);
          }
        }

        // After all branches are processed, write the complete branch data
        // Check if commitOnly is true - if so, skip git status
        const commitOnly = repo.commitOnly || false;

        if (commitOnly) {
          // Skip git status for commitOnly repos
          cacheData.repositories[repoName] = {
            name: repoName,
            path: repo.path,
            gitRoot: gitRoot !== repoPath ? gitRoot : null,
            language: repo.language,
            disabled: repo.disabled || false,
            commitOnly: commitOnly,
            branchCount: branches.length,
            branches,
            status: null // No status for commitOnly repos
          };
          await writeCacheToFile(cacheData);
          console.log(`Wrote all branch data for ${repoName} (commitOnly: skipped status)`);
        } else {
          // Set in_progress status before fetching
          cacheData.repositories[repoName] = {
            name: repoName,
            path: repo.path,
            gitRoot: gitRoot !== repoPath ? gitRoot : null,
            language: repo.language,
            disabled: repo.disabled || false,
            commitOnly: commitOnly,
            branchCount: branches.length,
            branches,
            status: 'in_progress' // Status fetch in progress
          };
          await writeCacheToFile(cacheData);
          console.log(`Wrote all branch data for ${repoName}, fetching status...`);
        }
      }

      // Get git status for current branch (only if not commitOnly)
      const commitOnly = repo.commitOnly || false;
      if (!commitOnly) {
        const statusOutput = await execGitCommand(['status', '--porcelain'], repoPath);
        const status = {
          staged: [],
          unstaged: [],
          untracked: []
        };

        if (statusOutput) {
          const allFiles = {
            staged: [],
            unstaged: [],
            untracked: []
          };

          statusOutput.split('\n').forEach(line => {
            if (!line) return;
            const statusCode = line.substring(0, 2);
            const filename = line.substring(2).trimStart();

            if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
              allFiles.staged.push(filename);
            }
            if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
              allFiles.unstaged.push(filename);
            }
            if (statusCode === '??') {
              allFiles.untracked.push(filename);
            }
          });

          // Filter files to only include those within the repo path
          status.staged = filterFilesByRepoPath(allFiles.staged, repoPath, gitRoot);
          status.unstaged = filterFilesByRepoPath(allFiles.unstaged, repoPath, gitRoot);
          status.untracked = filterFilesByRepoPath(allFiles.untracked, repoPath, gitRoot);
        }

        // Update with status information and write to file
        cacheData.repositories[repoName] = {
          name: repoName,
          path: repo.path,
          gitRoot: gitRoot !== repoPath ? gitRoot : null,
          language: repo.language,
          disabled: repo.disabled || false,
          commitOnly: commitOnly,
          branchCount: branches.length,
          branches,
          status
        };
        await writeCacheToFile(cacheData);
        console.log(`Wrote git status for ${repoName}`);
      }
    } catch (err) {
      console.error(`Error caching repository ${repoName}:`, err.message);
      cacheData.repositories[repoName] = {
        name: repoName,
        path: repo.path,
        language: repo.language,
        disabled: repo.disabled || false,
        commitOnly: repo.commitOnly || false,
        error: `Failed to cache: ${err.message}`
      };
      // Write to file immediately after error
      await writeCacheToFile(cacheData);
    }
  }

  CacheInProgress = false;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Repository cache built successfully in ${elapsed}s`);
}

// Load cache from file if it exists
async function loadCacheFromFile() {
  try {
    if (await fs.pathExists(CACHE_FILE_PATH)) {
      repoCache = await fs.readJson(CACHE_FILE_PATH);
      const age = Math.floor(Date.now() / 1000) - repoCache.timestamp;
      console.log(`Loaded repository cache from file (${age}s old)`);
      return true;
    }
  } catch (err) {
    console.error('Error loading cache file:', err.message);
  }
  return false;
}

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello World from Express backend!' });
});

app.get('/api/health', (req, res) => {
  const hasApiKey = !!process.env.ARMCHAIR_MODEL_API_KEY && !!process.env.ARMCHAIR_MODEL_API_BASE_URL && !!process.env.ARMCHAIR_MODEL_NAME;
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    llmEnabled: hasApiKey,
    cacheEnabled: argv.enableCache,
    modelName: process.env.ARMCHAIR_MODEL_NAME || null,
    modelApiBaseUrl: process.env.ARMCHAIR_MODEL_API_BASE_URL || null
  });
});

// Get current configuration
app.get('/api/config', (req, res) => {
  try {
    // Check if config file exists
    const configFileExists = fs.existsSync(ARMCHAIR_CONFIG_PATH);
    const sourceConfigExists = fs.existsSync(SOURCE_CONFIG_PATH);

    // Return current config values (from armchairConfig if loaded, otherwise from env)
    // Only expose LLM-related settings
    const currentConfig = {
      ARMCHAIR_MODEL_API_KEY: armchairConfig.ARMCHAIR_MODEL_API_KEY || process.env.ARMCHAIR_MODEL_API_KEY || '',
      ARMCHAIR_MODEL_API_BASE_URL: armchairConfig.ARMCHAIR_MODEL_API_BASE_URL || process.env.ARMCHAIR_MODEL_API_BASE_URL || '',
      ARMCHAIR_MODEL_NAME: armchairConfig.ARMCHAIR_MODEL_NAME || process.env.ARMCHAIR_MODEL_NAME || ''
    };

    // Get source repositories from source.yaml and map paths for display
    const repositories = (config.source?.repositories || []).map(repo => ({
      ...repo,
      path: mapPathForDisplay(repo.path)
    }));

    res.json({
      success: true,
      config: currentConfig,
      repositories: repositories,
      configPath: ARMCHAIR_CONFIG_PATH,
      sourceConfigPath: SOURCE_CONFIG_PATH,
      configFileExists,
      sourceConfigExists,
      rootDir: ROOT_DIR || null,
      GITHUB_PAT_SET: !!armchairConfig.GITHUB_PAT,
      GITHUB_REPOS: armchairConfig.GITHUB_REPOS || []
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update configuration
app.put('/api/config', (req, res) => {
  try {
    const { config: newConfig, repositories: newRepositories, GITHUB_PAT, GITHUB_REPOS } = req.body;

    let configSaved = true;
    let repositoriesSaved = true;

    // Update .armchair.json if config is provided
    if (newConfig || GITHUB_PAT !== undefined || GITHUB_REPOS !== undefined) {
      // Validate that only allowed fields are being set (LLM-related only)
      const allowedFields = [
        'ARMCHAIR_MODEL_API_KEY',
        'ARMCHAIR_MODEL_API_BASE_URL',
        'ARMCHAIR_MODEL_NAME'
      ];

      // Start with existing config to preserve GitHub fields
      const configToSave = { ...armchairConfig };
      if (newConfig) {
        for (const field of allowedFields) {
          if (newConfig[field] !== undefined) {
            configToSave[field] = newConfig[field];
          }
        }
      }

      // Handle GitHub integration fields
      if (GITHUB_PAT !== undefined) {
        configToSave.GITHUB_PAT = GITHUB_PAT;
      }
      if (GITHUB_REPOS !== undefined) {
        configToSave.GITHUB_REPOS = GITHUB_REPOS;
      }

      // Save to file and update env vars
      configSaved = saveArmchairConfig(configToSave);
    }

    // Update source.yaml if repositories are provided
    if (newRepositories !== undefined) {
      try {
        // Validate and map repository paths
        const validationErrors = [];
        const mappedRepositories = newRepositories.map((repo, index) => {
          // Validate path is under ROOT_DIR
          const validation = validatePathUnderRoot(repo.path);
          if (!validation.valid) {
            validationErrors.push(`Repository ${index + 1} (${repo.name || 'unnamed'}): ${validation.error}`);
            return null;
          }

          // Map the path for storage
          return {
            ...repo,
            path: mapPathForStorage(repo.path)
          };
        }).filter(repo => repo !== null);

        // If there are validation errors, return them
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Repository path validation failed',
            details: validationErrors
          });
        }

        // Ensure .armchair directory exists
        ensureArmchairDir();

        // Update the in-memory config
        config.source = {
          repositories: mappedRepositories
        };

        // Write to source.yaml
        const yamlContent = yaml.stringify(config);
        fs.writeFileSync(SOURCE_CONFIG_PATH, yamlContent, 'utf8');
        console.log(`Saved source.yaml to: ${SOURCE_CONFIG_PATH}`);
        repositoriesSaved = true;
      } catch (error) {
        console.error('Error saving source.yaml:', error);
        repositoriesSaved = false;
      }
    }

    if (configSaved && repositoriesSaved) {
      res.json({
        success: true,
        message: 'Configuration updated successfully',
        config: newConfig,
        repositories: newRepositories
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save configuration'
      });
    }
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/commits', async (req, res) => {
  try {
    const outputPath = argv.output;

    if (!await fs.pathExists(outputPath)) {
      return res.status(404).json({ error: 'Output directory not found' });
    }

    const commitDirs = await fs.readdir(outputPath);

    // Process directories in parallel for better performance
    const processCommit = async (commitDir) => {
      try {
        const commitPath = path.join(outputPath, commitDir);
        const stat = await fs.stat(commitPath);

        if (!stat.isDirectory()) return null;

        const files = await fs.readdir(commitPath);
        const metadataFiles = files.filter(file => file.startsWith('metadata_') && file.endsWith('.json'));

        if (metadataFiles.length === 0) return null;

        const metadataPath = path.join(commitPath, metadataFiles[0]);
        const metadata = await fs.readJson(metadataPath);

        // Filter out deleted commits
        if (metadata.state === 'deleted') {
          return null;
        }

        return {
          commitId: commitDir,
          path: commitPath,
          metadata: {
            generatedAt: metadata.generated_at,
            totalPatches: metadata.total_patches,
            goalSummary: metadata.goal_summary,
            repository: metadata.repository,
            state: metadata.state || 'active',
            mental_model: metadata.mental_model || null,
            patches: (metadata.patches?.map(patch => ({
              id: patch.id,
              name: patch.name,
              description: patch.description,
              category: patch.category,
              priority: patch.priority,
              files: patch.files,
              filename: patch.filename,
              annotations: patch.annotations || [],
              state: patch.state || 'active'
            })) || []).sort((a, b) => a.id - b.id)
          }
        };
      } catch (error) {
        console.error(`Error reading metadata for ${commitDir}:`, error.message);
        return null;
      }
    };

    // Process all commits in parallel with concurrency limit
    const batchSize = 10; // Process 10 at a time to avoid overwhelming the system
    const results = [];

    for (let i = 0; i < commitDirs.length; i += batchSize) {
      const batch = commitDirs.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processCommit));
      results.push(...batchResults.filter(r => r !== null));
    }

    res.json({
      commits: results,
      total: results.length
    });
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

app.get('/api/patch/:commitId/:patchFilename', async (req, res) => {
  try {
    const { commitId, patchFilename } = req.params;
    const outputPath = argv.output;
    
    // Handle double .patch extension issue - normalize filename
    let normalizedFilename = patchFilename;
    if (patchFilename.endsWith('.patch.patch')) {
      normalizedFilename = patchFilename.replace('.patch.patch', '.patch');
    }
    
    const patchPath = path.join(outputPath, commitId, normalizedFilename);
    
    // If normalized file doesn't exist, try original filename
    if (!await fs.pathExists(patchPath)) {
      const originalPatchPath = path.join(outputPath, commitId, patchFilename);
      if (await fs.pathExists(originalPatchPath)) {
        const patchContent = await fs.readFile(originalPatchPath, 'utf8');
        return res.json({
          commitId,
          filename: patchFilename,
          content: patchContent
        });
      }
      return res.status(404).json({ error: 'Patch file not found' });
    }

    const patchContent = await fs.readFile(patchPath, 'utf8');
    
    res.json({
      commitId,
      filename: normalizedFilename,
      content: patchContent
    });
  } catch (error) {
    console.error('Error fetching patch content:', error);
    res.status(500).json({ error: 'Failed to fetch patch content' });
  }
});

app.delete('/api/commits/:commitId', async (req, res) => {
  try {
    const { commitId } = req.params;
    const outputPath = argv.output;
    const commitPath = path.join(outputPath, commitId);

    if (!await fs.pathExists(commitPath)) {
      return res.status(404).json({ error: 'Commit not found' });
    }

    // Find the metadata file
    const files = await fs.readdir(commitPath);
    const metadataFiles = files.filter(file => file.startsWith('metadata_') && file.endsWith('.json'));

    if (metadataFiles.length === 0) {
      return res.status(404).json({ error: 'Metadata file not found' });
    }

    const metadataPath = path.join(commitPath, metadataFiles[0]);
    const metadata = await fs.readJson(metadataPath);

    // Update the metadata with deleted state
    metadata.state = 'deleted';
    metadata.deleted_at = new Date().toISOString();

    // Write the updated metadata back to the file
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });

    res.json({
      success: true,
      message: 'Commit marked as deleted',
      commitId
    });
  } catch (error) {
    console.error('Error deleting commit:', error);
    res.status(500).json({ error: 'Failed to delete commit' });
  }
});

// Helper function to execute git commands safely
/**
 * Execute a git command safely using execFile to prevent command injection
 * @param {string[]} args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param {string} cwd - Working directory
 * @returns {Promise<string|null>} - Command output or null on error
 */
async function execGitCommand(args, cwd) {
  // Support legacy string format for backward compatibility during migration
  if (typeof args === 'string') {
    console.warn(`DEPRECATED: execGitCommand called with string: ${args}`);
    console.warn('  This will be removed in a future version. Use array format instead.');
    // Parse the string into args (basic implementation)
    const parts = args.split(' ');
    if (parts[0] === 'git') {
      args = parts.slice(1);
    } else {
      args = parts;
    }
  }

  console.log(`Executing git command: git ${args.join(' ')} in ${cwd}`);
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
    });
    // Don't trim for diff commands - trailing whitespace can be significant in unified diff format
    const isDiffCommand = args.includes('diff') || args.includes('show') || args.includes('log');
    return isDiffCommand ? stdout : stdout.trim();
  } catch (error) {
    console.error(`Git command failed: git ${args.join(' ')}`, error.message);
    return null;
  }
}

// Helper function to filter file paths to only include files within repo subdirectory
function filterFilesByRepoPath(files, repoPath, gitRoot) {
  // If repoPath is the git root, no filtering needed
  if (repoPath === gitRoot) {
    return files;
  }

  // Calculate relative path from git root to repo path
  const relativePath = path.relative(gitRoot, repoPath);
  if (!relativePath || relativePath === '.') {
    return files;
  }

  // Filter files that start with the relative path and strip the prefix
  const prefix = relativePath + path.sep;
  return files
    .filter(file => {
      return file.startsWith(prefix) || file === relativePath;
    })
    .map(file => {
      // Strip the prefix from the file path
      if (file.startsWith(prefix)) {
        return file.substring(prefix.length);
      }
      return file;
    });
}

/**
 * Generate patch content for a repository
 *
 * This function supports multiple patch generation modes (mutually exclusive):
 *
 * 1. **Pre-existing patch mode**: Pass patch content directly
 *    - Required: repoPath, patch
 *    - Optional: none
 *
 * 2. **Commit diff mode**: Generate diff for a specific commit
 *    - Required: repoPath, commitId
 *    - Optional: none
 *    - Generates: diff between commitId^ and commitId
 *
 * 3. **Branch comparison mode**: Compare two branches
 *    - Required: repoPath, branch, baseBranch (both branch and baseBranch must be provided)
 *    - Optional: none
 *    - Generates: diff between baseBranch..branch
 *
 * 4. **Working directory mode**: Generate diff of uncommitted changes
 *    - Required: repoPath
 *    - Optional: branch, untracked, untrackedFiles
 *    - Generates: diff between HEAD and working directory
 *    - The branch parameter (if provided) is informational only and doesn't affect the diff
 *    - If untracked=true and untrackedFiles provided, includes diffs for untracked files
 *
 * @param {Object} options - Patch generation options
 * @param {string} options.repoPath - REQUIRED: Path to the repository (must exist and be a git repo)
 * @param {string} [options.patch] - OPTIONAL: Pre-existing patch content (mode 1)
 * @param {string} [options.commitId] - OPTIONAL: Commit hash to generate diff for (mode 2)
 * @param {string} [options.branch] - OPTIONAL: Branch name - used with baseBranch for mode 3, or informational for mode 4
 * @param {string} [options.baseBranch] - OPTIONAL: Base branch for comparison (mode 3 only, requires branch)
 * @param {boolean} [options.untracked=false] - OPTIONAL: Include untracked files (mode 4 only)
 * @param {string[]} [options.untrackedFiles] - OPTIONAL: List of untracked files to include (mode 4 only, requires untracked=true)
 *
 * @returns {Promise<string>} - Generated patch content in unified diff format
 * @throws {Error} - If repoPath is missing, patch generation fails, or no changes found
 *
 * @example
 * // Mode 1: Use pre-existing patch
 * const patch1 = await generatePatchContent({ repoPath: '/path/to/repo', patch: 'diff --git...' });
 *
 * @example
 * // Mode 2: Generate diff for a commit
 * const patch2 = await generatePatchContent({ repoPath: '/path/to/repo', commitId: 'abc123' });
 *
 * @example
 * // Mode 3: Compare branches
 * const patch3 = await generatePatchContent({ repoPath: '/path/to/repo', branch: 'feature', baseBranch: 'main' });
 *
 * @example
 * // Mode 4: Working directory with untracked files
 * const patch4 = await generatePatchContent({
 *   repoPath: '/path/to/repo',
 *   untracked: true,
 *   untrackedFiles: ['newfile.js', 'newdir/']
 * });
 */
async function generatePatchContent(options) {
  // Validate required parameters
  if (!options || typeof options !== 'object') {
    const error = new Error('generatePatchContent: options parameter is required');
    console.error('GeneratePatch ERROR:', error.message);
    throw error;
  }

  const {
    repoPath,
    patch,
    commitId,
    branch,
    baseBranch,
    untracked,
    untrackedFiles
  } = options;

  // Validate repoPath (always required)
  if (!repoPath || typeof repoPath !== 'string') {
    const error = new Error('generatePatchContent: repoPath is required and must be a string');
    console.error('GeneratePatch ERROR:', error.message, '- options:', options);
    throw error;
  }

  // Validate mode-specific parameter combinations
  // Note: branch alone is valid (MODE 4: working directory on a specific branch)
  // Only when baseBranch is provided do we require branch (for MODE 3: branch comparison)
  if (baseBranch && !branch) {
    const error = new Error('generatePatchContent: branch is required when baseBranch is specified');
    console.error('GeneratePatch ERROR:', error.message, '- options:', { baseBranch, branch });
    throw error;
  }
  if (untrackedFiles && !untracked) {
    console.warn('generatePatchContent: untrackedFiles provided but untracked is false; files will be ignored');
  }

  // Get git root to determine if we need to filter diffs
  const gitRoot = await execGitCommand(['rev-parse', '--show-toplevel'], repoPath);
  const relativePath = gitRoot && gitRoot !== repoPath ? path.relative(gitRoot, repoPath) : null;

  // Helper function to add path filter to git diff command
  const getPathFilter = () => {
    if (!relativePath) return [];
    return ['--', '.'];
  };

  console.log(`GeneratePatch: gitRoot=${gitRoot}, repoPath=${repoPath}, relativePath=${relativePath}`);
  if (relativePath) {
    console.log(`Filtering to only include files in subdirectory: ${relativePath}`);
  }

  let patchContent = null;

  // Select patch generation mode based on provided parameters
  // Priority order: patch > commitId > (branch+baseBranch) > working directory

  if (patch) {
    // MODE 1: Pre-existing patch content
    // Simply use the provided patch as-is
    console.log('GeneratePatch: Using pre-existing patch content');
    patchContent = patch;

  } else if (commitId) {
    // MODE 2: Commit diff
    // Generate diff for a specific commit
    console.log(`GeneratePatch: Generating diff for commit ${commitId}`);

    // Check if commit has a parent (to handle initial commits)
    const hasParent = await execGitCommand(['rev-parse', '--verify', `${commitId}^`], repoPath);

    let diff;
    if (hasParent) {
      // Normal commit with parent: diff between parent and commit
      diff = await execGitCommand(
        ['diff', `${commitId}^..${commitId}`, ...getPathFilter()],
        repoPath
      );
    } else {
      // Initial commit (no parent): show all files as additions
      console.log(`GeneratePatch: Commit ${commitId} is an initial commit (no parent)`);
      diff = await execGitCommand(
        ['show', '--format=', commitId, ...getPathFilter()],
        repoPath
      );
    }

    if (diff === null || !diff.trim()) {
      const error = new Error('Failed to get commit diff or diff is empty');
      console.error(`GeneratePatch ERROR: ${error.message} - commitId: ${commitId}, repoPath: ${repoPath}, hasParent: ${!!hasParent}`);
      throw error;
    }
    patchContent = diff;

  } else if (branch && baseBranch) {
    // MODE 3: Branch comparison
    // Generate diff between two branches (baseBranch..branch)
    console.log(`GeneratePatch: Comparing branches ${baseBranch}..${branch}`);
    const diff = await execGitCommand(
      ['diff', `${baseBranch}..${branch}`, ...getPathFilter()],
      repoPath
    );

    if (diff === null || !diff.trim()) {
      const error = new Error('Failed to get branch diff or diff is empty');
      console.error(`GeneratePatch ERROR: ${error.message} - branch: ${branch}, baseBranch: ${baseBranch}, repoPath: ${repoPath}`);
      throw error;
    }
    patchContent = diff;

  } else {
    // MODE 4: Working directory (uncommitted changes)
    // Generate diff of staged and unstaged changes (HEAD to working directory)
    console.log('GeneratePatch: Generating diff for working directory changes');

    // Get working directory diff, limited to repo subdirectory if needed
    const diff = await execGitCommand(
      ['diff', 'HEAD', ...getPathFilter()],
      repoPath
    );

    if (diff === null || !diff.trim()) {
      const errorMsg = relativePath
        ? `No uncommitted changes found in ${relativePath} subdirectory`
        : 'No uncommitted changes found in repository';
      const error = new Error(errorMsg);
      console.error(`GeneratePatch ERROR: ${error.message} - repoPath: ${repoPath}, relativePath: ${relativePath}`);
      throw error;
    }
    patchContent = diff;

    // MODE 4 EXTENSION: Include untracked files
    // Only applicable in working directory mode
    // Requires both untracked=true AND untrackedFiles array to be provided
    if (untracked && untrackedFiles && untrackedFiles.length > 0) {
      console.log(`GeneratePatch: Including ${untrackedFiles.length} untracked items in working directory diff`);

      // Expand directories to get actual files
      const filesToDiff = [];
      for (const item of untrackedFiles) {
        const itemPath = path.join(repoPath, item);
        if (await fs.pathExists(itemPath)) {
          const stat = await fs.stat(itemPath);
          if (stat.isDirectory()) {
            // Recursively find all files in directory
            const findFiles = async (dir) => {
              const entries = await fs.readdir(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  await findFiles(fullPath);
                } else if (entry.isFile()) {
                  const relativePath = path.relative(repoPath, fullPath);
                  filesToDiff.push(relativePath);
                }
              }
            };
            await findFiles(itemPath);
          } else if (stat.isFile()) {
            filesToDiff.push(item);
          }
        }
      }

      console.log(`Expanded to ${filesToDiff.length} files to include`);

      // Generate diffs for each file
      for (const file of filesToDiff) {
        try {
          const filePath = path.join(repoPath, file);
          if (await fs.pathExists(filePath)) {
            // Read file content and create proper unified diff
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');

            // Remove trailing empty line if present
            if (lines.length > 0 && lines[lines.length - 1] === '') {
              lines.pop();
            }

            // Create unified diff format
            const needsNewline = patchContent.length > 0 && !patchContent.endsWith('\n');
            let untrackedDiff = needsNewline ? '\n' : '';
            untrackedDiff += `diff --git a/${file} b/${file}\n`;
            untrackedDiff += `new file mode 100644\n`;
            untrackedDiff += `index 0000000..0000000\n`;
            untrackedDiff += `--- /dev/null\n`;
            untrackedDiff += `+++ b/${file}\n`;
            untrackedDiff += `@@ -0,0 +1,${lines.length} @@\n`;

            // Add each line with + prefix
            for (const line of lines) {
              untrackedDiff += `+${line}\n`;
            }

            patchContent += untrackedDiff;
            console.log(`Added diff for untracked file: ${file} (${lines.length} lines)`);
          }
        } catch (err) {
          console.error(`Error generating diff for untracked file ${file}:`, err.message);
        }
      }
    }
  }

  return patchContent;
}

// Trigger code reviewer to review a diff
app.post('/api/review', async (req, res) => {
  try {
    const { repoName, branch, commitId, baseBranch, patch, untracked, untrackedFiles } = req.body;

    // Validate mutual exclusivity: patch cannot be provided with commit or branch
    if (patch) {
      if (commitId) {
        return res.status(400).json({
          error: 'Cannot provide both patch and commitId. They are mutually exclusive.'
        });
      }
      if (branch) {
        return res.status(400).json({
          error: 'Cannot provide both patch and branch. They are mutually exclusive.'
        });
      }
      if (!repoName) {
        return res.status(400).json({
          error: 'Missing required field: repoName is required when providing patch'
        });
      }
    } else if (!repoName || !branch) {
      return res.status(400).json({
        error: 'Missing required fields: repoName and branch are required (or provide patch instead)'
      });
    }

    // Find repository in config
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;

    // Validate that the path exists
    if (!await fs.pathExists(repoPath)) {
      return res.status(404).json({ error: `Repository path does not exist: ${repoPath}` });
    }

    // Get git root for path filtering (needed later for file list)
    const gitRoot = await execGitCommand(['rev-parse', '--show-toplevel'], repoPath);
    const relativePath = gitRoot && gitRoot !== repoPath ? path.relative(gitRoot, repoPath) : null;

    // Helper function for path filtering
    const getPathFilter = () => {
      if (!relativePath) return [];
      return ['--', '.'];
    };

    // Generate patch content using the reusable function
    let tempPatchFile = null;
    let patchContent = null;

    try {
      patchContent = await generatePatchContent({
        repoPath,
        patch,
        commitId,
        branch,
        baseBranch,
        untracked,
        untrackedFiles
      });
    } catch (err) {
      console.error('Review: Failed to generate patch content:', err.message);
      return res.status(404).json({ error: err.message });
    }

    // Get commit message if reviewing a specific commit
    let commitMessage = null;
    if (commitId) {
      try {
        const message = await execGitCommand(
          ['log', '-1', '--format=%s', commitId],
          repoPath
        );
        if (message) {
          commitMessage = message.trim();
        }
      } catch (err) {
        console.error('Error fetching commit message:', err.message);
        // Continue without commit message
      }
    }

    // Write patch content to a temporary file
    const outputPath = argv.output;
    const tempDir = path.join(outputPath, 'temp');
    await fs.ensureDir(tempDir);

    tempPatchFile = path.join(tempDir, `review_patch_${Date.now()}.patch`);
    await fs.writeFile(tempPatchFile, patchContent, 'utf8');

    // Create reviews directory and output file for review results
    const reviewsDir = path.join(outputPath, 'reviews');
    await fs.ensureDir(reviewsDir);
    const tempOutputFile = path.join(reviewsDir, `review_output_${Date.now()}.json`);

    // Construct the code reviewer command
    const reviewerPath = process.env.CODE_REVIEWER_PATH || path.join(__dirname, '../../code_reviewer/code-reviewer');
    const appConfig = process.env.CODE_REVIEWER_APP_CONFIG || path.join(__dirname, '../../code_reviewer/configs/app.yaml');

    const commandArgs = [
      '-patch', tempPatchFile,
      '-repo', repoName,
      '-source-config', SOURCE_CONFIG_PATH,
      '-app-config', appConfig,
      '-output', tempOutputFile
    ];

    // Add description if we have a commit message
    if (commitMessage) {
      commandArgs.push('--description', commitMessage);
      console.log(`Using commit message as description: ${commitMessage}`);
    }

    console.log(`Running code reviewer for ${repoName}`);
    console.log(`Command: ${reviewerPath} ${commandArgs.join(' ')}`);

    // Execute the code reviewer
    const reviewerProcess = spawn(reviewerPath, commandArgs, {
      env: process.env,
      shell: false
    });

    let stdout = '';
    let stderr = '';

    reviewerProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[reviewer stdout]: ${data}`);
    });

    reviewerProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[reviewer stderr]: ${data}`);
    });

    reviewerProcess.on('close', async (code) => {
      const isDevMode = process.env.DEV_MODE === 'true';

      // Clean up temporary patch file (skip in dev mode)
      if (tempPatchFile && !isDevMode) {
        try {
          await fs.remove(tempPatchFile);
          console.log(`Cleaned up temporary patch file: ${tempPatchFile}`);
        } catch (cleanupErr) {
          console.error(`Failed to clean up temporary patch file: ${cleanupErr.message}`);
        }
      } else if (tempPatchFile && isDevMode) {
        console.log(`[DEV MODE] Preserving temporary patch file: ${tempPatchFile}`);
      }

      if (code === 0) {
        console.log('Code reviewer completed successfully');

        // Read the review output JSON
        let reviewData = null;
        try {
          if (await fs.pathExists(tempOutputFile)) {
            reviewData = await fs.readJson(tempOutputFile);

            // Enrich with metadata
            try {
              const metadata = {
                repository: {
                  name: repoName,
                  branch: branch || null,
                  commit: commitId || null,
                  is_uncommitted: !commitId,
                  path: repoPath
                },
                generatedAt: new Date().toISOString(),
                timestamp: Math.floor(Date.now() / 1000)
              };

              // Get commit message if we have a commitId
              if (commitId) {
                try {
                  const commitMessage = await execGitCommand(
                    ['log', '-1', '--format=%s', commitId],
                    repoPath
                  );
                  if (commitMessage) {
                    metadata.repository.commit_message = commitMessage.trim();
                  }
                } catch (err) {
                  console.error('Error fetching commit message:', err.message);
                }
              }

              // Get list of files from the diff (with path filtering if needed)
              try {
                let fileListOutput = null;
                if (commitId) {
                  // Check if commit has a parent (to handle initial commits)
                  const hasParent = await execGitCommand(['rev-parse', '--verify', `${commitId}^`], repoPath);
                  if (hasParent) {
                    fileListOutput = await execGitCommand(
                      ['diff', '--name-only', `${commitId}^..${commitId}`, ...getPathFilter()],
                      repoPath
                    );
                  } else {
                    // Initial commit: use git show
                    fileListOutput = await execGitCommand(
                      ['show', '--name-only', '--format=', commitId, ...getPathFilter()],
                      repoPath
                    );
                  }
                } else if (branch && baseBranch) {
                  fileListOutput = await execGitCommand(
                    ['diff', '--name-only', `${baseBranch}..${branch}`, ...getPathFilter()],
                    repoPath
                  );
                } else {
                  fileListOutput = await execGitCommand(
                    ['diff', '--name-only', 'HEAD', ...getPathFilter()],
                    repoPath
                  );
                }

                if (fileListOutput) {
                  let files = fileListOutput.trim().split('\n').filter(f => f.length > 0);
                  // If we're in a subdirectory, filter files to only those in the subdirectory
                  if (relativePath && gitRoot) {
                    files = filterFilesByRepoPath(files, repoPath, gitRoot);
                  }
                  metadata.files = files;
                  metadata.file_count = files.length;
                }
              } catch (err) {
                console.error('Error fetching file list:', err.message);
              }

              // Merge metadata into review data
              reviewData = { ...reviewData, ...metadata };

              // Write the enriched data back to the file (keep it in reviews directory)
              await fs.writeJson(tempOutputFile, reviewData, { spaces: 2 });
              console.log(`Enriched review data saved to: ${tempOutputFile}`);
            } catch (metadataErr) {
              console.error('Error enriching metadata:', metadataErr.message);
              // Continue even if metadata enrichment fails
            }

            // Note: We DON'T delete the tempOutputFile anymore since it's in the reviews directory
            // and should be kept for future reference
          }
        } catch (readErr) {
          console.error('Error reading review output:', readErr.message);
        }

        // Extract review ID from the output file path
        const reviewId = path.basename(tempOutputFile, '.json');

        res.json({
          success: true,
          message: 'Code review completed successfully',
          review: reviewData,
          reviewId,  // Always include review ID for frontend navigation
          output: stdout,
          repoName,
          branch: branch || null,
          commitId: commitId || null,
          ...(isDevMode && { tempPatchFile, tempOutputFile })
        });
      } else {
        console.error(`Code reviewer exited with code ${code}`);
        console.error('=== Code Reviewer Error Details ===');
        if (stdout.trim()) {
          console.error('--- stdout ---');
          console.error(stdout);
        }
        if (stderr.trim()) {
          console.error('--- stderr (including stack trace) ---');
          console.error(stderr);
        }
        console.error('=== End Code Reviewer Error Details ===');

        // Note: We keep the output file even on error for debugging
        // It's in the reviews directory and can be inspected

        res.status(500).json({
          error: 'Code reviewer failed',
          exitCode: code,
          stdout,
          stderr,
          ...(isDevMode && { tempPatchFile, tempOutputFile })
        });
      }
    });

    reviewerProcess.on('error', (err) => {
      console.error('Failed to start code reviewer process:', err);
      console.error('Process error stack trace:', err.stack);
      res.status(500).json({
        error: 'Failed to start code reviewer process',
        details: err.message,
        stack: err.stack
      });
    });

  } catch (error) {
    console.error('Error triggering code reviewer:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to trigger code reviewer',
      details: error.message,
      stack: error.stack
    });
  }
});

// Get list of all reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const outputPath = argv.output;
    const reviewsDir = path.join(outputPath, 'reviews');

    // Check if reviews directory exists
    if (!await fs.pathExists(reviewsDir)) {
      return res.json({ reviews: [], total: 0 });
    }

    // Read all JSON files in reviews directory
    const files = await fs.readdir(reviewsDir);
    const reviewFiles = files.filter(f => f.endsWith('.json'));

    // Read files concurrently using Promise.all
    const reviewPromises = reviewFiles.map(async (file) => {
      try {
        const filePath = path.join(reviewsDir, file);
        const [stats, reviewData] = await Promise.all([
          fs.stat(filePath),
          fs.readJson(filePath)
        ]);

        // Extract metadata from review
        return {
          id: file.replace('.json', ''),
          filename: file,
          repoName: reviewData.repository?.name || reviewData.repoName || 'Unknown',
          branch: reviewData.repository?.branch || reviewData.branch || null,
          commitId: reviewData.repository?.commit || reviewData.commitId || null,
          isUncommitted: reviewData.repository?.is_uncommitted || false,
          fileCount: reviewData.files?.length || 0,
          createdAt: stats.mtime.toISOString(),
          timestamp: Math.floor(stats.mtime.getTime() / 1000),
          hasMarkdown: !!reviewData.review_markdown || !!reviewData.markdown,
          summary: reviewData.summary || null,
          status: reviewData.status || 'active',
          archivedAt: reviewData.archivedAt || null
        };
      } catch (err) {
        console.error(`Error reading review file ${file}:`, err.message);
        // Return null for invalid files
        return null;
      }
    });

    // Wait for all file reads to complete and filter out nulls
    let reviews = (await Promise.all(reviewPromises)).filter(r => r !== null);

    // Filter out archived reviews by default (unless includeArchived query param is set)
    const includeArchived = req.query.includeArchived === 'true';
    if (!includeArchived) {
      reviews = reviews.filter(r => r.status !== 'archived');
    }

    // Sort by timestamp descending (newest first)
    reviews.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      reviews,
      total: reviews.length
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews', details: error.message });
  }
});

// Get specific review by ID
app.get('/api/reviews/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params;
    const outputPath = argv.output;
    const reviewsDir = path.join(outputPath, 'reviews');

    // Sanitize filename to prevent directory traversal
    const sanitizedId = path.basename(reviewId.replace(/[^a-zA-Z0-9_-]/g, ''));
    const reviewFile = path.join(reviewsDir, `${sanitizedId}.json`);

    // Verify the resolved path is still within the reviews directory
    const resolvedPath = path.resolve(reviewFile);
    const resolvedReviewsDir = path.resolve(reviewsDir);
    if (!resolvedPath.startsWith(resolvedReviewsDir)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }

    // Check if file exists
    if (!await fs.pathExists(reviewFile)) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Read the review data
    const reviewData = await fs.readJson(reviewFile);
    const stats = await fs.stat(reviewFile);

    // Return full review with metadata
    res.json({
      id: sanitizedId,
      filename: `${sanitizedId}.json`,
      repoName: reviewData.repository?.name || reviewData.repoName || 'Unknown',
      branch: reviewData.repository?.branch || reviewData.branch || null,
      commitId: reviewData.repository?.commit || reviewData.commitId || null,
      isUncommitted: reviewData.repository?.is_uncommitted || false,
      fileCount: reviewData.files?.length || 0,
      files: reviewData.files || [],
      createdAt: stats.mtime.toISOString(),
      timestamp: Math.floor(stats.mtime.getTime() / 1000),
      markdown: reviewData.review_markdown || reviewData.markdown || null,
      review: reviewData,
      summary: reviewData.summary || null
    });
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({ error: 'Failed to fetch review', details: error.message });
  }
});

// Archive a review
app.post('/api/reviews/:reviewId/archive', async (req, res) => {
  try {
    const { reviewId } = req.params;
    const outputPath = argv.output;
    const reviewsDir = path.join(outputPath, 'reviews');

    // Sanitize filename to prevent directory traversal
    const sanitizedId = path.basename(reviewId.replace(/[^a-zA-Z0-9_-]/g, ''));
    const reviewFile = path.join(reviewsDir, `${sanitizedId}.json`);

    // Verify the resolved path is still within the reviews directory
    const resolvedPath = path.resolve(reviewFile);
    const resolvedReviewsDir = path.resolve(reviewsDir);
    if (!resolvedPath.startsWith(resolvedReviewsDir)) {
      return res.status(400).json({ error: 'Invalid review ID' });
    }

    // Check if file exists
    if (!await fs.pathExists(reviewFile)) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Read the review data
    const reviewData = await fs.readJson(reviewFile);

    // Add archived status
    reviewData.status = 'archived';
    reviewData.archivedAt = new Date().toISOString();
    reviewData.archivedTimestamp = Math.floor(Date.now() / 1000);

    // Write back to file
    await fs.writeJson(reviewFile, reviewData, { spaces: 2 });

    console.log(`Archived review: ${sanitizedId}`);

    res.json({
      success: true,
      message: 'Review archived successfully',
      reviewId: sanitizedId,
      archivedAt: reviewData.archivedAt
    });
  } catch (error) {
    console.error('Error archiving review:', error);
    res.status(500).json({ error: 'Failed to archive review', details: error.message });
  }
});

// Trigger splitter agent to split a diff
//
// This endpoint uses generatePatchContent() to create a patch file, then passes it to the splitter agent.
// The splitter agent always receives a patch file via --patch flag.
//
// Supported modes (same as generatePatchContent):
// 1. Pre-existing patch: { repoName, patch }
// 2. Commit diff: { repoName, commitId }
// 3. Branch comparison: { repoName, branch, baseBranch }
// 4. Working directory: { repoName, branch } with optional { untracked, untrackedFiles }
app.post('/api/split', async (req, res) => {
  try {
    const { repoName, branch, commitId, baseBranch, patch, untracked, untrackedFiles } = req.body;

    // Validate required field
    if (!repoName) {
      return res.status(400).json({
        error: 'Missing required field: repoName'
      });
    }

    // Find repository in config
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;

    // Validate that the path exists
    if (!await fs.pathExists(repoPath)) {
      return res.status(404).json({ error: `Repository path does not exist: ${repoPath}` });
    }

    // Generate patch content using the reusable function
    // This handles all modes: pre-existing patch, commit diff, branch comparison, or working directory
    let patchContent = null;
    try {
      console.log('Split: Generating patch content with params:', {
        repoName,
        hasPath: !!patch,
        commitId,
        branch,
        baseBranch,
        untracked,
        untrackedFilesCount: untrackedFiles?.length || 0
      });

      patchContent = await generatePatchContent({
        repoPath,
        patch,
        commitId,
        branch,
        baseBranch,
        untracked,
        untrackedFiles
      });

      console.log(`Split: Generated patch content (${patchContent.length} bytes)`);
    } catch (err) {
      console.error('Split: Failed to generate patch content:', err.message);
      return res.status(404).json({ error: err.message });
    }

    // Write patch content to a temporary file
    // The splitter agent always receives a patch file via --patch flag
    const outputPath = argv.output;
    const tempDir = path.join(outputPath, 'temp');
    await fs.ensureDir(tempDir);

    const tempPatchFile = path.join(tempDir, `split_patch_${Date.now()}.patch`);
    await fs.writeFile(tempPatchFile, patchContent, 'utf8');
    console.log(`Split: Wrote patch to temporary file: ${tempPatchFile}`);

    // Create temp file for splitter output
    const tempOutputFile = path.join(tempDir, `split_output_${Date.now()}.log`);
    const outputStream = nodeFs.createWriteStream(tempOutputFile);
    console.log(`Split: Splitter output will be written to: ${tempOutputFile}`);

    // Construct the splitter command
    const splitterPath = process.env.SPLITTER_PATH || path.join(__dirname, '../../splitter_dep');

    // Build command arguments
    // The splitter agent ALWAYS receives patch content via --patch flag (never --commit or --target-branch)
    // It also receives the backend-managed source.yaml, ensuring consistency across all agents
    console.log(`Split: Using source config: ${SOURCE_CONFIG_PATH}`);

    const commandArgs = [
      '-m', 'code_splitter.main',
      'split',
      '--output-dir', outputPath,
      '--source-config', SOURCE_CONFIG_PATH,  // Use backend-managed source.yaml
      '--repo', repoName,
      '--patch', tempPatchFile,  // Always use --patch flag
      '--annotate-patches'
    ];

    // Add LLM configuration
    const apiKey = process.env.ARMCHAIR_MODEL_API_KEY;
    if (apiKey) {
      commandArgs.push('--api-key', apiKey);
    } else {
      // Run without LLM if no API key
      commandArgs.push('--no-llm');
    }

    const apiBase = process.env.ARMCHAIR_MODEL_API_BASE_URL;
    if (apiBase) {
      commandArgs.push('--api-base', apiBase);
    }

    const modelName = process.env.ARMCHAIR_MODEL_NAME;
    if (modelName) {
      commandArgs.push('--model', modelName);
    }

    // Log which mode is being used
    let modeDescription;
    if (patch) {
      modeDescription = 'pre-existing patch';
    } else if (commitId) {
      modeDescription = `commit ${commitId}`;
    } else if (branch && baseBranch) {
      modeDescription = `branch comparison ${baseBranch}..${branch}`;
    } else if (branch) {
      modeDescription = `working directory on branch ${branch}`;
      if (untracked && untrackedFiles?.length > 0) {
        modeDescription += ` (including ${untrackedFiles.length} untracked items)`;
      }
    } else {
      modeDescription = 'working directory';
    }
    console.log(`Split: Running splitter for ${repoName} using ${modeDescription}`);

    // Use venv Python interpreter by default, fall back to system Python
    const defaultPythonPath = path.join(__dirname, '../../splitter_dep/venv/bin/python3');
    const pythonPath = process.env.PYTHON_PATH || (await fs.pathExists(defaultPythonPath) ? defaultPythonPath : 'python3');

    console.log(`Split: Executing splitter with Python: ${pythonPath}`);
    console.log(`Split: Command: ${pythonPath} ${commandArgs.join(' ')}`);

    // Execute the splitter
    // The splitter is installed with 'pip install -e' in the venv, so it's importable as a module
    const splitterProcess = spawn(pythonPath, commandArgs, {
      env: process.env,
      shell: false
    });

    let stdout = '';
    let stderr = '';

    splitterProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      outputStream.write(`[stdout] ${data}`);
      console.log(`[Splitter stdout]: ${data}`);
    });

    splitterProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      outputStream.write(`[stderr] ${data}`);
      console.error(`[Splitter stderr]: ${data}`);
    });

    splitterProcess.on('close', async (code) => {
      // Close the output stream
      outputStream.end();

      // Clean up temporary files (unless in DEV_MODE)
      const isDevMode = process.env.DEV_MODE === 'true';
      if (!isDevMode) {
        // Clean up temp patch file
        if (tempPatchFile) {
          try {
            await fs.remove(tempPatchFile);
            console.log(`Split: Cleaned up temporary patch file: ${tempPatchFile}`);
          } catch (cleanupErr) {
            console.error(`Split: Failed to clean up temporary patch file: ${cleanupErr.message}`);
          }
        }
        // Clean up temp output file
        if (tempOutputFile) {
          try {
            await fs.remove(tempOutputFile);
            console.log(`Split: Cleaned up temporary output file: ${tempOutputFile}`);
          } catch (cleanupErr) {
            console.error(`Split: Failed to clean up temporary output file: ${cleanupErr.message}`);
          }
        }
      } else {
        console.log(`Split: DEV_MODE enabled - preserving temporary files:`);
        console.log(`  - Patch file: ${tempPatchFile}`);
        console.log(`  - Output file: ${tempOutputFile}`);
      }

      if (code === 0) {
        console.log('Split: Splitter completed successfully');

        // Extract the generated directory from stdout
        // Look for "Output directory: /path/to/dir" in the output
        let generatedDir = null;
        const outputDirMatch = stdout.match(/Output directory:\s*(.+)/);
        if (outputDirMatch) {
          const fullPath = outputDirMatch[1].trim();
          // Extract just the directory name from the full path
          generatedDir = path.basename(fullPath);
          console.log(`Split: Extracted generated directory: ${generatedDir}`);
        }

        // Find the newly created output directory (fallback if regex doesn't work)
        let latestCommitDir = null;

        try {
          const commitDirs = await fs.readdir(outputPath);
          const sortedDirs = commitDirs
            .filter(dir => dir.startsWith('commit_') || dir.startsWith('patch_') || dir.startsWith('pr_'))
            .sort()
            .reverse();

          latestCommitDir = sortedDirs[0] || null;
        } catch (err) {
          console.error('Split: Error reading output directory:', err);
        }

        // Use generatedDir if available, otherwise fall back to latestCommitDir
        const finalDir = generatedDir || latestCommitDir;

        console.log(`Split: Returning success with commit ID: ${finalDir}`);

        res.json({
          success: true,
          message: `Split completed successfully using ${modeDescription}`,
          commitDir: finalDir,
          commit_id: finalDir,  // Add this for consistency with frontend expectation
          output: stdout,
          repoName,
          branch: branch || null,
          commitId: commitId || null
        });
      } else {
        console.error(`Split: Splitter exited with code ${code}`);
        console.error('=== Splitter Error Details ===');
        if (stdout.trim()) {
          console.error('--- stdout ---');
          console.error(stdout);
        }
        if (stderr.trim()) {
          console.error('--- stderr (including stack trace) ---');
          console.error(stderr);
        }
        console.error('=== End Splitter Error Details ===');

        res.status(500).json({
          error: 'Splitter failed',
          exitCode: code,
          stdout,
          stderr
        });
      }
    });

    splitterProcess.on('error', (err) => {
      console.error('Failed to start splitter process:', err);
      console.error('Process error stack trace:', err.stack);
      res.status(500).json({
        error: 'Failed to start splitter process',
        details: err.message,
        stack: err.stack
      });
    });

  } catch (error) {
    console.error('Error triggering splitter:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to trigger splitter',
      details: error.message,
      stack: error.stack
    });
  }
});

// Get working directory diff for a repository branch
app.get('/api/repositories/:repoName/branches/:branchName/working-directory/diff', async (req, res) => {
  try {
    const { repoName, branchName } = req.params;

    // Find repository in config
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;

    // Get git root for path filtering
    const gitRoot = await execGitCommand(['rev-parse', '--show-toplevel'], repoPath);
    const relativePath = gitRoot && gitRoot !== repoPath ? path.relative(gitRoot, repoPath) : null;

    // Helper function to add path filter
    const getPathFilter = () => {
      if (!relativePath) return [];
      return ['--', '.'];
    };

    // Get the diff for working directory (staged and unstaged changes)
    let diff = await execGitCommand(
      ['diff', 'HEAD', ...getPathFilter()],
      repoPath
    );

    if (diff === null) {
      return res.status(404).json({ error: 'Failed to get working directory diff' });
    }

    // Strip the git root prefix from file paths in the diff
    if (relativePath && diff) {
      const prefix = relativePath + '/';
      const escapedPrefix = prefix.replace(/\//g, '\\/');

      // Replace paths in diff --git lines
      diff = diff.replace(
        new RegExp(`diff --git a/${escapedPrefix}`, 'g'),
        'diff --git a/'
      );
      diff = diff.replace(
        new RegExp(`b/${escapedPrefix}`, 'g'),
        'b/'
      );
      // Replace paths in --- and +++ lines
      diff = diff.replace(
        new RegExp(`--- a/${escapedPrefix}`, 'g'),
        '--- a/'
      );
      diff = diff.replace(
        new RegExp(`\\+\\+\\+ b/${escapedPrefix}`, 'g'),
        '+++ b/'
      );
    }

    // Get list of files changed
    const filesChanged = await execGitCommand(
      ['diff', 'HEAD', '--name-only', ...getPathFilter()],
      repoPath
    );

    const allFiles = filesChanged ? filesChanged.split('\n').filter(f => f.trim()) : [];
    const files = filterFilesByRepoPath(allFiles, repoPath, gitRoot);

    // Get status for categorization
    const statusOutput = await execGitCommand(['status', '--porcelain'], repoPath);
    const status = {
      staged: [],
      unstaged: [],
      untracked: []
    };

    if (statusOutput) {
      const allFilesStatus = {
        staged: [],
        unstaged: [],
        untracked: []
      };

      statusOutput.split('\n').forEach(line => {
        if (!line) return;
        const statusCode = line.substring(0, 2);
        const filename = line.substring(2).trimStart();

        if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
          allFilesStatus.staged.push(filename);
        }
        if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
          allFilesStatus.unstaged.push(filename);
        }
        if (statusCode === '??') {
          allFilesStatus.untracked.push(filename);
        }
      });

      // Filter files to only include those within the repo path
      status.staged = filterFilesByRepoPath(allFilesStatus.staged, repoPath, gitRoot);
      status.unstaged = filterFilesByRepoPath(allFilesStatus.unstaged, repoPath, gitRoot);
      status.untracked = filterFilesByRepoPath(allFilesStatus.untracked, repoPath, gitRoot);
    }

    res.json({
      repoName,
      branchName,
      workingDirectory: {
        files,
        status
      },
      diff
    });
  } catch (error) {
    console.error('Error fetching working directory diff:', error);
    res.status(500).json({ error: 'Failed to fetch working directory diff' });
  }
});

// Get diff for a specific commit in a repository
app.get('/api/repositories/:repoName/commits/:commitHash/diff', async (req, res) => {
  try {
    const { repoName, commitHash } = req.params;

    // Find repository in config
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;

    // Get commit info
    const commitInfo = await execGitCommand(
      ['log', commitHash, '-1', '--pretty=format:%H|%h|%an|%ae|%ar|%at|%s|%b'],
      repoPath
    );

    if (!commitInfo) {
      return res.status(404).json({ error: 'Commit not found' });
    }

    const [hash, shortHash, author, email, relativeDate, timestamp, subject, body] = commitInfo.split('|');

    // Get the diff for this commit (compare with parent)
    const diff = await execGitCommand(
      ['diff', `${commitHash}^..${commitHash}`],
      repoPath
    );

    if (diff === null) {
      return res.status(404).json({ error: 'Failed to get commit diff' });
    }

    // Get list of files changed
    const filesChanged = await execGitCommand(
      ['diff', `${commitHash}^..${commitHash}`, '--name-only'],
      repoPath
    );

    const files = filesChanged ? filesChanged.split('\n').filter(f => f.trim()) : [];

    res.json({
      repoName,
      commit: {
        hash,
        shortHash,
        author,
        email,
        relativeDate,
        timestamp: parseInt(timestamp),
        message: subject,
        body: body || '',
        files
      },
      diff
    });
  } catch (error) {
    console.error('Error fetching commit diff:', error);
    res.status(500).json({ error: 'Failed to fetch commit diff' });
  }
});

// Get commits for a specific repository and branch
app.get('/api/repositories/:repoName/branches/:branchName/commits', async (req, res) => {
  try {
    const { repoName, branchName } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const skip = parseInt(req.query.skip) || 0;

    // Try to use cached commits first (only for skip=0, first page, and if cache is enabled)
    if (argv.enableCache && skip === 0 && repoCache.repositories[repoName]) {
      const cachedRepo = repoCache.repositories[repoName];
      const cachedBranch = cachedRepo.branches?.find(b => b.name === branchName);

      if (cachedBranch && cachedBranch.commits && cachedBranch.commits.length > 0) {
        const commits = cachedBranch.commits.slice(0, limit);
        const hasMore = cachedBranch.commits.length > limit;

        console.log(`[CACHE] Returning cached commits for ${repoName}/${branchName}`);
        return res.json({
          repoName,
          branchName,
          commits,
          hasMore,
          cacheTimestamp: repoCache.timestamp,
          cacheAge: Math.floor(Date.now() / 1000) - repoCache.timestamp
        });
      }
    }

    // Fall back to live fetch for pagination or if not cached
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;

    // Get commits for the branch with skip and limit
    // Request limit+1 to determine if there are more commits
    const commitLog = await execGitCommand(
      ['log', branchName, `--skip=${skip}`, `-${limit + 1}`, '--pretty=format:%H|%h|%an|%ae|%ar|%at|%s'],
      repoPath
    );

    if (!commitLog) {
      return res.status(404).json({ error: 'Failed to get commits or branch not found' });
    }

    const allCommits = commitLog.split('\n').map(line => {
      const [hash, shortHash, author, email, relativeDate, timestamp, message] = line.split('|');
      return {
        hash,
        shortHash,
        author,
        email,
        relativeDate,
        timestamp: parseInt(timestamp),
        message
      };
    });

    // Check if there are more commits by seeing if we got limit+1 results
    const hasMore = allCommits.length > limit;
    // Return only 'limit' commits
    const commits = hasMore ? allCommits.slice(0, limit) : allCommits;

    res.json({
      repoName,
      branchName,
      commits,
      hasMore,
      cacheTimestamp: null,
      cacheAge: null
    });
  } catch (error) {
    console.error('Error fetching commits:', error);
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// Get basic repository information (lightweight)
app.get('/api/repositories', async (req, res) => {
  try {
    const repositories = config.source?.repositories || [];
    const repoData = repositories.map(repo => ({
      name: repo.name,
      path: repo.path,
      language: repo.language,
      disabled: repo.disabled || false,
      commitOnly: repo.commitOnly || false
    }));

    res.json({
      repositories: repoData,
      total: repoData.length,
      cacheTimestamp: repoCache.timestamp,
      cacheAge: repoCache.timestamp ? Math.floor(Date.now() / 1000) - repoCache.timestamp : null
    });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Get detailed information for a specific repository
app.get('/api/repositories/:repoName', async (req, res) => {
  try {
    const { repoName } = req.params;

    // Check if we have cached data for this repository (only if cache is enabled)
    if (argv.enableCache && repoCache.repositories[repoName]) {
      const cachedData = repoCache.repositories[repoName];
      console.log(`[CACHE] Returning cached repository details for ${repoName}`);
      return res.json({
        ...cachedData,
        cacheTimestamp: repoCache.timestamp,
        cacheAge: Math.floor(Date.now() / 1000) - repoCache.timestamp
      });
    }

    // If not in cache, fall back to live fetch
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;
    const gitRoot = await execGitCommand(['rev-parse', '--show-toplevel'], repoPath);

    if (!gitRoot) {
      return res.json({
        name: repo.name,
        path: repo.path,
        gitRoot: null,
        language: repo.language,
        disabled: repo.disabled || false,
        commitOnly: repo.commitOnly || false,
        error: 'Not a git repository or path does not exist',
        cacheTimestamp: null,
        cacheAge: null
      });
    }

    // Get all branches - optimized to only fetch branch names and current branch
    const branchesOutput = await execGitCommand(['branch'], repoPath);
    const branches = [];

    if (branchesOutput) {
      const branchLines = branchesOutput.split('\n').filter(line => line.trim());

      // Get current branch
      const currentBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

      for (const line of branchLines) {
        const branchName = line.replace('*', '').trim();
        const isCurrent = branchName === currentBranch;

        branches.push({
          name: branchName,
          isCurrent,
          // Don't fetch commits here - they will be fetched on-demand when branch is expanded
          commits: []
        });
      }
    }

    // Get git status for current branch (only if not commitOnly)
    const commitOnly = repo.commitOnly || false;
    let status = null;

    if (!commitOnly) {
      const statusOutput = await execGitCommand(['status', '--porcelain'], repoPath);
      status = {
        staged: [],
        unstaged: [],
        untracked: []
      };

      if (statusOutput) {
        const allFilesStatus = {
          staged: [],
          unstaged: [],
          untracked: []
        };

        statusOutput.split('\n').forEach(line => {
          if (!line) return;
          // Git status porcelain format: XY filename
          // where X and Y are status codes, followed by a space, then the filename
          const statusCode = line.substring(0, 2);
          // The filename starts after the 2-char status code and any whitespace
          const filename = line.substring(2).trimStart();

          if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
            allFilesStatus.staged.push(filename);
          }
          if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
            allFilesStatus.unstaged.push(filename);
          }
          if (statusCode === '??') {
            allFilesStatus.untracked.push(filename);
          }
        });

        // Filter files to only include those within the repo path
        status.staged = filterFilesByRepoPath(allFilesStatus.staged, repoPath, gitRoot);
        status.unstaged = filterFilesByRepoPath(allFilesStatus.unstaged, repoPath, gitRoot);
        status.untracked = filterFilesByRepoPath(allFilesStatus.untracked, repoPath, gitRoot);
      }
    }

    res.json({
      name: repo.name,
      path: repo.path,
      gitRoot: gitRoot !== repoPath ? gitRoot : null,
      language: repo.language,
      disabled: repo.disabled || false,
      commitOnly: commitOnly,
      branchCount: branches.length,
      branches,
      status,
      cacheTimestamp: null,
      cacheAge: null
    });
  } catch (error) {
    console.error('Error fetching repository details:', error);
    res.status(500).json({ error: 'Failed to fetch repository details' });
  }
});

// Refresh repository data (re-fetches from git)
app.post('/api/repositories/:repoName/refresh', async (req, res) => {
  try {
    const { repoName } = req.params;

    // Find repository in config
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;
    console.log(`Refreshing repository data: ${repoName}`);

    try {
      const gitRoot = await execGitCommand(['rev-parse', '--show-toplevel'], repoPath);

      if (!gitRoot) {
        const repoData = {
          name: repoName,
          path: repo.path,
          gitRoot: null,
          language: repo.language,
          disabled: repo.disabled || false,
          commitOnly: repo.commitOnly || false,
          error: 'Not a git repository or path does not exist'
        };
        return res.json({
          success: true,
          repository: repoData
        });
      }

      // Get all branches
      const branchesOutput = await execGitCommand(['branch'], repoPath);
      const branches = [];

      if (branchesOutput) {
        const branchLines = branchesOutput.split('\n').filter(line => line.trim());
        const currentBranch = await execGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

        for (const line of branchLines) {
          const branchName = line.replace('*', '').trim();
          const isCurrent = branchName === currentBranch;

          branches.push({
            name: branchName,
            isCurrent,
            // Don't fetch commits here - they will be fetched on-demand
            commits: []
          });
        }
      }

      // Get git status for current branch (only if not commitOnly)
      const commitOnly = repo.commitOnly || false;
      let status = null;

      if (!commitOnly) {
        const statusOutput = await execGitCommand(['status', '--porcelain'], repoPath);
        status = {
          staged: [],
          unstaged: [],
          untracked: []
        };

        if (statusOutput) {
          const allFilesStatus = {
            staged: [],
            unstaged: [],
            untracked: []
          };

          statusOutput.split('\n').forEach(line => {
            if (!line) return;
            const statusCode = line.substring(0, 2);
            const filename = line.substring(2).trimStart();

            if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
              allFilesStatus.staged.push(filename);
            }
            if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
              allFilesStatus.unstaged.push(filename);
            }
            if (statusCode === '??') {
              allFilesStatus.untracked.push(filename);
            }
          });

          console.log(`Refresh ${repoName}: Before filter - staged:`, allFilesStatus.staged, 'unstaged:', allFilesStatus.unstaged, 'untracked:', allFilesStatus.untracked);
          console.log(`Refresh ${repoName}: gitRoot=${gitRoot}, repoPath=${repoPath}`);

          // Filter files to only include those within the repo path
          status.staged = filterFilesByRepoPath(allFilesStatus.staged, repoPath, gitRoot);
          status.unstaged = filterFilesByRepoPath(allFilesStatus.unstaged, repoPath, gitRoot);
          status.untracked = filterFilesByRepoPath(allFilesStatus.untracked, repoPath, gitRoot);

          console.log(`Refresh ${repoName}: After filter - staged:`, status.staged, 'unstaged:', status.unstaged, 'untracked:', status.untracked);
        }
      }

      const repoData = {
        name: repoName,
        path: repo.path,
        gitRoot: gitRoot !== repoPath ? gitRoot : null,
        language: repo.language,
        disabled: repo.disabled || false,
        commitOnly: commitOnly,
        branchCount: branches.length,
        branches,
        status,
        cacheTimestamp: null,
        cacheAge: null
      };

      // If cache is enabled, update the cache
      if (argv.enableCache) {
        const cacheData = {
          timestamp: Math.floor(Date.now() / 1000),
          repositories: { ...repoCache.repositories, [repoName]: repoData }
        };
        await writeCacheToFile(cacheData);
        console.log(`Successfully refreshed and cached data for ${repoName}`);
      } else {
        console.log(`Successfully refreshed data for ${repoName} (cache disabled)`);
      }

      res.json({
        success: true,
        repository: repoData
      });
    } catch (err) {
      console.error(`Error refreshing repository ${repoName}:`, err.message);
      const repoData = {
        name: repoName,
        path: repo.path,
        language: repo.language,
        disabled: repo.disabled || false,
        commitOnly: repo.commitOnly || false,
        error: `Failed to refresh: ${err.message}`
      };

      return res.status(500).json({
        success: false,
        error: `Failed to refresh: ${err.message}`,
        repository: repoData
      });
    }
  } catch (error) {
    console.error('Error refreshing repository:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh repository' });
  }
});

// Apply a patch to a repository
app.post('/api/apply', async (req, res) => {
  try {
    const { repoName, patchFile, branch, index, autoCommit } = req.body;

    // Validate required parameters
    if (!repoName || !patchFile) {
      return res.status(400).json({
        error: 'Missing required fields: repoName and patchFile are required'
      });
    }

    // Find repository in config
    const repositories = config.source?.repositories || [];
    const repo = repositories.find(r => r.name === repoName);

    if (!repo) {
      return res.status(404).json({ error: `Repository '${repoName}' not found in config` });
    }

    const repoPath = repo.path;

    // Validate that the path exists
    if (!await fs.pathExists(repoPath)) {
      return res.status(404).json({ error: `Repository path does not exist: ${repoPath}` });
    }

    // Validate that the patch file exists
    if (!await fs.pathExists(patchFile)) {
      return res.status(404).json({ error: `Patch file does not exist: ${patchFile}` });
    }

    // If branch is specified, checkout that branch first
    if (branch) {
      const checkoutResult = await execGitCommand(['checkout', branch], repoPath);
      if (checkoutResult === null) {
        return res.status(500).json({ error: `Failed to checkout branch: ${branch}` });
      }
    }

    // Build git apply command arguments
    const applyArgs = ['apply'];
    if (index) {
      applyArgs.push('--index');
    }
    applyArgs.push(patchFile);

    console.log(`Applying patch: git ${applyArgs.join(' ')}`);
    const applyResult = await execGitCommand(applyArgs, repoPath);

    if (applyResult === null) {
      return res.status(500).json({
        error: 'Failed to apply patch',
        details: 'Git apply command failed. Check if the patch is compatible with the current state of the repository.'
      });
    }

    let commitHash = null;

    // If autoCommit is true, commit the changes
    if (autoCommit) {
      // Get patch filename for commit message
      const patchFilename = path.basename(patchFile);
      const commitMessage = `Apply patch: ${patchFilename}`;

      console.log(`Auto-committing with message: ${commitMessage}`);

      const commitResult = await execGitCommand(['commit', '-m', commitMessage], repoPath);

      if (commitResult === null) {
        return res.status(500).json({
          error: 'Patch applied but commit failed',
          details: 'The patch was successfully applied but could not be committed. You may need to stage files first or check for conflicts.'
        });
      }

      // Get the commit hash
      commitHash = await execGitCommand(['rev-parse', 'HEAD'], repoPath);
    }

    // Get current status
    const statusOutput = await execGitCommand(['status', '--porcelain'], repoPath);

    res.json({
      success: true,
      message: autoCommit ? 'Patch applied and committed' : 'Patch applied successfully',
      repoName,
      patchFile,
      branch: branch || 'current',
      commitHash,
      status: statusOutput || ''
    });

  } catch (error) {
    console.error('Error applying patch:', error);
    res.status(500).json({ error: 'Failed to apply patch', details: error.message });
  }
});

// ==========================================
// GitHub Integration Endpoints
// ==========================================

/**
 * Shared helper: perform a GitHub PR split.
 * Fetches the PR diff, writes it to a temp file, spawns the splitter,
 * and renames the output directory with pr_ prefix.
 */
async function performGitHubSplit(owner, repo, number) {
  const pat = armchairConfig.GITHUB_PAT;
  if (!pat) {
    throw new Error('GitHub PAT not configured. Add it in Settings > GitHub Integration.');
  }

  // Fetch PR details and diff
  const prDetails = await getPullRequest(owner, repo, number, pat);
  const diffContent = await getPullRequestDiff(owner, repo, number, pat);

  if (!diffContent || diffContent.trim().length === 0) {
    throw new Error('PR has no diff content (empty PR or no changes)');
  }

  const outputPath = argv.output;
  const tempDir = path.join(outputPath, 'temp');
  await fs.ensureDir(tempDir);

  const timestamp = Date.now();
  const tempPatchFile = path.join(tempDir, `pr_${owner}_${repo}_${number}_${timestamp}.patch`);
  await fs.writeFile(tempPatchFile, diffContent, 'utf8');
  console.log(`GitHub Split: Wrote PR diff to: ${tempPatchFile} (${diffContent.length} bytes)`);

  // Construct the splitter command
  const commandArgs = [
    '-m', 'code_splitter.main',
    'split',
    '--output-dir', outputPath,
    '--source-config', SOURCE_CONFIG_PATH,
    '--repo', `${owner}/${repo}`,
    '--patch', tempPatchFile,
    '--annotate-patches'
  ];

  // Add LLM configuration
  const apiKey = process.env.ARMCHAIR_MODEL_API_KEY;
  if (apiKey) {
    commandArgs.push('--api-key', apiKey);
  } else {
    commandArgs.push('--no-llm');
  }

  const apiBase = process.env.ARMCHAIR_MODEL_API_BASE_URL;
  if (apiBase) {
    commandArgs.push('--api-base', apiBase);
  }

  const modelName = process.env.ARMCHAIR_MODEL_NAME;
  if (modelName) {
    commandArgs.push('--model', modelName);
  }

  // Use venv Python interpreter by default, fall back to system Python
  const defaultPythonPath = path.join(__dirname, '../../splitter_dep/venv/bin/python3');
  const pythonPath = process.env.PYTHON_PATH || (await fs.pathExists(defaultPythonPath) ? defaultPythonPath : 'python3');

  console.log(`GitHub Split: Executing splitter for PR #${number} from ${owner}/${repo}`);

  return new Promise((resolve, reject) => {
    const splitterProcess = spawn(pythonPath, commandArgs, {
      env: process.env,
      shell: false
    });

    let stdout = '';
    let stderr = '';

    splitterProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`[GitHub Splitter stdout]: ${data}`);
    });

    splitterProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`[GitHub Splitter stderr]: ${data}`);
    });

    splitterProcess.on('close', async (code) => {
      // Clean up temp file
      try {
        await fs.remove(tempPatchFile);
      } catch (e) {
        console.error(`GitHub Split: Failed to clean up temp file: ${e.message}`);
      }

      if (code !== 0) {
        reject(new Error(`Splitter failed with exit code ${code}: ${stderr}`));
        return;
      }

      // Extract the generated directory
      let generatedDir = null;
      const outputDirMatch = stdout.match(/Output directory:\s*(.+)/);
      if (outputDirMatch) {
        generatedDir = path.basename(outputDirMatch[1].trim());
      }

      // Fallback: find latest output dir
      if (!generatedDir) {
        try {
          const dirs = await fs.readdir(outputPath);
          const sorted = dirs
            .filter(dir => dir.startsWith('commit_') || dir.startsWith('patch_'))
            .sort()
            .reverse();
          generatedDir = sorted[0] || null;
        } catch (e) {
          console.error('GitHub Split: Error finding output dir:', e);
        }
      }

      if (!generatedDir) {
        reject(new Error('Splitter completed but no output directory found'));
        return;
      }

      // Rename to pr_ prefix
      const prDirName = `pr_${owner}_${repo}_${number}_${timestamp}`;
      const oldPath = path.join(outputPath, generatedDir);
      const newPath = path.join(outputPath, prDirName);

      try {
        await fs.rename(oldPath, newPath);
        console.log(`GitHub Split: Renamed ${generatedDir} -> ${prDirName}`);
      } catch (renameErr) {
        console.error(`GitHub Split: Failed to rename, using original dir: ${renameErr.message}`);
        resolve({
          success: true,
          commitDir: generatedDir,
          pr: prDetails
        });
        return;
      }

      // Enrich metadata with PR info
      try {
        const metadataFiles = (await fs.readdir(newPath)).filter(f => f.startsWith('metadata_') && f.endsWith('.json'));
        if (metadataFiles.length > 0) {
          const metaPath = path.join(newPath, metadataFiles[0]);
          const metadata = await fs.readJson(metaPath);
          metadata.pr = {
            owner,
            repo,
            number,
            title: prDetails.title,
            url: prDetails.url,
            base_branch: prDetails.base_branch,
            head_branch: prDetails.head_branch,
            author: prDetails.author
          };
          await fs.writeJson(metaPath, metadata, { spaces: 2 });
          console.log(`GitHub Split: Enriched metadata with PR info`);
        }
      } catch (metaErr) {
        console.error(`GitHub Split: Failed to enrich metadata: ${metaErr.message}`);
      }

      resolve({
        success: true,
        commitDir: prDirName,
        pr: prDetails
      });
    });

    splitterProcess.on('error', (err) => {
      reject(new Error(`Failed to start splitter: ${err.message}`));
    });
  });
}

// GET /api/github/status — connection status
app.get('/api/github/status', async (req, res) => {
  try {
    const pat = armchairConfig.GITHUB_PAT;
    const repos = armchairConfig.GITHUB_REPOS || [];

    if (!pat) {
      return res.json({
        connected: false,
        login: null,
        repos,
        detectedRemotes: []
      });
    }

    try {
      const user = await validatePat(pat);

      // Detect GitHub remotes from configured source repositories
      let detectedRemotes = [];
      const sourceRepos = config.source?.repositories || [];
      for (const sourceRepo of sourceRepos) {
        try {
          const remotes = await detectGitHubRemotes(execGitCommand, sourceRepo.path);
          detectedRemotes.push(...remotes);
        } catch (e) {
          // Skip repos that fail
        }
      }

      // Deduplicate
      const seen = new Set();
      detectedRemotes = detectedRemotes.filter(r => {
        const key = `${r.owner}/${r.repo}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      res.json({
        connected: true,
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        scopes: user.scopes,
        repos,
        detectedRemotes
      });
    } catch (err) {
      res.json({
        connected: false,
        error: err.message,
        repos,
        detectedRemotes: []
      });
    }
  } catch (error) {
    console.error('Error checking GitHub status:', error);
    res.status(500).json({ error: 'Failed to check GitHub status' });
  }
});

// POST /api/github/validate-pat — validate a PAT before saving
app.post('/api/github/validate-pat', async (req, res) => {
  try {
    const { pat } = req.body;
    if (!pat) {
      return res.json({ connected: false, error: 'No token provided' });
    }

    try {
      const user = await validatePat(pat);
      res.json({
        connected: true,
        login: user.login,
        name: user.name,
        scopes: user.scopes
      });
    } catch (err) {
      res.json({ connected: false, error: err.message });
    }
  } catch (error) {
    console.error('Error validating PAT:', error);
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

// GET /api/github/pulls — list open PRs across all connected repos
app.get('/api/github/pulls', async (req, res) => {
  try {
    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured' });
    }

    const repos = armchairConfig.GITHUB_REPOS || [];
    if (repos.length === 0) {
      return res.json({ pulls: [], total: 0 });
    }

    const repoFilter = req.query.repo; // Optional: "owner/repo"
    const targetRepos = repoFilter
      ? repos.filter(r => r === repoFilter)
      : repos;

    const allPulls = [];
    const errors = [];

    for (const repoSlug of targetRepos) {
      const [owner, repo] = repoSlug.split('/');
      if (!owner || !repo) {
        errors.push(`Invalid repo format: ${repoSlug}`);
        continue;
      }

      try {
        const prs = await listPullRequests(owner, repo, pat);
        allPulls.push(...prs);
      } catch (err) {
        errors.push(`${repoSlug}: ${err.message}`);
      }
    }

    // Sort all PRs by updated_at descending
    allPulls.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    res.json({
      pulls: allPulls,
      total: allPulls.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error listing GitHub PRs:', error);
    res.status(500).json({ error: 'Failed to list pull requests' });
  }
});

// GET /api/github/pulls/:owner/:repo/:number — PR details
app.get('/api/github/pulls/:owner/:repo/:number', async (req, res) => {
  try {
    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured' });
    }

    const { owner, repo, number } = req.params;
    const pr = await getPullRequest(owner, repo, parseInt(number), pat);
    res.json(pr);
  } catch (error) {
    console.error('Error fetching PR details:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// GET /api/github/pulls/:owner/:repo/:number/diff — PR unified diff
app.get('/api/github/pulls/:owner/:repo/:number/diff', async (req, res) => {
  try {
    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured' });
    }

    const { owner, repo, number } = req.params;
    const diff = await getPullRequestDiff(owner, repo, parseInt(number), pat);
    res.json({ diff });
  } catch (error) {
    console.error('Error fetching PR diff:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /api/github/split — fetch diff, run splitter on PR
app.post('/api/github/split', async (req, res) => {
  try {
    const { owner, repo, number } = req.body;
    if (!owner || !repo || !number) {
      return res.status(400).json({ error: 'Missing required fields: owner, repo, number' });
    }

    const result = await performGitHubSplit(owner, repo, parseInt(number));

    res.json({
      success: true,
      message: `Split completed for PR #${number}`,
      commitDir: result.commitDir,
      commit_id: result.commitDir,
      pr: result.pr
    });
  } catch (error) {
    console.error('Error splitting GitHub PR:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/github/review — fetch diff, run reviewer on PR
app.post('/api/github/review', async (req, res) => {
  try {
    const { owner, repo, number } = req.body;
    if (!owner || !repo || !number) {
      return res.status(400).json({ error: 'Missing required fields: owner, repo, number' });
    }

    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured' });
    }

    // Fetch PR diff
    const diffContent = await getPullRequestDiff(owner, repo, parseInt(number), pat);
    const prDetails = await getPullRequest(owner, repo, parseInt(number), pat);

    if (!diffContent || diffContent.trim().length === 0) {
      return res.status(400).json({ error: 'PR has no diff content' });
    }

    // Write diff to temp file
    const outputPath = argv.output;
    const tempDir = path.join(outputPath, 'temp');
    await fs.ensureDir(tempDir);

    const timestamp = Date.now();
    const tempPatchFile = path.join(tempDir, `review_pr_${owner}_${repo}_${number}_${timestamp}.patch`);
    await fs.writeFile(tempPatchFile, diffContent, 'utf8');

    // Spawn the reviewer
    const reviewerPath = process.env.CODE_REVIEWER_PATH || path.join(__dirname, '../../code_reviewer/code-reviewer');
    const appConfigPath = process.env.CODE_REVIEWER_APP_CONFIG || path.join(__dirname, '../../code_reviewer/configs/app.yaml');

    const reviewArgs = [
      '--patch', tempPatchFile,
      '--source-config', SOURCE_CONFIG_PATH,
      '--app-config', appConfigPath,
      '--output-dir', path.join(outputPath, 'reviews')
    ];

    // Add LLM configuration
    const apiKey = process.env.ARMCHAIR_MODEL_API_KEY;
    if (apiKey) {
      reviewArgs.push('--api-key', apiKey);
    }
    const apiBase = process.env.ARMCHAIR_MODEL_API_BASE_URL;
    if (apiBase) {
      reviewArgs.push('--api-base', apiBase);
    }
    const modelName = process.env.ARMCHAIR_MODEL_NAME;
    if (modelName) {
      reviewArgs.push('--model', modelName);
    }

    console.log(`GitHub Review: Running reviewer for PR #${number} from ${owner}/${repo}`);

    const reviewPromise = new Promise((resolve, reject) => {
      const reviewProcess = spawn(reviewerPath, reviewArgs, {
        env: process.env,
        shell: false
      });

      let stdout = '';
      let stderr = '';

      reviewProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      reviewProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      reviewProcess.on('close', async (code) => {
        try { await fs.remove(tempPatchFile); } catch (e) { /* ignore */ }
        if (code !== 0) {
          reject(new Error(`Reviewer failed: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });

      reviewProcess.on('error', (err) => {
        reject(new Error(`Failed to start reviewer: ${err.message}`));
      });
    });

    await reviewPromise;

    res.json({
      success: true,
      message: `Review completed for PR #${number}`,
      pr: prDetails
    });
  } catch (error) {
    console.error('Error reviewing GitHub PR:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/github/analyze-url — parse PR URL and split
app.post('/api/github/analyze-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Missing required field: url' });
    }

    const parsed = parsePrUrl(url);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/123' });
    }

    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured. Add it in Settings > GitHub Integration.' });
    }

    const result = await performGitHubSplit(parsed.owner, parsed.repo, parsed.number);

    res.json({
      success: true,
      message: `Split completed for PR #${parsed.number}`,
      commitDir: result.commitDir,
      commit_id: result.commitDir,
      pr: result.pr,
      parsed
    });
  } catch (error) {
    console.error('Error analyzing GitHub PR URL:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/github/pulls/:owner/:repo/:number/comment — post analysis comment
app.post('/api/github/pulls/:owner/:repo/:number/comment', async (req, res) => {
  try {
    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured' });
    }

    const { owner, repo, number } = req.params;
    const { splitId, includeDescriptions = true, includeReviewTips = true } = req.body;

    if (!splitId) {
      return res.status(400).json({ error: 'Missing required field: splitId' });
    }

    // Find and read the split metadata
    const outputPath = argv.output;
    const splitDir = path.join(outputPath, splitId);

    if (!await fs.pathExists(splitDir)) {
      return res.status(404).json({ error: `Split directory not found: ${splitId}` });
    }

    const files = await fs.readdir(splitDir);
    const metadataFiles = files.filter(f => f.startsWith('metadata_') && f.endsWith('.json'));

    if (metadataFiles.length === 0) {
      return res.status(404).json({ error: 'No metadata found in split directory' });
    }

    const metadata = await fs.readJson(path.join(splitDir, metadataFiles[0]));

    // Format the comment
    const commentBody = formatPrComment(metadata, { includeDescriptions, includeReviewTips });

    // Post or update the comment
    const result = await postOrUpdatePrComment(owner, repo, parseInt(number), commentBody, pat);

    res.json({
      success: true,
      comment: result,
      message: result.updated ? 'Comment updated on PR' : 'Comment posted to PR'
    });
  } catch (error) {
    console.error('Error posting PR comment:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// POST /api/github/pulls/:owner/:repo/:number/restack — restack PR with split patches
app.post('/api/github/pulls/:owner/:repo/:number/restack', async (req, res) => {
  try {
    const pat = armchairConfig.GITHUB_PAT;
    if (!pat) {
      return res.status(400).json({ error: 'GitHub PAT not configured' });
    }

    const { owner, repo, number } = req.params;
    const prNumber = parseInt(number);
    const { splitId, postComment = false } = req.body;

    if (!splitId) {
      return res.status(400).json({ error: 'Missing required field: splitId' });
    }

    // Check push access
    const hasPush = await checkPushAccess(owner, repo, pat);
    if (!hasPush) {
      return res.status(403).json({ error: 'No push access to this repository. You need write permissions to restack.' });
    }

    // Get PR details
    const prDetails = await getPullRequest(owner, repo, prNumber, pat);

    // Read split metadata and patch files
    const outputPath = argv.output;
    const splitDir = path.join(outputPath, splitId);

    if (!await fs.pathExists(splitDir)) {
      return res.status(404).json({ error: `Split directory not found: ${splitId}` });
    }

    const splitFiles = await fs.readdir(splitDir);
    const metadataFiles = splitFiles.filter(f => f.startsWith('metadata_') && f.endsWith('.json'));

    if (metadataFiles.length === 0) {
      return res.status(404).json({ error: 'No metadata found in split directory' });
    }

    const metadata = await fs.readJson(path.join(splitDir, metadataFiles[0]));
    const patches = metadata.patches || [];

    if (patches.length === 0) {
      return res.status(400).json({ error: 'No patches found in split' });
    }

    // Get ordered patch files
    const patchFiles = patches
      .sort((a, b) => a.id - b.id)
      .map(p => ({
        filename: p.filename,
        name: p.name,
        description: p.description,
        path: path.join(splitDir, p.filename)
      }))
      .filter(p => fs.existsSync(p.path));

    if (patchFiles.length === 0) {
      return res.status(400).json({ error: 'No patch files found on disk' });
    }

    // Get merge base
    const mergeBase = await getPrMergeBase(owner, repo, prDetails.base_branch, prDetails.head_branch, pat);
    if (!mergeBase) {
      return res.status(500).json({ error: 'Could not determine merge base for this PR' });
    }

    // Clone the repository to a temp directory
    const tempCloneDir = path.join('/tmp', `armchair-restack-${Date.now()}`);
    const cloneUrl = `https://x-access-token:${pat}@github.com/${owner}/${repo}.git`;

    console.log(`Restack: Cloning ${owner}/${repo} to ${tempCloneDir}`);

    try {
      // Clone
      await new Promise((resolve, reject) => {
        const cloneProcess = spawn('git', ['clone', '--no-checkout', cloneUrl, tempCloneDir], { shell: false });
        let stderr = '';
        cloneProcess.stderr.on('data', (data) => { stderr += data.toString(); });
        cloneProcess.on('close', (code) => {
          if (code !== 0) reject(new Error(`Clone failed: ${stderr}`));
          else resolve();
        });
        cloneProcess.on('error', (err) => reject(err));
      });

      // Configure git identity
      await execGitCommand(['config', 'user.email', 'armchair@localhost'], tempCloneDir);
      await execGitCommand(['config', 'user.name', 'Armchair'], tempCloneDir);

      // Checkout merge base
      await execGitCommand(['checkout', mergeBase], tempCloneDir);

      // Create backup branch
      const backupBranch = `${prDetails.head_branch}-pre-restack`;
      await execGitCommand(['fetch', 'origin', prDetails.head_branch], tempCloneDir);
      await execGitCommand(['push', 'origin', `origin/${prDetails.head_branch}:refs/heads/${backupBranch}`], tempCloneDir);
      console.log(`Restack: Created backup branch: ${backupBranch}`);

      // Apply each patch
      const newCommits = [];
      for (const pf of patchFiles) {
        const applyResult = await execGitCommand(['apply', '--check', pf.path], tempCloneDir);
        if (applyResult === null) {
          return res.status(400).json({
            error: `Patch apply failed: ${pf.name}`,
            details: `The patch "${pf.filename}" could not be applied cleanly. Restack aborted. Backup branch: ${backupBranch}`,
            backupBranch
          });
        }

        await execGitCommand(['apply', pf.path], tempCloneDir);
        await execGitCommand(['add', '-A'], tempCloneDir);

        const commitMsg = `${pf.name}\n\n${pf.description || ''}`.trim();
        await execGitCommand(['commit', '-m', commitMsg], tempCloneDir);

        const commitHash = await execGitCommand(['rev-parse', 'HEAD'], tempCloneDir);
        newCommits.push({
          hash: commitHash?.trim(),
          message: pf.name,
          patchFile: pf.filename
        });

        console.log(`Restack: Applied and committed: ${pf.name}`);
      }

      // Force push to the head branch
      await new Promise((resolve, reject) => {
        const pushProcess = spawn('git', ['push', '--force', 'origin', `HEAD:refs/heads/${prDetails.head_branch}`], {
          cwd: tempCloneDir,
          shell: false
        });
        let stderr = '';
        pushProcess.stderr.on('data', (data) => { stderr += data.toString(); });
        pushProcess.on('close', (code) => {
          if (code !== 0) reject(new Error(`Force push failed: ${stderr}`));
          else resolve();
        });
        pushProcess.on('error', (err) => reject(err));
      });

      console.log(`Restack: Force pushed to ${prDetails.head_branch}`);

      // Optionally post comment
      let commentResult = null;
      if (postComment) {
        try {
          const commentBody = formatPrComment(metadata, { includeDescriptions: true, includeReviewTips: true });
          commentResult = await postOrUpdatePrComment(owner, repo, prNumber, commentBody, pat);
        } catch (commentErr) {
          console.error(`Restack: Failed to post comment: ${commentErr.message}`);
        }
      }

      res.json({
        success: true,
        backupBranch,
        commits: newCommits,
        commentResult
      });
    } finally {
      // Clean up temp directory
      try {
        await fs.remove(tempCloneDir);
        console.log(`Restack: Cleaned up temp dir: ${tempCloneDir}`);
      } catch (e) {
        console.error(`Restack: Failed to clean up: ${e.message}`);
      }
    }
  } catch (error) {
    console.error('Error restacking PR:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Initialize cache and start server
async function startServer() {
  // Enable MCP server if --mcp flag is set
  if (argv.mcp) {
    console.log('[MCP] Initializing MCP server at /mcp...');
    const mcpServer = new ArmchairMCPServer(SOURCE_CONFIG_PATH, argv.output, config);
    await mcpServer.loadConfig();

    // Mount MCP server at /mcp path
    app.use('/mcp', mcpServer.getExpressHandler());
    console.log('[MCP] MCP server enabled at /mcp');
  }

  // Set up periodic cache refresh (only if cache is enabled)
  if (argv.enableCache) {
    setInterval(async () => {
      console.log('Refreshing repository cache...');
      await buildRepositoryCache();
    }, CACHE_REFRESH_INTERVAL_MS);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Config loaded: ${Object.keys(config).length} keys found`);
    console.log(`Repository cache: ${argv.enableCache ? 'ENABLED' : 'DISABLED'}`);
    if (argv.enableCache) {
      console.log(`Cache refresh interval: ${CACHE_REFRESH_INTERVAL_MS / 1000}s`);
    }
    if (argv.mcp) {
      console.log(`MCP server: ENABLED at http://localhost:${PORT}/mcp`);
    }
  });

  // Only load/build cache if enabled
  if (argv.enableCache) {
    // Try to load existing cache
    const cacheLoaded = await loadCacheFromFile();

    if (!cacheLoaded) {
      // Build cache for the first time
      await buildRepositoryCache();
    }
  } else {
    console.log('Cache is disabled. All requests will fetch live data from git repositories.');
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
