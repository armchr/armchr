# Quick Start Guide

Get started with the Code Splitter Agent in 5 minutes!

## Installation

### Option 1: Using Make (Recommended)

```bash
# Set up virtual environment and install everything
make setup

# Activate the virtual environment
source venv/bin/activate

# You're ready to go!
python -m code_splitter --help
```

### Option 2: Manual Installation

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install package
pip install -e .
```

### Option 3: Install in Current Environment

```bash
# Install directly (not recommended for development)
make install

# Or with dev dependencies
make install-dev
```

## Basic Usage

### 1. Prepare Your Diff

Create a diff file from your changes:

```bash
# From git
git diff > my_changes.diff

# Or from specific commits
git diff HEAD~5..HEAD > my_changes.diff

# Or from uncommitted changes
git diff HEAD > my_changes.diff
```

### 2. Set Up API Key (Optional)

For LLM-enhanced analysis (recommended):

```bash
export OPENAI_API_KEY="your-api-key-here"
```

Or use any OpenAI-compatible service:

```bash
export OPENAI_API_KEY="your-api-key"
# For custom endpoints, use --base-url flag
```

### 3. Run the Splitter

```bash
# Basic usage - split your diff
python -m code_splitter my_changes.diff

# This will:
# - Analyze your changes
# - Identify dependencies
# - Split into patches
# - Save results to ./patches/
```

### 4. Review the Results

Check the `patches/` directory:

```bash
ls patches/
# 000_summary.json      # Overall summary and metadata
# 001_patch_name.patch  # First patch
# 002_patch_name.patch  # Second patch
# ...
```

Each patch file contains:
- Description and rationale
- Dependencies on other patches
- The actual diff content

### 5. Apply Patches

Apply patches in order:

```bash
# Apply first patch
patch -p1 < patches/001_*.patch

# Or use git apply
git apply patches/001_*.patch

# Continue with remaining patches in order...
```

## Advanced Usage

### Custom Patch Size

Control how large each patch should be:

```bash
# Smaller patches (good for easier review)
python -m code_splitter my_changes.diff --target-size 100

# Larger patches (fewer patches overall)
python -m code_splitter my_changes.diff --target-size 500
```

### Without LLM

Works without an API key (slightly less sophisticated analysis):

```bash
python -m code_splitter my_changes.diff --no-llm
```

### Custom Output Directory

```bash
python -m code_splitter my_changes.diff --output-dir ./my_patches
```

### From Git Directly

```bash
git diff HEAD~10..HEAD | python -m code_splitter -
```

## Python API

Use the agent programmatically:

```python
from code_splitter import CodeSplitterAgent

# Create agent
agent = CodeSplitterAgent(
    llm_api_key="your-key",  # or None for no LLM
    use_llm=True
)

# Split changes
with open("my_changes.diff") as f:
    diff_text = f.read()

result = agent.split_changes(diff_text, target_patch_size=200)

# Inspect results
print(f"Created {len(result.patches)} patches")

for patch in result.patches:
    print(f"Patch {patch.id}: {patch.name}")
    print(f"  Size: {patch.size_lines} lines")
    print(f"  Depends on: {patch.depends_on}")

# Export to files
agent.export_patches_to_files(result, diff_text, "./output")
```

## Example

Run the included example:

```bash
python example.py
```

This demonstrates splitting a sample refactoring with:
- Type hint additions
- Method extraction
- API changes

## Configuration

### Target Patch Size

- **50-100 lines**: Very small, many patches, easiest review
- **150-200 lines**: Default, good balance
- **300-500 lines**: Larger patches, fewer overall

### LLM Models

Works with any OpenAI-compatible model:

```bash
# GPT-4 (default, most sophisticated)
python -m code_splitter my.diff --model gpt-4

# GPT-3.5 (faster, cheaper)
python -m code_splitter my.diff --model gpt-3.5-turbo

# Claude via LiteLLM
python -m code_splitter my.diff \
  --base-url http://localhost:8000 \
  --model claude-3-opus-20240229

# Local model
python -m code_splitter my.diff \
  --base-url http://localhost:1234/v1 \
  --model local-model
```

## Troubleshooting

### "No changes found"

Make sure your diff is in unified format:

```bash
git diff -U3 > my_changes.diff
```

### "Tree-sitter not available"

Install language parsers:

```bash
pip install tree-sitter-python tree-sitter-javascript
```

The agent will fall back to regex-based parsing if needed.

### "Validation failed"

The agent found issues with the split. Check warnings in the output:

```bash
cat patches/000_summary.json | jq '.warnings'
```

Common issues:
- Circular dependencies (these become atomic groups)
- Very complex refactorings (may need manual splitting)

### Large diffs

For very large diffs (>10,000 lines), consider:

1. Pre-splitting by file or feature
2. Using larger target patch sizes
3. Running without LLM for speed

```bash
# Faster for large diffs
python -m code_splitter huge.diff --target-size 500 --no-llm
```

## Next Steps

- Read the [full README](README.md) for detailed documentation
- Check out [example.py](example.py) for API usage
- Run tests: `pytest tests/`
- Explore the phase modules for customization

## Getting Help

If you encounter issues:

1. Check the warnings in `patches/000_summary.json`
2. Review the quality metrics
3. Try adjusting `--target-size`
4. Use `--no-llm` to isolate LLM-related issues

## Tips for Best Results

1. **Clean diffs**: Remove unrelated formatting changes first
2. **Meaningful commits**: The agent works better with focused changes
3. **Test changes**: Ensure your diff is correct before splitting
4. **Review patches**: Always review the generated patches
5. **Apply incrementally**: Test after each patch application

Happy splitting! 🚀
