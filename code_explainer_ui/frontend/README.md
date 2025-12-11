# ArmChair Frontend

React-based web interface for the ArmChair Change Browser - an AI-powered Git commit analysis and management tool.

## Overview

The frontend provides a modern, intuitive interface for:
- Browsing repositories, branches, and commits
- Viewing syntax-highlighted diffs
- Triggering AI-powered code reviews and commit splitting
- Managing split patches and reviews

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React Frontend (8686)                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ CommitsPage │  │ Repository  │  │ PatchDetail │  │  Settings   │ │
│  │  (Main UI)  │  │   Panel     │  │    View     │  │   Dialog    │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                          ┌────────▼────────┐                        │
│                          │   API Service   │                        │
│                          │  (api.js)       │                        │
│                          └────────┬────────┘                        │
└───────────────────────────────────┼─────────────────────────────────┘
                                    │ REST API
                                    ▼
                    ┌───────────────────────────────┐
                    │   Express.js Backend (8787)   │
                    └───────────────────────────────┘
```

### Component Hierarchy

```
App.js (Theme + Router)
├── CommitsPage.js (Main Dashboard)
│   ├── RepositoryPanel.js (Left Sidebar)
│   │   └── Repository/Branch/Commit Tree
│   ├── Tab: Split Patches List
│   └── Tab: Reviews List
├── PatchDetailView.js (Detail Views)
│   ├── DiffViewer.js (Diff Rendering)
│   ├── Breadcrumbs.js (Navigation)
│   └── FilePath.js + FileTypeIcon.js
└── SettingsDialog.js (Configuration)
```

## Tech Stack

- **React 18** - UI framework
- **Material-UI (MUI)** - Component library
- **react-diff-view** - Diff rendering
- **react-markdown** - Markdown rendering
- **PrismJS** - Syntax highlighting
- **react-router-dom** - Client-side routing

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm start
# Opens http://localhost:8686
```

### Production Build

```bash
npm run build
# Output in dist/
```

## Environment Variables

Create a `.env` file or set these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_API_BASE_URL` | `http://localhost:8787/api` | Backend API URL |
| `FRONTEND_PORT` | `8686` | Dev server port |

## Project Structure

```
frontend/
├── public/
│   └── index.html          # HTML template with Google Fonts
├── src/
│   ├── components/
│   │   ├── CommitsPage.js      # Main dashboard with tabs
│   │   ├── RepositoryPanel.js  # Left sidebar with repo browser
│   │   ├── PatchDetailView.js  # Commit/patch detail view
│   │   ├── DiffViewer.js       # Syntax-highlighted diff display
│   │   ├── SettingsDialog.js   # Configuration dialog
│   │   ├── Breadcrumbs.js      # Navigation breadcrumbs
│   │   ├── FilePath.js         # File path typography components
│   │   ├── FileTypeIcon.js     # Language-specific file icons
│   │   └── Skeletons.js        # Loading skeleton components
│   ├── hooks/
│   │   └── useKeyboardShortcuts.js  # Keyboard shortcut handling
│   ├── services/
│   │   └── api.js              # Backend API client
│   ├── styles/
│   │   └── prism-themes.css    # Syntax highlighting themes
│   ├── App.js                  # Theme configuration and routing
│   └── index.js                # Entry point
├── webpack.config.js           # Build configuration
└── package.json
```

## Key Features

### Repository Browser
- Expandable repository/branch tree
- Commit history with relative dates
- Uncommitted changes display (staged/unstaged/untracked)
- Resizable sidebar (240-480px, persisted to localStorage)

### Diff Viewer
- Side-by-side or unified diff view
- Syntax highlighting via PrismJS
- File navigation with arrow keys
- AI annotation display

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + ,` | Open settings |
| `Cmd/Ctrl + R` | Refresh data |
| `1` | Switch to Split Patches tab |
| `2` | Switch to Reviews tab |
| `Escape` | Close dialogs |

### Theme & Typography
- Indigo primary color (#6366F1)
- Inter font for UI, JetBrains Mono for code
- Consistent 8px spacing grid
- Semantic diff colors (green additions, red deletions)

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | CommitsPage | Main dashboard |
| `/patch/:commitId/:patchId` | PatchDetailView | View split patch |
| `/commit/:repoName/:commitHash` | PatchDetailView | View repository commit |
| `/working-directory/:repoName/:branchName` | PatchDetailView | View uncommitted changes |

## API Integration

The frontend communicates with the backend via REST API. See `src/services/api.js` for all API calls.

Key endpoints used:
- `GET /api/repositories` - List repositories
- `GET /api/commits` - List split patches
- `GET /api/reviews` - List reviews
- `POST /api/split` - Trigger commit splitting
- `POST /api/review` - Trigger code review

## Development Notes

### Adding New Components
1. Create component in `src/components/`
2. Import colors from `../App` for consistent theming
3. Use MUI components with sx prop for styling

### Modifying Theme
Edit `src/App.js` to update:
- Color palette (`colors` object)
- MUI component overrides
- Typography settings

### Build Configuration
`webpack.config.js` handles:
- Babel transpilation (React, ES6+)
- CSS loading
- Development server with hot reload
- Production optimization

## Troubleshooting

### "Failed to fetch" errors
- Verify backend is running on port 8787
- Check CORS configuration in backend
- Verify `REACT_APP_API_BASE_URL` if using custom backend URL

### Styles not loading
- Clear browser cache
- Verify Google Fonts CDN accessibility
- Check for CSS import errors in console

### Build failures
- Delete `node_modules` and `package-lock.json`, then reinstall
- Verify Node.js version >= 16.0.0
