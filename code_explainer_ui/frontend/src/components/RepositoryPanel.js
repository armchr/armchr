import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Tooltip,
  Badge,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  Card,
  Paper
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  AccountTree as BranchIcon,
  CheckCircle as CheckCircleIcon,
  Code as CodeIcon,
  Storage as StorageIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  Commit as CommitIcon,
  CallSplit as CallSplitIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  RateReview as RateReviewIcon,
  Info as InfoIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { Skeleton } from '@mui/material';
import { fetchBranchCommits, splitCommit, fetchRepositoryDetails, refreshRepository, reviewCommit } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { colors } from '../App';
import FilePath, { CommitHash } from './FilePath';

const RepositoryPanel = ({ repositories, loading, error, onReviewComplete, onSplitComplete, onOpenSettings }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState({});
  const [branchExpanded, setBranchExpanded] = useState({});
  const [branchCommits, setBranchCommits] = useState({});
  const [loadingCommits, setLoadingCommits] = useState({});
  const [loadingMoreCommits, setLoadingMoreCommits] = useState({});
  const [hasMoreCommits, setHasMoreCommits] = useState({});
  const [splittingCommit, setSplittingCommit] = useState({});
  const [splitSuccess, setSplitSuccess] = useState({});
  const [splitError, setSplitError] = useState(null);
  const [splitErrorDetails, setSplitErrorDetails] = useState(null);
  const [reviewingCommit, setReviewingCommit] = useState({});
  const [reviewSuccess, setReviewSuccess] = useState({});
  const [reviewError, setReviewError] = useState(null);
  const [untrackedDialog, setUntrackedDialog] = useState({
    open: false,
    repoName: null,
    branchName: null,
    untrackedFiles: [],
    action: 'split' // 'split' or 'review'
  });
  const [selectedUntrackedFiles, setSelectedUntrackedFiles] = useState([]);
  const [repoDetails, setRepoDetails] = useState({});
  const [loadingRepoDetails, setLoadingRepoDetails] = useState({});
  const [prefetchingDetails, setPrefetchingDetails] = useState({});
  const [cacheAge, setCacheAge] = useState(null);
  const [refreshingRepo, setRefreshingRepo] = useState({});

  // Handler for refreshing a repository
  const handleRefreshRepository = async (repoName, e) => {
    e.stopPropagation(); // Prevent accordion from toggling

    setRefreshingRepo(prev => ({ ...prev, [repoName]: true }));
    try {
      const result = await refreshRepository(repoName);

      if (result.success) {
        // Update the repo details with the refreshed data
        setRepoDetails(prev => ({
          ...prev,
          [repoName]: result.repository
        }));

        // Update cache age
        setCacheAge(0); // Just refreshed

        // If the repo is expanded, refresh the current branch
        if (expanded[repoName]) {
          await expandCurrentBranch(repoName, result.repository);
        }
      }
    } catch (err) {
      console.error('Error refreshing repository:', err);
      // For refresh errors, we can use a simple alert since it's less critical
      // Or we could add a separate error state if needed
      alert(`Failed to refresh repository: ${err.message}`);
    } finally {
      setRefreshingRepo(prev => ({ ...prev, [repoName]: false }));
    }
  };

  // Helper function to expand current branch and fetch commits
  const expandCurrentBranch = async (repoName, details) => {
    // If there's a current branch, expand it automatically
    const currentBranch = details.branches?.find(b => b.isCurrent);
    if (currentBranch) {
      const branchKey = `${repoName}:${currentBranch.name}`;

      // Expand the current branch
      setBranchExpanded(prev => ({
        ...prev,
        [branchKey]: true
      }));

      // Fetch commits for the current branch if not already loaded
      if (!branchCommits[branchKey]) {
        setLoadingCommits(prev => ({ ...prev, [branchKey]: true }));
        try {
          const data = await fetchBranchCommits(repoName, currentBranch.name, 20, 0);
          setBranchCommits(prev => ({
            ...prev,
            [branchKey]: data.commits || []
          }));
          setHasMoreCommits(prev => ({
            ...prev,
            [branchKey]: data.hasMore || false
          }));
        } catch (err) {
          console.error('Error fetching branch commits:', err);
          setBranchCommits(prev => ({
            ...prev,
            [branchKey]: []
          }));
          setHasMoreCommits(prev => ({
            ...prev,
            [branchKey]: false
          }));
        } finally {
          setLoadingCommits(prev => ({ ...prev, [branchKey]: false }));
        }
      }
    }
  };

  // Prefetch repository details in background
  useEffect(() => {
    const prefetchRepoDetails = async (repoName) => {
      if (repoDetails[repoName] || loadingRepoDetails[repoName] || prefetchingDetails[repoName]) {
        return; // Already loaded, loading, or prefetching
      }

      setPrefetchingDetails(prev => ({ ...prev, [repoName]: true }));
      try {
        const details = await fetchRepositoryDetails(repoName);
        setRepoDetails(prev => ({
          ...prev,
          [repoName]: details
        }));

        // Update cache age from first response
        if (details.cacheAge !== undefined && cacheAge === null) {
          setCacheAge(details.cacheAge);
        }

        // If this repo is currently expanded, auto-expand its current branch
        if (expanded[repoName]) {
          await expandCurrentBranch(repoName, details);
        }
      } catch (err) {
        console.error(`Error prefetching details for ${repoName}:`, err);
      } finally {
        setPrefetchingDetails(prev => ({ ...prev, [repoName]: false }));
      }
    };

    const handlePrefetchEvent = (event) => {
      const { repositories } = event.detail;
      // Prefetch details for all repositories sequentially with a small delay
      repositories.forEach((repo, index) => {
        setTimeout(() => {
          prefetchRepoDetails(repo.name);
        }, index * 200); // Stagger by 200ms to avoid overwhelming the backend
      });
    };

    window.addEventListener('prefetchRepositoryDetails', handlePrefetchEvent);
    return () => {
      window.removeEventListener('prefetchRepositoryDetails', handlePrefetchEvent);
    };
  }, [repoDetails, loadingRepoDetails, prefetchingDetails, expanded, branchCommits]);

  const handleAccordionChange = (repoName, currentBranchName) => async (event, isExpanded) => {
    setExpanded(prev => ({
      ...prev,
      [repoName]: isExpanded
    }));

    // If expanding the repo, fetch its details if not already available
    if (isExpanded) {
      const details = repoDetails[repoName];

      // If details not loaded yet, wait for them (or fetch if prefetch hasn't started)
      if (!details) {
        // Check if already being fetched/prefetched
        if (!loadingRepoDetails[repoName] && !prefetchingDetails[repoName]) {
          setLoadingRepoDetails(prev => ({ ...prev, [repoName]: true }));
          try {
            const fetchedDetails = await fetchRepositoryDetails(repoName);
            setRepoDetails(prev => ({
              ...prev,
              [repoName]: fetchedDetails
            }));

            // Auto-expand current branch with the fetched details
            await expandCurrentBranch(repoName, fetchedDetails);
          } catch (err) {
            console.error('Error fetching repository details:', err);
          } finally {
            setLoadingRepoDetails(prev => ({ ...prev, [repoName]: false }));
          }
        }
        // If already being fetched, the details will appear when ready
      } else {
        // Details already loaded, just expand current branch if needed
        await expandCurrentBranch(repoName, details);
      }
    }
  };

  const handleBranchToggle = async (repoName, branchName) => {
    const key = `${repoName}:${branchName}`;
    const isCurrentlyExpanded = branchExpanded[key];

    // Toggle expansion
    setBranchExpanded(prev => ({
      ...prev,
      [key]: !isCurrentlyExpanded
    }));

    // Fetch commits if expanding and not already loaded
    if (!isCurrentlyExpanded && !branchCommits[key]) {
      setLoadingCommits(prev => ({ ...prev, [key]: true }));
      try {
        const data = await fetchBranchCommits(repoName, branchName, 20, 0);
        setBranchCommits(prev => ({
          ...prev,
          [key]: data.commits || []
        }));
        setHasMoreCommits(prev => ({
          ...prev,
          [key]: data.hasMore || false
        }));
      } catch (err) {
        console.error('Error fetching branch commits:', err);
        setBranchCommits(prev => ({
          ...prev,
          [key]: []
        }));
        setHasMoreCommits(prev => ({
          ...prev,
          [key]: false
        }));
      } finally {
        setLoadingCommits(prev => ({ ...prev, [key]: false }));
      }
    }
  };

  const handleSplitCommit = async (repoName, branchName, commitHash, e, untrackedFiles = []) => {
    e.stopPropagation();

    // If this is for uncommitted changes and we have untracked files, show dialog
    if (!commitHash && untrackedFiles && untrackedFiles.length > 0) {
      setUntrackedDialog({
        open: true,
        repoName,
        branchName,
        untrackedFiles,
        action: 'split'
      });
      // Initialize with all files selected
      setSelectedUntrackedFiles(untrackedFiles);
      return;
    }

    // Proceed with split
    await performSplit(repoName, branchName, commitHash, false);
  };

  const performSplit = async (repoName, branchName, commitHash, includeUntracked, untrackedFiles = null) => {
    // Use 'uncommitted' as key when commitHash is null (for working directory changes)
    const key = `${repoName}:${branchName}:${commitHash || 'uncommitted'}`;

    setSplittingCommit(prev => ({ ...prev, [key]: true }));
    try {
      // Pass null for commitId to split working directory changes
      // Pass untrackedFiles list if provided
      const result = await splitCommit(
        repoName,
        branchName,
        commitHash || null,
        null,
        includeUntracked,
        untrackedFiles
      );
      setSplitSuccess(prev => ({ ...prev, [key]: true }));

      // Extract commit ID from result
      const commitId = result.commit_id || result.commitId;

      // Show success message briefly then notify parent
      setTimeout(() => {
        setSplitSuccess(prev => ({ ...prev, [key]: false }));

        // Notify parent component that split is complete
        if (onSplitComplete && commitId) {
          onSplitComplete(commitId);
        } else {
          // Fallback: reload the page if no callback provided
          window.location.reload();
        }
      }, 1500);
    } catch (err) {
      console.error('Error splitting commit:', err);
      setSplitError(err.message);
      setSplitErrorDetails(err.details || null);
      setSplittingCommit(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleReviewCommit = async (repoName, branchName, commitHash, e, untrackedFiles = []) => {
    e.stopPropagation();

    // If this is for uncommitted changes and we have untracked files, show dialog
    if (!commitHash && untrackedFiles && untrackedFiles.length > 0) {
      setUntrackedDialog({
        open: true,
        repoName,
        branchName,
        untrackedFiles,
        action: 'review'
      });
      // Initialize with all files selected
      setSelectedUntrackedFiles(untrackedFiles);
      return;
    }

    // Proceed with review
    await performReview(repoName, branchName, commitHash, false);
  };

  const performReview = async (repoName, branchName, commitHash, includeUntracked, untrackedFiles = null) => {
    const key = `${repoName}:${branchName}:${commitHash || 'uncommitted'}`;

    setReviewingCommit(prev => ({ ...prev, [key]: true }));
    try {
      const result = await reviewCommit(
        repoName,
        branchName,
        commitHash || null,
        null, // baseBranch
        includeUntracked,
        untrackedFiles
      );
      setReviewSuccess(prev => ({ ...prev, [key]: true }));

      // Show success message briefly, then navigate to review
      setTimeout(() => {
        setReviewSuccess(prev => ({ ...prev, [key]: false }));

        // Notify parent component that review is complete
        // Backend now always includes reviewId in the response
        if (onReviewComplete && result.reviewId) {
          onReviewComplete(result.reviewId);
        }
      }, 1500);
    } catch (err) {
      console.error('Error reviewing commit:', err);
      setReviewError(err.message);
      setReviewingCommit(prev => ({ ...prev, [key]: false }));
    } finally {
      setReviewingCommit(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleUntrackedDialogClose = (includeUntracked) => {
    const { repoName, branchName, action } = untrackedDialog;
    setUntrackedDialog({ open: false, repoName: null, branchName: null, untrackedFiles: [], action: 'split' });

    // Only proceed if user made a choice (not just closed the dialog)
    if (repoName && branchName && includeUntracked !== undefined) {
      // Pass the list of selected untracked files when including them
      if (action === 'split') {
        performSplit(repoName, branchName, null, includeUntracked, includeUntracked ? selectedUntrackedFiles : null);
      } else if (action === 'review') {
        performReview(repoName, branchName, null, includeUntracked, includeUntracked ? selectedUntrackedFiles : null);
      }
    }
    setSelectedUntrackedFiles([]);
  };

  const handleUntrackedDialogCancel = () => {
    setUntrackedDialog({ open: false, repoName: null, branchName: null, untrackedFiles: [], action: 'split' });
    setSelectedUntrackedFiles([]);
  };

  const handleUntrackedFileToggle = (file) => {
    setSelectedUntrackedFiles(prev => {
      if (prev.includes(file)) {
        return prev.filter(f => f !== file);
      } else {
        return [...prev, file];
      }
    });
  };

  const handleSelectAllUntracked = (checked) => {
    if (checked) {
      setSelectedUntrackedFiles(untrackedDialog.untrackedFiles);
    } else {
      setSelectedUntrackedFiles([]);
    }
  };


  const handleLoadMoreCommits = async (repoName, branchName) => {
    const key = `${repoName}:${branchName}`;
    const currentCommits = branchCommits[key] || [];
    const skip = currentCommits.length;

    setLoadingMoreCommits(prev => ({ ...prev, [key]: true }));
    try {
      const data = await fetchBranchCommits(repoName, branchName, 20, skip);
      setBranchCommits(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), ...(data.commits || [])]
      }));
      setHasMoreCommits(prev => ({
        ...prev,
        [key]: data.hasMore || false
      }));
    } catch (err) {
      console.error('Error loading more commits:', err);
    } finally {
      setLoadingMoreCommits(prev => ({ ...prev, [key]: false }));
    }
  };

  const getStatusBadgeCount = (status) => {
    if (!status || status === 'in_progress') return 0;
    return (status.staged?.length || 0) +
           (status.unstaged?.length || 0) +
           (status.untracked?.length || 0);
  };

  const getLanguageColor = (language) => {
    const colors = {
      javascript: '#f7df1e',
      python: '#3776ab',
      go: '#00add8',
      java: '#007396',
      typescript: '#3178c6',
      rust: '#ce422b'
    };
    return colors[language?.toLowerCase()] || '#gray';
  };

  const formatCacheAge = (ageInSeconds) => {
    if (ageInSeconds === null || ageInSeconds === undefined) return '';
    if (ageInSeconds < 60) return `${ageInSeconds}s ago`;
    if (ageInSeconds < 3600) return `${Math.floor(ageInSeconds / 60)}m ago`;
    if (ageInSeconds < 86400) return `${Math.floor(ageInSeconds / 3600)}h ago`;
    return `${Math.floor(ageInSeconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        <Box sx={{
          p: 2,
          backgroundColor: colors.background.paper,
          borderBottom: `1px solid ${colors.border.light}`,
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Repositories
          </Typography>
          <Skeleton variant="text" width={80} height={20} />
        </Box>
        <Box sx={{ p: 1 }}>
          {[1, 2, 3].map((i) => (
            <Card key={i} sx={{ mb: 1, p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Skeleton variant="circular" width={20} height={20} sx={{ mr: 1 }} />
                <Skeleton variant="text" width="60%" height={24} />
              </Box>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Error loading repositories: {error}</Alert>
      </Box>
    );
  }

  if (!repositories || repositories.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">No repositories configured</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{
        p: 2,
        backgroundColor: colors.background.paper,
        borderBottom: `1px solid ${colors.border.light}`,
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Repositories
          </Typography>
          <Tooltip title="Configure Repositories">
            <IconButton
              size="small"
              onClick={onOpenSettings}
              sx={{
                color: colors.primary.main,
                '&:hover': {
                  backgroundColor: 'rgba(99, 102, 241, 0.1)'
                }
              }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {repositories.length} configured
          </Typography>
          {cacheAge !== null && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              Updated {formatCacheAge(cacheAge)}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ p: 1 }}>
        {repositories.map((repo) => {
          const isExpanded = expanded[repo.name] || false;
          const details = repoDetails[repo.name];
          const isLoadingDetails = loadingRepoDetails[repo.name];
          const statusBadgeCount = getStatusBadgeCount(details?.status);
          const hasChanges = statusBadgeCount > 0;
          const currentBranch = details?.branches?.find(b => b.isCurrent);
          const currentBranchName = currentBranch?.name;

          return (
            <Accordion
              key={repo.name}
              expanded={isExpanded}
              onChange={handleAccordionChange(repo.name, currentBranchName)}
              sx={{
                mb: 1,
                '&:before': { display: 'none' },
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                opacity: repo.disabled ? 0.6 : 1
              }}
              disabled={repo.disabled}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: colors.text.secondary }} />}
                sx={{
                  backgroundColor: details?.error ? colors.accent.light : colors.background.paper,
                  '&:hover': {
                    backgroundColor: details?.error ? 'rgba(245, 158, 11, 0.2)' : colors.background.subtle
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 1 }}>
                  {isExpanded ? (
                    <FolderOpenIcon sx={{ mr: 1, color: colors.accent.main, fontSize: 20 }} />
                  ) : (
                    <FolderIcon sx={{ mr: 1, color: colors.accent.dark, fontSize: 20 }} />
                  )}
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {repo.name}
                    </Typography>
                  </Box>
                  {/* Show spinner when prefetching or loading details */}
                  {(prefetchingDetails[repo.name] || loadingRepoDetails[repo.name]) && (
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                  )}
                  {hasChanges && (
                    <Badge
                      badgeContent={statusBadgeCount}
                      color="warning"
                      sx={{ mr: 1 }}
                    />
                  )}
                  {/* Refresh button */}
                  <Tooltip title="Refresh repository data">
                    <IconButton
                      size="small"
                      onClick={(e) => handleRefreshRepository(repo.name, e)}
                      disabled={refreshingRepo[repo.name]}
                      sx={{
                        p: 0.5,
                        mr: 0.5,
                        '&:hover': {
                          backgroundColor: 'rgba(99, 102, 241, 0.1)'
                        }
                      }}
                    >
                      {refreshingRepo[repo.name] ? (
                        <CircularProgress size={16} />
                      ) : (
                        <RefreshIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 2, backgroundColor: colors.background.paper }}>
                {/* Loading state while fetching details */}
                {isExpanded && isLoadingDetails && (
                  <Box sx={{ py: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Skeleton variant="circular" width={16} height={16} sx={{ mr: 1 }} />
                      <Skeleton variant="text" width="60%" height={20} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Skeleton variant="circular" width={16} height={16} sx={{ mr: 1 }} />
                      <Skeleton variant="text" width="50%" height={20} />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Skeleton variant="circular" width={16} height={16} sx={{ mr: 1 }} />
                      <Skeleton variant="text" width="40%" height={20} />
                    </Box>
                  </Box>
                )}

                {/* Error state */}
                {isExpanded && !isLoadingDetails && details?.error && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    {details.error}
                  </Alert>
                )}

                {/* Expanded view - show branches */}
                {isExpanded && !isLoadingDetails && details && !details.error && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                      Branches ({details.branches?.length || 0})
                    </Typography>

                    {details.branches && details.branches.length > 0 ? (
                      <List dense sx={{ p: 0 }}>
                        {details.branches.map((branch) => {
                          const branchKey = `${repo.name}:${branch.name}`;
                          const isBranchExpanded = branchExpanded[branchKey];
                          const commits = branchCommits[branchKey];
                          const isLoadingCommits = loadingCommits[branchKey];

                          return (
                            <Box key={branch.name}>
                              <ListItem
                                sx={{
                                  px: 1,
                                  py: 0.5,
                                  backgroundColor: branch.isCurrent ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                  borderRadius: 1,
                                  mb: 0.5,
                                  cursor: 'pointer',
                                  '&:hover': {
                                    backgroundColor: branch.isCurrent ? 'rgba(99, 102, 241, 0.12)' : colors.background.subtle
                                  }
                                }}
                                onClick={() => handleBranchToggle(repo.name, branch.name)}
                              >
                                <Box sx={{ width: '100%' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    <IconButton
                                      size="small"
                                      sx={{ p: 0, mr: 0.5 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleBranchToggle(repo.name, branch.name);
                                      }}
                                    >
                                      {isBranchExpanded ? (
                                        <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                                      ) : (
                                        <KeyboardArrowRightIcon sx={{ fontSize: 16 }} />
                                      )}
                                    </IconButton>
                                    {branch.isCurrent && (
                                      <CheckCircleIcon
                                        sx={{ fontSize: 14, mr: 0.5, color: colors.primary.main }}
                                      />
                                    )}
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontWeight: branch.isCurrent ? 600 : 400,
                                        fontSize: '0.85rem',
                                        flexGrow: 1
                                      }}
                                    >
                                      {branch.name}
                                    </Typography>
                                    {branch.isCurrent && (
                                      <Chip
                                        label="Current"
                                        size="small"
                                        color="primary"
                                        sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
                                      />
                                    )}
                                  </Box>

                                  {/* Expandable commits section */}
                                  <Collapse in={isBranchExpanded} timeout="auto" unmountOnExit>
                                    <Box sx={{ ml: 2.5, mt: 1 }}>
                                      {isLoadingCommits ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
                                          <CircularProgress size={16} sx={{ mr: 1 }} />
                                          <Typography variant="caption" color="text.secondary">
                                            Loading commits...
                                          </Typography>
                                        </Box>
                                      ) : (
                                        <Box>
                                          {/* Show "Loading status..." for current branch when in_progress */}
                                          {branch.isCurrent && details.status === 'in_progress' && (
                                            <Box sx={{ mb: 2 }}>
                                              <Box sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                pl: 1,
                                                borderLeft: `2px solid ${colors.primary.main}`,
                                                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                                borderRadius: '0 4px 4px 0',
                                                py: 1,
                                                px: 1
                                              }}>
                                                <CircularProgress size={12} sx={{ mr: 1 }} />
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem',
                                                    color: colors.primary.main
                                                  }}
                                                >
                                                  Checking for uncommitted files...
                                                </Typography>
                                              </Box>
                                            </Box>
                                          )}

                                          {/* Show uncommitted changes for current branch */}
                                          {branch.isCurrent && details.status && details.status !== 'in_progress' &&
                                           (details.status.staged?.length > 0 ||
                                            details.status.unstaged?.length > 0 ||
                                            details.status.untracked?.length > 0) && (
                                            <Box sx={{ mb: 2 }}>
                                              <Box sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                mb: 1
                                              }}>
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    fontWeight: 600,
                                                    fontSize: '0.7rem',
                                                    display: 'block'
                                                  }}
                                                >
                                                  Uncommitted Changes:
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                  {/* Review button for uncommitted */}
                                                  {reviewingCommit[`${repo.name}:${branch.name}:uncommitted`] ? (
                                                    <CircularProgress size={14} />
                                                  ) : (
                                                    <Tooltip title="Review uncommitted changes">
                                                      <IconButton
                                                        size="small"
                                                        onClick={(e) => handleReviewCommit(repo.name, branch.name, null, e, details.status.untracked || [])}
                                                        disabled={reviewingCommit[`${repo.name}:${branch.name}:uncommitted`] || splittingCommit[`${repo.name}:${branch.name}:uncommitted`]}
                                                        sx={{
                                                          p: 0.25,
                                                          color: reviewSuccess[`${repo.name}:${branch.name}:uncommitted`] ? 'success.main' : 'secondary.main',
                                                          '&:hover': {
                                                            backgroundColor: 'rgba(156, 39, 176, 0.1)'
                                                          }
                                                        }}
                                                      >
                                                        {reviewSuccess[`${repo.name}:${branch.name}:uncommitted`] ? (
                                                          <CheckCircleIcon sx={{ fontSize: 14 }} />
                                                        ) : (
                                                          <RateReviewIcon sx={{ fontSize: 14 }} />
                                                        )}
                                                      </IconButton>
                                                    </Tooltip>
                                                  )}
                                                  {/* Split button for uncommitted */}
                                                  {splittingCommit[`${repo.name}:${branch.name}:uncommitted`] ? (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                      <CircularProgress size={14} />
                                                      <Typography variant="caption" color="primary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                                        Splitting...
                                                      </Typography>
                                                    </Box>
                                                  ) : (
                                                    <Tooltip title="Split uncommitted changes into patches">
                                                      <IconButton
                                                        size="small"
                                                        onClick={(e) => handleSplitCommit(repo.name, branch.name, null, e, details.status.untracked || [])}
                                                        disabled={splittingCommit[`${repo.name}:${branch.name}:uncommitted`] || reviewingCommit[`${repo.name}:${branch.name}:uncommitted`]}
                                                        sx={{
                                                          p: 0.25,
                                                          color: splitSuccess[`${repo.name}:${branch.name}:uncommitted`] ? 'success.main' : 'primary.main',
                                                          '&:hover': {
                                                            backgroundColor: 'rgba(25, 118, 210, 0.1)'
                                                          }
                                                        }}
                                                      >
                                                        {splitSuccess[`${repo.name}:${branch.name}:uncommitted`] ? (
                                                          <CheckCircleIcon sx={{ fontSize: 14 }} />
                                                        ) : (
                                                          <CallSplitIcon sx={{ fontSize: 14 }} />
                                                        )}
                                                      </IconButton>
                                                    </Tooltip>
                                                  )}
                                                </Box>
                                              </Box>
                                              <Box
                                                sx={{
                                                  pl: 1,
                                                  borderLeft: `2px solid ${colors.accent.main}`,
                                                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                                  borderRadius: '0 4px 4px 0',
                                                  py: 1,
                                                  px: 1,
                                                  cursor: 'pointer',
                                                  '&:hover': {
                                                    backgroundColor: 'rgba(245, 158, 11, 0.2)'
                                                  }
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigate(`/working-directory/${encodeURIComponent(repo.name)}/${encodeURIComponent(branch.name)}`);
                                                }}
                                              >
                                                {details.status.staged?.length > 0 && (
                                                  <Box sx={{ mb: 1 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                                                      <CheckCircleIcon sx={{ fontSize: 10, mr: 0.5, color: 'success.main' }} />
                                                      <Typography
                                                        variant="caption"
                                                        sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'success.main' }}
                                                      >
                                                        Staged ({details.status.staged.length})
                                                      </Typography>
                                                    </Box>
                                                    {details.status.staged.slice(0, 3).map(file => (
                                                      <Box key={file} sx={{ pl: 1.5, display: 'block' }}>
                                                        <FilePath path={file} variant="caption" sx={{ fontSize: '0.6rem' }} />
                                                      </Box>
                                                    ))}
                                                    {details.status.staged.length > 3 && (
                                                      <Typography
                                                        variant="caption"
                                                        sx={{
                                                          fontSize: '0.6rem',
                                                          pl: 1.5,
                                                          color: 'text.secondary',
                                                          fontStyle: 'italic'
                                                        }}
                                                      >
                                                        +{details.status.staged.length - 3} more
                                                      </Typography>
                                                    )}
                                                  </Box>
                                                )}
                                                {details.status.unstaged?.length > 0 && (
                                                  <Box sx={{ mb: 1 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                                                      <EditIcon sx={{ fontSize: 10, mr: 0.5, color: 'warning.main' }} />
                                                      <Typography
                                                        variant="caption"
                                                        sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'warning.main' }}
                                                      >
                                                        Unstaged ({details.status.unstaged.length})
                                                      </Typography>
                                                    </Box>
                                                    {details.status.unstaged.slice(0, 3).map(file => (
                                                      <Box key={file} sx={{ pl: 1.5, display: 'block' }}>
                                                        <FilePath path={file} variant="caption" sx={{ fontSize: '0.6rem' }} />
                                                      </Box>
                                                    ))}
                                                    {details.status.unstaged.length > 3 && (
                                                      <Typography
                                                        variant="caption"
                                                        sx={{
                                                          fontSize: '0.6rem',
                                                          pl: 1.5,
                                                          color: 'text.secondary',
                                                          fontStyle: 'italic'
                                                        }}
                                                      >
                                                        +{details.status.unstaged.length - 3} more
                                                      </Typography>
                                                    )}
                                                  </Box>
                                                )}
                                                {details.status.untracked?.length > 0 && (
                                                  <Box>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                                                      <AddIcon sx={{ fontSize: 10, mr: 0.5, color: 'info.main' }} />
                                                      <Typography
                                                        variant="caption"
                                                        sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'info.main' }}
                                                      >
                                                        Untracked ({details.status.untracked.length})
                                                      </Typography>
                                                    </Box>
                                                    {details.status.untracked.slice(0, 3).map(file => (
                                                      <Box key={file} sx={{ pl: 1.5, display: 'block' }}>
                                                        <FilePath path={file} variant="caption" sx={{ fontSize: '0.6rem' }} />
                                                      </Box>
                                                    ))}
                                                    {details.status.untracked.length > 3 && (
                                                      <Typography
                                                        variant="caption"
                                                        sx={{
                                                          fontSize: '0.6rem',
                                                          pl: 1.5,
                                                          color: 'text.secondary',
                                                          fontStyle: 'italic'
                                                        }}
                                                      >
                                                        +{details.status.untracked.length - 3} more
                                                      </Typography>
                                                    )}
                                                  </Box>
                                                )}
                                              </Box>
                                            </Box>
                                          )}

                                          {/* Commits list */}
                                          {commits && commits.length > 0 && (
                                            <Box>
                                              <Typography
                                                variant="caption"
                                                sx={{
                                                  fontWeight: 600,
                                                  fontSize: '0.7rem',
                                                  display: 'block',
                                                  mb: 0.5
                                                }}
                                              >
                                                Recent Commits ({commits.length}):
                                              </Typography>
                                          {commits.map((commit) => {
                                            const commitKey = `${repo.name}:${branch.name}:${commit.hash}`;
                                            const isSplitting = splittingCommit[commitKey];
                                            const showSuccess = splitSuccess[commitKey];

                                            return (
                                              <Box
                                                key={commit.hash}
                                                sx={{
                                                  mb: 1,
                                                  py: 0.75,
                                                  px: 1,
                                                  borderLeft: `3px solid ${colors.border.light}`,
                                                  borderRadius: '0 6px 6px 0',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.15s ease',
                                                  '&:hover': {
                                                    backgroundColor: colors.background.subtle,
                                                    borderLeftColor: colors.primary.main,
                                                    transform: 'translateX(2px)',
                                                  }
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigate(`/commit/${encodeURIComponent(repo.name)}/${commit.hash}`);
                                                }}
                                              >
                                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.25 }}>
                                                  <Box sx={{ display: 'flex', alignItems: 'flex-start', flexGrow: 1 }}>
                                                    <CommitIcon sx={{ fontSize: 10, mr: 0.5, mt: 0.2, color: 'text.secondary' }} />
                                                    <Tooltip title={`${commit.hash} - Click to view diff`}>
                                                      <Box
                                                        component="span"
                                                        sx={{
                                                          cursor: 'pointer',
                                                          '&:hover': {
                                                            textDecoration: 'underline'
                                                          }
                                                        }}
                                                      >
                                                        <CommitHash hash={commit.shortHash} short={false} sx={{ fontSize: '0.65rem' }} />
                                                      </Box>
                                                    </Tooltip>
                                                  </Box>
                                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                                    {/* Review button */}
                                                    {(() => {
                                                      const isReviewing = reviewingCommit[commitKey];
                                                      const showReviewSuccess = reviewSuccess[commitKey];
                                                      return isReviewing ? (
                                                        <CircularProgress size={10} sx={{ ml: 0.5 }} />
                                                      ) : (
                                                        <Tooltip title="Review this commit">
                                                          <IconButton
                                                            size="small"
                                                            onClick={(e) => handleReviewCommit(repo.name, branch.name, commit.hash, e)}
                                                            disabled={isReviewing || isSplitting}
                                                            sx={{
                                                              p: 0.25,
                                                              color: showReviewSuccess ? 'success.main' : 'secondary.main',
                                                              '&:hover': {
                                                                backgroundColor: 'rgba(156, 39, 176, 0.1)'
                                                              }
                                                            }}
                                                          >
                                                            {showReviewSuccess ? (
                                                              <CheckCircleIcon sx={{ fontSize: 12 }} />
                                                            ) : (
                                                              <RateReviewIcon sx={{ fontSize: 12 }} />
                                                            )}
                                                          </IconButton>
                                                        </Tooltip>
                                                      );
                                                    })()}
                                                    {/* Split button */}
                                                    {isSplitting ? (
                                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                                                        <CircularProgress size={10} />
                                                        <Typography variant="caption" color="primary" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
                                                          Splitting...
                                                        </Typography>
                                                      </Box>
                                                    ) : (
                                                      <Tooltip title="Split this commit into patches">
                                                        <IconButton
                                                          size="small"
                                                          onClick={(e) => handleSplitCommit(repo.name, branch.name, commit.hash, e)}
                                                          disabled={isSplitting || reviewingCommit[commitKey]}
                                                          sx={{
                                                            p: 0.25,
                                                            ml: 0.5,
                                                            color: showSuccess ? 'success.main' : 'primary.main',
                                                            '&:hover': {
                                                              backgroundColor: 'rgba(25, 118, 210, 0.1)'
                                                            }
                                                          }}
                                                        >
                                                          {showSuccess ? (
                                                            <CheckCircleIcon sx={{ fontSize: 12 }} />
                                                          ) : (
                                                            <CallSplitIcon sx={{ fontSize: 12 }} />
                                                          )}
                                                        </IconButton>
                                                      </Tooltip>
                                                    )}
                                                  </Box>
                                                </Box>
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    fontSize: '0.7rem',
                                                    display: 'block',
                                                    color: 'text.primary',
                                                    mb: 0.25,
                                                    wordWrap: 'break-word',
                                                    overflowWrap: 'break-word',
                                                    whiteSpace: 'normal'
                                                  }}
                                                >
                                                  {commit.message}
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                  <Typography
                                                    variant="caption"
                                                    sx={{
                                                      fontSize: '0.6rem',
                                                      color: 'text.secondary'
                                                    }}
                                                  >
                                                    {commit.author} • {commit.relativeDate}
                                                  </Typography>
                                                  {commit.filesChanged && (
                                                    <Typography
                                                      variant="caption"
                                                      sx={{
                                                        fontSize: '0.55rem',
                                                        color: colors.text.muted,
                                                        backgroundColor: colors.background.subtle,
                                                        px: 0.5,
                                                        py: 0.125,
                                                        borderRadius: 0.5,
                                                      }}
                                                    >
                                                      {commit.filesChanged} files
                                                    </Typography>
                                                  )}
                                                </Box>
                                              </Box>
                                            );
                                          })}

                                              {/* Load More Button */}
                                              {hasMoreCommits[branchKey] && (
                                                <Box sx={{ mt: 1, textAlign: 'center' }}>
                                                  <Button
                                                    size="small"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleLoadMoreCommits(repo.name, branch.name);
                                                    }}
                                                    disabled={loadingMoreCommits[branchKey]}
                                                    sx={{
                                                      fontSize: '0.7rem',
                                                      textTransform: 'none',
                                                      color: colors.primary.main
                                                    }}
                                                  >
                                                    {loadingMoreCommits[branchKey] ? (
                                                      <>
                                                        <CircularProgress size={12} sx={{ mr: 0.5 }} />
                                                        Loading...
                                                      </>
                                                    ) : (
                                                      'Load More'
                                                    )}
                                                  </Button>
                                                </Box>
                                              )}
                                            </Box>
                                          )}

                                          {!commits || commits.length === 0 ? (
                                            <Typography variant="caption" color="text.secondary">
                                              No commits found
                                            </Typography>
                                          ) : null}
                                        </Box>
                                      )}
                                    </Box>
                                  </Collapse>
                                </Box>
                              </ListItem>
                              <Divider />
                            </Box>
                          );
                        })}
                      </List>
                    ) : (
                      <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                        No branches found
                      </Alert>
                    )}
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {/* Untracked Files Dialog */}
      <Dialog
        open={untrackedDialog.open}
        onClose={handleUntrackedDialogCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Select Untracked Files to Include</Typography>
          <IconButton
            aria-label="close"
            onClick={handleUntrackedDialogCancel}
            sx={{
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {untrackedDialog.action === 'split'
              ? 'Select the untracked files you want to include in the split:'
              : 'Select the untracked files you want to include in the review:'}
          </DialogContentText>
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedUntrackedFiles.length === untrackedDialog.untrackedFiles.length && untrackedDialog.untrackedFiles.length > 0}
                  indeterminate={selectedUntrackedFiles.length > 0 && selectedUntrackedFiles.length < untrackedDialog.untrackedFiles.length}
                  onChange={(e) => handleSelectAllUntracked(e.target.checked)}
                />
              }
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Select All</Typography>}
            />
          </Box>
          <Box sx={{
            maxHeight: 300,
            overflow: 'auto',
            p: 2,
            backgroundColor: colors.background.subtle,
            borderRadius: 1,
            border: `1px solid ${colors.border.light}`
          }}>
            {untrackedDialog.untrackedFiles.map((file, idx) => (
              <FormControlLabel
                key={idx}
                control={
                  <Checkbox
                    checked={selectedUntrackedFiles.includes(file)}
                    onChange={() => handleUntrackedFileToggle(file)}
                    size="small"
                  />
                }
                label={
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                      fontSize: '0.85rem',
                      color: 'text.secondary'
                    }}
                  >
                    {file}
                  </Typography>
                }
                sx={{ display: 'flex', mb: 0.5 }}
              />
            ))}
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {selectedUntrackedFiles.length} of {untrackedDialog.untrackedFiles.length} files selected
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleUntrackedDialogClose(false)} color="primary">
            Skip All Untracked
          </Button>
          <Button
            onClick={() => handleUntrackedDialogClose(true)}
            color="primary"
            variant="contained"
            disabled={selectedUntrackedFiles.length === 0}
          >
            Include Selected ({selectedUntrackedFiles.length})
          </Button>
        </DialogActions>
      </Dialog>

      {/* Split Error Dialog */}
      <Dialog
        open={!!splitError}
        onClose={() => {
          setSplitError(null);
          setSplitErrorDetails(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: colors.error.light, color: colors.error.dark }}>
          Split Failed
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <DialogContentText sx={{ mb: 2, color: 'text.primary' }}>
            {splitError}
          </DialogContentText>

          {splitErrorDetails && (
            <Accordion sx={{ mt: 2, border: `1px solid ${colors.border.light}` }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  backgroundColor: colors.background.subtle,
                  '&:hover': {
                    backgroundColor: colors.background.default
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <InfoIcon sx={{ fontSize: 18, mr: 1, color: colors.primary.main }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Detailed Logs
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 2, maxHeight: '400px', overflow: 'auto' }}>
                {splitErrorDetails.exitCode && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      Exit Code:
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'error.main' }}>
                      {splitErrorDetails.exitCode}
                    </Typography>
                  </Box>
                )}

                {splitErrorDetails.stderr && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      Error Output (stderr):
                    </Typography>
                    <Paper
                      sx={{
                        p: 2,
                        backgroundColor: colors.background.subtle,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: '0.85rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '200px',
                        overflow: 'auto',
                        border: `1px solid ${colors.border.light}`
                      }}
                    >
                      {splitErrorDetails.stderr}
                    </Paper>
                  </Box>
                )}

                {splitErrorDetails.stdout && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      Standard Output (stdout):
                    </Typography>
                    <Paper
                      sx={{
                        p: 2,
                        backgroundColor: colors.background.subtle,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        fontSize: '0.85rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '200px',
                        overflow: 'auto',
                        border: `1px solid ${colors.border.light}`
                      }}
                    >
                      {splitErrorDetails.stdout}
                    </Paper>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setSplitError(null);
              setSplitErrorDetails(null);
            }}
            variant="contained"
            color="primary"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Review Error Dialog */}
      <Dialog
        open={!!reviewError}
        onClose={() => setReviewError(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: '#ffebee', color: '#c62828' }}>
          Review Failed
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <DialogContentText sx={{ color: 'text.primary' }}>
            {reviewError}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setReviewError(null)}
            variant="contained"
            color="primary"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RepositoryPanel;
