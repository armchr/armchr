#!/bin/bash

set -e

echo "🪑 Armchair - Tools for AI Coding Workflows"
echo "============================================"
echo ""

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [options]

This script sets up and starts the Armchair Dashboard.

If environment variables are not set, it will run an interactive setup.
If environment variables are already configured, it will skip setup and start the dashboard.

Options:
  --api-key KEY           API key for LLM service
  --api-base-url URL      API base URL (e.g., https://api.anthropic.com/v1)
  --model-name MODEL      Model name (e.g., claude-3-5-sonnet-20241022)
  --port-frontend PORT    Frontend UI port (default: 8686)
  --port-backend PORT     Backend API port (default: 8787)
  --foreground, -f        Run in foreground mode (default: detached)
  --name NAME             Container name (default: armchair-dashboard)
  --local                 Use local image 'explainer:latest'
  --image IMAGE           Use custom Docker image
  --no-llm                Run without LLM support (not recommended)
  --reconfigure           Force reconfiguration even if environment is set
  --help, -h              Show this help message

Examples:
  # First time run (will prompt for configuration)
  $0

  # Run with existing configuration
  source \$ARMCHAIR_HOME/armchair_env.sh
  $0

  # Force reconfiguration
  $0 --reconfigure

  # Start with custom settings
  $0 --api-key sk-... --api-base-url https://api.openai.com/v1 --model-name gpt-4o

  # Start in foreground mode
  $0 --foreground

Environment Variables:
  ARMCHAIR_HOME               - Armchair workspace directory (required)
  ARMCHAIR_SOURCE_YAML        - Path to source.yaml configuration
  ARMCHAIR_FS_MAP             - Docker volume mappings
  ARMCHAIR_OUTPUT             - Output directory for results
  ARMCHAIR_MODEL_API_KEY      - Your API key
  ARMCHAIR_MODEL_API_BASE_URL - Your API base URL
  ARMCHAIR_MODEL_NAME         - Your model name

EOF
}

# Function to find git root directory
find_git_root() {
    local path="$1"
    while [ "$path" != "/" ]; do
        if [ -d "$path/.git" ]; then
            echo "$path"
            return 0
        fi
        path=$(dirname "$path")
    done
    return 1
}

# Function to calculate relative path (compatible with macOS)
get_relative_path() {
    local from="$1"
    local to="$2"

    # Convert to absolute paths
    from=$(cd "$from" && pwd)
    to=$(cd "$to" && pwd)

    # If paths are the same, return "."
    if [ "$from" = "$to" ]; then
        echo "."
        return 0
    fi

    # Remove common prefix
    local common="$from"
    local result=""

    # Find the longest common prefix
    while [ "${to#$common/}" = "$to" ] && [ "$common" != "/" ]; do
        common=$(dirname "$common")
    done

    # Build relative path
    if [ "$common" = "/" ]; then
        # No common path, return absolute path
        echo "$to"
    else
        # Calculate relative path
        local forward=""
        local temp="$from"
        while [ "$temp" != "$common" ]; do
            if [ -z "$forward" ]; then
                forward=".."
            else
                forward="../$forward"
            fi
            temp=$(dirname "$temp")
        done

        local remainder="${to#$common/}"
        if [ -z "$remainder" ]; then
            echo "$forward"
        elif [ -z "$forward" ]; then
            echo "$remainder"
        else
            echo "$forward/$remainder"
        fi
    fi
}

# Function to get or assign workspace for git root
get_workspace_for_git_root() {
    local git_root="$1"
    local workspace_name=""

    # Check if this git root already has a workspace assignment
    for i in "${!git_roots[@]}"; do
        if [ "${git_roots[$i]}" = "$git_root" ]; then
            echo "${workspace_assignments[$i]}"
            return 0
        fi
    done

    # New git root, assign a new workspace
    workspace_name="workspace$workspace_counter"
    git_roots+=("$git_root")
    workspace_assignments+=("$workspace_name")
    workspace_counter=$((workspace_counter + 1))
    echo "$workspace_name"
}

