import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Chip,
  IconButton
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  GitHub as GitHubIcon
} from '@mui/icons-material';
import { fetchGitHubStatus } from '../services/api';
import { colors } from '../App';

const GitHubSettings = ({ pat, onPatChange, repos, onReposChange }) => {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [detectedRemotes, setDetectedRemotes] = useState([]);
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
      const status = await fetchGitHubStatus();
      if (status.connected) {
        setVerifyResult({ success: true, login: status.login, name: status.name });
        setDetectedRemotes(status.detectedRemotes || []);
      } else {
        setVerifyResult({ success: false, error: status.error || 'Token validation failed' });
      }
    } catch (err) {
      setVerifyResult({ success: false, error: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const handleAddRepo = (repoSlug) => {
    if (!repoSlug || repos.includes(repoSlug)) return;
    onReposChange([...repos, repoSlug]);
    setNewRepo('');
  };

  const handleRemoveRepo = (repoSlug) => {
    onReposChange(repos.filter(r => r !== repoSlug));
  };

  const handleAddManualRepo = () => {
    const slug = newRepo.trim();
    if (!slug) return;
    // Validate format: owner/repo
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(slug)) {
      return;
    }
    handleAddRepo(slug);
  };

  const handleNewRepoKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddManualRepo();
    }
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
          helperText="Token needs 'repo' scope for private repos. Create at github.com/settings/tokens"
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

      {/* Detected Remotes */}
      {detectedRemotes.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Detected GitHub Remotes
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {detectedRemotes.map(remote => {
              const slug = `${remote.owner}/${remote.repo}`;
              const alreadyAdded = repos.includes(slug);
              return (
                <Chip
                  key={slug}
                  label={slug}
                  icon={<GitHubIcon sx={{ fontSize: 16 }} />}
                  onClick={alreadyAdded ? undefined : () => handleAddRepo(slug)}
                  onDelete={alreadyAdded ? undefined : () => handleAddRepo(slug)}
                  deleteIcon={alreadyAdded ? <CheckCircleIcon /> : <AddIcon />}
                  variant={alreadyAdded ? 'filled' : 'outlined'}
                  color={alreadyAdded ? 'primary' : 'default'}
                  sx={{ cursor: alreadyAdded ? 'default' : 'pointer' }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* Manual Repo Input */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Connected Repositories
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            placeholder="owner/repo"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            onKeyPress={handleNewRepoKeyPress}
            sx={{ flexGrow: 1 }}
            helperText="Add a GitHub repository (e.g., facebook/react)"
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAddManualRepo}
            disabled={!newRepo.trim()}
            sx={{ mt: 0, height: 40 }}
          >
            Add
          </Button>
        </Box>

        {/* Repos List */}
        {repos.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No repositories connected. Add one above or click a detected remote.
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
