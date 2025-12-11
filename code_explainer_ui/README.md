# ArmChair - AI-Powered Git Commit Browser & Analyzer

ArmChair is a full-stack web application that helps developers understand, review, and manage Git commits through AI-powered analysis. It provides intelligent commit splitting, automated code reviews, and an intuitive interface for browsing repository changes.

## Features

- 🔍 **Visual Commit Browser**: Browse commits, branches, and uncommitted changes across multiple repositories
- 🤖 **AI-Powered Code Review**: Automatically generate detailed code reviews with annotations
- ✂️ **Intelligent Commit Splitting**: Break down large commits into semantically coherent patches
- 📊 **Diff Visualization**: Syntax-highlighted diff viewer with file-by-file navigation
- 🏢 **Monorepo Support**: Works with monorepo subdirectories and complex Git structures
- 🔄 **Real-time Status**: Monitor uncommitted changes and repository state
- 📦 **Patch Management**: Apply, review, and archive split patches

## Architecture

**ArmChair** consists of three main components:

1. **[React Frontend](frontend/README.md)** (port 8686): Modern UI built with Material-UI and react-diff-view
2. **[Express.js Backend](backend/README.md)** (port 8787): REST API and Git operations coordinator
3. **External AI Agents**:
   - Go-based code reviewer for generating reviews with annotations
   - Python-based splitter for semantic commit decomposition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ArmChair System                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    React Frontend (port 8686)                        │   │
│   │  • Repository Browser    • Diff Viewer    • Settings UI             │   │
│   │  • Split Patches List    • Reviews List   • Keyboard Shortcuts      │   │
│   └────────────────────────────────┬────────────────────────────────────┘   │
│                                    │ REST API                               │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                  Express.js Backend (port 8787)                      │   │
│   │  • Git Operations        • Config Management    • Caching           │   │
│   │  • MCP Server Mode       • Path Validation      • Agent Coordinator │   │
│   └───────┬─────────────────────────┬─────────────────────────┬─────────┘   │
│           │                         │                         │             │
│           ▼                         ▼                         ▼             │
│   ┌───────────────┐        ┌───────────────┐        ┌───────────────┐       │
│   │  Git Repos    │        │  Go Reviewer  │        │ Python Splitter│      │
│   │  (read-only)  │        │    Agent      │        │     Agent      │      │
│   └───────────────┘        └───────────────┘        └───────────────┘       │
│                                    │                         │              │
│                                    └───────────┬─────────────┘              │
│                                                ▼                            │
│                                    ┌───────────────────────┐                │
│                                    │    LLM Provider       │                │
│                                    │ (Claude/OpenAI/Ollama)│                │
│                                    └───────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```

For detailed documentation on each component:
- **[Frontend README](frontend/README.md)** - React components, routing, keyboard shortcuts, theming
- **[Backend README](backend/README.md)** - API endpoints, configuration, external agent integration, MCP server

## Prerequisites

- **Node.js**: >= 16.0.0
- **Git**: Installed and accessible in PATH
- **Go**: >= 1.21 (for building code reviewer - optional)
- **Python**: >= 3.8 (for code splitter - optional)

## Quick Start

### Using Make (Recommended)

```bash
# 1. Install dependencies
make install

# 2. Create configuration (see Configuration section below)
mkdir -p config
cat > config/source.yaml << 'EOF'
source:
  repositories:
    - name: "my-project"
      path: "/absolute/path/to/your/repo"
EOF

# 3. Start development servers
make dev
```

- Frontend: http://localhost:8686
- Backend API: http://localhost:8787

### Manual Setup

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

### Using Docker

```bash
# From parent directory (armchair/)
make docker-build
make docker-run CONFIG_DIR=/path/to/config OUTPUT_DIR=/path/to/output
```

## Configuration

### Required: source.yaml

Create a `source.yaml` file to define repositories:

```yaml
source:
  repositories:
    - name: "my-app"               # Display name
      path: "/absolute/path/repo"   # Absolute path to repository
      language: "javascript"        # Optional: for syntax highlighting
      commitOnly: false             # Optional: hide uncommitted changes
      disabled: false               # Optional: disable repository
```

**Default location**: `../config/source.yaml` (relative to backend/)

Override with environment variable:
```bash
export ARMCHAIR_SOURCE_YAML=/path/to/source.yaml
```

### Environment Variables

**Required for AI Features**:
```bash
# LLM API Configuration (for code review)
export ARMCHAIR_MODEL_API_KEY="your-api-key"
export ARMCHAIR_MODEL_API_BASE_URL="https://api.openai.com/v1"
export ARMCHAIR_MODEL_NAME="gpt-4"
```

**Optional Configuration**:
```bash
# Paths (with defaults)
export ARMCHAIR_SOURCE_YAML="../config/source.yaml"
export ARMCHAIR_OUTPUT="../output"
export CODE_REVIEWER_PATH="../../code_reviewer/code-reviewer"
export CODE_REVIEWER_APP_CONFIG="../../code_reviewer/configs/app.yaml"
export SPLITTER_PATH="../../splitter_dep"
export PYTHON_PATH="../../splitter_dep/venv/bin/python3"  # Use venv Python

