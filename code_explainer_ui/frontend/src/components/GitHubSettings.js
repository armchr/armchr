import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  GitHub as GitHubIcon,
  HelpOutline as HelpOutlineIcon
} from '@mui/icons-material';
import { validateGitHubPat } from '../services/api';
import { colors } from '../App';

const GitHubSettings = ({ pat, onPatChange, repos, onReposChange, onOpenGuide }) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [newRepo, setNewRepo] = useState('');

  // Verify PAT on load if set
  useEffect(() => {
    if (pat) {
      handleVerify();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await validateGitHubPat(pat);
      if (result.connected) {
        setVerifyResult({ success: true, login: result.login, name: result.name });
      } else {
        setVerifyResult({ success: false, error: result.error || 'Token validation failed' });
      }
    } catch (err) {
      setVerifyResult({ success: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const handleAddRepo = () => {
    const slug = newRepo.trim();
    if (!slug || repos.includes(slug)) return;
    // Validate format: owner/repo
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(slug)) {
      return;
    }
    onReposChange([...repos, slug]);
    setNewRepo('');
  };

  const handleRemoveRepo = (repoSlug) => {
    onReposChange(repos.filter(r => r !== repoSlug));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* PAT Input */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
        <TextField
          label="GitHub Personal Access Token"
          type="password"
          value={pat}
          onChange={(e) => { onPatChange(e.target.value); setVerifyResult(null); }}
          fullWidth
          helperText={
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              Token needs 'repo' scope for private repos.
              {onOpenGuide && (
                <Box
                  component="span"
                  onClick={onOpenGuide}
                  sx={{
                    color: colors.primary.main,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.25,
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  <HelpOutlineIcon sx={{ fontSize: 14 }} />
                  Setup guide
                </Box>
              )}
            </Box>
          }
          placeholder="ghp_..."
        />
        <Button
          variant="outlined"
          onClick={handleVerify}
          disabled={!pat || verifying}
          startIcon={verifying ? <CircularProgress size={16} /> : <GitHubIcon />}
          sx={{ mt: 1, whiteSpace: 'nowrap' }}
        >
          {verifying ? 'Verifying...' : 'Verify'}
        </Button>
      </Box>

      {/* Verify Result */}
      {verifyResult && (
        <Alert
          severity={verifyResult.success ? 'success' : 'error'}
          icon={verifyResult.success ? <CheckCircleIcon /> : undefined}
        >
          {verifyResult.success
            ? `Connected as ${verifyResult.login}${verifyResult.name ? ` (${verifyResult.name})` : ''}`
            : `Verification failed: ${verifyResult.error}`
          }
        </Alert>
      )}

      {/* GitHub Repos to fetch PRs from */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
          Repositories to Watch
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Add GitHub repositories to browse their pull requests in the Pull Requests tab.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            placeholder="owner/repo (e.g. facebook/react)"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddRepo(); }}
            sx={{ flexGrow: 1 }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddRepo}
            disabled={!newRepo.trim()}
            sx={{ mt: 0, height: 40 }}
          >
            Add
          </Button>
        </Box>

        {/* Repos List */}
        {repos.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No repositories added yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {repos.map(repo => (
              <Box
                key={repo}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1,
                  borderRadius: 1,
                  border: `1px solid ${colors.border.light}`,
                  backgroundColor: colors.background.subtle
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <GitHubIcon sx={{ fontSize: 18, color: colors.text.secondary }} />
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {repo}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => handleRemoveRepo(repo)} sx={{ color: 'error.main' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default GitHubSettings;