# Parse command line arguments
PORT_FRONTEND="8686"
PORT_BACKEND="8787"
DETACHED="-d"
DOCKER_IMAGE="armchr/explainer:latest"
CONTAINER_NAME="armchair-dashboard"
NO_LLM=""
CLI_API_KEY=""
CLI_API_BASE_URL=""
CLI_MODEL_NAME=""
FORCE_RECONFIGURE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --port-frontend)
            PORT_FRONTEND="$2"
            shift 2
            ;;
        --port-backend)
            PORT_BACKEND="$2"
            shift 2
            ;;
        --foreground|-f)
            DETACHED=""
            shift
            ;;
        --name)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        --no-llm)
            NO_LLM="true"
            shift
            ;;
        --api-key)
            CLI_API_KEY="$2"
            shift 2
            ;;
        --api-base-url)
            CLI_API_BASE_URL="$2"
            shift 2
            ;;
        --model-name)
            CLI_MODEL_NAME="$2"
            shift 2
            ;;
        --local)
            DOCKER_IMAGE="explainer:latest"
            shift
            ;;
        --image)
            DOCKER_IMAGE="$2"
            shift 2
            ;;
        --reconfigure)
            FORCE_RECONFIGURE=true
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "💡 Run $0 --help for usage information"
            exit 1
            ;;
    esac
done

# Check if we need to run setup
NEED_SETUP=false

if [ "$FORCE_RECONFIGURE" = true ]; then
    echo "🔄 Force reconfiguration requested"
    NEED_SETUP=true
elif [ -z "$ARMCHAIR_HOME" ]; then
    echo "⚠️  ARMCHAIR_HOME is not set"
    NEED_SETUP=true
elif [ -z "$ARMCHAIR_SOURCE_YAML" ] || [ -z "$ARMCHAIR_FS_MAP" ] || [ -z "$ARMCHAIR_OUTPUT" ]; then
    echo "⚠️  Some environment variables are missing"
    NEED_SETUP=true
fi

