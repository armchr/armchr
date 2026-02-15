/**
 * Data provider abstraction layer.
 * In static mode (window.__ARMCHAIR_STATIC_DATA__), reads from bundled data.
 * In normal mode, delegates to api.js.
 */

import * as api from './api';

export const isStaticMode = () => !!window.__ARMCHAIR_STATIC_DATA__;

const getStaticData = () => window.__ARMCHAIR_STATIC_DATA__;

// ====== Data reading functions ======

export const fetchCommits = async () => {
  if (isStaticMode()) {
    const data = getStaticData();
    const commits = data.commits || [];
    const totalPatches = commits.reduce((sum, c) => {
      const active = c.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0;
      return sum + active;
    }, 0);
    return {
      success: true,
      commits,
      total: commits.length,
      stats: { total: commits.length, totalPatches }
    };
  }
  return api.fetchCommits();
};

export const fetchPatchContent = async (commitId, patchFilename) => {
  if (isStaticMode()) {
    const data = getStaticData();
    const key = `${commitId}/${patchFilename}`;
    const content = data.patches?.[key];
    if (content !== undefined) {
      return { content };
    }
    throw new Error(`Patch not found in static data: ${key}`);
  }
  return api.fetchPatchContent(commitId, patchFilename);
};

export const fetchHealth = async () => {
  if (isStaticMode()) {
    return {
      status: 'ok',
      llmEnabled: false,
      modelName: null,
      modelApiBaseUrl: null
    };
  }
  return api.fetchHealth();
};

export const fetchConfig = async () => {
  if (isStaticMode()) {
    return {
      success: true,
      configFileExists: true,
      repositories: [],
      rootDir: '/'
    };
  }
  return api.fetchConfig();
};

export const fetchReviews = async () => {
  if (isStaticMode()) {
    return { success: true, reviews: [] };
  }
  return api.fetchReviews();
};

export const fetchReviewById = async (reviewId) => {
  if (isStaticMode()) {
    throw new Error('Reviews not available in static mode');
  }
  return api.fetchReviewById(reviewId);
};

export const fetchGitHubStatus = async () => {
  if (isStaticMode()) {
    return { connected: false, repos: [] };
  }
  return api.fetchGitHubStatus();
};

export const fetchRepositories = async () => {
  if (isStaticMode()) {
    return { repositories: [] };
  }
  return api.fetchRepositories();
};

// ====== Write/action functions — pass through to api.js ======
// Not available in static mode, but re-exported so callers
// can import everything from one module.

export const deleteCommit = api.deleteCommit;
export const splitCommit = api.splitCommit;
export const applyPatch = api.applyPatch;
export const reviewCommit = api.reviewCommit;
export const archiveReview = api.archiveReview;
export const updateConfig = api.updateConfig;
export const fetchRepositoryDetails = api.fetchRepositoryDetails;
export const fetchBranchCommits = api.fetchBranchCommits;
export const fetchCommitDiff = api.fetchCommitDiff;
export const fetchWorkingDirectoryDiff = api.fetchWorkingDirectoryDiff;
export const refreshRepository = api.refreshRepository;
export const postPrComment = api.postPrComment;
export const restackPr = api.restackPr;
export const fetchGitHubPrDetails = api.fetchGitHubPrDetails;
export const fetchGitHubPulls = api.fetchGitHubPulls;
export const fetchGitHubPrDiff = api.fetchGitHubPrDiff;
export const splitGitHubPr = api.splitGitHubPr;
export const reviewGitHubPr = api.reviewGitHubPr;
export const analyzeGitHubPrUrl = api.analyzeGitHubPrUrl;
export const validateGitHubPat = api.validateGitHubPat;
