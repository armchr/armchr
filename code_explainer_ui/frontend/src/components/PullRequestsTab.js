import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  GitHub as GitHubIcon,
  CallSplit as CallSplitIcon,
  RateReview as RateReviewIcon,
  Search as SearchIcon,
  Link as LinkIcon,
  ArrowForward as ArrowForwardIcon,
  Schedule as ScheduleIcon,
  Code as CodeIcon,
  Description as DescriptionIcon,
  MergeType as MergeTypeIcon,
  PersonOutline as PersonIcon,
  Clear as ClearIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import { fetchGitHubPulls, splitGitHubPr, reviewGitHubPr, analyzeGitHubPrUrl } from '../services/api';
import { colors } from '../App';
import { FEATURE_REVIEW_ENABLED } from '../featureFlags';

const PullRequestsTab = ({ githubConnected, githubRepos, commits, onSplitComplete, onOpenSettings }) => {
  const navigate = useNavigate();
  const [pullRequests, setPullRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [repoFilter, setRepoFilter] = useState('');
  const [splittingPr, setSplittingPr] = useState(null); // PR number currently being split
  const [reviewingPr, setReviewingPr] = useState(null);

  // URL paste bar state
  const [prUrl, setPrUrl] = useState('');
  const [urlAnalyzing, setUrlAnalyzing] = useState(false);
  const [urlError, setUrlError] = useState(null);

  // Build a lookup: "owner/repo/number" -> array of matching splits (most recent first)
  const prSplitsMap = useMemo(() => {
    const map = {};
    if (!commits) return map;
    for (const commit of commits) {
      const pr = commit.metadata?.pr;
      if (!pr) continue;
      const key = `${pr.owner}/${pr.repo}/${pr.number}`;
      if (!map[key]) map[key] = [];
      map[key].push(commit);
    }
    // Sort each list by generatedAt descending (most recent first)
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (b.metadata?.generatedAt || 0) - (a.metadata?.generatedAt || 0));
    }
    return map;
  }, [commits]);

  // Load PRs on mount and when filters change
  useEffect(() => {
    if (!githubConnected) return;

    const loadPulls = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchGitHubPulls(repoFilter || null);
        setPullRequests(data.pulls || []);
        if (data.errors && data.errors.length > 0) {
          setError(`Some repos had errors: ${data.errors.join('; ')}`);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadPulls();
  }, [githubConnected, repoFilter]);

  // Filter PRs by search query
  const filteredPRs = useMemo(() => {
    if (!searchQuery) return pullRequests;
    const query = searchQuery.toLowerCase();
    return pullRequests.filter(pr =>
      pr.title.toLowerCase().includes(query) ||
      pr.author.toLowerCase().includes(query) ||
      String(pr.number).includes(query)
    );
  }, [pullRequests, searchQuery]);

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleSplit = async (pr) => {
    setSplittingPr(pr.number);
    try {
      const result = await splitGitHubPr(pr.owner, pr.repo, pr.number);
      if (onSplitComplete && result.commitDir) {
        onSplitComplete(result.commitDir);
      }
    } catch (err) {
      setError(`Failed to split PR #${pr.number}: ${err.message}`);
    } finally {
      setSplittingPr(null);
    }
  };

  const handleReview = async (pr) => {
    setReviewingPr(pr.number);
    try {
      await reviewGitHubPr(pr.owner, pr.repo, pr.number);
    } catch (err) {
      setError(`Failed to review PR #${pr.number}: ${err.message}`);
    } finally {
      setReviewingPr(null);
    }
  };

  const handleAnalyzeUrl = async () => {
    if (!prUrl.trim()) return;

    // Client-side URL validation
    const prUrlPattern = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
    if (!prUrlPattern.test(prUrl.trim())) {
      setUrlError('Invalid URL. Expected: https://github.com/owner/repo/pull/123');
      return;
    }

    setUrlAnalyzing(true);
    setUrlError(null);
    try {
      const result = await analyzeGitHubPrUrl(prUrl.trim());
      if (onSplitComplete && result.commitDir) {
        onSplitComplete(result.commitDir);
      }
      setPrUrl('');
    } catch (err) {
      setUrlError(err.message);
    } finally {
      setUrlAnalyzing(false);
    }
  };

  const handleViewSplit = (commit) => {
    const firstPatch = commit.metadata?.patches?.[0];
    const patchId = firstPatch ? firstPatch.id : 0;
    navigate(`/patch/${commit.commitId}/${patchId}`);
  };

  // Not connected state
  if (!githubConnected) {
    return (
      <Card sx={{ p: 4, backgroundColor: 'rgba(99, 102, 241, 0.04)', border: `1px solid ${colors.primary.light}` }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <GitHubIcon sx={{ fontSize: 48, color: colors.text.muted, mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            GitHub Integration
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Connect your GitHub account to browse and split pull requests directly from the dashboard.
          </Typography>
          <Button
            variant="contained"
            onClick={onOpenSettings}
            startIcon={<GitHubIcon />}
          >
            Configure GitHub in Settings
          </Button>
        </Box>
      </Card>
    );
  }

  return (
    <Box>
      {/* URL Paste Bar */}
      <Card sx={{ mb: 3, p: 2, border: `1px solid ${colors.border.light}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LinkIcon sx={{ color: colors.text.muted }} />
          <TextField
            fullWidth
            size="small"
            placeholder="Paste a GitHub PR URL to analyze (e.g., https://github.com/owner/repo/pull/123)"
            value={prUrl}
            onChange={(e) => { setPrUrl(e.target.value); setUrlError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyzeUrl(); }}
            disabled={urlAnalyzing}
            error={!!urlError}
            helperText={urlError}
            InputProps={{
              endAdornment: prUrl && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => { setPrUrl(''); setUrlError(null); }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <Button
            variant="contained"
            onClick={handleAnalyzeUrl}
            disabled={!prUrl.trim() || urlAnalyzing}
            startIcon={urlAnalyzing ? <CircularProgress size={16} /> : <CallSplitIcon />}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {urlAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </Box>
        {urlAnalyzing && <LinearProgress sx={{ mt: 1 }} />}
      </Card>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField
          size="small"
          placeholder="Search PRs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: colors.text.muted }} />
              </InputAdornment>
            )
          }}
          sx={{ flexGrow: 1 }}
        />
        {githubRepos && githubRepos.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Repository</InputLabel>
            <Select
              value={repoFilter}
              label="Repository"
              onChange={(e) => setRepoFilter(e.target.value)}
            >
              <MenuItem value="">All Repositories</MenuItem>
              {githubRepos.map(repo => (
                <MenuItem key={repo} value={repo}>{repo}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Loading pull requests...
          </Typography>
        </Box>
      )}

      {/* Empty state */}
      {!loading && filteredPRs.length === 0 && !error && (
        <Card sx={{ p: 4, textAlign: 'center', border: `1px solid ${colors.border.light}` }}>
          <GitHubIcon sx={{ fontSize: 40, color: colors.text.muted, mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {searchQuery ? 'No PRs match your search' : 'No open pull requests'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {searchQuery
              ? 'Try a different search query.'
              : 'Your connected repositories have no open PRs, or you can paste a PR URL above.'}
          </Typography>
        </Card>
      )}

      {/* PR Cards */}
      {!loading && filteredPRs.length > 0 && (
        <Grid container spacing={2}>
          {filteredPRs.map(pr => {
            const prKey = `${pr.owner}/${pr.repo}/${pr.number}`;
            const existingSplits = prSplitsMap[prKey] || [];
            const latestSplit = existingSplits[0] || null;

            return (
              <Grid item xs={12} key={prKey}>
                <Card
                  sx={{
                    border: `1px solid ${colors.border.light}`,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: colors.primary.main,
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)'
                    }
                  }}
                >
                  <CardContent sx={{ pb: '16px !important' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      {/* Left: PR info */}
                      <Box sx={{ flexGrow: 1, mr: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <MergeTypeIcon sx={{ mr: 1, color: pr.draft ? colors.text.muted : '#238636', fontSize: 22 }} />
                          <Typography variant="h6" sx={{ fontWeight: 600, mr: 1 }}>
                            {pr.title}
                          </Typography>
                          <Chip
                            label={`#${pr.number}`}
                            size="small"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              height: 22,
                              backgroundColor: 'rgba(99, 102, 241, 0.1)',
                              color: colors.primary.dark
                            }}
                          />
                          {pr.draft && (
                            <Chip label="Draft" size="small" sx={{ ml: 1, height: 22 }} color="default" />
                          )}
                        </Box>

                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, ml: 4, mb: 1 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CodeIcon sx={{ fontSize: 16 }} />
                            {pr.owner}/{pr.repo}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PersonIcon sx={{ fontSize: 16 }} />
                            {pr.author}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ScheduleIcon sx={{ fontSize: 16 }} />
                            {formatRelativeTime(pr.updated_at)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {pr.head_branch} → {pr.base_branch}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1.5, ml: 4, alignItems: 'center' }}>
                          {pr.commits > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {pr.commits} commit{pr.commits !== 1 ? 's' : ''}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            <DescriptionIcon sx={{ fontSize: 14, mr: 0.3, verticalAlign: 'middle' }} />
                            {pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#238636' }}>
                            +{pr.additions}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#da3633' }}>
                            -{pr.deletions}
                          </Typography>
                          {pr.labels && pr.labels.length > 0 && pr.labels.map(label => (
                            <Chip
                              key={label.name}
                              label={label.name}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.65rem',
                                backgroundColor: `#${label.color}20`,
                                color: `#${label.color}`,
                                border: `1px solid #${label.color}40`
                              }}
                            />
                          ))}
                        </Box>

                        {/* Existing splits indicator */}
                        {latestSplit && (
                          <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            ml: 4,
                            mt: 1,
                            p: 0.75,
                            px: 1.5,
                            backgroundColor: 'rgba(99, 102, 241, 0.06)',
                            borderRadius: 1,
                            border: `1px solid ${colors.border.light}`,
                            width: 'fit-content'
                          }}>
                            <CallSplitIcon sx={{ fontSize: 16, color: colors.primary.main }} />
                            <Typography variant="caption" sx={{ color: colors.primary.dark, fontWeight: 500 }}>
                              {existingSplits.length === 1
                                ? `Split into ${latestSplit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0} patches`
                                : `${existingSplits.length} splits (latest: ${latestSplit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0} patches)`
                              }
                            </Typography>
                            <Button
                              size="small"
                              startIcon={<VisibilityIcon sx={{ fontSize: 14 }} />}
                              onClick={() => handleViewSplit(latestSplit)}
                              sx={{
                                textTransform: 'none',
                                fontSize: '0.75rem',
                                py: 0,
                                px: 1,
                                minHeight: 24,
                                color: colors.primary.main,
                              }}
                            >
                              View
                            </Button>
                          </Box>
                        )}
                      </Box>

                      {/* Right: Action buttons */}
                      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                        <Tooltip title={latestSplit ? 'Re-split this PR' : 'Split this PR into logical patches'}>
                          <span>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={splittingPr === pr.number ? <CircularProgress size={16} /> : <CallSplitIcon />}
                              onClick={() => handleSplit(pr)}
                              disabled={splittingPr !== null || reviewingPr !== null}
                              sx={{ textTransform: 'none' }}
                            >
                              {splittingPr === pr.number ? 'Splitting...' : latestSplit ? 'Re-split' : 'Split'}
                            </Button>
                          </span>
                        </Tooltip>
                        {FEATURE_REVIEW_ENABLED && (
                          <Tooltip title="Review this PR">
                            <span>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={reviewingPr === pr.number ? <CircularProgress size={16} /> : <RateReviewIcon />}
                                onClick={() => handleReview(pr)}
                                disabled={splittingPr !== null || reviewingPr !== null}
                                sx={{ textTransform: 'none' }}
                              >
                                {reviewingPr === pr.number ? 'Reviewing...' : 'Review'}
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                        <Tooltip title="View on GitHub">
                          <IconButton
                            size="small"
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: colors.text.secondary }}
                          >
                            <ArrowForwardIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  </CardContent>
                  {(splittingPr === pr.number || reviewingPr === pr.number) && (
                    <LinearProgress />
                  )}
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default PullRequestsTab;
