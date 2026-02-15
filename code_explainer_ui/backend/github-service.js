/**
 * GitHub API service module for Armchair.
 * Provides authenticated GitHub API access, PR operations, and utility functions.
 */

/**
 * Authenticated fetch wrapper for the GitHub API.
 * @param {string} endpoint - API endpoint (e.g., '/repos/owner/repo/pulls')
 * @param {string} pat - GitHub Personal Access Token
 * @param {object} options - Additional fetch options
 * @returns {Promise<object|string>} Parsed JSON or raw text depending on Accept header
 */
export async function githubApiFetch(endpoint, pat, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://api.github.com${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    let errorMessage = `GitHub API error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorBody);
      if (errorJson.message) {
        errorMessage = `GitHub API error: ${errorJson.message}`;
      }
    } catch {
      // Use default error message
    }
    const err = new Error(errorMessage);
    err.status = response.status;
    err.body = errorBody;
    throw err;
  }

  // If the Accept header requests diff format, return raw text
  const acceptHeader = headers['Accept'] || '';
  if (acceptHeader.includes('application/vnd.github.diff')) {
    return response.text();
  }

  return response.json();
}

/**
 * Validate a GitHub Personal Access Token by calling /user.
 * @param {string} pat - GitHub Personal Access Token
 * @returns {Promise<object>} User info { login, name, avatar_url, scopes }
 */
export async function validatePat(pat) {
  if (!pat) {
    throw new Error('No GitHub PAT provided');
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid or expired GitHub token');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const user = await response.json();
  const scopes = response.headers.get('x-oauth-scopes') || '';

  return {
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    scopes: scopes.split(',').map(s => s.trim()).filter(Boolean)
  };
}

/**
 * List open pull requests for a repository.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} pat - GitHub Personal Access Token
 * @param {object} params - Optional query parameters (state, sort, direction, per_page, page)
 * @returns {Promise<Array>} Array of PR objects
 */
export async function listPullRequests(owner, repo, pat, params = {}) {
  const queryParams = new URLSearchParams({
    state: params.state || 'open',
    sort: params.sort || 'updated',
    direction: params.direction || 'desc',
    per_page: String(params.per_page || 30),
    page: String(params.page || 1)
  });

  const prs = await githubApiFetch(
    `/repos/${owner}/${repo}/pulls?${queryParams}`,
    pat
  );

  // The list endpoint doesn't include additions/deletions/changed_files,
  // so fetch each PR's details in parallel to get those stats.
  const enriched = await Promise.all(prs.map(async (pr) => {
    let additions = 0, deletions = 0, changed_files = 0, commits = 0;
    try {
      const detail = await githubApiFetch(
        `/repos/${owner}/${repo}/pulls/${pr.number}`,
        pat
      );
      additions = detail.additions || 0;
      deletions = detail.deletions || 0;
      changed_files = detail.changed_files || 0;
      commits = detail.commits || 0;
    } catch (_) {
      // If detail fetch fails, leave stats at 0
    }

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      author: pr.user?.login || 'unknown',
      author_avatar: pr.user?.avatar_url || null,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      base_branch: pr.base?.ref || null,
      head_branch: pr.head?.ref || null,
      head_sha: pr.head?.sha || null,
      draft: pr.draft || false,
      additions,
      deletions,
      changed_files,
      commits,
      labels: (pr.labels || []).map(l => ({ name: l.name, color: l.color })),
      mergeable: pr.mergeable,
      owner,
      repo
    };
  }));

  return enriched;
}

/**
 * Get details for a single pull request.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} number - PR number
 * @param {string} pat - GitHub Personal Access Token
 * @returns {Promise<object>} PR details
 */
export async function getPullRequest(owner, repo, number, pat) {
  const pr = await githubApiFetch(
    `/repos/${owner}/${repo}/pulls/${number}`,
    pat
  );

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    state: pr.state,
    url: pr.html_url,
    author: pr.user?.login || 'unknown',
    author_avatar: pr.user?.avatar_url || null,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    merged_at: pr.merged_at,
    base_branch: pr.base?.ref || null,
    base_sha: pr.base?.sha || null,
    head_branch: pr.head?.ref || null,
    head_sha: pr.head?.sha || null,
    draft: pr.draft || false,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changed_files: pr.changed_files || 0,
    commits: pr.commits || 0,
    labels: (pr.labels || []).map(l => ({ name: l.name, color: l.color })),
    mergeable: pr.mergeable,
    mergeable_state: pr.mergeable_state,
    owner,
    repo
  };
}

/**
 * Fetch the unified diff for a pull request.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} number - PR number
 * @param {string} pat - GitHub Personal Access Token
 * @returns {Promise<string>} Unified diff text
 */
export async function getPullRequestDiff(owner, repo, number, pat) {
  return githubApiFetch(
    `/repos/${owner}/${repo}/pulls/${number}`,
    pat,
    {
      headers: {
        'Accept': 'application/vnd.github.diff'
      }
    }
  );
}

/**
 * Detect GitHub remotes from a git repository.
 * @param {function} execGitCommand - Function to execute git commands
 * @param {string} repoPath - Path to the git repository
 * @returns {Promise<Array>} Array of { name, owner, repo, url } objects
 */
