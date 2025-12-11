# ArmChair Backend

Express.js API server for the ArmChair Change Browser - providing Git operations, AI-powered code review, and commit splitting capabilities.

## Overview

The backend server provides:
- REST API for repository browsing and Git operations
- Integration with external AI agents (code reviewer, splitter)
- Configuration management for repositories and LLM settings
- MCP (Model Context Protocol) server mode for IDE integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Express.js Backend (8787)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         REST API Layer                              │ │
│  │  /api/repositories  /api/commits  /api/split  /api/review  /api/*  │ │
│  └────────────────────────────────┬───────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────┬───────────────┼───────────────┬────────────────┐    │
│  │                │               │               │                │    │
│  ▼                ▼               ▼               ▼                ▼    │
│ ┌──────┐    ┌──────────┐   ┌───────────┐   ┌──────────┐    ┌─────────┐ │
│ │ Git  │    │  Config  │   │  Review   │   │ Splitter │    │  Cache  │ │
│ │ Ops  │    │  Manager │   │  Service  │   │ Service  │    │ Manager │ │
│ └──┬───┘    └────┬─────┘   └─────┬─────┘   └────┬─────┘    └────┬────┘ │
│    │             │               │              │               │       │
└────┼─────────────┼───────────────┼──────────────┼───────────────┼───────┘
     │             │               │              │               │
     ▼             ▼               ▼              ▼               ▼
┌─────────┐  ┌──────────┐  ┌─────────────┐  ┌───────────┐  ┌───────────┐
│   Git   │  │  Config  │  │ Go Reviewer │  │  Python   │  │   Cache   │
│  Repos  │  │  Files   │  │   Binary    │  │ Splitter  │  │   File    │
└─────────┘  └──────────┘  └─────────────┘  └───────────┘  └───────────┘
```

### Request Flow

```
Client Request
      │
      ▼
┌─────────────────┐
│  Express Router │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌──────────────┐
│ Cache │  │ Git Command  │
│ Check │  │  Execution   │
└───┬───┘  └──────┬───────┘
    │             │
    └──────┬──────┘
           ▼
    ┌─────────────┐
    │   Response  │
    │   (JSON)    │
    └─────────────┘
```

## Tech Stack

- **Express.js** - Web framework
- **fs-extra** - Enhanced file operations
- **yaml** - Configuration parsing
- **yargs** - CLI argument parsing
- **@modelcontextprotocol/sdk** - MCP server support

## Quick Start

### Prerequisites

- Node.js >= 16.0.0
- Git installed and accessible in PATH

### Installation

```bash
npm install
```

### Running the Server

```bash
# Development mode
npm run dev

# Production mode
npm start

# MCP server mode (for IDE integration)
npm run dev:mcp
```

The server runs on port 8787 by default.

## Command Line Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--output` | Yes | Directory for split patches, reviews, and configuration |
| `--root-dir` | Yes* | Root directory constraint for repository paths |
| `--root-map` | No | Path mapping for storage (defaults to root-dir) |
| `--enable-cache` | No | Enable repository caching |
| `--mcp` | No | Run as MCP server on stdio |

*Required when not using MCP mode

### Examples

```bash
# Basic usage
node server.js --output ./output --root-dir /home/user/repos

# With caching enabled
node server.js --output ./output --root-dir /home/user/repos --enable-cache

# Docker path mapping (container path → host path)
node server.js --output /app/output --root-dir /app/repos --root-map /host/repos
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Server port |
| `ARMCHAIR_MODEL_API_KEY` | - | LLM API key (required for AI features) |
| `ARMCHAIR_MODEL_API_BASE_URL` | - | LLM API base URL |
| `ARMCHAIR_MODEL_NAME` | - | LLM model name |
| `CODE_REVIEWER_PATH` | `../../code_reviewer/code-reviewer` | Path to code reviewer binary |
| `CODE_REVIEWER_APP_CONFIG` | `../../code_reviewer/configs/app.yaml` | Code reviewer config |
| `SPLITTER_PATH` | `../../splitter_dep` | Path to Python splitter module |
| `PYTHON_PATH` | Auto-detected | Python executable path |
| `CACHE_REFRESH_INTERVAL_MS` | `1800000` (30 min) | Cache refresh interval |
| `DEV_MODE` | `false` | Preserve temp files for debugging |

## Configuration

### Directory Structure

The `--output` directory contains:

```
{output}/
├── .armchair/
│   ├── source.yaml         # Repository definitions
│   └── .armchair.json      # Runtime settings (LLM config)
├── .repo-cache.json        # Repository cache (if enabled)
├── commit_*/               # Split patches
│   ├── metadata_*.json
│   └── patch_*.patch
└── reviews/                # Code reviews
    ├── review_*.json
    └── review_*.md
