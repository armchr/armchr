.PHONY: install build dev dev-backend clean start-backend start-backend-dev start-frontend start docker-build docker-run docker-push docker-push-latest

# Install dependencies for both frontend and backend
install:
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# Build frontend for production
build:
	@echo "Building frontend..."
	cd frontend && npm run build

# Start development servers
dev:
	@echo "Starting development servers..."
	@echo "Backend will run on http://localhost:8787"
	@echo "Frontend will run on http://localhost:8686"
	@echo "Press Ctrl+C to stop servers"
	@make start-backend & make start-frontend

# Start development servers with backend in dev mode
dev-backend:
	@echo "Starting development servers (backend in DEV_MODE)..."
	@echo "Backend will run on http://localhost:8787 [DEV_MODE=true]"
	@echo "Frontend will run on http://localhost:8686"
	@echo "Press Ctrl+C to stop servers"
	@make start-backend-dev & make start-frontend

# Start backend server
start-backend:
	@echo "Starting backend server..."
	@echo "Config will be loaded from output/.armchair/source.yaml"
	cd backend && npm run dev:mcp

# Start backend server in development mode (preserves temp files)
start-backend-dev:
	@echo "Starting backend server in DEV_MODE..."
	@echo "Temporary files will be preserved for debugging"
	@echo "Config will be loaded from output/.armchair/source.yaml"
	cd backend && DEV_MODE=true npm run dev:mcp

# Start frontend development server
start-frontend:
	@echo "Starting frontend development server..."
	cd frontend && npm start

# Start production servers
start:
	@echo "Starting production servers..."
	@echo "Make sure to run 'make build' first"
	cd backend && npm start & cd frontend && npx serve -s dist -l 8686

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf frontend/dist
	rm -rf backend/node_modules
	rm -rf frontend/node_modules

# Docker commands
docker-build:
	@echo "Building Docker image..."
	docker build -t explainer_ui .

# Docker Hub configuration
DOCKER_HUB_REPO ?= $(DOCKER_HUB_USER)/explainer_ui
VERSION ?= latest

# Tag and push to Docker Hub
docker-push: docker-build
	@echo "Tagging image for Docker Hub..."
	docker tag explainer_ui $(DOCKER_HUB_REPO):$(VERSION)
	@echo "Pushing to Docker Hub: $(DOCKER_HUB_REPO):$(VERSION)"
	@echo "Make sure you're logged in with 'docker login'"
	docker push $(DOCKER_HUB_REPO):$(VERSION)

# Push with latest tag
docker-push-latest: docker-build
	@echo "Tagging and pushing as latest..."
	docker tag explainer_ui $(DOCKER_HUB_REPO):latest
	@echo "Pushing to Docker Hub: $(DOCKER_HUB_REPO):latest"
	@echo "Make sure you're logged in with 'docker login'"
	docker push $(DOCKER_HUB_REPO):latest

# Default paths for docker run
OUTPUT_DIR ?= /Users/anindya/src/designer/armchair/armchair/simple_splitter_agent/output

docker-run: docker-validate
	@echo "Running Docker container..."
	@echo "Output directory: $(OUTPUT_DIR)"
	@echo "Frontend: http://localhost:8686"
	@echo "Backend API: http://localhost:8787"
	@echo "Config will be loaded from $(OUTPUT_DIR)/.armchair/source.yaml"
	docker run -p 8686:8686 -p 8787:8787 \
		-v "$(OUTPUT_DIR):/app/output" \
		-e OUTPUT_PATH=/app/output \
		explainer_ui

# Validate required directories exist
docker-validate:
	@echo "Validating Docker setup..."
	@if [ ! -d "$(OUTPUT_DIR)" ]; then \
		echo "ERROR: Output directory does not exist: $(OUTPUT_DIR)"; \
		echo "Please create it or specify OUTPUT_DIR=<path>"; \
		exit 1; \
	fi
	@echo "✓ Validation passed"
	@echo "Note: source.yaml will be expected at $(OUTPUT_DIR)/.armchair/source.yaml"

# Docker run with custom paths
docker-run-custom: docker-validate
	@echo "Usage: make docker-run-custom OUTPUT_DIR=/path/to/output"
	@echo "Current OUTPUT_DIR: $(OUTPUT_DIR)"
	@echo "Running Docker container with custom paths..."
	docker run -p 8686:8686 -p 8787:8787 \
		-v "$(OUTPUT_DIR):/app/output" \
		-e OUTPUT_PATH=/app/output \
		explainer_ui

# Help
help:
	@echo "Available commands:"
	@echo "  install             - Install dependencies for both frontend and backend"
	@echo "  build               - Build frontend for production"
	@echo "  dev                 - Start development servers (frontend + backend)"
	@echo "  dev-backend         - Start development servers with backend in DEV_MODE"
	@echo "  start               - Start production servers"
	@echo "  start-backend       - Start only backend server"
	@echo "  start-backend-dev   - Start only backend server in DEV_MODE (preserves temp files)"
	@echo "  start-frontend      - Start only frontend server"
	@echo "  clean               - Clean build artifacts and node_modules"
	@echo "  docker-build        - Build Docker image"
	@echo "  docker-push         - Tag and push image to Docker Hub"
	@echo "  docker-push-latest  - Tag and push image to Docker Hub with latest tag"
	@echo "  docker-run          - Run Docker container with default paths"
	@echo "  docker-run-custom   - Run Docker container with custom OUTPUT_DIR"
	@echo "  help                - Show this help message"
	@echo ""
	@echo "Docker Usage Examples:"
	@echo "  make docker-run                                    # Use default paths"
	@echo "  make docker-run-custom OUTPUT_DIR=/my/output"
	@echo ""
	@echo "Docker Hub Examples:"
	@echo "  make docker-push DOCKER_HUB_REPO=myusername/explainer_ui"
	@echo "  make docker-push DOCKER_HUB_REPO=myusername/explainer_ui VERSION=v1.0.0"
	@echo "  make docker-push-latest DOCKER_HUB_REPO=myusername/explainer_ui"
	@echo ""
	@echo "Default paths:"
	@echo "  OUTPUT_DIR: $(OUTPUT_DIR)"
	@echo "  DOCKER_HUB_REPO: $(DOCKER_HUB_REPO)"
	@echo ""
	@echo "Note: Config file (source.yaml) is expected at OUTPUT_DIR/.armchair/source.yaml"
