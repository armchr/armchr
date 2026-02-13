.PHONY: docker-build docker-build-multi docker-run docker-push docker-push-latest docker-push-all help

# Docker image name
IMAGE_NAME ?= explainer
DOCKER_HUB_USER ?= armchr
DOCKER_HUB_REPO ?= $(DOCKER_HUB_USER)/${IMAGE_NAME}
VERSION ?= latest
PLATFORMS ?= linux/amd64,linux/arm64

# Default paths for docker run
ARMCHAIR_ROOT ?= $(HOME)
ARMCHAIR_OUTPUT ?= $(HOME)/.armchair_output

# Build the combined Docker image
docker-build:
	@echo "Building combined Armchair Docker image..."
	@echo "This includes: splitter, UI frontend, and backend"
	docker build -t $(IMAGE_NAME) .

# Build multi-platform image (requires buildx)
docker-build-multi:
	@echo "Building combined Armchair Docker image for multiple platforms..."
	@echo "Platforms: $(PLATFORMS)"
	@echo "This includes: splitter, UI frontend, and backend"
	@echo "Setting up buildx builder if needed..."
	@docker buildx create --name armchair-builder --use 2>/dev/null || docker buildx use armchair-builder || docker buildx use default
	docker buildx build --platform $(PLATFORMS) -t $(IMAGE_NAME) --load .

# Run the Docker container (mirrors scripts/armchair.sh --local)
docker-run:
	@mkdir -p "$(ARMCHAIR_OUTPUT)"
	@echo "Running Armchair Docker container..."
	@echo "==================================="
	@echo "Root directory: $(ARMCHAIR_ROOT)"
	@echo "Output directory: $(ARMCHAIR_OUTPUT)"
	@echo "Frontend UI: http://localhost:8686"
	@echo "Backend API: http://localhost:8787"
	@echo "==================================="
	docker run --rm \
		-p 8686:8686 -p 8787:8787 \
		-v "$(ARMCHAIR_ROOT):/workspace:ro" \
		-v "$(ARMCHAIR_OUTPUT):/app/output" \
		--entrypoint /bin/bash $(IMAGE_NAME) \
		-c "cd /app/backend && node server.js --mcp --output /app/output --root-map /workspace --root-dir $(ARMCHAIR_ROOT) & cd /app/frontend && serve -s dist -l 8686"

# Tag and push to Docker Hub with version (multi-platform)
docker-push:
	@echo "Building and pushing multi-platform image to Docker Hub..."
	@echo "Platforms: $(PLATFORMS)"
	@echo "Target: $(DOCKER_HUB_REPO):$(VERSION)"
	@echo "Make sure you're logged in with 'docker login'"
	@read -p "Are you sure you want to push? [y/N] " -n 1 -r; \
	echo; \
	if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "Push cancelled."; \
		exit 1; \
	fi
	@echo "Setting up buildx builder if needed..."
	@docker buildx create --name armchair-builder --use 2>/dev/null || docker buildx use armchair-builder || docker buildx use default
	docker buildx build --platform $(PLATFORMS) -t $(DOCKER_HUB_REPO):$(VERSION) --push .

# Push with latest tag (multi-platform)
docker-push-latest:
	@echo "Building and pushing multi-platform image as latest..."
	@echo "Platforms: $(PLATFORMS)"
	@echo "Target: $(DOCKER_HUB_REPO):latest"
	@echo "Make sure you're logged in with 'docker login'"
	@read -p "Are you sure you want to push? [y/N] " -n 1 -r; \
	echo; \
	if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "Push cancelled."; \
		exit 1; \
	fi
	@echo "Setting up buildx builder if needed..."
	@docker buildx create --name armchair-builder --use 2>/dev/null || docker buildx use armchair-builder || docker buildx use default
	docker buildx build --platform $(PLATFORMS) -t $(DOCKER_HUB_REPO):latest --push .

# Push both version and latest (multi-platform)
docker-push-all:
	@echo "Building and pushing multi-platform image with both tags..."
	@echo "Platforms: $(PLATFORMS)"
	@echo "Targets: $(DOCKER_HUB_REPO):$(VERSION) and $(DOCKER_HUB_REPO):latest"
	@echo "Make sure you're logged in with 'docker login'"
	@read -p "Are you sure you want to push both tags? [y/N] " -n 1 -r; \
	echo; \
	if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "Push cancelled."; \
		exit 1; \
	fi
	@echo "Setting up buildx builder if needed..."
	@docker buildx create --name armchair-builder --use 2>/dev/null || docker buildx use armchair-builder || docker buildx use default
	@echo "Pushing to Docker Hub: $(DOCKER_HUB_REPO):$(VERSION)"
	docker buildx build --platform $(PLATFORMS) -t $(DOCKER_HUB_REPO):$(VERSION) --push .
	@echo "Pushing to Docker Hub: $(DOCKER_HUB_REPO):latest"
	docker buildx build --platform $(PLATFORMS) -t $(DOCKER_HUB_REPO):latest --push .

# Help
help:
	@echo "Armchair Combined Docker Image - Makefile Commands"
	@echo "=================================================="
	@echo ""
	@echo "Available commands:"
	@echo "  docker-build        - Build the combined Docker image (local platform)"
	@echo "  docker-build-multi  - Build multi-platform image (amd64 + arm64)"
	@echo "  docker-run          - Run Docker container locally"
	@echo "  docker-push         - Build and push multi-platform image (with VERSION tag)"
	@echo "  docker-push-latest  - Build and push multi-platform image (with latest tag)"
	@echo "  docker-push-all     - Build and push multi-platform image with both tags"
	@echo "  help                - Show this help message"
	@echo ""
	@echo "Usage Examples:"
	@echo "  make docker-build"
	@echo "  make docker-build-multi"
	@echo "  make docker-run"
	@echo "  make docker-run ARMCHAIR_ROOT=/Users/me/src ARMCHAIR_OUTPUT=/Users/me/.armchair_output"
	@echo ""
	@echo "Docker Hub Push Examples (Multi-Platform):"
	@echo "  make docker-push VERSION=v1.0.0"
	@echo "  make docker-push-latest"
	@echo "  make docker-push-all VERSION=v1.0.0"
	@echo ""
	@echo "Current Configuration:"
	@echo "  IMAGE_NAME:      $(IMAGE_NAME)"
	@echo "  ARMCHAIR_ROOT:   $(ARMCHAIR_ROOT)"
	@echo "  ARMCHAIR_OUTPUT: $(ARMCHAIR_OUTPUT)"
	@echo "  DOCKER_HUB_REPO: $(DOCKER_HUB_REPO)"
	@echo "  VERSION:         $(VERSION)"
	@echo "  PLATFORMS:       $(PLATFORMS)"
	@echo ""
	@echo "Components included in this image:"
	@echo "  - Code Splitter (Python-based, from code-splitter-agent/)"
	@echo "  - Frontend UI (React, served on port 8686)"
	@echo "  - Backend API (Node.js, running on port 8787)"
