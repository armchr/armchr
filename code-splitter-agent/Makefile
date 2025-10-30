.PHONY: help build push test clean install venv setup

# Docker image name
IMAGE_NAME ?= splitter
IMAGE_TAG ?= latest
FULL_IMAGE_NAME = $(IMAGE_NAME):$(IMAGE_TAG)

# Docker registry (optional, for publishing)
REGISTRY ?=armchr

# Python and venv settings
PYTHON ?= python3
VENV_DIR ?= venv
VENV_ACTIVATE = $(VENV_DIR)/bin/activate

help:
	@echo "Code Splitter Agent - Makefile Commands"
	@echo "========================================"
	@echo ""
	@echo "Environment Setup:"
	@echo "  make venv         - Create Python virtual environment"
	@echo "  make setup        - Set up virtual env and install dependencies"
	@echo "  make install      - Install package in current environment"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make build        - Build Docker image"
	@echo "  make push         - Push Docker image to registry"
	@echo ""
	@echo "Development:"
	@echo "  make test         - Run tests"
	@echo "  make run-example  - Run example"
	@echo "  make install-dev  - Install with dev dependencies"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make clean-all    - Clean everything including venv"
	@echo ""
	@echo "Variables:"
	@echo "  IMAGE_NAME        - Docker image name (default: code-splitter-agent)"
	@echo "  IMAGE_TAG         - Docker image tag (default: latest)"
	@echo "  REGISTRY          - Docker registry (default: empty)"
	@echo "  PYTHON            - Python interpreter (default: python3)"
	@echo "  VENV_DIR          - Virtual env directory (default: venv)"

build:
	@echo "🐳 Building Docker image: $(FULL_IMAGE_NAME)"
	docker build -t $(FULL_IMAGE_NAME) .
	@echo "✅ Docker image built successfully"
	@if [ -n "$(REGISTRY)" ]; then \
		docker tag $(FULL_IMAGE_NAME) $(REGISTRY)/$(FULL_IMAGE_NAME); \
		echo "🏷️  Tagged as $(REGISTRY)/$(FULL_IMAGE_NAME)"; \
	fi

push:
	@if [ -z "$(REGISTRY)" ]; then \
		echo "❌ Error: REGISTRY variable is not set"; \
		echo "   Usage: make push REGISTRY=your-registry.com"; \
		exit 1; \
	fi
	@echo "📤 Pushing to $(REGISTRY)/$(FULL_IMAGE_NAME)"
	docker push $(REGISTRY)/$(FULL_IMAGE_NAME)
	@echo "✅ Image pushed successfully"

test:
	@echo "🧪 Running tests..."
	pytest tests/ -v
	@echo "✅ Tests completed"

clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf build/ dist/ *.egg-info
	rm -rf src/*.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf example_patches_*
	@echo "✅ Clean complete"

clean-all: clean
	@echo "🧹 Cleaning virtual environment..."
	rm -rf $(VENV_DIR)
	@echo "✅ Everything cleaned"

venv:
	@echo "🐍 Creating Python virtual environment..."
	@if [ -d "$(VENV_DIR)" ]; then \
		echo "⚠️  Virtual environment already exists at $(VENV_DIR)"; \
		echo "   Remove it first with: rm -rf $(VENV_DIR)"; \
		exit 1; \
	fi
	$(PYTHON) -m venv $(VENV_DIR)
	@echo "✅ Virtual environment created at $(VENV_DIR)"
	@echo ""
	@echo "To activate the virtual environment, run:"
	@echo "  source $(VENV_ACTIVATE)"

setup: venv
	@echo "📦 Installing dependencies in virtual environment..."
	@. $(VENV_ACTIVATE) && pip install --upgrade pip
	@. $(VENV_ACTIVATE) && pip install -r requirements.txt
	@. $(VENV_ACTIVATE) && pip install -e .
	@echo "✅ Setup complete!"
	@echo ""
	@echo "To activate the virtual environment, run:"
	@echo "  source $(VENV_ACTIVATE)"
	@echo ""
	@echo "Then you can use:"
	@echo "  python -m code_splitter --help"
	@echo "  python example.py"

install:
	@echo "📦 Installing package in current environment..."
	pip install -e .
	@echo "✅ Package installed"

install-dev:
	@echo "📦 Installing package with dev dependencies..."
	pip install -e ".[dev]"
	@echo "✅ Package with dev dependencies installed"

run-example:
	@echo "🚀 Running example..."
	@if [ -f "$(VENV_ACTIVATE)" ]; then \
		. $(VENV_ACTIVATE) && python example.py; \
	else \
		python example.py; \
	fi
	@echo "✅ Example complete"

# Docker run helpers
docker-run:
	@echo "🐳 Running Docker container..."
	@echo "Usage: make docker-run ARGS='--repo myrepo --source-config /config/source.yaml --output-dir /output'"
	@if [ -z "$(ARGS)" ]; then \
		docker run --rm $(FULL_IMAGE_NAME) --help; \
	else \
		docker run --rm $(ARGS) $(FULL_IMAGE_NAME) $(CMD); \
	fi

docker-shell:
	@echo "🐚 Starting Docker shell..."
	docker run --rm -it $(FULL_IMAGE_NAME) /bin/bash
