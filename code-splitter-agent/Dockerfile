FROM python:3.11-slim

# Install git (required for git operations)
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY pyproject.toml setup.py ./

# Install the package
RUN pip install -e .

# Create necessary directories
RUN mkdir -p /config /output

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Default command - run the CLI
ENTRYPOINT ["python", "-m", "code_splitter"]

# Default help
CMD ["--help"]
