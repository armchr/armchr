import fs from 'fs-extra';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Execute a git command safely using execFile to prevent command injection
 * @param {string[]} args - Git command arguments (e.g., ['status', '--porcelain'])
 * @param {string} cwd - Working directory
 * @returns {Promise<string|null>} - Command output or null on error
 */
async function execGitCommand(args, cwd) {
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

/**
 * Perform code review on uncommitted changes in a directory
 * @param {Object} options - Review options
 * @param {string} options.repoPath - Path to the repository
 * @param {string} options.repoName - Name of the repository
 * @param {string} [options.description] - Optional description for the review
 * @param {string} options.outputPath - Path to output directory
 * @param {string} options.sourceConfigPath - Path to source config file
 * @param {string} [options.reviewerPath] - Path to code reviewer binary
 * @param {string} [options.appConfigPath] - Path to app config file
 * @returns {Promise<Object>} Review result with markdown and metadata
 */
async function performCodeReview(options) {
  const {
    repoPath,
    repoName,
    description = null,
    outputPath,
    sourceConfigPath,
    reviewerPath = process.env.CODE_REVIEWER_PATH || path.join(__dirname, '../../code_reviewer/code-reviewer'),
    appConfigPath = process.env.CODE_REVIEWER_APP_CONFIG || path.join(__dirname, '../../code_reviewer/configs/app.yaml')
  } = options;

  // Validate that the path exists
  if (!await fs.pathExists(repoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  // Get working directory diff (uncommitted changes)
  const diff = await execGitCommand(['diff', 'HEAD'], repoPath);

  if (diff === null || !diff.trim()) {
    throw new Error('No uncommitted changes found or failed to get working directory diff');
  }

  // Write patch content to a temporary file
  const tempDir = path.join(outputPath, 'temp');
  await fs.ensureDir(tempDir);

  const tempPatchFile = path.join(tempDir, `review_patch_${Date.now()}.patch`);
  await fs.writeFile(tempPatchFile, diff, 'utf8');

  // Create reviews directory and output file for review results
  const reviewsDir = path.join(outputPath, 'reviews');
  await fs.ensureDir(reviewsDir);
  const tempOutputFile = path.join(reviewsDir, `review_output_${Date.now()}.json`);

  // Construct the code reviewer command
  const commandArgs = [
    '-patch', tempPatchFile,
    '-repo', repoName,
    '-source-config', sourceConfigPath,
    '-app-config', appConfigPath,
    '-output', tempOutputFile
  ];

  console.log(`Running code reviewer for ${repoName}`);
  console.log(`Command: ${reviewerPath} ${commandArgs.join(' ')}`);

  // Execute the code reviewer as a promise
  const reviewResult = await new Promise((resolve, reject) => {
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
                  branch: null,
                  commit: null,
                  is_uncommitted: true,
                  path: repoPath
                },
                generatedAt: new Date().toISOString(),
                timestamp: Math.floor(Date.now() / 1000)
              };

              if (description) {
                metadata.description = description;
              }

              // Get current branch
              try {
                const currentBranch = await execGitCommand(['branch', '--show-current'], repoPath);
                if (currentBranch) {
                  metadata.repository.branch = currentBranch.trim();
                }
              } catch (err) {
                console.error('Error fetching current branch:', err.message);
              }

              // Get list of files from the diff
              try {
                const fileListOutput = await execGitCommand(['diff', '--name-only', 'HEAD'], repoPath);

                if (fileListOutput) {
                  const files = fileListOutput.trim().split('\n').filter(f => f.length > 0);
                  metadata.files = files;
                  metadata.file_count = files.length;
                }
              } catch (err) {
                console.error('Error fetching file list:', err.message);
              }

              // Merge metadata into review data
              reviewData = { ...reviewData, ...metadata };

              // Write the enriched data back to the file
              await fs.writeJson(tempOutputFile, reviewData, { spaces: 2 });
              console.log(`Enriched review data saved to: ${tempOutputFile}`);
            } catch (metadataErr) {
              console.error('Error enriching metadata:', metadataErr.message);
              // Continue even if metadata enrichment fails
            }
          }
        } catch (readErr) {
          console.error('Error reading review output:', readErr.message);
          reject(new Error(`Error reading review output: ${readErr.message}`));
          return;
        }

        resolve({
          success: true,
          reviewData,
          stdout,
          stderr,
          outputFile: tempOutputFile,
          ...(isDevMode && { tempPatchFile })
        });
      } else {
        console.error(`Code reviewer exited with code ${code}`);
        reject(new Error(`Code reviewer failed with exit code ${code}: ${stderr}`));
      }
    });

    reviewerProcess.on('error', (err) => {
      console.error('Failed to start code reviewer process:', err);
      reject(new Error(`Failed to start code reviewer process: ${err.message}`));
    });
  });

  return reviewResult;
}

export { performCodeReview, execGitCommand };
