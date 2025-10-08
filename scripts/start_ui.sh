#!/bin/bash

set -e

echo "🪑 Armchair UI Startup Script"
echo "============================="

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Error: Docker is not running or not accessible."
        echo "Please start Docker and try again."
        exit 1
    fi
}

# Function to check if Docker image exists
check_docker_image() {
    local image_name="$1"
    if ! docker image inspect "$image_name" >/dev/null 2>&1; then
        echo "❌ Error: Docker image '$image_name' not found."
        echo "Please build the image first by running:"
        echo "  cd code_explainer_ui && make docker-build"
        exit 1
    fi
}

# Validate required environment variables
echo "🔍 Checking required environment variables..."
REQUIRED_VARS=("ARMCHAIR_HOME" "ARMCHAIR_SOURCE_YAML" "ARMCHAIR_OUTPUT")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: Required environment variable $var is not set."
        echo "Please ensure you have sourced the environment file:"
        echo "  source \$ARMCHAIR_HOME/env.sh"
        exit 1
    fi
    echo "✅ $var is set to: ${!var}"
done

# Check if source.yaml exists
if [ ! -f "$ARMCHAIR_SOURCE_YAML" ]; then
    echo "❌ Error: Source configuration file not found at $ARMCHAIR_SOURCE_YAML"
    echo "Please run the setup script to create the configuration."
    exit 1
fi

# Check if output directory exists
if [ ! -d "$ARMCHAIR_OUTPUT" ]; then
    echo "⚠️  Warning: Output directory $ARMCHAIR_OUTPUT does not exist."
    echo "📁 Creating output directory..."
    mkdir -p "$ARMCHAIR_OUTPUT"
fi

# Check Docker
echo "🐳 Checking Docker..."
check_docker

# Docker image name
DOCKER_IMAGE="armchair-change-navigator"

# Check if Docker image exists
echo "🔍 Checking for Docker image: $DOCKER_IMAGE"
check_docker_image "$DOCKER_IMAGE"

# Prepare volume mappings
CONFIG_DIR=$(dirname "$ARMCHAIR_SOURCE_YAML")
OUTPUT_DIR="$ARMCHAIR_OUTPUT"

echo "📂 Volume mappings:"
echo "  Config: $CONFIG_DIR -> /app/config"
echo "  Output: $OUTPUT_DIR -> /app/output"

# Check for existing container and stop it if running
CONTAINER_NAME="armchair-ui"
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo "🛑 Stopping existing container: $CONTAINER_NAME"
    docker stop "$CONTAINER_NAME" >/dev/null
fi

if docker ps -a -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo "🗑️  Removing existing container: $CONTAINER_NAME"
    docker rm "$CONTAINER_NAME" >/dev/null
fi

# Start the UI container
echo "🚀 Starting Armchair UI..."
echo ""

docker run -d \
    --name "$CONTAINER_NAME" \
    -p 8686:8686 \
    -p 8787:8787 \
    -v "$CONFIG_DIR:/app/config:ro" \
    -v "$OUTPUT_DIR:/app/output:ro" \
    -e CONFIG_PATH=/app/config/$(basename "$ARMCHAIR_SOURCE_YAML") \
    -e OUTPUT_PATH=/app/output \
    "$DOCKER_IMAGE"

# Wait a moment for the container to start
sleep 2

# Check if container is running
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo "✅ Armchair UI is now running!"
    echo ""
    echo "🌐 Access the UI at:"
    echo "  Frontend: http://localhost:8686"
    echo "  Backend:  http://localhost:8787"
    echo ""
    echo "📋 Container management:"
    echo "  View logs:    docker logs $CONTAINER_NAME"
    echo "  Stop UI:      docker stop $CONTAINER_NAME"
    echo "  Remove container: docker rm $CONTAINER_NAME"
    echo ""
    echo "💡 To follow the logs in real-time, run:"
    echo "  docker logs -f $CONTAINER_NAME"
else
    echo "❌ Failed to start the UI container."
    echo "📋 Check the logs with:"
    echo "  docker logs $CONTAINER_NAME"
    exit 1
fi