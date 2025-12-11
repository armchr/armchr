import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Box,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Checkbox,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { fetchConfig, updateConfig } from '../services/api';
import { colors } from '../App';

const SettingsDialog = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [success, setSuccess] = useState(false);
  const [config, setConfig] = useState({
    ARMCHAIR_MODEL_API_KEY: '',
    ARMCHAIR_MODEL_API_BASE_URL: '',
    ARMCHAIR_MODEL_NAME: ''
  });
  const [repositories, setRepositories] = useState([]);
  const [expandedRepo, setExpandedRepo] = useState(null);
  const [llmSectionExpanded, setLlmSectionExpanded] = useState(true);
  const [rootDir, setRootDir] = useState(null);
  const errorRef = useRef(null);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setSuccess(false);
    try {
      const data = await fetchConfig();
      if (data.success) {
        setConfig(data.config);
        setRepositories(data.repositories || []);
        setRootDir(data.rootDir || null);

        // Check if all LLM settings are filled
        const allLlmSettingsFilled =
          data.config.ARMCHAIR_MODEL_API_KEY &&
          data.config.ARMCHAIR_MODEL_API_BASE_URL &&
          data.config.ARMCHAIR_MODEL_NAME;

        // Collapse LLM section if all settings are filled
        setLlmSectionExpanded(!allLlmSettingsFilled);
      }
    } catch (err) {
      setError(`Failed to load configuration: ${err.message}`);
      setErrorDetails(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setErrorDetails(null);
    setSuccess(false);
    try {
      const data = await updateConfig({ config, repositories });
      if (data.success) {
        // Close the dialog immediately
        onClose();
        // Refresh the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
    } catch (err) {
      // Extract error details from the error object
      const errorMessage = err.message || 'Failed to save configuration';
      const details = err.details || null;

      setError(errorMessage);
      setErrorDetails(details);
      setSaving(false);

      // Scroll error into view after state updates
      setTimeout(() => {
        if (errorRef.current) {
          errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const handleChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRepoChange = (index, field, value) => {
    setRepositories(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const handleAddRepo = () => {
    const newRepo = {
      name: '',
      path: '',
      language: '',
      commitOnly: false
    };
    setRepositories(prev => [...prev, newRepo]);
    // Expand the newly added repo
    setExpandedRepo(repositories.length);
  };

  const handleDeleteRepo = (index) => {
    setRepositories(prev => prev.filter((_, i) => i !== index));
    // Close accordion if the deleted repo was expanded
    if (expandedRepo === index) {
      setExpandedRepo(null);
    }
  };

  const handleRepoAccordionChange = (index) => (event, isExpanded) => {
    setExpandedRepo(isExpanded ? index : null);
  };

  // Check if at least one repository exists
  const hasRepositories = repositories.length > 0;
  const canClose = hasRepositories;

  const handleDialogClose = (event, reason) => {
    // Prevent closing if no repositories are configured
    if (!canClose && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleDialogClose}
      maxWidth="lg"
      fullWidth
      disableEscapeKeyDown={!canClose}
      PaperProps={{
        sx: {
          minHeight: '600px',
          maxHeight: '90vh'
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
        <Typography variant="h6">Settings</Typography>
        {canClose && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent sx={{ mt: 2, px: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert ref={errorRef} severity="error" sx={{ mb: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {error}
                  </Typography>
                  {errorDetails && errorDetails.length > 0 && (
                    <Box component="ul" sx={{ mt: 1, mb: 1, pl: 2 }}>
                      {errorDetails.map((detail, index) => (
                        <li key={index}>
                          <Typography variant="body2">{detail}</Typography>
                        </li>
                      ))}
                    </Box>
                  )}
                  {rootDir && (
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>Current root directory:</strong> <code>{rootDir}</code>
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        All repositories must be under this root path.
                      </Typography>
                      <Typography variant="body2">
                        To change the root directory, run the setup script:
                        <code style={{ display: 'block', marginTop: '4px', padding: '4px 8px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85em' }}>
                          {`curl -fsSL https://raw.githubusercontent.com/armchr/armchr/main/scripts/armchair.sh -o armchair.sh
chmod +x armchair.sh
./armchair.sh`}
                        </code>
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Configuration saved successfully! Changes will take effect immediately.
              </Alert>
            )}

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Configure ArmChair settings. Changes are saved to <code>.armchair/</code> directory and take effect immediately.
            </Typography>

            {/* LLM Configuration */}
            <Accordion
              expanded={llmSectionExpanded}
              onChange={(e, isExpanded) => setLlmSectionExpanded(isExpanded)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">LLM Settings</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <TextField
                    label="Model API Key"
                    type="password"
                    value={config.ARMCHAIR_MODEL_API_KEY}
                    onChange={(e) => handleChange('ARMCHAIR_MODEL_API_KEY', e.target.value)}
                    fullWidth
                    helperText="API key for the LLM service"
                  />
                  <TextField
                    label="Model API Base URL"
                    value={config.ARMCHAIR_MODEL_API_BASE_URL}
                    onChange={(e) => handleChange('ARMCHAIR_MODEL_API_BASE_URL', e.target.value)}
                    fullWidth
                    helperText="Base URL for the LLM API endpoint"
                    placeholder="https://api.example.com/v1"
                  />
                  <TextField
                    label="Model Name"
                    value={config.ARMCHAIR_MODEL_NAME}
                    onChange={(e) => handleChange('ARMCHAIR_MODEL_NAME', e.target.value)}
                    fullWidth
                    helperText="Name of the LLM model to use"
                    placeholder="gpt-4"
                  />
                </Box>
              </AccordionDetails>
            </Accordion>

            <Divider sx={{ my: 2 }} />

            {/* Repository Configuration */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Repositories</Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddRepo}
                size="small"
              >
                Add Repository
              </Button>
            </Box>

            {repositories.length === 0 ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <strong>At least one repository is required.</strong> Click "Add Repository" to configure your first repository before you can use ArmChair.
              </Alert>
            ) : (
              <Box sx={{ mb: 2 }}>
                {repositories.map((repo, index) => (
                  <Accordion
                    key={index}
                    expanded={expandedRepo === index}
                    onChange={handleRepoAccordionChange(index)}
                    sx={{ mb: 1 }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', pr: 2 }}>
                        <Typography>
                          {repo.name || `Repository ${index + 1}`}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRepo(index);
                          }}
                          sx={{ color: 'error.main' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                          label="Repository Name"
                          value={repo.name || ''}
                          onChange={(e) => handleRepoChange(index, 'name', e.target.value)}
                          fullWidth
                          helperText="Unique name for this repository"
                          required
                        />
                        <TextField
                          label="Repository Path"
                          value={repo.path || ''}
                          onChange={(e) => handleRepoChange(index, 'path', e.target.value)}
                          fullWidth
                          helperText={`Absolute path (must be under ${rootDir})`}
                          required
                        />
                        <FormControl fullWidth>
                          <InputLabel id={`language-label-${index}`}>Language</InputLabel>
                          <Select
                            labelId={`language-label-${index}`}
                            value={repo.language || ''}
                            label="Language"
                            onChange={(e) => handleRepoChange(index, 'language', e.target.value)}
                          >
                            <MenuItem value="">
                              <em>None</em>
                            </MenuItem>
                            <MenuItem value="go">Go</MenuItem>
                            <MenuItem value="python">Python</MenuItem>
                            <MenuItem value="javascript">JavaScript</MenuItem>
                            <MenuItem value="typescript">TypeScript</MenuItem>
                            <MenuItem value="java">Java</MenuItem>
                            <MenuItem value="rust">Rust</MenuItem>
                            <MenuItem value="cpp">C++</MenuItem>
                            <MenuItem value="c">C</MenuItem>
                            <MenuItem value="ruby">Ruby</MenuItem>
                            <MenuItem value="php">PHP</MenuItem>
                            <MenuItem value="swift">Swift</MenuItem>
                            <MenuItem value="kotlin">Kotlin</MenuItem>
                            <MenuItem value="csharp">C#</MenuItem>
                          </Select>
                        </FormControl>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={repo.commitOnly || false}
                              onChange={(e) => handleRepoChange(index, 'commitOnly', e.target.checked)}
                            />
                          }
                          label="Commit Only Mode"
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                          When enabled, uncommitted changes will be hidden in the UI
                        </Typography>
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {canClose && (
          <Button onClick={onClose} variant="outlined">
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading || saving || !hasRepositories}
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsDialog;
