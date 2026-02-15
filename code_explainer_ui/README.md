# ArmChair - AI-Powered Git Commit Browser & Analyzer

ArmChair is a full-stack web application that helps developers understand, review, and manage Git commits through AI-powered analysis. It provides intelligent commit splitting, automated code reviews, GitHub PR integration, and an intuitive interface for browsing repository changes.

## Features

- **Visual Commit Browser**: Browse commits, branches, and uncommitted changes across multiple repositories
- **AI-Powered Code Review**: Automatically generate detailed code reviews with annotations
- **Intelligent Commit Splitting**: Break down large commits into semantically coherent patches
- **Diff Visualization**: Syntax-highlighted diff viewer with file-by-file navigation
- **GitHub PR Integration**: List, split, and analyze GitHub PRs; post analysis comments; restack PR commits
- **Monorepo Support**: Works with monorepo subdirectories and complex Git structures
- **Real-time Status**: Monitor uncommitted changes and repository state
- **Patch Management**: Apply, review, and archive split patches

## Architecture

**ArmChair** consists of three main components:

1. **[React Frontend](frontend/README.md)** (port 8686): Modern UI built with Material-UI and react-diff-view
2. **[Express.js Backend](backend/README.md)** (port 8787): REST API and Git operations coordinator
3. **External AI Agents**:
   - Go-based code reviewer for generating reviews with annotations
   - Python-based splitter for semantic commit decomposition

```
+---------------------------------------------------------------------------+
|                              ArmChair System                              |
+---------------------------------------------------------------------------+
|                                                                           |
|   +-------------------------------------------------------------------+  |
|   |                    React Frontend (port 8686)                      |  |
|   |  * Repository Browser    * Diff Viewer    * Settings UI           |  |
|   |  * Split Patches List    * Pull Requests  * Reviews List          |  |
|   +-------------------------------+-----------------------------------+  |
|                                   | REST API                             |
|                                   v                                      |
|   +-------------------------------------------------------------------+  |
|   |                  Express.js Backend (port 8787)                    |  |
|   |  * Git Operations        * Config Management    * Caching         |  |
|   |  * GitHub API            * Path Validation      * Agent Coord.    |  |
|   +--------+------------------------+------------------------+--------+  |
|            |                        |                        |           |
|            v                        v                        v           |
|   +---------------+        +---------------+        +---------------+   |
|   |  Git Repos    |        |  Go Reviewer  |        | Python Splitter|  |
|   |  (read-only)  |        |    Agent      |        |     Agent      |  |
|   +---------------+        +---------------+        +---------------+   |
|                                    |                        |            |
|                                    +------------+-----------+            |
|                                                 v                        |
|                                    +------------------------+            |
|                                    |    LLM Provider        |            |
|                                    | (Claude/OpenAI/Ollama) |            |
|                                    +------------------------+            |
+---------------------------------------------------------------------------+
```

For detailed documentation on each component:
- **[Frontend README](frontend/README.md)** - React components, routing, keyboard shortcuts, theming
- **[Backend README](backend/README.md)** - API endpoints, configuration, external agent integration, MCP server

## Prerequisites

- **Node.js**: >= 16.0.0
- **Git**: Installed and accessible in PATH
- **Go**: >= 1.21 (for building code reviewer - optional)
- **Python**: >= 3.8 (for code splitter - optional)

## Quick Start (Local, Without Docker)

### Using Make (Recommended)

```bash
cd code_explainer_ui

# 1. Install dependencies
make install

# 2. Create output directory and configuration
mkdir -p ../output/.armchair
cat > ../output/.armchair/source.yaml << 'EOF'
source:
  repositories:
    - name: "my-project"
      path: "/absolute/path/to/your/repo"
EOF

# 3. Start development servers (frontend + backend)
make dev
```

This starts:
- **Frontend**: http://localhost:8686
- **Backend API**: http://localhost:8787

The backend reads `--output` (default `../../output`) and `--root-dir` (default `$HOME`) from environment variables or CLI args. The `make dev` target uses these defaults.

To customize:
```bash
ARMCHAIR_OUTPUT=/my/output ARMCHAIR_ROOT_DIR=/my/workspace make dev
```

### Manual Setup (Without Make)

**Step 1 — Install dependencies:**
```bash
cd code_explainer_ui/backend && npm install
cd ../frontend && npm install
```

**Step 2 — Create output directory and configuration:**
```bash
mkdir -p /path/to/output/.armchair
```

Create `/path/to/output/.armchair/source.yaml`:
```yaml
source:
  repositories:
    - name: "my-project"
      path: "/absolute/path/to/your/repo"
```

