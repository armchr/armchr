# Armchair

Armchair is a set of tools to improve developer velocity while using AI coding agents like Claude Code, Github Copilot, Cursor etc.

Currently we are releasing v0 of our first two tools.

## Tools

### 🔄 Splitter Agent
The **Splitter Agent** breaks down commits (or uncommitted changes) into logical chunks for easier analysis. It can:
- Identify code structures and relationships
- Generate structured output for downstream analysis
- Support multiple programming languages

### 🌐 Armchair Dashboard
The **Armchair Dashboard** provides simple access to all the ArmChair tools (only Splitter now):
- Visualizes code analysis results from the Splitter Agent
- Provides an interactive frontend for navigating code explanations
- Enables running splitter analysis directly from the UI
- Available at http://localhost:8686

## Quick Start

The easiest way to run Armchair is using the Docker image. Follow these steps to get started:

### Prerequisites

- Docker installed and running
- API key for Claude (Anthropic) or OpenAI or your local LLM. Expects OpenAI compatible API (Ollama etc.)
- Local directory path to Git repositories you want to analyze

### First Time Setup and Run

1. Set the `ARMCHAIR_HOME` environment variable to the directory where this file is:

```bash
export ARMCHAIR_HOME=/path/to/armchr
```

2. Run the Armchair script (it will automatically configure and start):

```bash
./scripts/armchair.sh
```

