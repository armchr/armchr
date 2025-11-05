#!/bin/bash

set -e

echo "🪑 Armchair - Tools for AI Coding Workflows"
echo "============================================"
echo ""

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [options]

This script starts the Armchair Dashboard using Docker.

Options:
  --port-frontend PORT    Frontend UI port (default: 8686)
  --port-backend PORT     Backend API port (default: 8787)
  --foreground, -f        Run in foreground mode (default: detached)
  --name NAME             Container name (default: armchair-dashboard)
  --local                 Use local image 'explainer:latest'
  --image IMAGE           Use custom Docker image
  --help, -h              Show this help message

Examples:
  # Run with defaults (user home as workspace)
  $0

  # Start in foreground mode
  $0 --foreground

  # Use local development image
  $0 --local

Environment Variables:
  ARMCHAIR_MODEL_API_KEY      - Your API key (optional)
  ARMCHAIR_MODEL_API_BASE_URL - Your API base URL (optional)
  ARMCHAIR_MODEL_NAME         - Your model name (optional)

EOF
}

# Parse command line arguments
PORT_FRONTEND="8686"
PORT_BACKEND="8787"
DETACHED="-d"
DOCKER_IMAGE="armchr/explainer:latest"
CONTAINER_NAME="armchair-dashboard"

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

# Set up directories
ARMCHAIR_HOME="$HOME"
ARMCHAIR_OUTPUT="$ARMCHAIR_HOME/.armchair_output"

# Create output directory if it doesn't exist
if [ ! -d "$ARMCHAIR_OUTPUT" ]; then
    echo "📂 Creating output directory: $ARMCHAIR_OUTPUT"
    mkdir -p "$ARMCHAIR_OUTPUT"
fi

# Create .armchair directory for configuration
ARMCHAIR_CONFIG_DIR="$ARMCHAIR_OUTPUT/.armchair"
mkdir -p "$ARMCHAIR_CONFIG_DIR"

