import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Alert,
  Paper,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Drawer,
  Menu,
  MenuItem,
  ListItemIcon,
  Tabs,
  Tab,
  Snackbar,
  Tooltip,
  Badge,
  Collapse
} from '@mui/material';
import {
  Code as CodeIcon,
  Folder as FolderIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  ExpandMore as ExpandMoreIcon,
  Description as DescriptionIcon,
  Storage as StorageIcon,
  Info as InfoIcon,
  Delete as DeleteIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Menu as MenuIcon,
  Article as ArticleIcon,
  Gavel as GavelIcon,
  GitHub as GitHubIcon,
  VpnKey as VpnKeyIcon,
  Close as CloseIcon,
  Archive as ArchiveIcon,
  RateReview as RateReviewIcon,
  CallSplit as CallSplitIcon,
  ContentCopy as ContentCopyIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Psychology as PsychologyIcon,
  LightbulbOutlined as LightbulbIcon,
  TipsAndUpdates as TipsIcon,
  ArrowForward as ArrowForwardIcon,
  StarBorder as StarIcon
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import { fetchCommits, deleteCommit, fetchRepositories, fetchHealth, fetchReviews, fetchReviewById, archiveReview, fetchConfig, fetchGitHubStatus } from '../services/data-provider';
import RepositoryPanel from './RepositoryPanel';
import PullRequestsTab from './PullRequestsTab';
import SettingsDialog from './SettingsDialog';
import FilePath from './FilePath';
import { PatchCardSkeleton, ReviewCardSkeleton } from './Skeletons';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import { colors } from '../App';

// Mental Model Summary Component - shows in accordion summary
const MentalModelSummary = ({ mentalModel }) => {
  if (!mentalModel?.summary) return null;

  const truncatedSummary = mentalModel.summary.length > 150
    ? mentalModel.summary.substring(0, 150) + '...'
    : mentalModel.summary;

  return (
    <Box
      sx={{
        mt: 1.5,
        ml: 4,
        p: 1.5,
        backgroundColor: 'rgba(99, 102, 241, 0.04)',
        borderLeft: `3px solid ${colors.primary.main}`,
        borderRadius: '0 8px 8px 0',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <LightbulbIcon sx={{ fontSize: 18, color: colors.primary.main, mt: 0.2 }} />
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {truncatedSummary}
        </Typography>
      </Box>
    </Box>
  );
};

// Mental Model Full Card Component - shows in expanded accordion
const MentalModelCard = ({ mentalModel }) => {
  const [expanded, setExpanded] = React.useState(false);

  if (!mentalModel) return null;

  const hasMoreContent = (mentalModel.progression && mentalModel.progression.length > 0) ||
    (mentalModel.key_concepts && mentalModel.key_concepts.length > 0) ||
    mentalModel.review_tips;

  return (
    <Card
      sx={{
        mb: 3,
        backgroundColor: 'rgba(99, 102, 241, 0.03)',
        border: `1px solid ${colors.border.light}`,
        borderLeft: `4px solid ${colors.primary.main}`,
        cursor: hasMoreContent ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
        '&:hover': hasMoreContent ? {
          backgroundColor: 'rgba(99, 102, 241, 0.06)',
        } : {},
      }}
      onClick={() => hasMoreContent && setExpanded(!expanded)}
    >
      <CardContent sx={{ pb: hasMoreContent ? 1.5 : 2, '&:last-child': { pb: hasMoreContent ? 1.5 : 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <PsychologyIcon sx={{ mr: 1.5, color: colors.primary.main, fontSize: 24 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Before You Begin
            </Typography>
          </Box>
          {hasMoreContent && (
            <Box sx={{ display: 'flex', alignItems: 'center', color: colors.text.secondary }}>
              <Typography variant="body2" sx={{ mr: 0.5 }}>
                {expanded ? 'Show Less' : 'Show More'}
              </Typography>
              <ExpandMoreIcon sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
                fontSize: 20,
              }} />
            </Box>
          )}
        </Box>

        {/* Overview - Always visible */}
        {mentalModel.summary && (
          <Box sx={{ mb: hasMoreContent ? 2 : 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: colors.text.primary }}>
              What This Change Does
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {mentalModel.summary}
            </Typography>
          </Box>
        )}

        {/* Collapsed Preview - Section headers */}
        {!expanded && hasMoreContent && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, color: colors.text.muted }}>
            {mentalModel.progression && mentalModel.progression.length > 0 && (
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                How Patches Progress <span style={{ fontWeight: 400 }}>({mentalModel.progression.length} steps)</span>
              </Typography>
            )}
            {mentalModel.key_concepts && mentalModel.key_concepts.length > 0 && (
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Key Concepts <span style={{ fontWeight: 400 }}>({mentalModel.key_concepts.length})</span>
              </Typography>
            )}
            {mentalModel.review_tips && (
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Review Tips
              </Typography>
            )}
          </Box>
        )}

        {/* Collapsible Content */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 2 }}>
            {/* Progression Items */}
            {mentalModel.progression && mentalModel.progression.length > 0 && (
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: colors.text.primary }}>
                  How Patches Progress
                </Typography>
                <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                  {mentalModel.progression.map((step, idx) => (
                    <Box
                      component="li"
                      key={idx}
                      sx={{
                        mb: 0.75,
                        '&::marker': { color: colors.primary.main, fontWeight: 600 }
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {step}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Key Concepts */}
            {mentalModel.key_concepts && mentalModel.key_concepts.length > 0 && (
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: colors.text.primary }}>
                  Key Concepts
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {mentalModel.key_concepts.map((concept, idx) => (
                    <Box
                      component="li"
                      key={idx}
                      sx={{
                        mb: 0.5,
                        '&::marker': { color: colors.secondary.main }
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {concept}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Review Tips */}
            {mentalModel.review_tips && (
              <Box
                sx={{
                  p: 1.5,
                  backgroundColor: 'rgba(16, 185, 129, 0.06)',
                  borderRadius: 1,
                  border: `1px solid rgba(16, 185, 129, 0.2)`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <TipsIcon sx={{ fontSize: 18, color: colors.secondary.main, mt: 0.2 }} />
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: colors.secondary.dark }}>
                      Review Tips
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {mentalModel.review_tips}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

const CommitsPage = () => {
  const navigate = useNavigate();
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, totalPatches: 0 });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commitToDelete, setCommitToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Repository panel state
  const [repositories, setRepositories] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [reposLoaded, setReposLoaded] = useState(false);

  // Resizable sidebar state
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const saved = localStorage.getItem('armchair-sidebar-width');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [isResizing, setIsResizing] = useState(false);
  const minDrawerWidth = 240;
  const maxDrawerWidth = 480;

  // LLM status state
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [modelName, setModelName] = useState(null);
  const [modelApiBaseUrl, setModelApiBaseUrl] = useState(null);

  // Root directory warning state
  const [rootDirWarning, setRootDirWarning] = useState(null);

  // Menu state
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const menuOpen = Boolean(menuAnchorEl);

  // Content dialog state
  const [contentDialogOpen, setContentDialogOpen] = useState(false);
  const [contentDialogTitle, setContentDialogTitle] = useState('');
  const [contentDialogContent, setContentDialogContent] = useState('');
  const [contentDialogType, setContentDialogType] = useState('text'); // 'text' or 'markdown'
  const [contentLoading, setContentLoading] = useState(false);

  // Settings dialog state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  // GitHub state
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubRepos, setGithubRepos] = useState([]);
  const [pullRequestCount, setPullRequestCount] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState(0); // 0 = Split Patches, 1 = Pull Requests, 2 = Reviews

  // Reviews state
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);
  const [expandedReview, setExpandedReview] = useState(null); // ID of currently expanded review
  const [reviewDetails, setReviewDetails] = useState({}); // Cache of fetched review details
  const [copySnackbarOpen, setCopySnackbarOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [reviewToArchive, setReviewToArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [reviewsRefreshing, setReviewsRefreshing] = useState(false);

  // Sidebar resize handlers
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleMouseMove = React.useCallback((e) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= minDrawerWidth && newWidth <= maxDrawerWidth) {
      setDrawerWidth(newWidth);
    }
  }, [isResizing, minDrawerWidth, maxDrawerWidth]);

  const handleMouseUp = React.useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('armchair-sidebar-width', drawerWidth.toString());
    }
  }, [isResizing, drawerWidth]);

  // Add mouse event listeners for resizing
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Keyboard shortcuts
  const anyDialogOpen = settingsDialogOpen || contentDialogOpen || deleteDialogOpen || archiveDialogOpen;
  const shortcuts = useMemo(() => ({
    'cmd+,': () => setSettingsDialogOpen(true),
    'cmd+r': () => {
      // Refresh repositories and patches
      fetchCommits().then(data => {
        if (data.success) {
          setCommits(data.commits);
          setStats(data.stats);
        }
      });
      fetchReviews().then(data => {
        if (data.success) {
          setReviews(data.reviews);
        }
      });
    },
    'escape': () => {
      if (settingsDialogOpen) setSettingsDialogOpen(false);
      else if (contentDialogOpen) setContentDialogOpen(false);
      else if (deleteDialogOpen) setDeleteDialogOpen(false);
      else if (archiveDialogOpen) setArchiveDialogOpen(false);
    },
    '1': () => setActiveTab(0), // Split Patches tab
    '2': () => setActiveTab(1), // Pull Requests tab
    '3': () => setActiveTab(2), // Reviews tab
  }), [settingsDialogOpen, contentDialogOpen, deleteDialogOpen, archiveDialogOpen]);

  useKeyboardShortcuts(shortcuts, !anyDialogOpen || shortcuts['escape']);

  const handleMenuClick = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleMenuItemClick = async (type) => {
    handleMenuClose();

    if (type === 'github') {
      window.open('https://github.com/armchr/armchr', '_blank');
      return;
    }

    if (type === 'settings') {
      setSettingsDialogOpen(true);
      return;
    }

    setContentLoading(true);
    setContentDialogOpen(true);

    try {
      let url, title, contentType;

      if (type === 'readme') {
        url = '/assets/README.md';
        title = 'README';
        contentType = 'markdown';
      } else if (type === 'license') {
        url = '/assets/LICENSE';
        title = 'License';
        contentType = 'text';
      } else if (type === 'github-pat-guide') {
        url = '/assets/github-pat-guide.md';
        title = 'GitHub Token Setup Guide';
        contentType = 'markdown';
      }

      const response = await fetch(url);
      const text = await response.text();

      setContentDialogTitle(title);
      setContentDialogContent(text);
      setContentDialogType(contentType);
    } catch (error) {
      setContentDialogTitle('Error');
      setContentDialogContent(`Failed to load content: ${error.message}`);
      setContentDialogType('text');
    } finally {
      setContentLoading(false);
    }
  };

  const handleContentDialogClose = () => {
    setContentDialogOpen(false);
    setContentDialogContent('');
    setContentDialogTitle('');
  };

  // Check if config file exists and auto-open settings dialog if not, or if no repos configured
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const data = await fetchConfig();
        if (data.success) {
          // Open settings if config file doesn't exist OR if no repositories are configured
          const hasNoRepositories = !data.repositories || data.repositories.length === 0;
          if (!data.configFileExists || hasNoRepositories) {
            setSettingsDialogOpen(true);
          }

          // Check if any repository paths don't start with rootDir
          // rootDir is now always present since it's required
          if (data.rootDir && data.repositories && data.repositories.length > 0) {
            const invalidPaths = data.repositories.filter(repo => {
              const repoPath = repo.path || '';
              return !repoPath.startsWith(data.rootDir);
            });

            if (invalidPaths.length > 0) {
              setRootDirWarning({
                rootDir: data.rootDir,
                invalidRepos: invalidPaths.map(r => r.name || r.path)
              });
            } else {
              setRootDirWarning(null);
            }
          } else {
            setRootDirWarning(null);
          }
        }
      } catch (err) {
        console.error('Error checking config:', err);
        // Don't show error to user, just log it
      }
    };

    // Check config on mount
    checkConfig();
  }, []);

  // Load commits - deferred to not block initial render
  useEffect(() => {
    const loadCommits = async () => {
      try {
        setLoading(true);
        const data = await fetchCommits();
        setCommits(data.commits || []);

        // Count only active patches (not deleted)
        const totalPatches = data.commits?.reduce((sum, commit) => {
          const activePatches = commit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0;
          return sum + activePatches;
        }, 0) || 0;

        setStats({
          total: data.total || 0,
          totalPatches
        });
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Defer loading commits to next tick to allow UI to render first
    const timer = setTimeout(() => {
      loadCommits();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Load repositories only when drawer is open
  useEffect(() => {
    const loadRepositories = async () => {
      if (reposLoaded) return; // Only load once

      try {
        setReposLoading(true);
        const data = await fetchRepositories();
        setRepositories(data.repositories || []);
        setReposError(null);
        setReposLoaded(true);

        // After repositories list is loaded, trigger prefetch of all repo details
        // Send event to RepositoryPanel to start prefetching
        window.dispatchEvent(new CustomEvent('prefetchRepositoryDetails', {
          detail: { repositories: data.repositories || [] }
        }));
      } catch (err) {
        setReposError(err.message);
      } finally {
        setReposLoading(false);
      }
    };

    if (drawerOpen && !reposLoaded) {
      // Defer loading to not block UI
      const timer = setTimeout(() => {
        loadRepositories();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [drawerOpen, reposLoaded]);

  // Check LLM status
  useEffect(() => {
    const checkLlmStatus = async () => {
      try {
        const data = await fetchHealth();
        setLlmEnabled(data.llmEnabled);
        setModelName(data.modelName);
        setModelApiBaseUrl(data.modelApiBaseUrl);
      } catch (err) {
        console.error('Error checking LLM status:', err);
        // Default to true on error to avoid showing false warnings
        setLlmEnabled(true);
      }
    };

    // Defer to not block initial render
    const timer = setTimeout(() => {
      checkLlmStatus();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Check GitHub connection status
  useEffect(() => {
    const checkGitHub = async () => {
      try {
        const status = await fetchGitHubStatus();
        setGithubConnected(status.connected);
        setGithubRepos(status.repos || []);
      } catch (err) {
        // GitHub integration is optional, don't show error
        console.error('Error checking GitHub status:', err);
      }
    };

    const timer = setTimeout(() => {
      checkGitHub();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Load reviews on initial mount
  useEffect(() => {
    const loadReviews = async () => {
      try {
        setReviewsLoading(true);
        const data = await fetchReviews();
        setReviews(data.reviews || []);
        setReviewsError(null);
      } catch (err) {
        setReviewsError(err.message);
      } finally {
        setReviewsLoading(false);
      }
    };

    // Defer loading reviews to next tick to allow UI to render first
    const timer = setTimeout(() => {
      loadReviews();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Poll for new reviews when Reviews tab is active
  useEffect(() => {
    if (activeTab !== 2) {
      // Not on Reviews tab, don't poll
      return;
    }

    const refreshReviews = async () => {
      try {
        setReviewsRefreshing(true);
        const data = await fetchReviews();
        setReviews(data.reviews || []);
        setReviewsError(null);
      } catch (err) {
        console.error('Error refreshing reviews:', err);
        // Don't overwrite existing reviews on error, just log it
      } finally {
        setReviewsRefreshing(false);
      }
    };

    // Poll every 5 seconds when on Reviews tab
    const pollInterval = setInterval(refreshReviews, 5000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [activeTab]);

  const handleRefreshReviews = async () => {
    try {
      setReviewsRefreshing(true);
      const data = await fetchReviews();
      setReviews(data.reviews || []);
      setReviewsError(null);
    } catch (err) {
      setReviewsError(err.message);
    } finally {
      setReviewsRefreshing(false);
    }
  };

  const handleCopyMarkdown = (reviewId) => {
    const markdown = reviewDetails[reviewId]?.markdown;
    if (markdown) {
      navigator.clipboard.writeText(markdown)
        .then(() => {
          setCopySnackbarOpen(true);
        })
        .catch((err) => {
          console.error('Failed to copy markdown:', err);
        });
    }
  };

  const handleArchiveClick = (reviewId, event) => {
    event.stopPropagation(); // Prevent accordion from expanding
    setReviewToArchive(reviewId);
    setArchiveDialogOpen(true);
  };

  const handleArchiveConfirm = async () => {
    if (!reviewToArchive) return;

    setArchiving(true);
    try {
      await archiveReview(reviewToArchive);

      // Reload reviews list
      const data = await fetchReviews();
      setReviews(data.reviews || []);

      // Close dialog
      setArchiveDialogOpen(false);
      setReviewToArchive(null);
    } catch (err) {
      console.error('Error archiving review:', err);
      alert(`Failed to archive review: ${err.message}`);
    } finally {
      setArchiving(false);
    }
  };

  const handleArchiveCancel = () => {
    setArchiveDialogOpen(false);
    setReviewToArchive(null);
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';

    // Convert UTC timestamp in seconds to milliseconds and create Date object
    const date = new Date(timestamp * 1000);

    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Check if it's today
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return `Today ${timeStr}`;
    }

    // Check if it's yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isYesterday) {
      return `Yesterday ${timeStr}`;
    }

    // Check if it's within the last week
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }

    // For older dates, show the full date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 1: return 'error';
      case 2: return 'warning';
      case 3: return 'info';
      default: return 'default';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'feature': return 'primary';
      case 'bugfix': return 'error';
      case 'refactor': return 'secondary';
      case 'enhancement': return 'success';
      default: return 'default';
    }
  };

  const getCommitDescription = (commit) => {
    const patches = commit.metadata?.patches || [];
    if (patches.length === 0) return 'No patches available';

    const categories = [...new Set(patches.map(p => p.category))];
    const mainCategory = categories[0] || 'unknown';

    if (patches.length === 1) {
      return patches[0].description;
    }

    return `${patches.length} patches including ${categories.join(', ')} changes`;
  };

  const truncateDescription = (description, maxLength = 80) => {
    if (!description) return '';

    // Get first line
    const firstLine = description.split('\n')[0];

    // Truncate if longer than maxLength
    if (firstLine.length > maxLength) {
      return firstLine.substring(0, maxLength) + '...';
    }

    // Add ... if there are more lines
    if (description.includes('\n')) {
      return firstLine + '...';
    }

    return firstLine;
  };

  const handlePatchClick = (commit, patch) => {
    navigate(`/patch/${commit.commitId}/${encodeURIComponent(patch.id)}`);
  };

  const handleDeleteClick = (commit, event) => {
    event.stopPropagation(); // Prevent accordion expansion
    setCommitToDelete(commit);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!commitToDelete) return;
    
    try {
      setDeleting(true);
      await deleteCommit(commitToDelete.commitId);
      
      // Remove the deleted commit from the state
      setCommits(prevCommits => 
        prevCommits.filter(c => c.commitId !== commitToDelete.commitId)
      );
      
      // Update stats - count only active patches
      const deletedCommitPatches = commitToDelete.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0;
      setStats(prevStats => ({
        total: prevStats.total - 1,
        totalPatches: prevStats.totalPatches - deletedCommitPatches
      }));
      
      setDeleteDialogOpen(false);
      setCommitToDelete(null);
    } catch (error) {
      console.error('Error deleting commit:', error);
      setError(`Failed to delete commit: ${error.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setCommitToDelete(null);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleReviewExpand = async (reviewId) => {
    // Toggle: if already expanded, collapse it
    if (expandedReview === reviewId) {
      setExpandedReview(null);
      return;
    }

    // Set as expanded
    setExpandedReview(reviewId);

    // Fetch details if not already cached
    if (!reviewDetails[reviewId]) {
      try {
        const details = await fetchReviewById(reviewId);
        setReviewDetails(prev => ({ ...prev, [reviewId]: details }));
      } catch (err) {
        console.error('Error fetching review details:', err);
        alert(`Failed to load review: ${err.message}`);
      }
    }
  };

  const handleNewReview = async (reviewId) => {
    // Switch to Reviews tab
    setActiveTab(2);

    try {
      // Reload reviews list
      const data = await fetchReviews();
      setReviews(data.reviews || []);

      // Expand the new review
      setExpandedReview(reviewId);

      // Fetch the review details immediately
      const details = await fetchReviewById(reviewId);
      setReviewDetails(prev => ({ ...prev, [reviewId]: details }));
    } catch (err) {
      console.error('Error loading review:', err);
      alert(`Failed to load review: ${err.message}`);
    }
  };

  const handleNewSplit = async (commitId) => {
    // Switch to Split Patches tab
    setActiveTab(0);

    try {
      // Reload commits list
      const commitsData = await fetchCommits();
      setCommits(commitsData);

      // Navigate to the new patch detail view with state to trigger mental model dialog
      if (commitId) {
        // Get the first patch (0) of the newly split commit
        navigate(`/patch/${commitId}/0`, { state: { fromSplit: true } });
      }
    } catch (err) {
      console.error('Error loading new split:', err);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Left Panel - Repository Drawer */}
      <Drawer
        variant="persistent"
        open={drawerOpen}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            borderRight: 'none',
            backgroundColor: colors.background.paper,
            overflow: 'visible',
          },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <RepositoryPanel
            repositories={repositories}
            loading={reposLoading}
            error={reposError}
            onReviewComplete={handleNewReview}
            onSplitComplete={handleNewSplit}
            onOpenSettings={() => setSettingsDialogOpen(true)}
          />
          {/* Resize Handle */}
          <Box
            onMouseDown={handleMouseDown}
            sx={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 4,
              cursor: 'col-resize',
              backgroundColor: isResizing ? colors.primary.main : 'transparent',
              borderRight: `1px solid ${colors.border.light}`,
              transition: 'background-color 0.15s ease',
              '&:hover': {
                backgroundColor: colors.primary.light,
              },
              zIndex: 1000,
            }}
          />
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          backgroundColor: colors.background.default,
          transition: isResizing ? 'none' : 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
          marginLeft: drawerOpen ? 0 : `-${drawerWidth}px`
        }}
      >
        {/* Toggle Button */}
        <Box
          sx={{
            position: 'fixed',
            left: drawerOpen ? drawerWidth : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1201,
            transition: isResizing ? 'none' : 'left 225ms cubic-bezier(0, 0, 0.2, 1) 0ms'
          }}
        >
          <IconButton
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{
              backgroundColor: colors.background.paper,
              border: `1px solid ${colors.border.light}`,
              borderLeft: drawerOpen ? `1px solid ${colors.border.light}` : 'none',
              borderRadius: drawerOpen ? '0 8px 8px 0' : '0 8px 8px 0',
              width: 32,
              height: 64,
              color: colors.text.secondary,
              '&:hover': {
                backgroundColor: colors.background.subtle,
                color: colors.primary.main,
              },
              boxShadow: '2px 0 8px rgba(0,0,0,0.08)'
            }}
          >
            {drawerOpen ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </IconButton>
        </Box>
        <Container maxWidth={false} sx={{ py: 4, px: 4 }}>
          {/* Root Directory Warning Banner */}
          {rootDirWarning && (
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Invalid Repository Paths Detected
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.875rem', mt: 1 }}>
                The following repositories have paths that don't start with the required root directory (<code>{rootDirWarning.rootDir}</code>):
              </Typography>
              <ul style={{ marginTop: '8px', marginBottom: '8px', paddingLeft: '20px' }}>
                {rootDirWarning.invalidRepos.map((repo, idx) => (
                  <li key={idx}>
                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                      {repo}
                    </Typography>
                  </li>
                ))}
              </ul>
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                Please update these repository paths in Settings to start with <code>{rootDirWarning.rootDir}</code>.
              </Typography>
            </Alert>
          )}

          {/* LLM Disabled Banner */}
          {!llmEnabled && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                LLM-based analysis is disabled
              </Typography>
              <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                All analysis will be run without any LLM enhancements and some features might not be available.
                Set <code>ARMCHAIR_MODEL_API_KEY</code> environment variable and rerun <code>run_explainer.sh</code> to enable LLM-based features.
              </Typography>
            </Alert>
          )}

          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 4,
            p: 3,
            backgroundColor: colors.background.paper,
            borderRadius: 2,
            border: `1px solid ${colors.border.light}`,
            borderTop: `3px solid ${colors.primary.main}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
          }}>
            <Box>
              <Typography variant="h4" component="h1" sx={{ mb: 0.5, fontWeight: 700 }}>
                ArmChair Change Browser
              </Typography>
              {(modelName || modelApiBaseUrl) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                  {modelName && (
                    <Chip
                      size="small"
                      label={modelName}
                      sx={{
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        color: colors.primary.dark,
                        fontWeight: 500,
                        fontSize: '0.75rem',
                      }}
                    />
                  )}
                  {modelApiBaseUrl && (
                    <Typography variant="caption" color="text.secondary">
                      {modelApiBaseUrl}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<StarIcon />}
                endIcon={<GitHubIcon sx={{ fontSize: 16 }} />}
                href="https://github.com/armchr/armchr"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  textTransform: 'none',
                  borderColor: colors.border.main,
                  color: colors.text.secondary,
                  fontSize: '0.8rem',
                  py: 0.75,
                  '&:hover': {
                    borderColor: colors.primary.main,
                    backgroundColor: 'rgba(99, 102, 241, 0.04)',
                    color: colors.primary.main,
                  }
                }}
              >
                Star on GitHub
              </Button>
              <IconButton
                onClick={handleMenuClick}
                sx={{
                  color: colors.text.secondary,
                  border: `1px solid ${colors.border.light}`,
                  borderRadius: 2,
                  '&:hover': {
                    backgroundColor: colors.background.subtle,
                    color: colors.primary.main,
                    borderColor: colors.primary.light,
                  }
                }}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Menu */}
          <Menu
            anchorEl={menuAnchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem onClick={() => handleMenuItemClick('settings')}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Settings</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleMenuItemClick('github')}>
              <ListItemIcon>
                <GitHubIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>GitHub Repository</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleMenuItemClick('github-pat-guide')}>
              <ListItemIcon>
                <VpnKeyIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>GitHub Token Guide</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleMenuItemClick('readme')}>
              <ListItemIcon>
                <ArticleIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>README</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleMenuItemClick('license')}>
              <ListItemIcon>
                <GavelIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>License</ListItemText>
            </MenuItem>
          </Menu>

          {/* Content Dialog */}
          <Dialog
            open={contentDialogOpen}
            onClose={handleContentDialogClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: {
                minHeight: '60vh',
                maxHeight: '80vh'
              }
            }}
          >
            <DialogTitle sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: colors.background.subtle,
              borderBottom: `1px solid ${colors.border.light}`
            }}>
              <Typography variant="h6">{contentDialogTitle}</Typography>
              <IconButton onClick={handleContentDialogClose} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              {contentLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box sx={{
                  '& pre': {
                    backgroundColor: colors.background.subtle,
                    padding: 2,
                    borderRadius: 1,
                    overflow: 'auto'
                  },
                  '& code': {
                    backgroundColor: colors.background.subtle,
                    padding: '2px 6px',
                    borderRadius: 1,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    fontSize: '0.875rem',
                  },
                  '& h1': { fontSize: '2rem', marginTop: 3, marginBottom: 2 },
                  '& h2': { fontSize: '1.5rem', marginTop: 2.5, marginBottom: 1.5 },
                  '& h3': { fontSize: '1.25rem', marginTop: 2, marginBottom: 1 },
                  '& p': { marginBottom: 1.5 },
                  '& ul, & ol': { marginBottom: 1.5, paddingLeft: 3 },
                  '& li': { marginBottom: 0.5 }
                }}>
                  {contentDialogType === 'markdown' ? (
                    <ReactMarkdown components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{contentDialogContent}</ReactMarkdown>
                  ) : (
                    <Typography component="pre" sx={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem'
                    }}>
                      {contentDialogContent}
                    </Typography>
                  )}
                </Box>
              )}
            </DialogContent>
          </Dialog>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={activeTab} onChange={handleTabChange} aria-label="content tabs">
              <Tab
                icon={<CallSplitIcon />}
                iconPosition="start"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>Split Patches</span>
                    <Badge
                      badgeContent={stats.total}
                      color="primary"
                      max={999}
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.75rem',
                          height: '20px',
                          minWidth: '20px',
                          borderRadius: '10px'
                        }
                      }}
                    >
                      <Box sx={{ width: 0, height: 0 }} />
                    </Badge>
                  </Box>
                }
                sx={{ textTransform: 'none', fontSize: '1rem', fontWeight: 500 }}
              />
              <Tab
                icon={<GitHubIcon />}
                iconPosition="start"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>Pull Requests</span>
                    {pullRequestCount > 0 && (
                      <Badge
                        badgeContent={pullRequestCount}
                        color="primary"
                        max={999}
                        sx={{
                          '& .MuiBadge-badge': {
                            fontSize: '0.75rem',
                            height: '20px',
                            minWidth: '20px',
                            borderRadius: '10px'
                          }
                        }}
                      >
                        <Box sx={{ width: 0, height: 0 }} />
                      </Badge>
                    )}
                  </Box>
                }
                sx={{ textTransform: 'none', fontSize: '1rem', fontWeight: 500 }}
              />
              <Tab
                icon={<RateReviewIcon />}
                iconPosition="start"
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>Reviews</span>
                    <Badge
                      badgeContent={reviews.length}
                      color="primary"
                      max={999}
                      sx={{
                        '& .MuiBadge-badge': {
                          fontSize: '0.75rem',
                          height: '20px',
                          minWidth: '20px',
                          borderRadius: '10px'
                        }
                      }}
                    >
                      <Box sx={{ width: 0, height: 0 }} />
                    </Badge>
                  </Box>
                }
                sx={{ textTransform: 'none', fontSize: '1rem', fontWeight: 500 }}
              />
            </Tabs>
          </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box>
          {/* Error state */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              Error loading commits: {error}
            </Alert>
          )}

          {/* Show welcome message immediately (even while loading) if no commits yet */}
          {commits.length === 0 && !error && (
        <Card sx={{ p: 4, backgroundColor: colors.background.paper, border: `1px solid ${colors.border.light}` }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <InfoIcon sx={{ fontSize: 48, color: colors.primary.main, mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Welcome to ArmChair Change Browser
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Get started by exploring your repositories and splitting changes into logical patches
            </Typography>
            {loading && (
              <Box sx={{ mt: 2 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Checking for existing patches...
                </Typography>
              </Box>
            )}
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                <FolderIcon sx={{ mr: 2, color: colors.primary.main, mt: 0.5 }} />
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Browse Repositories
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Use the left panel to see all your configured repositories, branches, and commits. Navigate through your codebase easily.
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                <BuildIcon sx={{ mr: 2, color: colors.primary.main, mt: 0.5 }} />
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Split Changes
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Select a commit or view uncommitted changes, then split them into smaller logical patches for easier review.
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                <DescriptionIcon sx={{ mr: 2, color: colors.primary.main, mt: 0.5 }} />
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Review Patches
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Browse split patches with AI-generated descriptions and annotations. Each patch represents a logical change that's easy to understand.
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                <CodeIcon sx={{ mr: 2, color: colors.primary.main, mt: 0.5 }} />
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Better Reviews
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Push forward smaller, focused changes for peer review instead of one large changeset. Improve code review quality and speed.
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Card>
      )}

      {/* Commits list - show when we have commits */}
      {commits.length > 0 && (
        <Box>
          {commits.map((commit) => (
            <Accordion
              key={commit.commitId}
              sx={{
                mb: 2,
                border: `1px solid ${colors.border.light}`,
                borderRadius: 2,
                '&:before': { display: 'none' },
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderColor: colors.border.main,
                }
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ color: colors.text.secondary }} />}
                sx={{
                  backgroundColor: colors.background.paper,
                  borderRadius: '12px 12px 0 0',
                  '&.Mui-expanded': {
                    borderRadius: '12px 12px 0 0',
                    backgroundColor: colors.background.subtle,
                  }
                }}
              >
                <Box sx={{ width: '100%', pr: 2, display: 'flex', justifyContent: 'space-between' }}>
                  {/* Left side: Description and metadata */}
                  <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* First line: Description */}
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <CodeIcon sx={{ mr: 1, color: colors.primary.main }} />
                      <Typography variant="h6" component="div">
                        {commit.metadata?.repository?.description
                          ? truncateDescription(commit.metadata.repository.description)
                          : commit.metadata?.goalSummary
                          ? truncateDescription(commit.metadata.goalSummary)
                          : commit.commitId}
                      </Typography>
                    </Box>

                    {/* Vertical metadata: Repo, Branch, Path */}
                    <Box sx={{ ml: 4 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.3 }}>
                        <strong>Repo:</strong> {commit.metadata?.repository?.source_repo_name || 'Unknown'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.3 }}>
                        <strong>Branch:</strong> {commit.metadata?.repository?.current_branch || 'N/A'}
                      </Typography>
                      {(commit.metadata?.repository?.description || commit.metadata?.goalSummary) && (
                        <Typography variant="body2" color="text.secondary">
                          <strong>Path:</strong> {commit.commitId}
                        </Typography>
                      )}
                    </Box>

                    {/* Mental Model Summary Preview */}
                    <MentalModelSummary mentalModel={commit.metadata?.mental_model} />
                  </Box>

                  {/* Right side: Statistics stacked vertically */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, minWidth: '180px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <BuildIcon sx={{ mr: 0.5, fontSize: 18, color: colors.primary.main }} />
                      <Typography variant="body2" color="text.secondary">
                        <strong>{commit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0}</strong> patches
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <StorageIcon sx={{ mr: 0.5, fontSize: 18, color: colors.primary.main }} />
                      <Typography variant="body2" color="text.secondary">
                        <strong>{commit.metadata?.patches?.filter(p => p.state !== 'deleted').reduce((total, patch) =>
                          total + (patch.files?.length || 0), 0) || 0}</strong> files
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <ScheduleIcon sx={{ mr: 0.5, fontSize: 18, color: colors.text.muted }} />
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(commit.metadata?.generatedAt)}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ArchiveIcon />}
                      onClick={(event) => handleDeleteClick(commit, event)}
                      sx={{
                        color: colors.text.secondary,
                        borderColor: colors.border.main,
                        mt: 0.5,
                        '&:hover': {
                          backgroundColor: 'rgba(99, 102, 241, 0.04)',
                          borderColor: colors.primary.main,
                          color: colors.primary.main,
                        }
                      }}
                    >
                      Archive
                    </Button>
                  </Box>
                </Box>
              </AccordionSummary>
              
              <AccordionDetails sx={{ backgroundColor: colors.background.paper }}>
                {/* Full Mental Model Card */}
                <MentalModelCard mentalModel={commit.metadata?.mental_model} />

                <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
                  Patch Details ({commit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0})
                </Typography>

                {commit.metadata?.patches?.length > 0 ? (
                  <Grid container spacing={2}>
                    {commit.metadata.patches.map((patch) => (
                      <Grid item xs={12} md={6} key={patch.id}>
                        <Card
                          variant="outlined"
                          sx={{
                            backgroundColor: colors.background.paper,
                            border: `1px solid ${colors.border.light}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease-in-out',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            '&:hover': {
                              backgroundColor: colors.background.subtle,
                              borderColor: colors.primary.main,
                              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)'
                            }
                          }}
                          onClick={() => handlePatchClick(commit, patch)}
                        >
                          <CardContent sx={{ pb: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                              <DescriptionIcon sx={{ mr: 2, color: colors.primary.main }} />
                              <Typography variant="h6" component="h4" sx={{ flexGrow: 1 }}>
                                {patch.name}
                              </Typography>
                            </Box>

                            <Typography variant="body1" sx={{ mb: 2 }}>
                              {patch.description}
                            </Typography>

                            <Divider sx={{ mb: 2 }} />

                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                                Files ({patch.files?.length || 0}):
                              </Typography>
                              {patch.files?.map((file, idx) => {
                                // Count annotations for this file
                                const fileAnnotations = patch.annotations?.filter(ann => ann.file_path === file) || [];
                                const totalLines = fileAnnotations.reduce((sum, ann) => {
                                  return sum + (ann.end_line - ann.start_line + 1);
                                }, 0);

                                return (
                                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', ml: 2, mb: 0.5 }}>
                                    <FilePath path={file} variant="body2" sx={{ flexGrow: 1 }} />
                                    {fileAnnotations.length > 0 && (
                                      <Typography variant="caption" sx={{ color: colors.accent.main, ml: 2 }}>
                                        {fileAnnotations.length} change{fileAnnotations.length !== 1 ? 's' : ''} annotated, {totalLines} line{totalLines !== 1 ? 's' : ''} changed
                                      </Typography>
                                    )}
                                  </Box>
                                );
                              }) || <Typography variant="body2" color="text.secondary">No files specified</Typography>}
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                ) : (
                  <Alert severity="info">
                    No patches available for this commit.
                  </Alert>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}

          {/* Loading indicator at bottom when loading more patches */}
          {loading && commits.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <PatchCardSkeleton count={2} />
            </Box>
          )}
        </Box>
      )}

      {/* Pull Requests Tab Content */}
      {activeTab === 1 && (
        <PullRequestsTab
          githubConnected={githubConnected}
          githubRepos={githubRepos}
          onSplitComplete={handleNewSplit}
          onOpenSettings={() => setSettingsDialogOpen(true)}
        />
      )}

      {/* Reviews Tab Content */}
      {activeTab === 2 && (
        <Box>
          {/* Loading state with skeleton */}
          {reviewsLoading && (
            <ReviewCardSkeleton count={3} />
          )}

          {/* Error state */}
          {reviewsError && (
            <Alert severity="error" sx={{ mb: 3 }}>
              Error loading reviews: {reviewsError}
            </Alert>
          )}

          {/* Empty state */}
          {!reviewsLoading && !reviewsError && reviews.length === 0 && (
            <Card sx={{ p: 4, backgroundColor: 'rgba(99, 102, 241, 0.04)', border: `1px solid ${colors.primary.light}` }}>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <RateReviewIcon sx={{ fontSize: 48, color: colors.primary.main, mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                  Code Reviews
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  No reviews yet. Click the review button on any commit in the left panel to generate an AI-powered code review.
                </Typography>
              </Box>

              <Divider sx={{ mb: 3 }} />

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                    <RateReviewIcon sx={{ mr: 2, color: colors.primary.main, mt: 0.5 }} />
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Automated Reviews
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Click the review button on any commit in the left panel to generate an AI-powered code review.
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                    <InfoIcon sx={{ mr: 2, color: colors.primary.main, mt: 0.5 }} />
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        Review History
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        All review results are saved in the reviews directory for future reference and analysis.
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Card>
          )}

          {/* Reviews list */}
          {!reviewsLoading && reviews.length > 0 && (
            <Box>
              {/* Reviews header with refresh button */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Recent Reviews ({reviews.length})
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={reviewsRefreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={handleRefreshReviews}
                  disabled={reviewsRefreshing}
                >
                  {reviewsRefreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
              </Box>

              {reviews.map((review) => (
                <Accordion
                  key={review.id}
                  expanded={expandedReview === review.id}
                  onChange={() => handleReviewExpand(review.id)}
                  sx={{
                    mb: 2,
                    border: `1px solid ${colors.border.light}`,
                    borderRadius: 2,
                    '&:before': { display: 'none' },
                    boxShadow: expandedReview === review.id ? '0 4px 12px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.08)',
                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                    '&:hover': {
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderColor: colors.border.main,
                    }
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ color: colors.text.secondary }} />}
                    sx={{
                      backgroundColor: expandedReview === review.id ? 'rgba(99, 102, 241, 0.08)' : colors.background.paper,
                      borderRadius: '12px 12px 0 0',
                      '&.Mui-expanded': {
                        borderRadius: '12px 12px 0 0'
                      }
                    }}
                  >
                    <Box sx={{ width: '100%', pr: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <RateReviewIcon sx={{ mr: 1, color: colors.primary.main }} />
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                          {reviewDetails[review.id]?.review?.repository?.commit_message
                            ? (reviewDetails[review.id].review.repository.commit_message.length > 80
                                ? reviewDetails[review.id].review.repository.commit_message.substring(0, 80) + '...'
                                : reviewDetails[review.id].review.repository.commit_message)
                            : (review.isUncommitted ? 'Uncommitted Changes' : review.repoName)
                          }
                        </Typography>
                        {review.isUncommitted && (
                          <Chip label="Uncommitted" size="small" color="warning" sx={{ ml: 2 }} />
                        )}
                        <Tooltip title="Archive review">
                          <IconButton
                            size="small"
                            onClick={(e) => handleArchiveClick(review.id, e)}
                            sx={{ ml: 1 }}
                          >
                            <ArchiveIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Box sx={{ ml: 4, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Repository:</strong> {review.repoName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Branch:</strong> {review.branch || 'N/A'}
                        </Typography>
                        {review.commitId && (
                          <Typography variant="body2" color="text.secondary">
                            <strong>Commit:</strong> {review.commitId.substring(0, 7)}
                          </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary">
                          <strong>Files:</strong> {review.fileCount}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Created:</strong> {formatDate(review.timestamp)}
                        </Typography>
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails sx={{ backgroundColor: colors.background.paper, p: 3 }}>
                    {reviewDetails[review.id] ? (
                      <Box>
                        {/* Copy button */}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                          <Tooltip title="Copy review as markdown">
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<ContentCopyIcon />}
                              onClick={() => handleCopyMarkdown(review.id)}
                              sx={{ textTransform: 'none' }}
                            >
                              Copy Markdown
                            </Button>
                          </Tooltip>
                        </Box>

                        {/* File list */}
                        {reviewDetails[review.id].files && reviewDetails[review.id].files.length > 0 && (
                          <Box sx={{ mb: 3, p: 2, backgroundColor: colors.background.subtle, borderRadius: 1, border: `1px solid ${colors.border.light}` }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center' }}>
                              <DescriptionIcon sx={{ fontSize: 18, mr: 1, color: colors.primary.main }} />
                              Files Changed ({reviewDetails[review.id].files.length})
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {reviewDetails[review.id].files.map((file, idx) => (
                                <Chip
                                  key={idx}
                                  label={file}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                                    fontSize: '0.75rem',
                                    backgroundColor: colors.background.paper,
                                    borderColor: colors.border.light,
                                  }}
                                />
                              ))}
                            </Box>
                          </Box>
                        )}

                        {/* Review markdown content */}
                        {reviewDetails[review.id].markdown ? (
                          <Box sx={{
                            '& h1': { fontSize: '1.5rem', marginTop: 2, marginBottom: 1.5, borderBottom: `2px solid ${colors.border.light}`, paddingBottom: 1 },
                            '& h2': { fontSize: '1.25rem', marginTop: 2, marginBottom: 1, borderBottom: `1px solid ${colors.border.light}`, paddingBottom: 0.5 },
                            '& h3': { fontSize: '1.1rem', marginTop: 1.5, marginBottom: 0.75 },
                            '& p': { marginBottom: 1 },
                            '& ul, & ol': { marginBottom: 1.5, paddingLeft: 3 },
                            '& li': { marginBottom: 0.5 },
                            '& code': {
                              backgroundColor: colors.background.subtle,
                              padding: '2px 6px',
                              borderRadius: 1,
                              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                              fontSize: '0.875em'
                            },
                            '& pre': {
                              backgroundColor: colors.background.subtle,
                              padding: 2,
                              borderRadius: 1,
                              overflow: 'auto',
                              marginBottom: 2,
                              border: `1px solid ${colors.border.light}`,
                            },
                            '& pre code': {
                              backgroundColor: 'transparent',
                              padding: 0
                            }
                          }}>
                            <ReactMarkdown>{reviewDetails[review.id].markdown}</ReactMarkdown>
                          </Box>
                        ) : (
                          <Alert severity="info">
                            No markdown content available for this review.
                          </Alert>
                        )}
                      </Box>
                    ) : (
                      <Box sx={{ textAlign: 'center', py: 2 }}>
                        <CircularProgress size={30} />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Loading review details...
                        </Typography>
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </Box>
      )}

          {/* Archive Confirmation Dialog */}
          <Dialog
            open={deleteDialogOpen}
            onClose={handleDeleteCancel}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Archive Patch Splits</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Are you sure you want to archive the patch splits for <strong>{commitToDelete?.commitId}</strong>?
                <br />
                <br />
                <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                  <strong>Note:</strong> This will only hide the patch splits from the tool's UI.
                  The actual patch files in your configured $ARMCHAIR_OUTPUT path will remain on disk and will not be deleted.
                </Alert>
                This action cannot be undone from the UI.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleDeleteCancel} color="primary">
                Cancel
              </Button>
              <Button
                onClick={handleDeleteConfirm}
                color="warning"
                variant="contained"
                disabled={deleting}
              >
                {deleting ? 'Archiving...' : 'Archive'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Archive Confirmation Dialog */}
          <Dialog
            open={archiveDialogOpen}
            onClose={handleArchiveCancel}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle sx={{ backgroundColor: colors.accent.light, color: colors.accent.dark }}>
              Archive Review
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
              <DialogContentText>
                Are you sure you want to archive this review? The review will be marked as archived but won't be deleted.
              </DialogContentText>
              {reviewToArchive && reviewDetails[reviewToArchive] && (
                <Box sx={{ mt: 2, p: 2, backgroundColor: colors.background.subtle, borderRadius: 1, border: `1px solid ${colors.border.light}` }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                    Review Details:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Repository:</strong> {reviewDetails[reviewToArchive].repoName}
                  </Typography>
                  {reviewDetails[reviewToArchive].branch && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>Branch:</strong> {reviewDetails[reviewToArchive].branch}
                    </Typography>
                  )}
                  {reviewDetails[reviewToArchive].commitId && (
                    <Typography variant="body2" color="text.secondary">
                      <strong>Commit:</strong> {reviewDetails[reviewToArchive].commitId.substring(0, 7)}
                    </Typography>
                  )}
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button
                onClick={handleArchiveCancel}
                disabled={archiving}
                variant="outlined"
              >
                Cancel
              </Button>
              <Button
                onClick={handleArchiveConfirm}
                disabled={archiving}
                variant="contained"
                color="warning"
                startIcon={archiving ? <CircularProgress size={16} /> : <ArchiveIcon />}
              >
                {archiving ? 'Archiving...' : 'Archive'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Copy Success Snackbar */}
          <Snackbar
            open={copySnackbarOpen}
            autoHideDuration={3000}
            onClose={() => setCopySnackbarOpen(false)}
            message="Review markdown copied to clipboard"
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          />

          {/* Settings Dialog */}
          <SettingsDialog
            open={settingsDialogOpen}
            onClose={() => setSettingsDialogOpen(false)}
            onOpenGitHubGuide={() => {
              setSettingsDialogOpen(false);
              handleMenuItemClick('github-pat-guide');
            }}
          />
        </Container>
      </Box>
    </Box>
  );
};

export default CommitsPage;