**Step 3 — Start the backend:**
```bash
cd code_explainer_ui/backend

# The backend requires --output and --root-dir arguments:
node server.js --output /path/to/output --root-dir /path/to/workspace

# Or use npm scripts (uses env var defaults):
ARMCHAIR_OUTPUT=/path/to/output ARMCHAIR_ROOT_DIR=/path/to/workspace npm run dev
```

**Step 4 — Start the frontend** (in a separate terminal):
```bash
cd code_explainer_ui/frontend
npm start
```

Open http://localhost:8686 in your browser.

### Backend CLI Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--output` | Yes | `../../output` (via env) | Output directory for patches, reviews, config |
| `--root-dir` | Yes | `$HOME` (via env) | Root directory — all repo paths must be under this |
| `--root-map` | No | same as root-dir | Storage path mapping (for container deployments) |
| `--enable-cache` | No | `false` | Enable repository caching |
| `--mcp` | No | `false` | Run as MCP server on stdio |

### Using Docker

```bash
# From parent directory (armchair/)
make docker-build
make docker-run OUTPUT_DIR=/path/to/output
```

## Configuration

### Repository Configuration (source.yaml)

Located at `{output}/.armchair/source.yaml`. Defines which repositories to display:

```yaml
source:
  repositories:
    - name: "my-app"               # Display name
      path: "/absolute/path/repo"   # Absolute path to repository
      language: "javascript"        # Optional: for syntax highlighting
      commitOnly: false             # Optional: hide uncommitted changes
```

This file can also be edited through the Settings dialog in the UI.

### LLM Configuration (.armchair.json)

Located at `{output}/.armchair/.armchair.json`. Managed through the Settings UI or set manually:

```json
{
  "ARMCHAIR_MODEL_API_KEY": "your-api-key",
  "ARMCHAIR_MODEL_API_BASE_URL": "https://api.openai.com/v1",
  "ARMCHAIR_MODEL_NAME": "gpt-4"
}
```

These can also be set as environment variables:
```bash
export ARMCHAIR_MODEL_API_KEY="your-api-key"
export ARMCHAIR_MODEL_API_BASE_URL="https://api.openai.com/v1"
export ARMCHAIR_MODEL_NAME="gpt-4"
```

### GitHub Integration Configuration

GitHub features (PR browsing, comment posting, restacking) require a GitHub Personal Access Token (PAT). Configure through the Settings dialog in the UI, or add to `.armchair.json`:

```json
{
  "GITHUB_PAT": "ghp_...",
  "GITHUB_REPOS": ["owner/repo-name"]
}
```

The PAT needs `repo` scope for private repositories, or `public_repo` for public ones.

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `ARMCHAIR_OUTPUT` | `../../output` | Output directory |
| `ARMCHAIR_ROOT_DIR` | `$HOME` | Root directory constraint |
| `ARMCHAIR_MODEL_API_KEY` | - | LLM API key |
| `ARMCHAIR_MODEL_API_BASE_URL` | - | LLM API base URL |
| `ARMCHAIR_MODEL_NAME` | - | LLM model name |
| `CODE_REVIEWER_PATH` | `../../code_reviewer/code-reviewer` | Go reviewer binary |
| `CODE_REVIEWER_APP_CONFIG` | `../../code_reviewer/configs/app.yaml` | Reviewer config |
| `SPLITTER_PATH` | `../../splitter_dep` | Python splitter directory |
| `PYTHON_PATH` | auto-detected | Python executable path |
| `CACHE_REFRESH_INTERVAL_MS` | `1800000` | Cache refresh interval (30 min) |
| `PORT` | `8787` | Backend server port |
| `DEV_MODE` | `false` | Preserve temp files for debugging |

### Output Directory Structure

```
output/
├── .armchair/
│   ├── source.yaml                  # Repository definitions
│   └── .armchair.json               # Runtime settings (LLM, GitHub)
├── commit_abc123_20231215/          # Split from local commits
│   ├── metadata_abc123.json
│   ├── patch_0.patch
│   └── patch_1.patch
├── pr_owner_repo_42_20231215/       # Split from GitHub PRs
│   ├── metadata_pr42.json
│   ├── patch_0.patch
│   └── patch_1.patch
├── reviews/                         # Code reviews
│   └── review_output_123.json
└── .repo-cache.json                 # Repository cache (optional)
```

## Available Commands

### Make Targets

