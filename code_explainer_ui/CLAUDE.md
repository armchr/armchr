# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ArmChair is a full-stack web application for managing, viewing, and analyzing Git commits and diffs. It provides AI-powered code review and automatic commit splitting capabilities through integration with external agents (Go-based code reviewer and Python-based splitter).

**Architecture**: React (frontend) + Express.js (backend) + External AI Agents

## Development Commands

### Local Development
```bash
# From root directory (code_explainer_ui/)
make install          # Install all dependencies
make dev              # Start both servers (frontend:8686, backend:8787)
make build            # Production build
```

### Backend Only
```bash
cd backend
npm run dev           # Development with default paths
# Backend requires --output and --root-dir arguments
```

### Frontend Only
```bash
cd frontend
npm start             # Dev server with hot reload (port 8686)
npm run build         # Production build
```

### Docker
```bash
# From parent directory (armchair/)
make docker-build     # Build complete image (splitter + UI + backend)
make docker-run       # Run with default paths
```

## Configuration

### Backend Configuration
Backend requires these critical parameters:
- `--output` (required): Directory for split patches, reviews, and configuration files
- `--root-dir` (required): Root directory for runtime/display - all repository paths must be under this directory
- `--root-map` (optional): Root mapping for storage in config files (default: same as root-dir)

Optional parameters:
- `--enable-cache`: Enable repository cache (default: false)
- `--mcp`: Run as MCP server on stdio (default: false)

The output directory contains a `.armchair` subdirectory with:
- `source.yaml`: Repository configuration (created automatically if missing)
- `.armchair.json`: Runtime settings (LLM config, paths)

### Root Directory Constraints
The `--root-dir` parameter enforces a security constraint that all repository paths must be under a specified root directory. This prevents accessing repositories outside a designated workspace.

When combined with `--root-map`, you can map between runtime (container) and storage (host) paths:
- `--root-dir`: Runtime path used for validation and display in the UI (typically container path)
- `--root-map`: Storage path written to config files (typically host path)

This is useful for containerized environments where paths differ between container and host:
```bash
# Example: Docker container mounts host /host/workspace as container /app/workspace
--root-dir=/app/workspace --root-map=/host/workspace
```
- Repositories shown in UI: `/app/workspace/repo` (container path for runtime)
- Repositories saved in config: `/host/workspace/repo` (host path for persistence)

### Configuration Directory Structure
```
{output}/
  .armchair/
    source.yaml         # Repository definitions
    .armchair.json      # Runtime settings (LLM config)
  .repo-cache.json      # Repository cache (if caching enabled)
  commit_*/             # Split patches
  reviews/              # Code reviews
```

### source.yaml Format
Located at `{output}/.armchair/source.yaml`:
```yaml
source:
  repositories:
    - name: "repo-name"
      path: "/absolute/path/to/repo"
      commitOnly: false  # Optional: if true, hides uncommitted changes
```

### .armchair.json Format
Located at `{output}/.armchair/.armchair.json` (managed via Settings UI):
```json
{
  "ARMCHAIR_MODEL_API_KEY": "your-api-key",
  "ARMCHAIR_MODEL_API_BASE_URL": "https://api.example.com/v1",
  "ARMCHAIR_MODEL_NAME": "gpt-4"
}
```

**Note**: LLM settings can be configured through the Settings dialog in the UI (accessible from the menu). The config file is created automatically when settings are saved.

### Environment Variables
Environment variables can be set directly or via `.armchair.json`:
- `ARMCHAIR_MODEL_API_KEY`: LLM API key (configurable via Settings UI)
- `ARMCHAIR_MODEL_API_BASE_URL`: LLM API base URL (configurable via Settings UI)
- `ARMCHAIR_MODEL_NAME`: LLM model name (configurable via Settings UI)
- `CODE_REVIEWER_PATH`: Path to Go-based code reviewer binary (default: `../../code_reviewer/code-reviewer`)
- `CODE_REVIEWER_APP_CONFIG`: Path to app config file (default: `../../code_reviewer/configs/app.yaml`)
- `SPLITTER_PATH`: Path to Python splitter directory (default: `../../splitter_dep`)
- `PYTHON_PATH`: Path to Python executable (default: `../../splitter_dep/venv/bin/python3` if exists, else `python3`)
- `CACHE_REFRESH_INTERVAL_MS`: Repository cache refresh interval (default: 30 minutes)

**Note**: The code reviewer's source config is automatically set to the backend's managed `source.yaml` at `{output}/.armchair/source.yaml`.

**Note**: The splitter requires the `code_splitter` Python module to be installed. Install it with:
```bash
cd ../../splitter_dep
source venv/bin/activate  # or create venv: python3 -m venv venv
pip install -e .
```

## Architecture

### Key Components

**Backend (backend/server.js)**
- Express.js server on port 8787
- Manages Git operations via child process execution
- Coordinates with external AI agents (code reviewer, splitter)
- Implements repository caching system
- Provides REST API and MCP server mode

