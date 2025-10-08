# Armchair

Armchair is a set of tools to improve developer velocity while using AI coding agents like Claude Code, Github Copilot, Cursor etc.

Currently we are releasing v0 of our first two tools.

## Tools

### 🔄 Splitter Agent
The **Splitter Agent** breaks down commits (or uncommitted changes) into logical chunks for easier analysis. It can:
- Processes source code from multiple repositories
- Identifies code structures and relationships  
- Generates structured output for downstream analysis
- Supports multiple programming languages

### 🌐 Explainer UI
The **Explainer UI** provides a web-based interface for exploring and understanding code changes. It:
- Visualizes code analysis results from the Splitter Agent
- Provides an interactive frontend for navigating code explanations
- http://localhost:8686

## Quick Start

### 1. Setup Environment

Before we begin, set the ARMCHAIR_HOME environment variable to point to the directory where this README file is.

First, configure your Armchair workspace and repositories:

```bash
# Run the setup script
./scripts/setup_armchair.sh
```

This script will:
- Create your Armchair workspace directory
- Configure repository paths and mappings
- Set up source.yaml configuration
- Generate environment variables file

Follow the prompts to:
- Checks for your `ARMCHAIR_HOME` directory
- Add repositories you want to analyze
- Claude or OpenAI key. Splitter agent supports any OpenAI compatible API.

### 2. Load Environment

Source the generated environment file:

```bash
# Load Armchair environment variables
source $ARMCHAIR_HOME/armchair_env.sh
```

### 3. Run Analysis

Run the Splitter Agent to analyze your code:

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

**Available Options:**
- `--repo REPO_NAME` - Repository name from source config (required)
- `--api-key API_KEY` - OpenAI API key (or set OPENAI_API_KEY env var)
- `--mcp-config FILE` - MCP configuration file path
- `--commit COMMIT_HASH` - Specific commit to analyze
- `--verbose` - Enable verbose output
- `--interactive, -it` - Run in interactive mode
- `--help, -h` - Show help message

**Note:** You can set `OPENAI_API_KEY` as an environment variable instead of using `--api-key`.
# OPENAI_API_KEY is your Claude or OpenAI api key.

### 4. Start UI

This is a one time step. You can run the analysis as many times you want and won't need to restart the UI everytime.

Launch the web interface:

```bash
# Start the Explainer UI
./scripts/start_ui.sh
```

The UI will be available at:
- Frontend: http://localhost:8686

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

## Scripts

### `scripts/setup_armchair.sh`
Interactive setup script that configures your Armchair environment:
- Prompts for repository information
- Detects git roots automatically
- Generates configuration files
- Creates environment variables

### `scripts/start_ui.sh`
Starts the Explainer UI with proper Docker configuration:
- Validates environment variables
- Checks Docker availability and images
- Manages container lifecycle
- Provides helpful status messages

## Manual Docker Commands

If you prefer to run Docker commands manually:

### Splitter Agent
```bash
docker run --rm \
  -v "your_git_root:/workspace1:ro" \
  -v "$ARMCHAIR_OUTPUT:/output" \
  -v "$(dirname $ARMCHAIR_SOURCE_YAML):/config:ro" \
  -e OPENAI_API_KEY=your_key \
  simple-splitter-agent:latest \
  --repo your_repo_name \
  --output-dir /output \
  --source-config /config/source.yaml
```

### Explainer UI
```bash
docker run -d \
  --name armchair-ui \
  -p 8686:8686 -p 8787:8787 \
  -v "$(dirname $ARMCHAIR_SOURCE_YAML):/app/config:ro" \
  -v "$ARMCHAIR_OUTPUT:/app/output:ro" \
  -e CONFIG_PATH=/app/config/source.yaml \
  -e OUTPUT_PATH=/app/output \
  armchair-change-navigator
```

## Troubleshooting

### Environment Issues
- Ensure `ARMCHAIR_HOME` is set and the directory exists
- Source the environment file: `source $ARMCHAIR_HOME/armchair_env.sh`
- Check that all required environment variables are set

### Docker Issues  
- Verify Docker is running: `docker info`
- Check if images exist: `docker images`
- Review container logs: `docker logs armchair-ui`

### Configuration Issues
- Validate source.yaml syntax
- Ensure repository paths are accessible
- Check file permissions for mounted volumes