# Write .armchair.json if environment variables are set
if [ ! -z "$ARMCHAIR_MODEL_API_KEY" ] || [ ! -z "$ARMCHAIR_MODEL_API_BASE_URL" ] || [ ! -z "$ARMCHAIR_MODEL_NAME" ]; then
    echo "📝 Writing LLM configuration to .armchair.json"
    cat > "$ARMCHAIR_CONFIG_DIR/.armchair.json" << EOF
{
EOF

    FIRST_FIELD=true
    if [ ! -z "$ARMCHAIR_MODEL_API_KEY" ]; then
        echo "  \"ARMCHAIR_MODEL_API_KEY\": \"$ARMCHAIR_MODEL_API_KEY\"" >> "$ARMCHAIR_CONFIG_DIR/.armchair.json"
        FIRST_FIELD=false
    fi

    if [ ! -z "$ARMCHAIR_MODEL_API_BASE_URL" ]; then
        if [ "$FIRST_FIELD" = false ]; then
            sed -i '' '$ s/$/,/' "$ARMCHAIR_CONFIG_DIR/.armchair.json"
        fi
        echo "  \"ARMCHAIR_MODEL_API_BASE_URL\": \"$ARMCHAIR_MODEL_API_BASE_URL\"" >> "$ARMCHAIR_CONFIG_DIR/.armchair.json"
        FIRST_FIELD=false
    fi

    if [ ! -z "$ARMCHAIR_MODEL_NAME" ]; then
        if [ "$FIRST_FIELD" = false ]; then
            sed -i '' '$ s/$/,/' "$ARMCHAIR_CONFIG_DIR/.armchair.json"
        fi
        echo "  \"ARMCHAIR_MODEL_NAME\": \"$ARMCHAIR_MODEL_NAME\"" >> "$ARMCHAIR_CONFIG_DIR/.armchair.json"
    fi

    echo "}" >> "$ARMCHAIR_CONFIG_DIR/.armchair.json"
fi

echo "✅ Armchair home: $ARMCHAIR_HOME"
echo "✅ Output directory: $ARMCHAIR_OUTPUT"
echo ""

# Starting the dashboard
echo "🚀 Starting Armchair Dashboard..."
echo "================================="
echo ""

# Get environment variables for LLM configuration if set
FINAL_API_KEY="${ARMCHAIR_MODEL_API_KEY:-}"
FINAL_API_BASE_URL="${ARMCHAIR_MODEL_API_BASE_URL:-}"
FINAL_MODEL_NAME="${ARMCHAIR_MODEL_NAME:-}"

# Replace localhost/127.0.0.1 with host.docker.internal for Docker on Mac/Windows
OS_TYPE=$(uname -s)
if [[ "$OS_TYPE" == "Darwin" ]] || [[ "$OS_TYPE" == MINGW* ]] || [[ "$OS_TYPE" == MSYS* ]] || [[ "$OS_TYPE" == CYGWIN* ]]; then
    if [ ! -z "$FINAL_API_BASE_URL" ]; then
        FINAL_API_BASE_URL="${FINAL_API_BASE_URL//localhost/host.docker.internal}"
        FINAL_API_BASE_URL="${FINAL_API_BASE_URL//127.0.0.1/host.docker.internal}"

        if [[ "$FINAL_API_BASE_URL" == *"host.docker.internal"* ]]; then
            echo "ℹ️  Detected localhost in API URL, using host.docker.internal"
        fi
    fi
fi

# Display configuration
if [ ! -z "$FINAL_API_KEY" ]; then
    echo "🤖 LLM configured:"
    echo "   API Base URL: $FINAL_API_BASE_URL"
    echo "   Model: $FINAL_MODEL_NAME"
    echo "   API Key: ${FINAL_API_KEY:0:10}..."
fi

echo "🌐 Frontend UI port: $PORT_FRONTEND"
echo "🔌 Backend API port: $PORT_BACKEND"
echo "🐳 Docker image: $DOCKER_IMAGE"
echo "📂 Workspace: $ARMCHAIR_HOME"
echo "📂 Output directory: $ARMCHAIR_OUTPUT"

# Build docker command
if [ ! -z "$DETACHED" ]; then
    DOCKER_CMD="docker run $DETACHED --name $CONTAINER_NAME"
else
    DOCKER_CMD="docker run --rm"
fi

DOCKER_CMD="$DOCKER_CMD -p $PORT_FRONTEND:8686"
DOCKER_CMD="$DOCKER_CMD -p $PORT_BACKEND:8787"
DOCKER_CMD="$DOCKER_CMD -v \"$ARMCHAIR_HOME:/workspace\""
DOCKER_CMD="$DOCKER_CMD -v \"$ARMCHAIR_OUTPUT:/app/output\""

# Add LLM configuration if available
#if [ ! -z "$FINAL_API_KEY" ]; then
#    DOCKER_CMD="$DOCKER_CMD -e ARMCHAIR_MODEL_API_KEY=\"$FINAL_API_KEY\""
#fi
#if [ ! -z "$FINAL_API_BASE_URL" ]; then
#    DOCKER_CMD="$DOCKER_CMD -e ARMCHAIR_MODEL_API_BASE_URL=\"$FINAL_API_BASE_URL\""
#fi
#if [ ! -z "$FINAL_MODEL_NAME" ]; then
#    DOCKER_CMD="$DOCKER_CMD -e ARMCHAIR_MODEL_NAME=\"$FINAL_MODEL_NAME\""
#fi

DOCKER_CMD="$DOCKER_CMD --entrypoint /bin/bash $DOCKER_IMAGE"
DOCKER_CMD="$DOCKER_CMD -c \"cd /app/backend && node server.js --output /app/output --root-map /workspace --root-dir $ARMCHAIR_HOME & cd /app/frontend && serve -s dist -l 8686\""

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
else
    echo ""
    echo "✅ Armchair Dashboard execution completed!"
fi