# Cache Settings
export CACHE_REFRESH_INTERVAL_MS=1800000  # 30 minutes

# Server Port
export PORT=8787
```

### Output Directory Structure

The backend creates this structure in the output directory:

```
output/
├── commit_abc123_20231215_120000/    # Split commits
│   ├── metadata_abc123.json
│   ├── patch_1.patch
│   └── patch_2.patch
├── reviews/                          # Code reviews
│   ├── review_xyz789.json
│   └── review_xyz789.md
└── .repo-cache.json                  # Repository cache
```

## Available Commands

### Development
```bash
make install     # Install all dependencies
make dev         # Start development servers
make build       # Build frontend for production
make start       # Start production servers
make clean       # Remove build artifacts and node_modules
```

### Docker
```bash
make docker-build         # Build Docker image
make docker-run           # Run with default paths
make docker-run-custom    # Run with custom CONFIG_DIR and OUTPUT_DIR
make docker-push          # Push to Docker Hub (requires login)
```

### Backend Only
```bash
cd backend
npm run dev                    # Development mode
npm run dev:mcp               # MCP server mode
npm start                     # Production mode
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

### 5. Apply Patches
- View split patches
- Use provided git commands to apply patches
- Or use the "Apply" button (if configured)

## API Endpoints

### Repositories
- `GET /api/repositories` - List all repositories
- `GET /api/repositories/:name/details` - Get repository details
- `POST /api/repositories/:name/refresh` - Refresh repository data
- `GET /api/repositories/:name/branches/:branch/commits` - Get commits
- `GET /api/repositories/:name/branches/:branch/working-directory/diff` - Get uncommitted changes
- `GET /api/repositories/:name/commits/:hash/diff` - Get commit diff

### Operations
- `POST /api/split` - Split commit into patches
- `POST /api/review` - Generate code review
- `POST /api/apply` - Apply patch to repository

### Data
- `GET /api/commits` - List split commits
- `DELETE /api/commits/:id` - Delete split commit
- `GET /api/reviews` - List reviews
- `GET /api/reviews/:id` - Get review details
- `POST /api/reviews/:id/archive` - Archive review

### Health
- `GET /api/health` - Health check and configuration status

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

A Python module that semantically splits commits.

**Location**: `../../splitter_dep` (relative to backend/)

Override with:
```bash
export SPLITTER_PATH=/path/to/splitter_dep
```

**Requirements**:
- Python >= 3.8
- Dependencies in `splitter_dep/requirements.txt`

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
├── frontend/              # React application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # API services
│   │   ├── utils/        # Utilities
│   │   └── App.js        # Main app
│   ├── public/           # Static assets
│   └── webpack.config.js
├── backend/              # Express.js server
│   ├── server.js         # Main server (API endpoints)
│   ├── mcp-server.mjs    # MCP server implementation
│   └── package.json
├── config/               # Configuration files
│   └── source.yaml       # Repository definitions
├── output/               # Generated data
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Docker Compose config
├── Makefile              # Build commands
└── README.md
```

### Key Technologies

**Frontend**:
- React 18
- Material-UI (MUI)
- react-diff-view (diff rendering)
- react-markdown (markdown rendering)
- PrismJS (syntax highlighting)

**Backend**:
- Express.js
- fs-extra (file operations)
- yaml (config parsing)
- cors (CORS support)

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
- Check your `source.yaml` file exists and is valid YAML
- Verify `ARMCHAIR_SOURCE_YAML` environment variable if using custom path
- Ensure repository names match exactly (case-sensitive)

### "Failed to get working directory diff"
- Verify the repository path exists and is a Git repository
- Check file permissions on the repository directory
- Ensure Git is installed and in PATH

### "LLM features disabled"
- Set required environment variables: `ARMCHAIR_MODEL_API_KEY`, `ARMCHAIR_MODEL_API_BASE_URL`, `ARMCHAIR_MODEL_NAME`
- Check API key is valid and has credits/access

### "Code reviewer/splitter not found"
- AI features are optional - the app works without them
- To enable: build or download the external agents
- Set `CODE_REVIEWER_PATH` and `SPLITTER_PATH` environment variables

### Docker: "Config directory does not exist"
- Ensure you're mounting actual directories: `make docker-run CONFIG_DIR=/absolute/path OUTPUT_DIR=/absolute/path`
- Create the directories first: `mkdir -p /path/to/config /path/to/output`

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