| Target | Description |
|--------|-------------|
| `make install` | Install dependencies for both frontend and backend |
| `make dev` | Start both dev servers (frontend:8686, backend:8787) |
| `make dev-backend` | Start both, but backend in DEV_MODE |
| `make build` | Build frontend for production |
| `make start` | Start production servers |
| `make start-backend` | Start only backend server |
| `make start-frontend` | Start only frontend server |
| `make clean` | Remove build artifacts and node_modules |
| `make docker-build` | Build Docker image |
| `make docker-run` | Run Docker container |
| `make docker-run-custom` | Run Docker container with custom OUTPUT_DIR |
| `make docker-push` | Push to Docker Hub |
| `make help` | Show all available commands |

### Backend npm Scripts

```bash
cd backend
npm run dev            # Start server (uses ARMCHAIR_OUTPUT and ARMCHAIR_ROOT_DIR env vars)
npm run dev:mcp        # Start with MCP server mode
npm start              # Production mode
```

### Frontend npm Scripts

```bash
cd frontend
npm start              # Dev server with hot reload on port 8686
npm run build          # Production build to dist/
```

## Usage

### 1. Browse Repositories
- View all configured repositories in the left panel
- Expand repositories to see branches
- Expand branches to see recent commits
- View uncommitted changes at the top of each branch

### 2. View Commits & Diffs
- Click any commit to see the full diff
- Navigate between files using arrow buttons
- View syntax-highlighted code changes

### 3. Split Large Commits
- Select a commit or uncommitted changes
- Click "Split" button
- AI agent analyzes and creates semantic patches
- View split patches in the "Split Patches" tab

### 4. Review Code
- Select a commit or uncommitted changes
- Click "Review" button
- AI generates detailed review with annotations
- View reviews in the "Reviews" tab

### 5. GitHub Pull Requests
- Configure a GitHub PAT in Settings
- Add repositories to monitor
- Browse open PRs in the "Pull Requests" tab
- Paste any GitHub PR URL to analyze it
- Split a PR to generate patches
- Post analysis results as a PR comment
- Restack a PR by replacing its commits with clean split patches

### 6. Apply Patches
- View split patches
- Use provided git commands to apply patches
- Or use the "Apply" button (if configured)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + ,` | Open Settings |
| `Cmd/Ctrl + R` | Refresh data |
| `1` | Switch to Split Patches tab |
| `2` | Switch to Pull Requests tab |
| `3` | Switch to Reviews tab |
| `Escape` | Close open dialogs |

## API Endpoints

### Configuration
- `GET /api/config` — Current configuration
- `PUT /api/config` — Update configuration (LLM settings, repositories, GitHub PAT)
- `GET /api/health` — Health check and LLM status

### Repositories
- `GET /api/repositories` — List all repositories
- `GET /api/repositories/:name/details` — Repository details
- `POST /api/repositories/:name/refresh` — Force-refresh repository data
- `GET /api/repositories/:name/branches/:branch/commits` — Branch commits
- `GET /api/repositories/:name/branches/:branch/working-directory/diff` — Uncommitted changes
- `GET /api/repositories/:name/commits/:hash/diff` — Commit diff

### Split & Review Operations
- `POST /api/split` — Split commit into patches
- `POST /api/review` — Generate code review
- `POST /api/apply` — Apply patch to repository

### Data
- `GET /api/commits` — List all split commits (includes `commit_*`, `patch_*`, `pr_*`)
- `DELETE /api/commits/:id` — Archive split commit
- `GET /api/reviews` — List reviews
- `GET /api/reviews/:id` — Get review details
- `POST /api/reviews/:id/archive` — Archive review

### GitHub Integration
- `GET /api/github/status` — Connection status, validated login, detected remotes
- `GET /api/github/pulls` — List open PRs across connected repos
- `GET /api/github/pulls/:owner/:repo/:number` — PR details
- `GET /api/github/pulls/:owner/:repo/:number/diff` — PR unified diff
- `POST /api/github/split` — Fetch PR diff and run splitter
- `POST /api/github/review` — Fetch PR diff and run reviewer
- `POST /api/github/analyze-url` — Parse a GitHub PR URL and split it
- `POST /api/github/pulls/:owner/:repo/:number/comment` — Post/update analysis comment on PR
- `POST /api/github/pulls/:owner/:repo/:number/restack` — Replace PR commits with split patches

## External Dependencies

### Code Reviewer (Optional)

A Go-based binary that generates AI-powered code reviews.

**Location**: `../../code_reviewer/code-reviewer` (relative to backend/)

Override with:
```bash
export CODE_REVIEWER_PATH=/path/to/code-reviewer
export CODE_REVIEWER_APP_CONFIG=/path/to/app.yaml
```

**Note**: The code reviewer automatically uses the source config managed by the backend at `{output}/.armchair/source.yaml`.

**Building from source** (if included in your setup):
```bash
cd ../code_reviewer
go build -o code-reviewer ./cmd/server
```

### Code Splitter (Optional)

A Python module that semantically splits commits. See [code-splitter-agent/README.md](../code-splitter-agent/README.md) for full documentation.

**Location**: `../../splitter_dep` (relative to backend/)

Override with:
```bash
export SPLITTER_PATH=/path/to/splitter_dep
```

**Requirements**:
- Python >= 3.8
- Install dependencies: `cd splitter_dep && pip install -r requirements.txt && pip install -e .`

## GitHub Action

ArmChair can run automatically on PRs via a GitHub Action. See [action/action.yml](../action/action.yml).

**Quick setup** — add to `.github/workflows/armchair.yml`:
```yaml
name: Armchair PR Analysis
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: read
  pull-requests: write
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: armchr/armchr/action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}  # Optional
          upload-artifact: 'true'  # Optional: upload static dashboard
