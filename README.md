# Armchair

Armchair is a set of tools to improve developer velocity while using AI coding agents like Claude Code, Github Copilot, Cursor etc.

Currently we are releasing v0 of our first two tools.

## Tools

### 🌐 Armchair Dashboard
The **Armchair Dashboard** provides a web-based interface for exploring and understanding code changes. It:
- Visualizes code analysis results from the Splitter Agent
- Provides an interactive frontend for navigating code explanations
- Enables running splitter analysis directly from the UI
- Available at http://localhost:8686

### 🔄 Splitter Agent
The **Splitter Agent** breaks down commits (or uncommitted changes) into logical chunks for easier analysis. It can:
- Process source code from multiple repositories
- Identify code structures and relationships
- Generate structured output for downstream analysis
- Support multiple programming languages

## Quick Start

### Prerequisites

- Docker installed and running
- API key for Claude (Anthropic) or OpenAI or your local LLM. Expects OpenAI compatible API (Ollama etc.)
- Git repositories you want to analyze

### 1. Setup Environment

Set the `ARMCHAIR_HOME` environment variable to point to the directory where this README file is located:

```bash
export ARMCHAIR_HOME=/path/to/armchr
```

Run the setup script to configure your Armchair workspace:

```bash
# Run the setup script
./scripts/setup_armchair.sh
```

This script will:
- Create your Armchair workspace directory
- Configure repository paths and mappings
- Set up source.yaml configuration
- Configure your LLM provider (API key, base URL, model name)
- Generate environment variables file

Follow the prompts to:
- Verify your `ARMCHAIR_HOME` directory
- Add repositories you want to analyze
- Choose your LLM provider and configure (supports any OpenAI-compatible API):
  - **API Base URL** - The endpoint for your LLM service
  - **Model Name** - The specific model to use
  - **API Key** - Your authentication key

**Common API Base URLs:**
- Claude (Anthropic): `https://api.anthropic.com/v1`
- OpenAI: `https://api.openai.com/v1`
- Ollama (local): `http://localhost:11434/v1`

**Common Model Names:**
- Claude: `claude-3-5-sonnet-20241022`
- OpenAI: `gpt-4o-mini`, `gpt-4o`
- Ollama: `qwen2.5-coder:32b`, `deepseek-coder-v2:16b`, `llama3.1:8b`

### 2. Load Environment

Source the generated environment file:

```bash
# Load Armchair environment variables
source $ARMCHAIR_HOME/armchair_env.sh
```

### 3. Start Armchair Dashboard

Run the dashboard script, which launches a Docker container with Armchair Dashboard and all the ArmChair tools:

```bash
# Start the dashboard (uses environment variables from setup)
./scripts/run_explainer.sh

# You can override with command line options
./scripts/run_explainer.sh \
  --api-key YOUR_API_KEY \
  --api-base-url https://api.anthropic.com/v1 \
  --model-name claude-3-5-sonnet-20241022
```

The dashboard will be available at:
- **Frontend Dashboard:** http://localhost:8686
- **Backend API:** http://localhost:8787

Use the web interface to:
- Browse and analyze your code repositories
- Run the splitter agent on commits or uncommitted changes
- Explore the separate patches and annotated changes in each

**Common Options:**
- `--api-key KEY` - API key for LLM service (optional if set in environment)
- `--api-base-url URL` - API base URL (optional if set in environment)
- `--model-name MODEL` - Model name (optional if set in environment)
- `--port-frontend PORT` - Frontend UI port (default: 8686)
- `--port-backend PORT` - Backend API port (default: 8787)
- `--no-llm` - Run without LLM support (not recommended)
- `--help, -h` - Show full help message

**Note:** If you completed step 1 (setup), the following environment variables are already configured in `$ARMCHAIR_HOME/armchair_env.sh`:
- `ARMCHAIR_HOME` - Your workspace directory
- `ARMCHAIR_SOURCE_YAML` - Path to source.yaml configuration
- `ARMCHAIR_FS_MAP` - Docker volume mappings for your repositories
- `ARMCHAIR_OUTPUT` - Output directory for analysis results
- `ARMCHAIR_MODEL_API_KEY` - Your API key
- `ARMCHAIR_MODEL_API_BASE_URL` - Your API base URL (e.g., https://api.anthropic.com/v1)
- `ARMCHAIR_MODEL_NAME` - Your model name (e.g., claude-3-5-sonnet-20241022)

**Performance Tip for Large Repositories:**

For very large repositories, the dashboard can be slow when loading unstaged/untracked files. You can improve performance by adding `commitOnly: true` to specific repositories in your `source.yaml`:

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

### `scripts/setup_armchair.sh`
Interactive setup script that configures your Armchair environment:
- Prompts for repository information
- Detects git roots automatically
- Generates configuration files
- Creates environment variables

### `scripts/run_splitter.sh`
Runs the Splitter Agent to analyze code changes:
- Validates environment variables
- Processes commits or uncommitted changes
- Supports interactive mode and MCP configuration
- Generates structured analysis output

### `scripts/run_explainer.sh`
Starts the Armchair Dashboard with proper Docker configuration:
- Validates environment variables
- Supports LLM-powered semantic analysis and code explanations
- Manages container lifecycle
- Configurable ports and Docker images
- Provides helpful status messages

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
