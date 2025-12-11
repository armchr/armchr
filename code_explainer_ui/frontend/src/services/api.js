const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8787/api';

export const fetchCommits = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/commits`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching commits:', error);
    throw error;
  }
};

export const fetchHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching health:', error);
    throw error;
  }
};

export const fetchPatchContent = async (commitId, patchFilename) => {
  try {
    const response = await fetch(`${API_BASE_URL}/patch/${commitId}/${patchFilename}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching patch content:', error);
    throw error;
  }
};

export const deleteCommit = async (commitId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/commits/${commitId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting commit:', error);
    throw error;
  }
};

export const fetchRepositories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/repositories`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching repositories:', error);
    throw error;
  }
};

export const fetchRepositoryDetails = async (repoName) => {
  try {
    const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repoName)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching repository details:', error);
    throw error;
  }
};

export const fetchBranchCommits = async (repoName, branchName, limit = 20, skip = 0) => {
  try {
    const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repoName)}/branches/${encodeURIComponent(branchName)}/commits?limit=${limit}&skip=${skip}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching branch commits:', error);
    throw error;
  }
};

export const fetchCommitDiff = async (repoName, commitHash) => {
  try {
    const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repoName)}/commits/${encodeURIComponent(commitHash)}/diff`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching commit diff:', error);
    throw error;
  }
};

export const fetchWorkingDirectoryDiff = async (repoName, branchName) => {
  try {
    const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repoName)}/branches/${encodeURIComponent(branchName)}/working-directory/diff`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching working directory diff:', error);
    throw error;
  }
};

export const splitCommit = async (repoName, branch, commitId = null, baseBranch = null, untracked = false, untrackedFiles = null) => {
  try {
    const body = {
      repoName,
      branch,
      ...(commitId && { commitId }),
      ...(baseBranch && { baseBranch }),
      ...(untracked && { untracked }),
      ...(untrackedFiles && { untrackedFiles })
    };

    const response = await fetch(`${API_BASE_URL}/split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      // Create a detailed error object with all available information
      const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
      error.details = errorData;
      throw error;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error splitting commit:', error);
    throw error;
  }
};

export const applyPatch = async (repoName, patchFile, branch = null, index = false, autoCommit = false) => {
  try {
    const body = {
      repoName,
      patchFile,
      ...(branch && { branch }),
      index,
      autoCommit
    };

    const response = await fetch(`${API_BASE_URL}/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error applying patch:', error);
    throw error;
  }
};

export const refreshRepository = async (repoName) => {
  try {
    const response = await fetch(`${API_BASE_URL}/repositories/${encodeURIComponent(repoName)}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error refreshing repository:', error);
    throw error;
  }
};

export const reviewCommit = async (repoName, branch = null, commitId = null, baseBranch = null, untracked = false, untrackedFiles = null) => {
  try {
    const body = {
      repoName,
      ...(branch && { branch }),
      ...(commitId && { commitId }),
      ...(baseBranch && { baseBranch }),
      ...(untracked && { untracked }),
      ...(untrackedFiles && untrackedFiles.length > 0 && { untrackedFiles })
    };

    const response = await fetch(`${API_BASE_URL}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error reviewing commit:', error);
    throw error;
  }
};

export const fetchReviews = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching reviews:', error);
    throw error;
  }
};

export const fetchReviewById = async (reviewId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${encodeURIComponent(reviewId)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching review:', error);
    throw error;
  }
};

export const archiveReview = async (reviewId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/reviews/${encodeURIComponent(reviewId)}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error archiving review:', error);
    throw error;
  }
};

export const fetchConfig = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/config`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching config:', error);
    throw error;
  }
};

export const updateConfig = async (config) => {
  try {
    const response = await fetch(`${API_BASE_URL}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config)
    });
    if (!response.ok) {
      const errorData = await response.json();
      // Create an error with additional details
      const error = new Error(errorData.error || `HTTP error! status: ${response.status}`);
      error.details = errorData.details || null;
      throw error;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating config:', error);
    throw error;
  }
};