```

## MCP Server Mode

ArmChair can run as an MCP (Model Context Protocol) server:

```bash
cd backend
npm run dev:mcp
```

This mode provides repository querying tools via MCP protocol on stdio.

## Development

### Project Structure

```
code_explainer_ui/
├── frontend/                    # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── CommitsPage.js        # Main dashboard (3 tabs)
│   │   │   ├── PatchDetailView.js    # Commit/patch detail view
│   │   │   ├── RepositoryPanel.js    # Left sidebar (repo browser)
│   │   │   ├── DiffViewer.js         # Syntax-highlighted diffs
│   │   │   ├── SettingsDialog.js     # Configuration dialog
│   │   │   ├── GitHubSettings.js     # GitHub PAT/repos settings
│   │   │   ├── PullRequestsTab.js    # Pull requests tab
│   │   │   ├── Breadcrumbs.js        # Navigation breadcrumbs
│   │   │   └── Skeletons.js          # Loading skeletons
│   │   ├── services/
│   │   │   ├── api.js                # Backend API client
│   │   │   └── data-provider.js      # Data abstraction (supports static mode)
│   │   ├── hooks/
│   │   │   └── useKeyboardShortcuts.js
│   │   └── App.js                    # Theme + Router config
│   ├── public/
│   └── webpack.config.js
├── backend/
│   ├── server.js               # Main Express server
│   ├── github-service.js       # GitHub API integration
│   ├── review-service.js       # Code review execution
│   ├── mcp-server.mjs          # MCP server implementation
│   └── package.json
├── config/                     # Example configuration files
├── Makefile                    # Build commands
└── README.md
```

### Key Technologies

**Frontend**:
- React 18
- Material-UI 7 (MUI)
- react-diff-view (diff rendering)
- react-markdown (markdown rendering)
- react-router-dom (routing)

**Backend**:
- Express.js
- fs-extra (file operations)
- yaml (config parsing)
- yargs (CLI argument parsing)

### Monorepo Support

ArmChair handles Git repositories where the configured path is a subdirectory of the Git root:

```yaml
source:
  repositories:
    - name: "ui"
      path: "/project/armchair/code_explainer_ui"  # Subdirectory
      # Git root is /project/armchair
```

The application automatically:
- Detects the Git root
- Filters files to the configured subdirectory
- Adjusts diff paths for correct display

## Troubleshooting

### "Repository not found in config"
- Check `{output}/.armchair/source.yaml` exists and is valid YAML
- Ensure repository names match exactly (case-sensitive)

### "Failed to get working directory diff"
- Verify the repository path exists and is a Git repository
- Check file permissions on the repository directory
- Ensure Git is installed and in PATH

### "LLM features disabled"
- Set `ARMCHAIR_MODEL_API_KEY`, `ARMCHAIR_MODEL_API_BASE_URL`, `ARMCHAIR_MODEL_NAME` in Settings or as env vars
- Check API key is valid and has credits/access

### "Code reviewer/splitter not found"
- AI features are optional — the app works without them
- To enable: build or download the external agents
- Set `CODE_REVIEWER_PATH` and `SPLITTER_PATH` environment variables

### Backend won't start
- Ensure `--output` directory exists: `mkdir -p /path/to/output/.armchair`
- All repository paths in `source.yaml` must be under the `--root-dir` path

### Docker: "Output directory does not exist"
- Ensure you're mounting actual directories: `make docker-run OUTPUT_DIR=/absolute/path`
- Create the directory first: `mkdir -p /path/to/output`

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

For security concerns or vulnerability reports, please see [SECURITY.md](SECURITY.md).

## License

See the LICENSE file in the parent repository.

## Acknowledgments

- Built with React, Material-UI, and Express.js
- Diff rendering powered by react-diff-view
- Syntax highlighting by PrismJS
