import React from 'react';
import { Box, Tooltip } from '@mui/material';
import {
  Code as CodeIcon,
  Description as DescriptionIcon,
  Settings as SettingsIcon,
  Storage as StorageIcon,
  Image as ImageIcon,
  DataObject as DataObjectIcon,
  Terminal as TerminalIcon,
  Web as WebIcon,
  Css as CssIcon,
} from '@mui/icons-material';
import { colors } from '../App';

// File extension to icon/color mapping
const fileTypeConfig = {
  // JavaScript/TypeScript
  js: { icon: DataObjectIcon, color: '#F7DF1E', label: 'JavaScript' },
  jsx: { icon: DataObjectIcon, color: '#61DAFB', label: 'React JSX' },
  ts: { icon: DataObjectIcon, color: '#3178C6', label: 'TypeScript' },
  tsx: { icon: DataObjectIcon, color: '#3178C6', label: 'React TSX' },
  mjs: { icon: DataObjectIcon, color: '#F7DF1E', label: 'ES Module' },

  // Python
  py: { icon: CodeIcon, color: '#3776AB', label: 'Python' },
  pyi: { icon: CodeIcon, color: '#3776AB', label: 'Python Stub' },
  pyx: { icon: CodeIcon, color: '#3776AB', label: 'Cython' },

  // Go
  go: { icon: CodeIcon, color: '#00ADD8', label: 'Go' },
  mod: { icon: SettingsIcon, color: '#00ADD8', label: 'Go Module' },
  sum: { icon: SettingsIcon, color: '#00ADD8', label: 'Go Sum' },

  // Rust
  rs: { icon: CodeIcon, color: '#DEA584', label: 'Rust' },
  toml: { icon: SettingsIcon, color: '#9C4121', label: 'TOML' },

  // Java/Kotlin
  java: { icon: CodeIcon, color: '#B07219', label: 'Java' },
  kt: { icon: CodeIcon, color: '#A97BFF', label: 'Kotlin' },
  kts: { icon: CodeIcon, color: '#A97BFF', label: 'Kotlin Script' },

  // C/C++
  c: { icon: CodeIcon, color: '#555555', label: 'C' },
  cpp: { icon: CodeIcon, color: '#F34B7D', label: 'C++' },
  cc: { icon: CodeIcon, color: '#F34B7D', label: 'C++' },
  h: { icon: CodeIcon, color: '#555555', label: 'C Header' },
  hpp: { icon: CodeIcon, color: '#F34B7D', label: 'C++ Header' },

  // Web
  html: { icon: WebIcon, color: '#E34F26', label: 'HTML' },
  htm: { icon: WebIcon, color: '#E34F26', label: 'HTML' },
  css: { icon: CssIcon, color: '#1572B6', label: 'CSS' },
  scss: { icon: CssIcon, color: '#CD6799', label: 'SCSS' },
  sass: { icon: CssIcon, color: '#CD6799', label: 'Sass' },
  less: { icon: CssIcon, color: '#1D365D', label: 'Less' },

  // Data/Config
  json: { icon: DataObjectIcon, color: '#292929', label: 'JSON' },
  yaml: { icon: SettingsIcon, color: '#CB171E', label: 'YAML' },
  yml: { icon: SettingsIcon, color: '#CB171E', label: 'YAML' },
  xml: { icon: DataObjectIcon, color: '#FF6600', label: 'XML' },
  csv: { icon: StorageIcon, color: '#217346', label: 'CSV' },

  // Markdown/Docs
  md: { icon: DescriptionIcon, color: '#083FA1', label: 'Markdown' },
  mdx: { icon: DescriptionIcon, color: '#083FA1', label: 'MDX' },
  txt: { icon: DescriptionIcon, color: '#6B7280', label: 'Text' },
  rst: { icon: DescriptionIcon, color: '#6B7280', label: 'reStructuredText' },

  // Shell/Scripts
  sh: { icon: TerminalIcon, color: '#4EAA25', label: 'Shell' },
  bash: { icon: TerminalIcon, color: '#4EAA25', label: 'Bash' },
  zsh: { icon: TerminalIcon, color: '#4EAA25', label: 'Zsh' },
  fish: { icon: TerminalIcon, color: '#4EAA25', label: 'Fish' },
  ps1: { icon: TerminalIcon, color: '#012456', label: 'PowerShell' },

  // Images
  png: { icon: ImageIcon, color: '#4CAF50', label: 'PNG Image' },
  jpg: { icon: ImageIcon, color: '#4CAF50', label: 'JPEG Image' },
  jpeg: { icon: ImageIcon, color: '#4CAF50', label: 'JPEG Image' },
  gif: { icon: ImageIcon, color: '#4CAF50', label: 'GIF Image' },
  svg: { icon: ImageIcon, color: '#FFB13B', label: 'SVG Image' },
  ico: { icon: ImageIcon, color: '#4CAF50', label: 'Icon' },

  // Database
  sql: { icon: StorageIcon, color: '#336791', label: 'SQL' },
  db: { icon: StorageIcon, color: '#336791', label: 'Database' },

  // Ruby
  rb: { icon: CodeIcon, color: '#CC342D', label: 'Ruby' },
  rake: { icon: CodeIcon, color: '#CC342D', label: 'Rake' },
  gemspec: { icon: SettingsIcon, color: '#CC342D', label: 'Gemspec' },

  // PHP
  php: { icon: CodeIcon, color: '#777BB4', label: 'PHP' },

  // Swift
  swift: { icon: CodeIcon, color: '#F05138', label: 'Swift' },

  // Docker
  dockerfile: { icon: SettingsIcon, color: '#2496ED', label: 'Dockerfile' },
  dockerignore: { icon: SettingsIcon, color: '#2496ED', label: 'Docker Ignore' },

  // Git
  gitignore: { icon: SettingsIcon, color: '#F05032', label: 'Git Ignore' },
  gitattributes: { icon: SettingsIcon, color: '#F05032', label: 'Git Attributes' },

  // Lock files
  lock: { icon: SettingsIcon, color: '#6B7280', label: 'Lock File' },

  // Makefile
  makefile: { icon: TerminalIcon, color: '#6D8086', label: 'Makefile' },
  mk: { icon: TerminalIcon, color: '#6D8086', label: 'Makefile' },
};

// Default config for unknown extensions
const defaultConfig = { icon: DescriptionIcon, color: colors.text.secondary, label: 'File' };

/**
 * Get file type configuration from filename
 */
export const getFileTypeConfig = (filename) => {
  if (!filename) return defaultConfig;

  const lower = filename.toLowerCase();

  // Check for exact matches first (Dockerfile, Makefile, etc.)
  if (lower === 'dockerfile' || lower.endsWith('/dockerfile')) {
    return fileTypeConfig.dockerfile;
  }
  if (lower === 'makefile' || lower.endsWith('/makefile')) {
    return fileTypeConfig.makefile;
  }

  // Get extension
  const parts = lower.split('.');
  if (parts.length < 2) return defaultConfig;

  const ext = parts[parts.length - 1];
  return fileTypeConfig[ext] || defaultConfig;
};

/**
 * File type icon component
 */
const FileTypeIcon = ({ filename, size = 18, showTooltip = true }) => {
  const config = getFileTypeConfig(filename);
  const IconComponent = config.icon;

  const icon = (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconComponent
        sx={{
          fontSize: size,
          color: config.color,
        }}
      />
    </Box>
  );

  if (showTooltip) {
    return (
      <Tooltip title={config.label} placement="top" arrow>
        {icon}
      </Tooltip>
    );
  }

  return icon;
};

export default FileTypeIcon;
