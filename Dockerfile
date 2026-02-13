# Multi-stage Dockerfile combining splitter, UI frontend, and backend
# Stage 1: Build frontend
FROM node:18-alpine as frontend-build

WORKDIR /app/frontend
COPY code_explainer_ui/frontend/package*.json ./
RUN npm install
COPY code_explainer_ui/frontend/ ./
RUN npm run build

# Stage 2: Prepare backend
FROM node:18-alpine as backend-build

WORKDIR /app/backend
COPY code_explainer_ui/backend/package*.json ./
RUN npm install --only=production
COPY code_explainer_ui/backend/ ./

# Final stage: Combine all components
FROM python:3.11-slim

# Install Node.js and git
RUN apt-get update && \
    apt-get install -y curl git && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install serve globally for serving frontend
RUN npm install -g serve

WORKDIR /app

# Copy splitter code and install Python dependencies
COPY code-splitter-agent/requirements.txt /app/splitter/requirements.txt
RUN pip install --no-cache-dir -r /app/splitter/requirements.txt

# Copy splitter source code
COPY code-splitter-agent/src/ /app/splitter/src/
COPY code-splitter-agent/pyproject.toml code-splitter-agent/setup.py /app/splitter/
RUN pip install -e /app/splitter

# Copy backend
COPY --from=backend-build /app/backend /app/backend

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Create necessary directories
RUN mkdir -p /app/output

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV SPLITTER_PATH=/app/splitter
ENV PYTHON_PATH=python3

# Expose ports
EXPOSE 8686 8787

# Default entrypoint - overridden at runtime with --root-map and --root-dir
CMD ["/bin/bash", "-c", "cd /app/backend && node server.js --mcp --output /app/output & cd /app/frontend && serve -s dist -l 8686"]