# Run setup if needed
if [ "$NEED_SETUP" = true ]; then
    echo ""
    echo "🔧 Running Setup..."
    echo "=================="
    echo ""

    # Check if ARMCHAIR_HOME is set
    if [ -z "$ARMCHAIR_HOME" ]; then
        echo "❌ Error: ARMCHAIR_HOME environment variable is not set."
        echo "Please set ARMCHAIR_HOME to point to your Armchair workspace directory."
        echo "Example: export ARMCHAIR_HOME=/path/to/your/armchair/workspace"
        exit 1
    fi

    echo "✅ ARMCHAIR_HOME is set to: $ARMCHAIR_HOME"

    # Create ARMCHAIR_HOME directory if it doesn't exist
    if [ ! -d "$ARMCHAIR_HOME" ]; then
        echo "📁 Creating ARMCHAIR_HOME directory: $ARMCHAIR_HOME"
        mkdir -p "$ARMCHAIR_HOME"
    fi

    # Handle ARMCHAIR_OUTPUT directory
    if [ -z "$ARMCHAIR_OUTPUT" ]; then
        OUTPUT_DIR="$ARMCHAIR_HOME/output"
        echo "📂 Creating output directory: $OUTPUT_DIR"
        mkdir -p "$OUTPUT_DIR"
    else
        OUTPUT_DIR="$ARMCHAIR_OUTPUT"
        echo "✅ ARMCHAIR_OUTPUT is set to: $ARMCHAIR_OUTPUT"
    fi

    # Ask user about AI model API preference
    echo ""
    echo "🤖 AI Model Configuration"
    echo "========================"
    echo "Please choose your preferred AI model API:"
    echo "1) Claude (Anthropic)"
    echo "2) OpenAI"
    echo "3) Other OpenAI-compatible API (Ollama, etc.)"
    echo ""

    while true; do
        read -p "Enter your choice (1-3): " api_choice

        case $api_choice in
            1)
                echo "✅ Using Claude API"
                MODEL_API_TYPE="claude"
                MODEL_API_BASE_URL="https://api.anthropic.com/v1"
                read -p "Enter Claude model name (e.g., claude-3-5-sonnet-20241022): " MODEL_NAME
                if [ -z "$MODEL_NAME" ]; then
                    echo "❌ Model name cannot be empty"
                    continue
                fi
                read -p "Enter your Anthropic API key: " MODEL_API_KEY
                if [ -z "$MODEL_API_KEY" ]; then
                    echo "❌ API key cannot be empty"
                    continue
                fi
                break
                ;;
            2)
                echo "✅ Using OpenAI API"
                MODEL_API_TYPE="openai"
                MODEL_API_BASE_URL="https://api.openai.com/v1"
                read -p "Enter OpenAI model name (e.g., gpt-4o, gpt-4o-mini): " MODEL_NAME
                if [ -z "$MODEL_NAME" ]; then
                    echo "❌ Model name cannot be empty"
                    continue
                fi
                read -p "Enter your OpenAI API key: " MODEL_API_KEY
                if [ -z "$MODEL_API_KEY" ]; then
                    echo "❌ API key cannot be empty"
                    continue
                fi
                break
                ;;
            3)
                echo "✅ Using other OpenAI-compatible API"
                MODEL_API_TYPE="other"
                read -p "Enter API base URL (e.g., http://localhost:11434/v1 for Ollama): " MODEL_API_BASE_URL
                if [ -z "$MODEL_API_BASE_URL" ]; then
                    echo "❌ API base URL cannot be empty"
                    continue
                fi
                read -p "Enter model name (e.g., qwen2.5-coder:32b): " MODEL_NAME
                if [ -z "$MODEL_NAME" ]; then
                    echo "❌ Model name cannot be empty"
                    continue
                fi
                read -p "Enter your API key (press Enter if not required): " MODEL_API_KEY
                break
                ;;
            *)
                echo "❌ Invalid choice. Please enter 1, 2, or 3."
                ;;
        esac
    done

    # Handle ARMCHAIR_SOURCE_YAML configuration
    CONFIG_DIR="$ARMCHAIR_HOME/config"
    CONFIG_FILE="$CONFIG_DIR/source.yaml"

    echo ""
    echo "⚙️  Configuring repositories..."

    # Create config directory
    mkdir -p "$CONFIG_DIR"

    # Check if default source.yaml already exists
    if [ -f "$CONFIG_FILE" ] && [ "$FORCE_RECONFIGURE" = false ]; then
        echo "📄 Found existing configuration file: $CONFIG_FILE"
        echo ""
        cat "$CONFIG_FILE"
        echo ""
        read -p "Do you want to keep this configuration? (y/n): " keep_config

        if [ "$keep_config" = "y" ] || [ "$keep_config" = "Y" ]; then
            echo "✅ Keeping existing configuration"
            SKIP_REPO_CONFIG=true
        else
            echo "📝 Creating new configuration..."
            SKIP_REPO_CONFIG=false
        fi
    else
        echo "📝 Let's configure your repositories."
        SKIP_REPO_CONFIG=false
    fi

    # Only collect repo info if not keeping existing config
    if [ "$SKIP_REPO_CONFIG" = false ]; then
        # Initialize arrays for storing repo info
        declare -a repo_names=()
        declare -a repo_paths=()
        declare -a repo_languages=()
        declare -a fs_mappings=()
        declare -a git_roots=()
        declare -a workspace_assignments=()
        workspace_counter=1

        while true; do
            echo ""
            read -p "Enter repository name (or 'done' to finish): " repo_name

            if [ "$repo_name" = "done" ]; then
                break
            fi

            if [ -z "$repo_name" ]; then
                echo "❌ Repository name cannot be empty"
                continue
            fi

            read -p "Enter full path to repository: " repo_path
            if [ -z "$repo_path" ]; then
                echo "❌ Repository path cannot be empty"
                continue
            fi

            # Expand tilde to home directory
            repo_path="${repo_path/#\~/$HOME}"

            if [ ! -d "$repo_path" ]; then
                echo "⚠️  Warning: Directory $repo_path does not exist"
                read -p "Continue anyway? (y/n): " continue_anyway
                if [ "$continue_anyway" != "y" ] && [ "$continue_anyway" != "Y" ]; then
                    continue
                fi
            fi

            # Find git root for this repository
            git_root=$(find_git_root "$repo_path")
            if [ $? -eq 0 ]; then
                echo "📁 Found git root: $git_root"
                workspace=$(get_workspace_for_git_root "$git_root")
                echo "🗂️  Assigned to workspace: $workspace"

                # Calculate relative path from git root to repo path
                relative_path=$(get_relative_path "$git_root" "$repo_path")
                if [ "$relative_path" = "." ]; then
                    relative_path=""
                fi

                # Use git root for fs mapping, workspace path for yaml
                fs_mappings+=("$git_root:/$workspace")

                if [ -z "$relative_path" ]; then
                    workspace_repo_path="/$workspace"
                else
                    workspace_repo_path="/$workspace/$relative_path"
                fi
            else
                echo "⚠️  Warning: $repo_path is not in a git repository"
                echo "📁 Using repository path directly"
                workspace="workspace$workspace_counter"
                workspace_counter=$((workspace_counter + 1))
                fs_mappings+=("$repo_path:/$workspace")
                workspace_repo_path="/$workspace"
            fi

            # Use default language (not critical for splitter functionality)
            repo_language="multi"

            # Store repo info
            repo_names+=("$repo_name")
            repo_paths+=("$workspace_repo_path")
            repo_languages+=("$repo_language")

            echo "✅ Added repository: $repo_name at $repo_path"
        done

        if [ ${#repo_names[@]} -eq 0 ]; then
            echo "❌ No repositories configured. Exiting."
            exit 1
        fi

        # Generate source.yaml file
        echo "📄 Writing configuration to: $CONFIG_FILE"

        cat > "$CONFIG_FILE" << EOF
source:
  repositories:
EOF

        # Add each repository to the config file
        for i in "${!repo_names[@]}"; do
            cat >> "$CONFIG_FILE" << EOF
    - name: "${repo_names[$i]}"
      path: "${repo_paths[$i]}"
      language: "${repo_languages[$i]}"
EOF
        done

        echo "✅ Configuration file created successfully!"

        # Generate ARMCHAIR_FS_MAP (remove duplicates using sort/uniq)
        if [ ${#fs_mappings[@]} -gt 0 ]; then
            FS_MAP=$(printf '%s\n' "${fs_mappings[@]}" | sort -u | tr '\n' ',' | sed 's/,$//')
        else
            FS_MAP=""
        fi
    else
        # Parse existing config to generate ARMCHAIR_FS_MAP
        echo "🗺️  Parsing existing configuration for file system mappings..."

        # Extract repository names from YAML (simple parsing)
        repo_names=($(grep -E "^\s*-\s*name:" "$CONFIG_FILE" | awk -F: '{print $2}' | sed 's/[[:space:]"]*//g'))

        # For existing config, we need to ask for original paths to create FS_MAP
        declare -a fs_mappings=()
        declare -a git_roots=()
        declare -a workspace_assignments=()
        workspace_counter=1

        for repo_name in "${repo_names[@]}"; do
            read -p "Enter the local path for repository '$repo_name': " original_path
            if [ ! -z "$original_path" ]; then
                # Expand tilde to home directory
                original_path="${original_path/#\~/$HOME}"

                # Find git root for this repository
                git_root=$(find_git_root "$original_path")
                if [ $? -eq 0 ]; then
                    echo "📁 Found git root for $repo_name: $git_root"
                    workspace=$(get_workspace_for_git_root "$git_root")
                    echo "🗂️  Assigned to workspace: $workspace"
                    fs_mappings+=("$git_root:/$workspace")
                else
                    echo "⚠️  Warning: $original_path is not in a git repository"
                    echo "📁 Using repository path directly for $repo_name"
                    workspace="workspace$workspace_counter"
                    workspace_counter=$((workspace_counter + 1))
                    fs_mappings+=("$original_path:/$workspace")
                fi
            fi
        done

        # Generate ARMCHAIR_FS_MAP (remove duplicates using sort/uniq)
        if [ ${#fs_mappings[@]} -gt 0 ]; then
            FS_MAP=$(printf '%s\n' "${fs_mappings[@]}" | sort -u | tr '\n' ',' | sed 's/,$//')
        else
            FS_MAP=""
        fi
    fi

    # Generate env.sh file
    ENV_FILE="$ARMCHAIR_HOME/armchair_env.sh"

    # Check if file exists and whether we should overwrite
    SHOULD_WRITE_ENV=false
    if [ -f "$ENV_FILE" ]; then
        if [ "$FORCE_RECONFIGURE" = true ]; then
            echo "📄 Overwriting existing environment file (reconfigure mode): $ENV_FILE"
            SHOULD_WRITE_ENV=true
        else
            echo "⚠️  Warning: Environment file already exists: $ENV_FILE"
            echo "   Not overwriting. Use --reconfigure to force overwrite."
            echo "   Using existing environment file..."
        fi
    else
        echo "📄 Writing environment variables to: $ENV_FILE"
        SHOULD_WRITE_ENV=true
    fi

    if [ "$SHOULD_WRITE_ENV" = true ]; then
        cat > "$ENV_FILE" << EOF
#!/bin/bash
# Armchair Environment Variables
# Generated by armchair.sh on $(date)

export ARMCHAIR_HOME="$ARMCHAIR_HOME"
export ARMCHAIR_SOURCE_YAML="$CONFIG_FILE"
export ARMCHAIR_FS_MAP="$FS_MAP"
export ARMCHAIR_OUTPUT="$OUTPUT_DIR"
EOF

        # Add model configuration variables only if they are set
        if [ ! -z "$MODEL_API_KEY" ]; then
            echo "export ARMCHAIR_MODEL_API_KEY=\"$MODEL_API_KEY\"" >> "$ENV_FILE"
        fi

        if [ ! -z "$MODEL_API_BASE_URL" ]; then
            echo "export ARMCHAIR_MODEL_API_BASE_URL=\"$MODEL_API_BASE_URL\"" >> "$ENV_FILE"
        fi

        if [ ! -z "$MODEL_NAME" ]; then
            echo "export ARMCHAIR_MODEL_NAME=\"$MODEL_NAME\"" >> "$ENV_FILE"
        fi

        echo "" >> "$ENV_FILE"
        echo "echo \"✅ Armchair environment variables loaded\"" >> "$ENV_FILE"

        chmod +x "$ENV_FILE"

        echo "✅ Environment file created successfully!"
    fi

    # Source the environment file to load variables
    echo "📥 Loading environment variables..."
    source "$ENV_FILE"

    # Pull required Docker images
    echo ""
    echo "🐳 Pulling required Docker images..."

    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo "⚠️  Warning: Docker is not running. Skipping Docker image pulls."
        echo "   Please start Docker and run 'docker pull armchr/explainer' manually."
    else
        echo "📥 Pulling armchr/explainer..."
        if docker pull armchr/explainer:latest; then
            echo "✅ Successfully pulled armchr/explainer"
        else
            echo "❌ Failed to pull armchr/explainer"
        fi
    fi

    echo ""
    echo "✅ Setup complete!"
    echo ""
else
    echo "✅ Using existing configuration"
    echo "   ARMCHAIR_HOME: $ARMCHAIR_HOME"
    echo ""
fi

# Now start the dashboard
echo "🚀 Starting Armchair Dashboard..."
echo "================================="
echo ""

# Check required environment variables
missing_vars=()

if [ -z "$ARMCHAIR_HOME" ]; then
    missing_vars+=("ARMCHAIR_HOME")
fi

if [ -z "$ARMCHAIR_OUTPUT" ]; then
    missing_vars+=("ARMCHAIR_OUTPUT")
fi

if [ -z "$ARMCHAIR_FS_MAP" ]; then
    missing_vars+=("ARMCHAIR_FS_MAP")
fi

if [ -z "$ARMCHAIR_SOURCE_YAML" ]; then
    missing_vars+=("ARMCHAIR_SOURCE_YAML")
fi

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "This should not happen. Please check your setup."
    exit 1
fi

# Check if source config exists
if [ ! -f "$ARMCHAIR_SOURCE_YAML" ]; then
    echo "❌ Error: Source configuration file not found: $ARMCHAIR_SOURCE_YAML"
    exit 1
fi

echo "✅ Source configuration file exists: $ARMCHAIR_SOURCE_YAML"

# Check if output directory exists, create if not
if [ ! -d "$ARMCHAIR_OUTPUT" ]; then
    echo "📂 Creating output directory: $ARMCHAIR_OUTPUT"
    mkdir -p "$ARMCHAIR_OUTPUT"
fi

echo "✅ Output directory ready: $ARMCHAIR_OUTPUT"

# Merge CLI options with environment variables (CLI takes precedence)
# Support legacy variable names for backwards compatibility
FINAL_API_KEY="${CLI_API_KEY:-${ARMCHAIR_MODEL_API_KEY:-${OPENAI_API_KEY:-${ANTHROPIC_API_KEY:-${API_KEY}}}}}"
FINAL_API_BASE_URL="${CLI_API_BASE_URL:-${ARMCHAIR_MODEL_API_BASE_URL}}"
FINAL_MODEL_NAME="${CLI_MODEL_NAME:-${ARMCHAIR_MODEL_NAME}}"

# Replace localhost/127.0.0.1 with host.docker.internal for Docker on Mac/Windows
# This allows the container to access services running on the host machine
OS_TYPE=$(uname -s)
if [[ "$OS_TYPE" == "Darwin" ]] || [[ "$OS_TYPE" == MINGW* ]] || [[ "$OS_TYPE" == MSYS* ]] || [[ "$OS_TYPE" == CYGWIN* ]]; then
    if [ ! -z "$FINAL_API_BASE_URL" ]; then
        # Replace localhost with host.docker.internal
        FINAL_API_BASE_URL="${FINAL_API_BASE_URL//localhost/host.docker.internal}"
        # Replace 127.0.0.1 with host.docker.internal
        FINAL_API_BASE_URL="${FINAL_API_BASE_URL//127.0.0.1/host.docker.internal}"

        if [[ "$FINAL_API_BASE_URL" == *"host.docker.internal"* ]]; then
            echo "ℹ️  Detected localhost/127.0.0.1 in API base URL"
            echo "   Replaced with host.docker.internal for Docker compatibility"
        fi
    fi
fi

# Validate LLM configuration
if [ -z "$NO_LLM" ]; then
    echo "🤖 LLM mode enabled - validating configuration..."

    missing_params=()

    if [ -z "$FINAL_API_KEY" ]; then
        missing_params+=("API key (--api-key or ARMCHAIR_MODEL_API_KEY)")
    fi

    if [ -z "$FINAL_API_BASE_URL" ]; then
        missing_params+=("API base URL (--api-base-url or ARMCHAIR_MODEL_API_BASE_URL)")
    fi

    if [ -z "$FINAL_MODEL_NAME" ]; then
        missing_params+=("Model name (--model-name or ARMCHAIR_MODEL_NAME)")
    fi

    if [ ${#missing_params[@]} -gt 0 ]; then
        echo "❌ Error: LLM mode requires the following parameters:"
        for param in "${missing_params[@]}"; do
            echo "   - $param"
        done
        echo ""
        echo "Either provide these parameters or use --no-llm to run without LLM support."
        exit 1
    fi

    echo "✅ LLM configuration validated"
    echo "   API Base URL: $FINAL_API_BASE_URL"
    echo "   Model: $FINAL_MODEL_NAME"
    echo "   API Key: ${FINAL_API_KEY:0:10}..."
else
    echo "🚫 LLM mode disabled - running with --no-llm"
fi

echo "🌐 Frontend UI port: $PORT_FRONTEND"
echo "🔌 Backend API port: $PORT_BACKEND"
echo "🐳 Docker image: $DOCKER_IMAGE"
echo "📄 Source config: $ARMCHAIR_SOURCE_YAML"
echo "📂 Output directory: $ARMCHAIR_OUTPUT"

# Parse ARMCHAIR_FS_MAP to create volume mappings
IFS=',' read -ra MAPPINGS <<< "$ARMCHAIR_FS_MAP"
VOLUME_ARGS=""
for mapping in "${MAPPINGS[@]}"; do
    IFS=':' read -ra PARTS <<< "$mapping"
    local_path="${PARTS[0]}"
    container_path="${PARTS[1]}"

    if [ -d "$local_path" ]; then
        VOLUME_ARGS="$VOLUME_ARGS -v \"$local_path:$container_path\""
        echo "📁 Mapping: $local_path -> $container_path (read-write)"
    else
        echo "⚠️  Warning: Local path does not exist: $local_path"
    fi
done

# Build docker command
if [ ! -z "$DETACHED" ]; then
    # In detached mode, don't use --rm and give it a name
    DOCKER_CMD="docker run $DETACHED --name $CONTAINER_NAME"
else
    # In foreground mode, use --rm to auto-cleanup
    DOCKER_CMD="docker run --rm"
fi

DOCKER_CMD="$DOCKER_CMD -p $PORT_FRONTEND:8686"
DOCKER_CMD="$DOCKER_CMD -p $PORT_BACKEND:8787"
DOCKER_CMD="$DOCKER_CMD -v \"$ARMCHAIR_SOURCE_YAML:/app/config/source.yaml:ro\""
DOCKER_CMD="$DOCKER_CMD -v \"$ARMCHAIR_OUTPUT:/app/output\""
DOCKER_CMD="$DOCKER_CMD $VOLUME_ARGS"
DOCKER_CMD="$DOCKER_CMD -e CONFIG_PATH=/app/config/source.yaml"
DOCKER_CMD="$DOCKER_CMD -e OUTPUT_PATH=/app/output"

# Add LLM configuration if not in --no-llm mode
if [ -z "$NO_LLM" ]; then
    # Pass the final merged values to the container using the primary variable name
    DOCKER_CMD="$DOCKER_CMD -e ARMCHAIR_MODEL_API_KEY=\"$FINAL_API_KEY\""
    DOCKER_CMD="$DOCKER_CMD -e ARMCHAIR_MODEL_API_BASE_URL=\"$FINAL_API_BASE_URL\""
    DOCKER_CMD="$DOCKER_CMD -e ARMCHAIR_MODEL_NAME=\"$FINAL_MODEL_NAME\""
fi

DOCKER_CMD="$DOCKER_CMD $DOCKER_IMAGE"

echo ""
echo "🚀 Running Docker command:"
echo "$DOCKER_CMD"
echo ""

# Stop and remove existing container if it exists (only in detached mode)
if [ ! -z "$DETACHED" ]; then
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "⚠️  Container '$CONTAINER_NAME' already exists. Stopping and removing..."
        docker stop $CONTAINER_NAME > /dev/null 2>&1 || true
        docker rm $CONTAINER_NAME > /dev/null 2>&1 || true
    fi
fi

# Execute the docker command
eval $DOCKER_CMD

if [ ! -z "$DETACHED" ]; then
    echo ""
    echo "✅ Armchair Dashboard is now running!"
    echo ""
    echo "💡 Management commands:"
    echo "   View logs:    docker logs $CONTAINER_NAME"
    echo "   Follow logs:  docker logs -f $CONTAINER_NAME"
    echo "   Stop:         docker stop $CONTAINER_NAME"
    echo "   Start:        docker start $CONTAINER_NAME"
    echo "   Remove:       docker rm $CONTAINER_NAME"
    echo ""
    echo "🌐 Frontend Dashboard: http://localhost:$PORT_FRONTEND"
    echo "🔌 Backend API: http://localhost:$PORT_BACKEND"
    echo "📂 Output directory: $ARMCHAIR_OUTPUT"
    echo ""
    echo "📝 To skip configuration next time, source the environment file before running:"
    echo "   source $ARMCHAIR_HOME/armchair_env.sh"
    echo "   $0"
    echo ""
    echo "🔄 To force reconfiguration, use:"
    echo "   $0 --reconfigure"
else
    echo ""
    echo "✅ Armchair Dashboard execution completed!"
fi