export async function detectGitHubRemotes(execGitCommand, repoPath) {
  const remoteOutput = await execGitCommand(['remote', '-v'], repoPath);
  if (!remoteOutput) return [];

  const remotes = [];
  const seen = new Set();
  const lines = remoteOutput.split('\n').filter(l => l.trim());

  for (const line of lines) {
    // Match patterns like:
    // origin  git@github.com:owner/repo.git (fetch)
    // origin  https://github.com/owner/repo.git (fetch)
    // origin  https://github.com/owner/repo (fetch)
    const match = line.match(
      /^(\S+)\s+(?:git@github\.com:|https?:\/\/github\.com\/)([^/]+)\/([^/\s.]+?)(?:\.git)?\s+\((?:fetch|push)\)/
    );
    if (match) {
      const key = `${match[2]}/${match[3]}`;
      if (!seen.has(key)) {
        seen.add(key);
        remotes.push({
          name: match[1],
          owner: match[2],
          repo: match[3],
          url: `https://github.com/${match[2]}/${match[3]}`
        });
      }
    }
  }

  return remotes;
}

/**
 * Parse a GitHub PR URL to extract owner, repo, and number.
 * @param {string} url - GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)
 * @returns {object|null} { owner, repo, number } or null if invalid
 */
export function parsePrUrl(url) {
  if (!url) return null;

  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
  );

  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10)
  };
}

/**
 * Format a PR comment with mental model and patch table as markdown.
 * @param {object} metadata - Split metadata
 * @param {object} options - { includeDescriptions, includeReviewTips }
 * @returns {string} Formatted markdown comment
 */
export function formatPrComment(metadata, options = {}) {
  const { includeDescriptions = true, includeReviewTips = true } = options;
  const patches = metadata.patches || [];
  const mentalModel = metadata.mental_model;

  let comment = '## Armchair Analysis\n\n';

  // Mental model section
  if (mentalModel) {
    if (mentalModel.summary) {
      comment += `**Overview:** ${mentalModel.summary}\n\n`;
    }

    if (mentalModel.progression && mentalModel.progression.length > 0) {
      comment += '**How patches progress:**\n';
      mentalModel.progression.forEach((step, idx) => {
        comment += `${idx + 1}. ${step}\n`;
      });
      comment += '\n';
    }

    if (mentalModel.key_concepts && mentalModel.key_concepts.length > 0) {
      comment += '**Key concepts:**\n';
      mentalModel.key_concepts.forEach(concept => {
        comment += `- ${concept}\n`;
      });
      comment += '\n';
    }

    if (includeReviewTips && mentalModel.review_tips) {
      comment += `> **Review Tips:** ${mentalModel.review_tips}\n\n`;
    }
  }

  // Patch table
  if (patches.length > 0) {
    comment += '### Patches\n\n';
    comment += '| # | Patch | Files | Category |\n';
    comment += '|---|-------|-------|----------|\n';

    patches.forEach((patch, idx) => {
      const fileCount = patch.files?.length || 0;
      const category = patch.category || '-';
      const name = patch.name || `Patch ${idx + 1}`;
      comment += `| ${idx + 1} | ${name} | ${fileCount} | ${category} |\n`;
    });
    comment += '\n';

    // Detailed descriptions
    if (includeDescriptions) {
      patches.forEach((patch, idx) => {
        if (patch.description) {
          const name = patch.name || `Patch ${idx + 1}`;
          comment += `<details>\n<summary><strong>${name}</strong></summary>\n\n`;
          comment += `${patch.description}\n\n`;
          if (patch.files && patch.files.length > 0) {
            comment += '**Files:**\n';
            patch.files.forEach(file => {
              comment += `- \`${file}\`\n`;
            });
          }
          comment += '\n</details>\n\n';
        }
      });
    }
  }

  comment += '---\n*Generated by [Armchair](https://github.com/armchr/armchr)*\n';

  return comment;
}

/**
 * Post or update an Armchair analysis comment on a PR.
 * Finds existing comment by "## Armchair Analysis" marker and updates it,
 * or creates a new one.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} number - PR number
 * @param {string} body - Comment body (markdown)
 * @param {string} pat - GitHub Personal Access Token
 * @returns {Promise<object>} { id, url, updated }
 */
export async function postOrUpdatePrComment(owner, repo, number, body, pat) {
  const marker = '## Armchair Analysis';

  // List existing comments and find one with our marker
  const comments = await githubApiFetch(
    `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
    pat
  );

  const existingComment = comments.find(c =>
    c.body && c.body.includes(marker)
  );

  if (existingComment) {
    // Update existing comment
    const updated = await githubApiFetch(
      `/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
      pat,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      }
    );
    return {
      id: updated.id,
      url: updated.html_url,
      updated: true
    };
  } else {
    // Create new comment
    const created = await githubApiFetch(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      pat,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      }
    );
    return {
      id: created.id,
      url: created.html_url,
      updated: false
    };
  }
}

/**
 * Check if the authenticated user has push access to a repository.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} pat - GitHub Personal Access Token
 * @returns {Promise<boolean>} True if user has push access
 */
export async function checkPushAccess(owner, repo, pat) {
  const repoData = await githubApiFetch(
    `/repos/${owner}/${repo}`,
    pat
  );
  return repoData.permissions?.push === true;
}

/**
 * Get the merge base SHA between two refs via the compare API.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} base - Base ref (e.g., 'main')
 * @param {string} head - Head ref (e.g., 'feature-branch')
 * @param {string} pat - GitHub Personal Access Token
 * @returns {Promise<string>} Merge base commit SHA
 */
export async function getPrMergeBase(owner, repo, base, head, pat) {
  const comparison = await githubApiFetch(
    `/repos/${owner}/${repo}/compare/${base}...${head}`,
    pat
  );
  return comparison.merge_base_commit?.sha;
}