The script will:
- Detect that configuration is needed and run interactive setup
- Prompt you to choose your LLM provider:
  - **Option 1: Claude (Anthropic)** - `https://api.anthropic.com/v1`
  - **Option 2: OpenAI** - `https://api.openai.com/v1`
  - **Option 3: Other (Ollama, etc.)** - `http://localhost:11434/v1` (On Mac/Windows use http://host.docker.internal:11434/v1 instead).
- Ask for your model name and API key
- Configure repository paths and mappings
- Generate `armchair_env.sh` with your configuration
- Pull required Docker images
- Automatically start the Armchair Dashboard

**Common Model Names:**
- Claude: `claude-3-5-sonnet-20241022`
- OpenAI: `gpt-4o-mini`, `gpt-4o`
- Ollama: `qwen3-coder:30b`, `qwen2.5-coder:32b`, `deepseek-coder-v2:16b`, `llama3.1:8b`

**Note for Local LLM Services (Ollama, etc.):**
When using a local LLM service on macOS or Windows, you can use `localhost` or `127.0.0.1` in your API base URL (e.g., `http://localhost:11434/v1`). The script will automatically replace it with `host.docker.internal` to allow the Docker container to access services running on your host machine.

### Subsequent Starts

After the first start, if you need to update the docker image or restart ArmChair, you can skip configuration by loading your environment first:

```bash
# Load saved configuration
source $ARMCHAIR_HOME/armchair_env.sh

# Start the dashboard
./scripts/armchair.sh
```

The script will detect existing configuration and skip setup, going directly to starting the dashboard.

### Dashboard Access

Once running, the dashboard will be available at:
- **Frontend Dashboard:** http://localhost:8686
- **Backend API:** http://localhost:8787

Use the web interface to:
- Browse and analyze your code repositories
- Run the splitter agent on commits or uncommitted changes
- Explore the separate patches and annotated changes in each

**Performance Tip for Large Repositories:**

For very very large repositories, the dashboard can be slow when loading unstaged/untracked files. You can improve performance by adding `commitOnly: true` to specific repositories in your `source.yaml`:

```yaml
source:
  repositories:
    - name: "large-repo"
      path: "/workspace1/large-repo"
      language: "multi"
      commitOnly: true  # Skip unstaged/untracked files for better performance
    - name: "normal-repo"
      path: "/workspace1/normal-repo"
      language: "multi"
      # commitOnly defaults to false
```

When `commitOnly: true` is set:
- All commits and branches remain available for exploration and analysis
- Unstaged and untracked files are not loaded in the dashboard
- Dashboard loads significantly faster for very large repositories
- You can still analyze specific commits via the UI or API


### Advanced Options

```bash
# Force reconfiguration
./scripts/armchair.sh --reconfigure

# Override LLM settings
./scripts/armchair.sh \
  --api-key YOUR_API_KEY \
  --api-base-url https://api.anthropic.com/v1 \
  --model-name claude-3-5-sonnet-20241022

# Run in foreground mode (see logs)
./scripts/armchair.sh --foreground

# Use custom ports
./scripts/armchair.sh --port-frontend 3000 --port-backend 3001

# Show help
./scripts/armchair.sh --help
```

**Available Options:**
- `--api-key KEY` - Override API key from environment
- `--api-base-url URL` - Override API base URL from environment
- `--model-name MODEL` - Override model name from environment
- `--port-frontend PORT` - Frontend UI port (default: 8686)
- `--port-backend PORT` - Backend API port (default: 8787)
- `--foreground, -f` - Run in foreground mode (shows logs)
- `--no-llm` - Run without LLM support (not recommended)
- `--reconfigure` - Force reconfiguration
- `--help, -h` - Show full help message

### Management Commands

```bash
# View logs
docker logs armchair-dashboard

# Follow logs in real-time
docker logs -f armchair-dashboard

# Stop dashboard
docker stop armchair-dashboard

# Start stopped dashboard
docker start armchair-dashboard

# Remove container
docker rm armchair-dashboard
```

### 4. Trigger Analysis via API

Once the dashboard is running, you can trigger splitter analysis from the UI for any commit or uncommitted changes.
If you need direct access to the splitter agent programmatically, trigger it via the backend API:

```bash
# Split a specific commit
curl -X POST http://localhost:8787/api/split \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-repo",
    "branch": "main",
    "commitId": "abc1234"
  }'

# Split uncommitted changes (working directory)
curl -X POST http://localhost:8787/api/split \
  -H "Content-Type: application/json" \
  -d '{
    "repoName": "my-repo",
    "branch": "main"
  }'

```

**Parameters:**
- `repoName` (required) - Repository name from your source config
- `branch` (required) - Target branch to analyze
- `commitId` (optional) - Specific commit hash to analyze. If omitted, analyzes uncommitted changes

**Other useful API endpoints:**

```bash
# List all repositories and their branches
curl http://localhost:8787/api/repositories

# List all analyzed commits
curl http://localhost:8787/api/commits

# Get diff for a specific commit
curl http://localhost:8787/api/repositories/my-repo/commits/abc1234/diff

# Get uncommitted changes diff
curl http://localhost:8787/api/repositories/my-repo/branches/main/working-directory/diff
```

## Configuration

### Repository Setup
The setup script automatically handles:
- **Git Root Detection**: Finds the root directory of each git repository
- **Workspace Mapping**: Maps git roots to workspaces (workspace1, workspace2, etc.)
- **Relative Paths**: Calculates paths relative to git roots for proper mounting

### Environment Variables
Key environment variables set by the setup:
- `ARMCHAIR_HOME`: Your workspace directory
- `ARMCHAIR_SOURCE_YAML`: Path to source configuration
- `ARMCHAIR_OUTPUT`: Output directory for analysis results
- `ARMCHAIR_FS_MAP`: File system mappings for Docker volumes

### Docker Volume Mapping
The system uses the following volume mapping strategy:
- **File System Map**: `git_root_path:/workspace1` (maps entire git repositories)
- **Source Config**: Uses workspace-relative paths like `/workspace1/subfolder`

## Running Splitter Agent as Command-Line Tool

If you prefer to run the Splitter Agent as a standalone command-line tool (without the UI), you can use the `run_splitter.sh` script. This is useful for:
- CI/CD pipelines
- Batch processing multiple repositories
- Automated analysis workflows
- Integration with other tools

### Usage

```bash
# Run the splitter for a specific repository
./scripts/run_splitter.sh --repo REPO_NAME --api-key YOUR_API_KEY

# Example with verbose output
./scripts/run_splitter.sh --repo my-repo --api-key sk-... --verbose

# Run for a specific commit
./scripts/run_splitter.sh --repo my-repo --api-key sk-... --commit abc123

# Run in interactive mode
./scripts/run_splitter.sh --repo my-repo --api-key sk-... --interactive

# Use MCP configuration
./scripts/run_splitter.sh --repo my-repo --api-key sk-... --mcp-config /path/to/mcp.json
```

### Available Options

- `--repo REPO_NAME` - Repository name from source config (required)
- `--api-key API_KEY` - API key (or set OPENAI_API_KEY env var)
- `--mcp-config FILE` - MCP configuration file path
- `--commit COMMIT_HASH` - Specific commit to analyze
- `--patch` - Analyze uncommitted changes
- `--verbose` - Enable verbose output
- `--interactive, -it` - Run in interactive mode
- `--help, -h` - Show help message

**Note:** You can set `OPENAI_API_KEY` as an environment variable instead of using `--api-key`.

### Output

The splitter generates structured analysis output in `$ARMCHAIR_OUTPUT`, which can be:
- Viewed using the Armchair Dashboard
- Processed by other tools
- Committed to version control for historical tracking

## Scripts

### `scripts/armchair.sh`
The main Armchair script that automatically sets up and runs the dashboard:

**Intelligent Setup Detection:**
- Automatically detects if configuration is needed
- Runs interactive setup on first run or when environment variables are missing
- Skips setup if environment is already configured
- Use `--reconfigure` flag to force reconfiguration

**What it does:**
- Interactive configuration wizard (LLM provider, repositories, etc.)
- Detects git roots automatically
- Generates `armchair_env.sh` with your configuration
- Pulls required Docker images
- Starts the Armchair Dashboard with Splitter Agent
- Automatic localhost→host.docker.internal conversion for Mac/Windows

**Common Usage:**
```bash
# First time (will run setup then start)
export ARMCHAIR_HOME=/path/to/workspace
./scripts/armchair.sh

# Subsequent runs (skip setup)
source $ARMCHAIR_HOME/armchair_env.sh
./scripts/armchair.sh

# Force reconfiguration
./scripts/armchair.sh --reconfigure

# Custom options
./scripts/armchair.sh --foreground --port-frontend 3000
```

**Available Options:**
- `--api-key`, `--api-base-url`, `--model-name` - Override LLM settings
- `--port-frontend`, `--port-backend` - Custom ports
- `--foreground, -f` - Run in foreground mode
- `--no-llm` - Disable LLM support
- `--reconfigure` - Force reconfiguration
- `--local` - Use local Docker image
- `--help, -h` - Show help

## Advanced: Manual Docker Commands

If you prefer to run Docker commands manually instead of using the provided scripts:

### Standalone Splitter Agent

For running the splitter agent without the UI:

```bash
docker run --rm \
  -v "your_git_root:/workspace1:ro" \
  -v "$ARMCHAIR_OUTPUT:/output" \
  -v "$(dirname $ARMCHAIR_SOURCE_YAML):/config:ro" \
  -e OPENAI_API_KEY=your_key \
  armchr/splitter:latest \
  --repo your_repo_name \
  --output-dir /output \
  --source-config /config/source.yaml
```

### Armchair Dashboard (Splitter + Dashboard combined)

**With LLM support (recommended):**
```bash
docker run -d \
  --name armchair-dashboard \
  -p 8686:8686 -p 8787:8787 \
  -v "$(dirname $ARMCHAIR_SOURCE_YAML):/app/config:ro" \
  -v "$ARMCHAIR_OUTPUT:/app/output" \
  -v "your_git_root:/workspace1" \
  -e CONFIG_PATH=/app/config/source.yaml \
  -e OUTPUT_PATH=/app/output \
  -e ARMCHAIR_MODEL_API_KEY=your_api_key \
  -e ARMCHAIR_MODEL_API_BASE_URL=https://api.anthropic.com/v1 \
  -e ARMCHAIR_MODEL_NAME=claude-3-5-sonnet-20241022 \
  armchr/explainer:latest
```

**Without LLM support (view-only mode):**
```bash
docker run -d \
  --name armchair-dashboard \
  -p 8686:8686 -p 8787:8787 \
  -v "$(dirname $ARMCHAIR_SOURCE_YAML):/app/config:ro" \
  -v "$ARMCHAIR_OUTPUT:/app/output" \
  -v "your_git_root:/workspace1" \
  -e CONFIG_PATH=/app/config/source.yaml \
  -e OUTPUT_PATH=/app/output \
  armchr/explainer:latest
```

## Troubleshooting

### Environment Issues
- Ensure `ARMCHAIR_HOME` is set and the directory exists
- Source the environment file: `source $ARMCHAIR_HOME/armchair_env.sh`
- Check that all required environment variables are set

### Docker Issues
- Verify Docker is running: `docker info`
- Check if images exist: `docker images | grep armchr`
- Review container logs: `docker logs armchair-dashboard`
- Stop and remove stale containers: `docker stop armchair-dashboard && docker rm armchair-dashboard`

### Configuration Issues
- Validate source.yaml syntax
- Ensure repository paths are accessible
- Check file permissions for mounted volumes
- Verify API keys are correctly set in environment or command line

### LLM Issues
- Check API key is valid and not expired
- Verify API base URL is correct for your provider
- Ensure model name matches what your API provider supports
- Review backend logs for API-related errors: `docker logs armchair-dashboard`
- Test API connectivity: `curl -X GET http://localhost:8787/api/health`
