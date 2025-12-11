import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import CommitsPage from './components/CommitsPage';
import PatchDetailView from './components/PatchDetailView';

// Color palette constants for consistent use across components
export const colors = {
  // Primary palette - Indigo
  primary: {
    main: '#6366F1',
    light: '#818CF8',
    dark: '#4F46E5',
    contrastText: '#FFFFFF',
  },
  // Secondary palette - Emerald (success/additions)
  secondary: {
    main: '#10B981',
    light: '#34D399',
    dark: '#059669',
    contrastText: '#FFFFFF',
  },
  // Accent - Amber (warnings/attention)
  accent: {
    main: '#F59E0B',
    light: '#FBBF24',
    dark: '#D97706',
  },
  // Error - Red (errors/deletions)
  error: {
    main: '#EF4444',
    light: '#F87171',
    dark: '#DC2626',
  },
  // Backgrounds
  background: {
    default: '#F8FAFC',
    paper: '#FFFFFF',
    subtle: '#F1F5F9',
  },
  // Borders
  border: {
    light: '#E2E8F0',
    main: '#CBD5E1',
    dark: '#94A3B8',
  },
  // Text
  text: {
    primary: '#0F172A',
    secondary: '#64748B',
    muted: '#94A3B8',
  },
  // Semantic colors for diffs
  diff: {
    addition: {
      bg: '#ECFDF5',
      border: '#10B981',
      text: '#065F46',
    },
    deletion: {
      bg: '#FEF2F2',
      border: '#EF4444',
      text: '#991B1B',
    },
    modified: {
      bg: '#FFF7ED',
      border: '#F59E0B',
      text: '#92400E',
    },
    context: {
      bg: '#F8FAFC',
      text: '#64748B',
    },
  },
  // Status colors
  status: {
    feature: '#6366F1',
    bugfix: '#EF4444',
    refactor: '#8B5CF6',
    enhancement: '#10B981',
    docs: '#06B6D4',
  },
};

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: colors.primary.main,
      light: colors.primary.light,
      dark: colors.primary.dark,
      contrastText: colors.primary.contrastText,
    },
    secondary: {
      main: colors.secondary.main,
      light: colors.secondary.light,
      dark: colors.secondary.dark,
      contrastText: colors.secondary.contrastText,
    },
    error: {
      main: colors.error.main,
      light: colors.error.light,
      dark: colors.error.dark,
    },
    warning: {
      main: colors.accent.main,
      light: colors.accent.light,
      dark: colors.accent.dark,
    },
    success: {
      main: colors.secondary.main,
      light: colors.secondary.light,
      dark: colors.secondary.dark,
    },
    background: {
      default: colors.background.default,
      paper: colors.background.paper,
    },
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
    },
    divider: colors.border.light,
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    h3: {
      fontWeight: 700,
      fontSize: '1.75rem',
      color: colors.text.primary,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      color: colors.text.primary,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.1rem',
      color: colors.text.primary,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
      color: colors.text.primary,
    },
    body1: {
      fontSize: '0.938rem',
    },
    body2: {
      fontSize: '0.875rem',
    },
    caption: {
      fontSize: '0.75rem',
      color: colors.text.secondary,
    },
  },
  shape: {
    borderRadius: 8,
  },
  shadows: [
    'none',
    '0 1px 3px rgba(0,0,0,0.08)',
    '0 2px 6px rgba(0,0,0,0.08)',
    '0 4px 12px rgba(0,0,0,0.1)',
    '0 8px 16px rgba(0,0,0,0.1)',
    '0 12px 24px rgba(0,0,0,0.12)',
    ...Array(19).fill('0 12px 24px rgba(0,0,0,0.12)'),
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.background.default,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.paper,
          borderRadius: 12,
          border: `1px solid ${colors.border.light}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.paper,
          borderRadius: 12,
          border: `1px solid ${colors.border.light}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
        },
        contained: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          },
        },
        outlined: {
          borderColor: colors.border.main,
          '&:hover': {
            borderColor: colors.primary.main,
            backgroundColor: 'rgba(99, 102, 241, 0.04)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.2s ease, color 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border.light}`,
          borderRadius: '12px !important',
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            margin: 0,
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          borderRadius: '12px 12px 0 0',
          '&.Mui-expanded': {
            borderRadius: '12px 12px 0 0',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.938rem',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.text.primary,
          fontSize: '0.75rem',
          borderRadius: 6,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'background-color 0.15s ease, transform 0.15s ease',
          '&:hover': {
            backgroundColor: colors.background.subtle,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: colors.background.subtle,
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
            },
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
        standardSuccess: {
          backgroundColor: colors.diff.addition.bg,
          borderLeft: `4px solid ${colors.secondary.main}`,
        },
        standardError: {
          backgroundColor: colors.diff.deletion.bg,
          borderLeft: `4px solid ${colors.error.main}`,
        },
        standardWarning: {
          backgroundColor: colors.diff.modified.bg,
          borderLeft: `4px solid ${colors.accent.main}`,
        },
        standardInfo: {
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          borderLeft: `4px solid ${colors.primary.main}`,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.subtle,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<CommitsPage />} />
          <Route path="/patch/:commitId/:patchId" element={<PatchDetailView />} />
          <Route path="/commit/:repoName/:commitHash" element={<PatchDetailView />} />
          <Route path="/working-directory/:repoName/:branchName" element={<PatchDetailView />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;