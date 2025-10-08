#!/bin/bash

set -e

echo "🪑 Armchair Splitter Runner"
echo "=========================="

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
    echo "💡 Run the setup script first:"
    echo "   ./scripts/setup_armchair.sh"
    echo "   source \$ARMCHAIR_HOME/env.sh"
    exit 1
fi

echo "✅ All required environment variables are set"

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

# Parse command line arguments
REPO_NAME=""
API_KEY=""
MCP_CONFIG=""
VERBOSE=""
COMMIT=""
INTERACTIVE=""
ADDITIONAL_ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --repo)
            REPO_NAME="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --mcp-config)
            MCP_CONFIG="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --commit)
            COMMIT="$2"
            shift 2
            ;;
        --interactive|-it)
            INTERACTIVE="-it"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --repo REPO_NAME       Repository name from source config (required)"
            echo "  --api-key API_KEY      OpenAI API key (or set OPENAI_API_KEY env var)"
            echo "  --mcp-config FILE      MCP configuration file path"
            echo "  --commit COMMIT_HASH   Specific commit to analyze"
            echo "  --verbose              Enable verbose output"
            echo "  --interactive, -it     Run in interactive mode"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Example:"
            echo "  $0 --repo my-repo --api-key sk-... --verbose"
            echo ""
            echo "Environment variables:"
            echo "  ARMCHAIR_HOME          - Armchair workspace directory"
            echo "  ARMCHAIR_OUTPUT        - Output directory for results"
            echo "  ARMCHAIR_FS_MAP        - File system mappings for docker volumes"
            echo "  ARMCHAIR_SOURCE_YAML   - Source configuration file"
            echo "  OPENAI_API_KEY         - OpenAI API key (alternative to --api-key)"
            exit 0
            ;;
        *)
            ADDITIONAL_ARGS="$ADDITIONAL_ARGS $1"
            shift
            ;;
    esac
done

# Check required parameters
if [ -z "$REPO_NAME" ]; then
    echo "❌ Error: Repository name is required. Use --repo REPO_NAME"
    echo "💡 Run $0 --help for usage information"
    exit 1
fi

# Check API key
if [ -z "$API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OpenAI API key is required."
    echo "   Set OPENAI_API_KEY environment variable or use --api-key option"
    exit 1
fi

# Use API_KEY if provided, otherwise use environment variable
if [ ! -z "$API_KEY" ]; then
    export OPENAI_API_KEY="$API_KEY"
fi

echo "🔍 Repository: $REPO_NAME"
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
        VOLUME_ARGS="$VOLUME_ARGS -v \"$local_path:$container_path:ro\""
        echo "📁 Mapping: $local_path -> $container_path"
    else
        echo "⚠️  Warning: Local path does not exist: $local_path"
    fi
done

# Build docker command
DOCKER_CMD="docker run --rm $INTERACTIVE"
DOCKER_CMD="$DOCKER_CMD -v \"$ARMCHAIR_SOURCE_YAML:/config/source.yaml:ro\""
DOCKER_CMD="$DOCKER_CMD -v \"$ARMCHAIR_OUTPUT:/output\""
DOCKER_CMD="$DOCKER_CMD $VOLUME_ARGS"
DOCKER_CMD="$DOCKER_CMD -e OPENAI_API_KEY=\"$OPENAI_API_KEY\""

# Add model configuration environment variables if they exist
if [ ! -z "$ARMCHAIR_MODEL_API_BASE_URL" ]; then
    DOCKER_CMD="$DOCKER_CMD -e API_BASE_URL=\"$ARMCHAIR_MODEL_API_BASE_URL\""
fi

if [ ! -z "$ARMCHAIR_MODEL_NAME" ]; then
    DOCKER_CMD="$DOCKER_CMD -e MODEL_NAME=\"$ARMCHAIR_MODEL_NAME\""
fi

# Add MCP config if provided
if [ ! -z "$MCP_CONFIG" ]; then
    if [ ! -f "$MCP_CONFIG" ]; then
        echo "❌ Error: MCP config file not found: $MCP_CONFIG"
        exit 1
    fi
    DOCKER_CMD="$DOCKER_CMD -v \"$MCP_CONFIG:/config/mcp.json:ro\""
    echo "🔧 MCP config: $MCP_CONFIG"
fi

DOCKER_CMD="$DOCKER_CMD simple-splitter-agent:latest"
DOCKER_CMD="$DOCKER_CMD --repo $REPO_NAME"
DOCKER_CMD="$DOCKER_CMD --source-config /config/source.yaml"
DOCKER_CMD="$DOCKER_CMD --output-dir /output"

# Add optional arguments
if [ ! -z "$VERBOSE" ]; then
    DOCKER_CMD="$DOCKER_CMD $VERBOSE"
fi

if [ ! -z "$COMMIT" ]; then
    DOCKER_CMD="$DOCKER_CMD --commit $COMMIT"
fi

if [ ! -z "$MCP_CONFIG" ]; then
    DOCKER_CMD="$DOCKER_CMD --mcp-config /config/mcp.json"
fi

if [ ! -z "$ADDITIONAL_ARGS" ]; then
    DOCKER_CMD="$DOCKER_CMD $ADDITIONAL_ARGS"
fi

echo ""
echo "🚀 Running Docker command:"
echo "$DOCKER_CMD"
echo ""

# Execute the docker command
eval $DOCKER_CMD

echo ""
echo "✅ Splitter execution completed!"
echo "📂 Check output in: $ARMCHAIR_OUTPUT"