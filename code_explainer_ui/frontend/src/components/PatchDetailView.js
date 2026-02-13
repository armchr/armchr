import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Button,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Snackbar,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Collapse
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  Code as CodeIcon,
  Description as DescriptionIcon,
  Storage as StorageIcon,
  Schedule as ScheduleIcon,
  Build as BuildIcon,
  CallSplit as CallSplitIcon,
  CheckCircle as CheckCircleIcon,
  PlayArrow as PlayArrowIcon,
  Info as InfoIcon,
  ExpandMore as ExpandMoreIcon,
  RateReview as RateReviewIcon,
  LightbulbOutlined as LightbulbIcon,
  ArrowForward as ArrowForwardIcon,
  Psychology as PsychologyIcon,
  TipsAndUpdates as TipsIcon
} from '@mui/icons-material';
import { fetchPatchContent, fetchCommits, fetchCommitDiff, splitCommit, fetchWorkingDirectoryDiff, applyPatch, reviewCommit } from '../services/api';
import DiffViewer from './DiffViewer';
import FilePath, { CommitHash } from './FilePath';
import Breadcrumbs from './Breadcrumbs';
import { colors } from '../App';

const PatchDetailView = () => {
  const { commitId, patchId, repoName, commitHash, branchName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [commit, setCommit] = useState(null);
  const [patch, setPatch] = useState(null);
  const [allPatches, setAllPatches] = useState([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [patchContent, setPatchContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [splitting, setSplitting] = useState(false);
  const [splitSuccess, setSplitSuccess] = useState(false);
  const [splitError, setSplitError] = useState(null);
  const [splitErrorDetails, setSplitErrorDetails] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [reviewError, setReviewError] = useState(null);
  const [showMentalModel, setShowMentalModel] = useState(true);
  const [mentalModelDialogOpen, setMentalModelDialogOpen] = useState(false);
  const [pendingMentalModelDialog, setPendingMentalModelDialog] = useState(false);

  // Determine view type
  const isCommitView = !!repoName && !!commitHash && !branchName;
  const isWorkingDirectoryView = !!repoName && !!branchName && !commitHash;

  const files = patch?.files || [];
  const currentFile = files[currentFileIndex];
  const currentPatchIndex = allPatches.findIndex(p => 
    p.id === patch?.id || String(p.id) === String(patch?.id)
  );

  // Load commit and patch data based on URL parameters
  useEffect(() => {
    const loadCommitAndPatch = async () => {
      try {
        setLoading(true);
        // Reset file index when loading a new patch
        setCurrentFileIndex(0);

        // Handle working directory view (from repository panel uncommitted changes)
        if (isWorkingDirectoryView) {
          const workingDirData = await fetchWorkingDirectoryDiff(repoName, branchName);
          setPatchContent(workingDirData.diff);
          setCommit({
            repoName: workingDirData.repoName,
            branchName: workingDirData.branchName,
            message: 'Uncommitted Changes',
            files: workingDirData.workingDirectory.files,
            status: workingDirData.workingDirectory.status
          });
          setPatch({
            id: 'working-directory',
            name: 'Uncommitted Changes',
            description: `Working directory changes in ${workingDirData.branchName} branch`,
            files: workingDirData.workingDirectory.files
          });
          setLoading(false);
          return;
        }

        // Handle commit view (from repository panel)
        if (isCommitView) {
          const commitData = await fetchCommitDiff(repoName, commitHash);
          setPatchContent(commitData.diff);
          setCommit({
            repoName: commitData.repoName,
            commitHash: commitData.commit.hash,
            shortHash: commitData.commit.shortHash,
            message: commitData.commit.message,
            body: commitData.commit.body,
            author: commitData.commit.author,
            email: commitData.commit.email,
            relativeDate: commitData.commit.relativeDate,
            files: commitData.commit.files
          });
          setPatch({
            id: commitData.commit.shortHash,
            name: commitData.commit.message,
            description: commitData.commit.body || commitData.commit.message,
            files: commitData.commit.files
          });
          setLoading(false);
          return;
        }

        // Handle patch view (from commits page)
        const commitsData = await fetchCommits();
        const targetCommit = commitsData.commits.find(c => c.commitId === commitId);

        if (!targetCommit) {
          setError('Commit not found');
          return;
        }

        // Decode the patch ID from URL
        const decodedPatchId = decodeURIComponent(patchId);

        // Try to find patch by exact ID match first (both string and number comparison)
        let targetPatch = targetCommit.metadata?.patches?.find(p =>
          p.id === decodedPatchId || String(p.id) === decodedPatchId
        );

        // If still not found and patchId looks like a number, try finding by index as last resort
        if (!targetPatch && /^\d+$/.test(decodedPatchId)) {
          const patchIndex = parseInt(decodedPatchId);
          // Only use index-based lookup if the index is valid and no ID match was found
          if (patchIndex >= 0 && patchIndex < (targetCommit.metadata?.patches?.length || 0)) {
            targetPatch = targetCommit.metadata?.patches?.[patchIndex];
          }
        }

        if (!targetPatch) {
          setError(`Patch not found. Available patches: ${targetCommit.metadata?.patches?.map(p => p.id).join(', ')}`);
          return;
        }

        setCommit(targetCommit);
        setPatch(targetPatch);
        setAllPatches(targetCommit.metadata?.patches || []);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if ((commitId && patchId) || (repoName && commitHash) || (repoName && branchName)) {
      loadCommitAndPatch();
    }
  }, [commitId, patchId, repoName, commitHash, branchName, isCommitView, isWorkingDirectoryView]);

  // Check if navigated from split action - show mental model dialog
  // We need to track if we came from split separately since commit loads async
  useEffect(() => {
    if (location.state?.fromSplit) {
      setPendingMentalModelDialog(true);
      // Clear the navigation state immediately
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Show dialog once commit with mental model is loaded
  useEffect(() => {
    if (pendingMentalModelDialog && commit?.metadata?.mental_model) {
      setMentalModelDialogOpen(true);
      setPendingMentalModelDialog(false);
    }
  }, [pendingMentalModelDialog, commit]);

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

  useEffect(() => {
    const loadPatchContent = async () => {
      if (!patch || !commit || isCommitView || isWorkingDirectoryView) return; // Skip for commit/working dir view as diff is already loaded

      try {
        setLoading(true);
        setError(null);

        if (patch.filename) {
          const response = await fetchPatchContent(commit.commitId, patch.filename);
          setPatchContent(response.content);
        } else {
          setPatchContent('No patch file available');
        }
      } catch (err) {
        setError(err.message);
        setPatchContent('Failed to load patch content');
      } finally {
        setLoading(false);
      }
    };

    loadPatchContent();
  }, [commit, patch, isCommitView, isWorkingDirectoryView]);

  const handlePreviousFile = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(currentFileIndex - 1);
    }
  };

  const handleNextFile = () => {
    if (currentFileIndex < files.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
    }
  };

  const handlePreviousPatch = () => {
    if (currentPatchIndex > 0 && allPatches[currentPatchIndex - 1]) {
      const previousPatch = allPatches[currentPatchIndex - 1];
      // Use encodeURIComponent to handle any special characters in patch ID
      navigate(`/patch/${commitId}/${encodeURIComponent(previousPatch.id)}`);
    }
  };

  const handleNextPatch = () => {
    if (currentPatchIndex < allPatches.length - 1 && allPatches[currentPatchIndex + 1]) {
      const nextPatch = allPatches[currentPatchIndex + 1];
      // Use encodeURIComponent to handle any special characters in patch ID
      navigate(`/patch/${commitId}/${encodeURIComponent(nextPatch.id)}`);
    }
  };

  const handleBackToList = () => {
    navigate('/');
  };

  const handleApplyPatch = async () => {
    if (!commit || !patch) return;

    setApplying(true);
    setApplyError(null);
    setApplySuccess(false);

    try {
      const repoName = commit.metadata?.repository?.source_repo_name || commit.metadata?.repository?.name;
      const branch = commit.metadata?.repository?.current_branch;

      // Construct the patch file path (commit.path + patch.filename)
      const patchFilePath = `${commit.path}/${patch.filename}`;

      // Apply with index flag and auto-commit
      const result = await applyPatch(repoName, patchFilePath, branch, true, true);

      setApplySuccess(true);

      // Show success message briefly
      setTimeout(() => {
        setApplySuccess(false);
      }, 3000);

    } catch (error) {
      console.error('Error applying patch:', error);
      setApplyError(error.message);
    } finally {
      setApplying(false);
    }
  };

  const handleSplit = async () => {
    if ((!isCommitView && !isWorkingDirectoryView) || !commit) return;

    setSplitting(true);
    setSplitError(null);
    setSplitErrorDetails(null);

    try {
      let result;
      if (isWorkingDirectoryView) {
        // Split working directory changes (no commit hash)
        result = await splitCommit(commit.repoName, commit.branchName, null);
      } else {
        // Split commit - for now we'll use 'main' as default base branch
        // In a real scenario, you might want to store branch info in the commit data
        result = await splitCommit(commit.repoName, 'main', commit.commitHash);
      }
      setSplitSuccess(true);

      // Navigate to the first patch of the new split with state to show mental model dialog
      setTimeout(() => {
        setSplitSuccess(false);
        const newCommitId = result.commitDir || result.commit_id;
        if (newCommitId) {
          // Navigate to first patch (id: 0) with state to trigger mental model dialog
          navigate(`/patch/${encodeURIComponent(newCommitId)}/0`, { state: { fromSplit: true } });
        } else {
          // Fallback to home page if no commit ID returned
          navigate('/');
        }
      }, 1500);
    } catch (err) {
      console.error('Error splitting:', err);
      setSplitError(err.message);
      setSplitErrorDetails(err.details || null);
      setSplitting(false);
    }
  };

  const handleReview = async () => {
    if ((!isCommitView && !isWorkingDirectoryView) || !commit) return;

    setReviewing(true);
    setReviewError(null);
    try {
      let result;
      if (isWorkingDirectoryView) {
        // Review working directory changes (no commit hash)
        result = await reviewCommit(commit.repoName, commit.branchName, null);
      } else {
        // Review commit
        result = await reviewCommit(commit.repoName, null, commit.commitHash);
      }
      setReviewData(result.review);
      setReviewSuccess(true);

      // Show success message
      setTimeout(() => {
        setReviewSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Error reviewing:', err);
      setReviewError(err.message);
      setReviewing(false);
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth={false} sx={{ mt: 4, textAlign: 'center', px: 2 }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading patch data...
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth={false} sx={{ mt: 4, px: 2 }}>
        <Alert severity="error">
          {error}
        </Alert>
      </Container>
    );
  }

  if (!commit || !patch) {
    return (
      <Container maxWidth={false} sx={{ mt: 4, px: 2 }}>
        <Alert severity="error">Invalid patch or commit data</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} sx={{ py: 4, px: 4 }}>
      {/* Progress bar overlay when splitting */}
      {splitting && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
          <LinearProgress />
        </Box>
      )}

      {/* Snackbar for splitting notification */}
      <Snackbar
        open={splitting}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '80px !important' }}
      >
        <Alert severity="info" sx={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Splitting in progress... This may take a few moments.
            </Typography>
          </Box>
        </Alert>
      </Snackbar>

      {/* Snackbar for reviewing notification */}
      <Snackbar
        open={reviewing}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '80px !important' }}
      >
        <Alert severity="info" sx={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              Reviewing in progress... This may take a few moments.
            </Typography>
          </Box>
        </Alert>
      </Snackbar>

      {/* Snackbar for review success */}
      <Snackbar
        open={reviewSuccess}
        autoHideDuration={3000}
        onClose={() => setReviewSuccess(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '80px !important' }}
      >
        <Alert severity="success" sx={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}>
          Review completed successfully!
        </Alert>
      </Snackbar>

      {/* Snackbar for review error */}
      <Snackbar
        open={!!reviewError}
        autoHideDuration={5000}
        onClose={() => setReviewError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '80px !important' }}
      >
        <Alert severity="error" sx={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}>
          Review failed: {reviewError}
        </Alert>
      </Snackbar>

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
        <DialogTitle sx={{ backgroundColor: '#ffebee', color: '#c62828' }}>
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
                    backgroundColor: '#eeeeee'
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
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace', color: 'error.main' }}>
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

      {/* Mental Model Dialog - shown after successful split */}
      <Dialog
        open={mentalModelDialogOpen}
        onClose={() => setMentalModelDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{
          backgroundColor: 'rgba(99, 102, 241, 0.05)',
          borderBottom: `1px solid ${colors.border.light}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <PsychologyIcon sx={{ color: colors.primary.main }} />
          Before You Begin
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          {commit?.metadata?.mental_model && (
            <Box>
              {/* What This Change Does */}
              {commit.metadata.mental_model.summary && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: colors.text.primary }}>
                    What This Change Does
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {commit.metadata.mental_model.summary}
                  </Typography>
                </Box>
              )}

              {/* How Patches Progress */}
              {commit.metadata.mental_model.progression && commit.metadata.mental_model.progression.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: colors.text.primary }}>
                    How Patches Progress
                  </Typography>
                  <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                    {commit.metadata.mental_model.progression.map((step, idx) => (
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
              {commit.metadata.mental_model.key_concepts && commit.metadata.mental_model.key_concepts.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, color: colors.text.primary }}>
                    Key Concepts
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                    {commit.metadata.mental_model.key_concepts.map((concept, idx) => (
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
              {commit.metadata.mental_model.review_tips && (
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: 'rgba(16, 185, 129, 0.06)',
                    borderRadius: 1,
                    border: `1px solid rgba(16, 185, 129, 0.2)`,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <TipsIcon sx={{ fontSize: 20, color: colors.secondary.main, mt: 0.2 }} />
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5, color: colors.secondary.dark }}>
                        Review Tips
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {commit.metadata.mental_model.review_tips}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setMentalModelDialogOpen(false)}
            variant="contained"
            color="primary"
          >
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      {/* Breadcrumb Navigation */}
      <Breadcrumbs
        items={
          isWorkingDirectoryView
            ? [
                { label: 'Home', href: '/', icon: 'home' },
                { label: repoName, icon: 'folder' },
                { label: branchName, icon: 'code' },
                { label: 'Working Directory', icon: 'file' },
              ]
            : isCommitView
            ? [
                { label: 'Home', href: '/', icon: 'home' },
                { label: repoName, icon: 'folder' },
                { label: commitHash?.substring(0, 7), icon: 'code' },
              ]
            : [
                { label: 'Home', href: '/', icon: 'home' },
                { label: 'Split Patches', href: '/' },
                { label: commitId, icon: 'folder' },
                { label: `Patch ${parseInt(patchId) + 1}`, icon: 'file' },
              ]
        }
      />

      {/* Header with back button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={handleBackToList}
            sx={{
              mr: 2,
              border: `1px solid ${colors.border.light}`,
              '&:hover': {
                backgroundColor: colors.background.subtle,
                borderColor: colors.primary.light,
              },
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            {isWorkingDirectoryView ? 'Working Directory Changes' : isCommitView ? 'Commit Details' : 'Patch Details'}
          </Typography>
        </Box>
        {(isCommitView || isWorkingDirectoryView) && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={splitting ? <CircularProgress size={20} color="inherit" /> : splitSuccess ? <CheckCircleIcon /> : <CallSplitIcon />}
              onClick={handleSplit}
              disabled={splitting || reviewing}
              color={splitSuccess ? 'success' : 'primary'}
              sx={{
                minWidth: 160,
                fontSize: splitting ? '1rem' : '0.875rem',
                fontWeight: splitting ? 700 : 500,
                py: 1
              }}
            >
              {splitting ? 'Splitting...' : splitSuccess ? 'Split Complete!' : isWorkingDirectoryView ? 'Split Changes' : 'Split Commit'}
            </Button>
            <Button
              variant="outlined"
              startIcon={reviewing ? <CircularProgress size={20} color="inherit" /> : reviewSuccess ? <CheckCircleIcon /> : <RateReviewIcon />}
              onClick={handleReview}
              disabled={reviewing || splitting}
              color={reviewSuccess ? 'success' : 'secondary'}
              sx={{
                minWidth: 160,
                fontSize: reviewing ? '1rem' : '0.875rem',
                fontWeight: reviewing ? 700 : 500,
                py: 1
              }}
            >
              {reviewing ? 'Reviewing...' : reviewSuccess ? 'Review Complete!' : isWorkingDirectoryView ? 'Review Changes' : 'Review Commit'}
            </Button>
          </Box>
        )}
      </Box>

      {/* Commit/Patch Overview */}
      <Card elevation={2} sx={{ mb: 3, backgroundColor: colors.background.paper }}>
        <CardContent>
          {isWorkingDirectoryView ? (
            // Working directory view header
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CodeIcon sx={{ mr: 1, color: '#ff9800' }} />
                  <Typography variant="h6">
                    Uncommitted Changes
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Repository: {commit.repoName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Branch: {commit.branchName}
                </Typography>
              </Grid>

              <Grid item xs={12} md={5}>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  Working directory changes
                </Typography>
                {commit.status && (
                  <Box>
                    {commit.status.staged?.length > 0 && (
                      <Typography variant="body2" color="success.main">
                        {commit.status.staged.length} staged
                      </Typography>
                    )}
                    {commit.status.unstaged?.length > 0 && (
                      <Typography variant="body2" color="warning.main">
                        {commit.status.unstaged.length} unstaged
                      </Typography>
                    )}
                    {commit.status.untracked?.length > 0 && (
                      <Typography variant="body2" color="info.main">
                        {commit.status.untracked.length} untracked
                      </Typography>
                    )}
                  </Box>
                )}
              </Grid>

              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <StorageIcon sx={{ mr: 1, fontSize: 18, color: '#ff9800' }} />
                  <Typography variant="body2" color="text.secondary">
                    {commit.files?.length || 0} files changed
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          ) : isCommitView ? (
            // Commit view header
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CodeIcon sx={{ mr: 1, color: colors.primary.main }} />
                  <Typography variant="h6" sx={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace' }}>
                    {commit.shortHash}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Repository: {commit.repoName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  By {commit.author}
                </Typography>
              </Grid>

              <Grid item xs={12} md={5}>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  {commit.message}
                </Typography>
                {commit.body && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {commit.body}
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ScheduleIcon sx={{ mr: 1, fontSize: 18, color: colors.primary.main }} />
                  <Typography variant="body2" color="text.secondary">
                    {commit.relativeDate}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <StorageIcon sx={{ mr: 1, fontSize: 18, color: colors.primary.main }} />
                  <Typography variant="body2" color="text.secondary">
                    {commit.files?.length || 0} files changed
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          ) : (
            // Patch view header
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CodeIcon sx={{ mr: 1, color: colors.primary.main }} />
                  <Typography variant="h6">
                    {commit.metadata?.repository?.description
                      ? truncateDescription(commit.metadata.repository.description)
                      : commit.metadata?.goalSummary
                      ? truncateDescription(commit.metadata.goalSummary)
                      : commit.commitId}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {commit.metadata?.repository?.source_repo_name || 'Unknown Repo'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Branch: {commit.metadata?.repository?.current_branch || 'N/A'}
                </Typography>
                {(commit.metadata?.repository?.description || commit.metadata?.goalSummary) && (
                  <Typography variant="body2" color="text.secondary">
                    Path: {commit.commitId}
                  </Typography>
                )}
              </Grid>

              <Grid item xs={12} md={5}>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
                  Commit with {commit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0} patches
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ScheduleIcon sx={{ mr: 1, fontSize: 18, color: colors.primary.main }} />
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(commit.metadata?.generatedAt)}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <BuildIcon sx={{ mr: 1, fontSize: 20, color: colors.primary.main }} />
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {commit.metadata?.patches?.filter(p => p.state !== 'deleted').length || 0} patches
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    • {commit.metadata?.patches?.filter(p => p.state !== 'deleted').reduce((total, p) =>
                      total + (p.files?.length || 0), 0) || 0} files
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Mental Model Context Bar - Only for split patch view */}
      {!isCommitView && !isWorkingDirectoryView && commit?.metadata?.mental_model && (
        <Card
          sx={{
            mb: 3,
            backgroundColor: 'rgba(99, 102, 241, 0.03)',
            border: `1px solid ${colors.border.light}`,
            borderLeft: `4px solid ${colors.primary.main}`,
          }}
        >
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            {/* Header with toggle */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              onClick={() => setShowMentalModel(!showMentalModel)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <PsychologyIcon sx={{ color: colors.primary.main, fontSize: 22 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  About This Change
                </Typography>
                <Chip
                  label={`Patch ${currentPatchIndex + 1} of ${allPatches.filter(p => p.state !== 'deleted').length}`}
                  size="small"
                  sx={{
                    backgroundColor: colors.primary.light,
                    color: 'white',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                  }}
                />
              </Box>
              <Button
                size="small"
                sx={{ textTransform: 'none', color: colors.text.secondary }}
              >
                {showMentalModel ? 'Hide' : 'Show'} Details
              </Button>
            </Box>

            {/* Summary always visible */}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1.5, fontStyle: 'italic' }}
            >
              {commit.metadata.mental_model.summary}
            </Typography>

            {/* Expandable details */}
            <Collapse in={showMentalModel}>
              <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${colors.border.light}` }}>
                {/* Current patch context from progression */}
                {commit.metadata.mental_model.progression && currentPatchIndex >= 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <LightbulbIcon sx={{ fontSize: 16, color: colors.primary.main }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        This Patch
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {commit.metadata.mental_model.progression[currentPatchIndex] ||
                        commit.metadata.mental_model.progression[commit.metadata.mental_model.progression.length - 1]}
                    </Typography>
                  </Box>
                )}

                {/* Next patch preview */}
                {currentPatchIndex < allPatches.filter(p => p.state !== 'deleted').length - 1 && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <ArrowForwardIcon sx={{ fontSize: 16, color: colors.secondary.main }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Coming Next
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {allPatches.filter(p => p.state !== 'deleted')[currentPatchIndex + 1]?.name}
                    </Typography>
                  </Box>
                )}

                {/* Key concepts */}
                {commit.metadata.mental_model.key_concepts && commit.metadata.mental_model.key_concepts.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      Key Concepts
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {commit.metadata.mental_model.key_concepts.slice(0, 3).map((concept, idx) => (
                        <Chip
                          key={idx}
                          label={concept.length > 60 ? concept.substring(0, 60) + '...' : concept}
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: colors.border.main,
                            fontSize: '0.75rem',
                            maxWidth: '100%',
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Review tips */}
                {commit.metadata.mental_model.review_tips && (
                  <Box
                    sx={{
                      p: 1.5,
                      backgroundColor: 'rgba(16, 185, 129, 0.06)',
                      borderRadius: 1,
                      border: `1px solid rgba(16, 185, 129, 0.2)`,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: colors.secondary.dark }}>
                      Review Tips
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {commit.metadata.mental_model.review_tips}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      )}

      {/* Review Results */}
      {reviewData && (
        <Card elevation={2} sx={{ mb: 3, backgroundColor: '#f0f7ff' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <RateReviewIcon sx={{ mr: 2, color: colors.primary.main }} />
              <Typography variant="h5" component="h2">
                Code Review Results
              </Typography>
            </Box>
            <Box sx={{
              backgroundColor: '#fff',
              p: 2,
              borderRadius: 1,
              border: `1px solid ${colors.border.light}`,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '0.9rem',
              whiteSpace: 'pre-wrap',
              maxHeight: '600px',
              overflow: 'auto'
            }}>
              {JSON.stringify(reviewData, null, 2)}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Patch Navigation */}
      <Card elevation={2} sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <DescriptionIcon sx={{ mr: 2, color: colors.primary.main }} />
              <Typography variant="h5" component="h2">
                {patch.name}
              </Typography>
            </Box>

            {!isCommitView && !isWorkingDirectoryView && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handlePreviousPatch}
                  disabled={currentPatchIndex <= 0}
                >
                  Previous Patch
                </Button>
                <Typography variant="body2" sx={{ mx: 1 }}>
                  {currentPatchIndex + 1} of {allPatches.length}
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleNextPatch}
                  disabled={currentPatchIndex >= allPatches.length - 1}
                >
                  Next Patch
                </Button>
              </Box>
            )}
          </Box>

          {applySuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Patch applied and committed successfully!
            </Alert>
          )}

          {applyError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setApplyError(null)}>
              Failed to apply patch: {applyError}
            </Alert>
          )}
          
          <Typography variant="body1" sx={{ mb: 2 }}>
            {patch.description}
          </Typography>

          <Divider sx={{ mb: 2 }} />

          {/* Apply Instructions */}
          {!isCommitView && !isWorkingDirectoryView && (
            <Accordion sx={{ mb: 2 }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  backgroundColor: colors.background.subtle,
                  '&:hover': {
                    backgroundColor: '#e8e8e8'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <InfoIcon sx={{ fontSize: 18, mr: 1, color: colors.primary.main }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    How to Apply This Patch
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 2 }}>
                {commit?.commitId?.startsWith('uncommitted_') ? (
                  <Box>
                    <Alert severity="warning" sx={{ mb: 2, fontSize: '0.85rem' }}>
                      <strong>Warning:</strong> This patch is from uncommitted changes. Back up your work before applying!
                    </Alert>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '0.85rem', mb: 1 }}>
                      # Backup your current changes first
                      <br />git stash push -m "Backup before applying patch"
                      <br /><br />
                      # Apply the patch
                      <br />git apply "{patch.filename}"
                      <br /><br />
                      # Or apply and stage the changes
                      <br />git apply --index "{patch.filename}"
                      <br /><br />
                      # To restore your backup if needed
                      <br />git stash pop
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '0.85rem', mb: 1 }}>
                      # Apply the patch to your working directory
                      <br />git apply "{patch.filename}"
                      <br /><br />
                      # Or apply and stage the changes
                      <br />git apply --index "{patch.filename}"
                      <br /><br />
                      # To apply and commit in one step
                      <br />git apply --index "{patch.filename}" && git commit -m "Apply: {patch.name}"
                    </Typography>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                  Patch file location: {commit?.path ? `${commit.path}/${patch.filename}` : patch.filename}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}

          <Divider sx={{ mb: 2 }} />
          
          {/* File Navigation */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <StorageIcon sx={{ mr: 1, fontSize: 18, color: colors.primary.main }} />
              <Typography variant="body2" component="span" sx={{ fontWeight: 500, mr: 1 }}>
                File:
              </Typography>
              {currentFile ? <FilePath path={currentFile} /> : <Typography variant="body2">No files</Typography>}
            </Box>
            
            {files.length > 1 && (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <IconButton
                  onClick={handlePreviousFile}
                  disabled={currentFileIndex <= 0}
                  size="small"
                >
                  <ArrowLeftIcon />
                </IconButton>
                <Typography variant="body2" sx={{ mx: 2 }}>
                  {currentFileIndex + 1} of {files.length}
                </Typography>
                <IconButton
                  onClick={handleNextFile}
                  disabled={currentFileIndex >= files.length - 1}
                  size="small"
                >
                  <ArrowRightIcon />
                </IconButton>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Patch Content */}
      <Card elevation={2}>
        <CardContent>
          {loading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography>Loading patch content...</Typography>
            </Box>
          ) : error ? (
            <Alert severity="error">
              Error loading patch content: {error}
            </Alert>
          ) : (
            <DiffViewer 
              patchContent={patchContent}
              currentFile={currentFile}
              annotations={patch?.annotations || []}
            />
          )}
        </CardContent>
      </Card>
    </Container>
  );
};

export default PatchDetailView;