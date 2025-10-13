#!/bin/bash

set -e

echo "🪑 Armchair Explainer Runner"
echo "============================"

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
    echo "   source \$ARMCHAIR_HOME/armchair_env.sh"
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
PORT_FRONTEND="8686"
PORT_BACKEND="8787"
DETACHED="-d"
DOCKER_IMAGE="armchr/explainer:latest"
CONTAINER_NAME="armchair-explainer"

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
        --local)
            DOCKER_IMAGE="explainer:latest"
            shift
            ;;
        --image)
            DOCKER_IMAGE="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --port-frontend PORT   Frontend UI port (default: 8686)"
            echo "  --port-backend PORT    Backend API port (default: 8787)"
            echo "  --foreground, -f       Run in foreground mode (default: detached)"
            echo "  --name NAME            Container name (default: armchair-explainer)"
            echo "  --local                Use local image 'explainer:latest' instead of 'armchr/explainer:latest'"
            echo "  --image IMAGE          Use custom Docker image"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Example:"
            echo "  $0                      # Run in detached mode (default)"
            echo "  $0 --foreground         # Run in foreground mode"
            echo "  $0 --port-frontend 3000 --port-backend 3001"
            echo "  $0 --local              # Use locally built image"
            echo "  $0 --name my-explainer  # Use custom container name"
            echo ""
            echo "Environment variables:"
            echo "  ARMCHAIR_HOME          - Armchair workspace directory"
            echo "  ARMCHAIR_OUTPUT        - Output directory for results"
            echo "  ARMCHAIR_FS_MAP        - File system mappings for docker volumes"
            echo "  ARMCHAIR_SOURCE_YAML   - Source configuration file"
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "💡 Run $0 --help for usage information"
            exit 1
            ;;
    esac
done

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
        VOLUME_ARGS="$VOLUME_ARGS -v \"$local_path:$container_path:ro\""
        echo "📁 Mapping: $local_path -> $container_path"
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

# Add model configuration environment variables if they exist
if [ ! -z "$ARMCHAIR_MODEL_API_BASE_URL" ]; then
    DOCKER_CMD="$DOCKER_CMD -e API_BASE_URL=\"$ARMCHAIR_MODEL_API_BASE_URL\""
fi

if [ ! -z "$ARMCHAIR_MODEL_NAME" ]; then
    DOCKER_CMD="$DOCKER_CMD -e MODEL_NAME=\"$ARMCHAIR_MODEL_NAME\""
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
    echo "✅ Explainer running in detached mode!"
    echo "🌐 Frontend UI: http://localhost:$PORT_FRONTEND"
    echo "🔌 Backend API: http://localhost:$PORT_BACKEND"
    echo "📂 Output directory: $ARMCHAIR_OUTPUT"
    echo ""
    echo "💡 Management commands:"
    echo "   View logs:    docker logs $CONTAINER_NAME"
    echo "   Follow logs:  docker logs -f $CONTAINER_NAME"
    echo "   Stop:         docker stop $CONTAINER_NAME"
    echo "   Start:        docker start $CONTAINER_NAME"
    echo "   Remove:       docker rm $CONTAINER_NAME"
else
    echo ""
    echo "✅ Explainer execution completed!"
fi