**Frontend (React + Material-UI)**
- `CommitsPage.js`: Main dashboard with 3 tabs (Repositories, Split Patches, Reviews)
- `RepositoryPanel.js`: Left sidebar showing repos, branches, commits, and uncommitted changes
- `PatchDetailView.js`: Detailed view for commits, patches, and diffs
- `DiffViewer.js`: Syntax-highlighted diff rendering using react-diff-view

### External Agent Integration

**Code Reviewer (Go binary)**
- Invoked via `/api/review` endpoint
- Takes patch files as input, outputs JSON review with annotations
- Reviews stored in `{output}/reviews/{reviewId}.json`

**Code Splitter (Python module)**
- Invoked via `/api/split` endpoint
- Python module: `code_splitter.main` from `splitter_dep/`
- Splits commits/patches into semantic units
- Outputs to `{output}/commit_{hash}_{timestamp}/`

### Repository Path Handling

The application supports monorepo subdirectories where `gitRoot ≠ repoPath`:
- Git commands run with `-C {repoPath}` flag
- File paths filtered using `filterFilesByRepoPath()` helper
- Diff paths stripped of subdirectory prefix for display
- This complexity is handled in server.js for all Git operations

### State Management Pattern

Frontend uses React hooks with these key state patterns:
- `repoDetails[repoName]`: Cached repository data (branches, status)
- `branchCommits[repoName:branchName]`: Commit lists per branch
- `branchExpanded[repoName:branchName]`: UI expansion state
- Auto-expands current branch on repository accordion expand

## Key API Endpoints

### Configuration Operations
- `GET /api/config`: Get current configuration (LLM settings, repositories, rootDir)
- `PUT /api/config`: Update configuration (LLM settings and/or repositories)

### Repository Operations
- `GET /api/repositories`: List all repositories with cached data
- `GET /api/repositories/:name/details`: Fetch specific repo details
- `POST /api/repositories/:name/refresh`: Force refresh repo data
- `GET /api/repositories/:name/branches/:branch/commits`: Get branch commits
- `GET /api/repositories/:name/branches/:branch/working-directory/diff`: Get uncommitted changes

### Commit Operations
- `GET /api/repositories/:name/commits/:hash/diff`: Get commit diff
- `POST /api/split`: Split commit/patch into semantic pieces
- `POST /api/review`: AI review of commit/patch
- `GET /api/commits`: List all split commits (from output directory)
- `DELETE /api/commits/:id`: Delete split commit

### Review Operations
- `GET /api/reviews`: List all reviews
- `GET /api/reviews/:id`: Get review details with markdown
- `POST /api/reviews/:id/archive`: Archive a review

## Important Implementation Details

### Repository Path Validation and Mapping
Backend enforces root directory constraints for security:
- All repository paths must be under `--root-dir` (container/runtime path)
- When adding/updating repositories via `/api/config`, paths are validated using `validatePathUnderRoot()`
- Paths are mapped for display vs storage using `mapPathForDisplay()` and `mapPathForStorage()`
- `ROOT_DIR` = container/runtime path (for validation and UI display)
- `ROOT_MAP` = host/storage path (for config file persistence)
- This enables containerized deployments where host and container paths differ

### File Path Consistency
When working with Git operations in subdirectories:
1. Run git commands with `-C {repoPath}`
2. Git returns paths relative to gitRoot
3. Filter files with `filterFilesByRepoPath(files, repoPath, gitRoot)`
4. This function both filters AND strips the subdirectory prefix
5. Diff content must also have paths stripped via regex replacement

### Working Directory vs Commit Views
`PatchDetailView.js` handles three view modes:
- Split patch view: Shows navigation between patches, "Apply Patch" instructions
- Commit view: Direct commit from repository panel (no patch navigation)
- Working directory view: Uncommitted changes (no patch navigation)

Check `isCommitView` and `isWorkingDirectoryView` flags to conditionally render UI elements.

### Component Communication
- RepositoryPanel fetches and displays repo structure
- Clicking items navigates via react-router to PatchDetailView
- PatchDetailView loads data based on URL params (commitId/patchId, repoName/commitHash, or repoName/branchName)
- DiffViewer receives full patch content and current file, parses with react-diff-view

### Cache System
Backend implements progressive caching:
- Enabled with `--enable-cache` flag
- Cache file: `{output}/.repo-cache.json`
- Auto-refreshes at `CACHE_REFRESH_INTERVAL_MS`
- Manual refresh via UI refresh button per repository

## Routes

- `/` - Main dashboard (CommitsPage)
- `/patch/:commitId/:patchId` - View split patch
- `/commit/:repoName/:commitHash` - View repository commit
- `/working-directory/:repoName/:branchName` - View uncommitted changes

## MCP Server Mode

Backend can run as MCP server with `--mcp` flag:
```bash
npm run dev:mcp
```
Provides tools for repository queries via MCP protocol on stdio.