```

### source.yaml Format

```yaml
source:
  repositories:
    - name: "my-app"
      path: "/absolute/path/to/repo"
      commitOnly: false    # Optional: hide uncommitted changes
      disabled: false      # Optional: disable repository
```

### .armchair.json Format

Managed via the Settings UI:

```json
{
  "ARMCHAIR_MODEL_API_KEY": "your-api-key",
  "ARMCHAIR_MODEL_API_BASE_URL": "https://api.openai.com/v1",
  "ARMCHAIR_MODEL_NAME": "gpt-4"
}
```

## API Endpoints

### Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get current configuration |
| PUT | `/api/config` | Update LLM settings and/or repositories |
| GET | `/api/health` | Health check and status |

### Repositories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repositories` | List all repositories |
| GET | `/api/repositories/:name/details` | Get repository details |
| POST | `/api/repositories/:name/refresh` | Force refresh repository data |
| GET | `/api/repositories/:name/branches/:branch/commits` | Get branch commits |
| GET | `/api/repositories/:name/branches/:branch/working-directory/diff` | Get uncommitted changes |
| GET | `/api/repositories/:name/commits/:hash/diff` | Get commit diff |

### Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/split` | Split commit/patch into semantic pieces |
| POST | `/api/review` | Generate AI code review |
| POST | `/api/apply` | Apply patch to repository |

### Data Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commits` | List all split commits |
| DELETE | `/api/commits/:id` | Delete split commit |
| GET | `/api/reviews` | List all reviews |
| GET | `/api/reviews/:id` | Get review details with markdown |
| POST | `/api/reviews/:id/archive` | Archive a review |

## External Agent Integration

### Code Reviewer (Go binary)

Generates AI-powered code reviews with inline annotations.

```bash
# Expected path
$CODE_REVIEWER_PATH (default: ../../code_reviewer/code-reviewer)

# Invoked via /api/review endpoint
```

### Code Splitter (Python module)

Semantically splits commits into logical patches.

```bash
# Expected path
$SPLITTER_PATH (default: ../../splitter_dep)

# Requires: python3 -m code_splitter.main
# Install: pip install -e . (from splitter_dep directory)
```

## MCP Server Mode

Run as an MCP server for IDE integration:

```bash
node server.js --mcp --root-dir /path/to/repos --output /path/to/output
```

Provides tools for:
- Repository querying
- Commit browsing
- Diff retrieval

## Project Structure

```
backend/
├── server.js           # Main Express server (API endpoints)
├── review-service.js   # Code review execution logic
├── mcp-server.mjs      # MCP server implementation
├── mcp-server.js       # MCP server (CommonJS)
├── mcp-server-cjs.js   # MCP server (legacy CJS)
└── package.json
```

## Security Considerations

### Path Validation
- All repository paths must be under `--root-dir`
- Path traversal protection on file operations
- Command injection prevention via `shell: false`

### Sensitive Data
- API keys stored in `.armchair.json` (not in source control)
- LLM settings configurable via UI or environment variables

### Recommendations for Production
- Run behind a reverse proxy with authentication
- Restrict CORS origins
- Use HTTPS
- Set appropriate rate limits

## Monorepo Support

The server handles Git repositories where the configured path is a subdirectory:

```yaml
repositories:
  - name: "ui"
    path: "/project/monorepo/packages/ui"  # Git root is /project/monorepo
```

Automatically:
- Detects Git root directory
- Filters files to configured subdirectory
- Adjusts diff paths for display

## Troubleshooting

### "Repository not found"
- Verify path in source.yaml exists
- Check path is under `--root-dir`
- Ensure Git repository is initialized

### "Code reviewer not found"
- AI features are optional
- Set `CODE_REVIEWER_PATH` environment variable
- Build the Go binary if needed

### "Splitter not found"
- Set `SPLITTER_PATH` environment variable
- Install Python dependencies: `pip install -e .`
- Verify Python >= 3.8

### Cache issues
- Delete `.repo-cache.json` to force refresh
- Use `POST /api/repositories/:name/refresh` endpoint
- Disable cache with `--enable-cache=false`

## Development

### Adding New Endpoints

1. Add route handler in `server.js`
2. Use `execGitCommand()` for Git operations (prevents command injection)
3. Validate paths with `validatePathUnderRoot()`
4. Return consistent JSON response format

### Logging

Uses `console.log/error` for logging. In production, consider:
- Replacing with structured logging (winston, pino)
- Adding log levels
- Implementing log rotation
