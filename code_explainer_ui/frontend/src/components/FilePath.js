import React from 'react';
import { Box, Typography } from '@mui/material';
import { colors } from '../App';

/**
 * FilePath component displays file paths with dimmed directories and highlighted filename
 * @param {string} path - The full file path
 * @param {string} variant - Typography variant (default: 'body2')
 * @param {object} sx - Additional styles
 */
const FilePath = ({ path, variant = 'body2', sx = {} }) => {
  if (!path) return null;

  // Split path into directory and filename
  const lastSlashIndex = path.lastIndexOf('/');
  const directory = lastSlashIndex >= 0 ? path.substring(0, lastSlashIndex + 1) : '';
  const filename = lastSlashIndex >= 0 ? path.substring(lastSlashIndex + 1) : path;

  return (
    <Box
      component="span"
      sx={{
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: variant === 'caption' ? '0.75rem' : '0.875rem',
        display: 'inline-flex',
        alignItems: 'baseline',
        ...sx
      }}
    >
      {directory && (
        <Typography
          component="span"
          sx={{
            color: colors.text.muted,
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
        >
          {directory}
        </Typography>
      )}
      <Typography
        component="span"
        sx={{
          color: colors.text.primary,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 600,
        }}
      >
        {filename}
      </Typography>
    </Box>
  );
};

/**
 * CommitHash component displays commit hashes with proper styling
 * @param {string} hash - The commit hash (short or full)
 * @param {boolean} short - Whether to show shortened version (default: true)
 * @param {object} sx - Additional styles
 */
export const CommitHash = ({ hash, short = true, sx = {} }) => {
  if (!hash) return null;

  const displayHash = short && hash.length > 7 ? hash.substring(0, 7) : hash;

  return (
    <Typography
      component="span"
      sx={{
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '0.75rem',
        fontWeight: 500,
        color: colors.error.main,
        letterSpacing: '0.025em',
        ...sx
      }}
    >
      {displayHash}
    </Typography>
  );
};

/**
 * CodeText component for inline code snippets
 * @param {string} children - The code text
 * @param {object} sx - Additional styles
 */
export const CodeText = ({ children, sx = {} }) => {
  return (
    <Box
      component="code"
      sx={{
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '0.875em',
        padding: '0.125em 0.375em',
        borderRadius: '4px',
        backgroundColor: colors.background.subtle,
        color: colors.text.primary,
        ...sx
      }}
    >
      {children}
    </Box>
  );
};

export default FilePath;
