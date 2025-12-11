# Code Splitter Agent

A tool to intelligently split large code changes into smaller, dependency-aware patches that are easier to review and safer to apply. The agent analyzes code structure, identifies dependencies, and groups related changes while ensuring patches can be applied independently without breaking compilation or runtime behavior.

> **Part of Armchair** — See the [main Armchair README](../README.md#quick-start) for the full dashboard experience with interactive UI.

---

## Table of Contents

- [Quick Start](#quick-start)
- [What It Does](#what-it-does)
- [Key Features](#key-features)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Examples](#basic-examples)
  - [Command-Line Reference](#command-line-reference)
  - [Working with Monorepos](#working-with-monorepos)
  - [Python API](#python-api)
- [Architecture](#architecture)
  - [Five-Phase Pipeline](#five-phase-pipeline)
  - [Core Components](#core-components)
  - [Dependency Constraints](#dependency-constraints)
  - [Data Models](#data-models)
- [Output Format](#output-format)
- [Configuration](#configuration)
- [Advanced Features](#advanced-features)
  - [LLM Integration](#llm-integration)
  - [Quality Metrics](#quality-metrics)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

Get up and running in 60 seconds:

```bash
# 1. Clone and setup
git clone https://github.com/armchr/armchr.git
cd armchr/code-splitter-agent
make setup && source venv/bin/activate

# 2. Configure your repository
cp source.example.yaml source.yaml
# Edit source.yaml with your repository path:
#   repositories:
#     - name: "myproject"
#       path: "/path/to/your/repo"

# 3. Split uncommitted changes
python -m code_splitter.main split --source-config source.yaml --repo myproject

# 4. Apply the generated patches
cd /path/to/your/repo
./output/uncommitted_*/apply_patches.sh
```

**That's it!** Your large diff is now split into ordered, reviewable patches.

### Quick Start with LLM Enhancement

For better semantic understanding and naming (optional):

```bash
export OPENAI_API_KEY="your-key"  # or ANTHROPIC_API_KEY

python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --api-key $OPENAI_API_KEY
```

---

## What It Does

The Code Splitter Agent solves a common problem in software development: **how to break down large code changes into reviewable chunks without breaking dependencies**.

### The Problem

When you have a large diff with hundreds or thousands of lines:
- Hard to review thoroughly
- Difficult to understand the purpose of each change
- Risk of introducing bugs
- Challenging to revert specific parts
- Hard to track which changes depend on each other

### The Solution

The Code Splitter Agent:
1. **Analyzes** your code changes to understand symbols, dependencies, and relationships
2. **Groups** related changes semantically (refactorings, feature additions, etc.)
3. **Splits** the changes into smaller patches while respecting dependencies
4. **Orders** patches topologically so they can be applied sequentially
5. **Validates** that each patch is self-contained and won't break the build

### Real-World Example

**Input:** A 1500-line diff mixing:
- New API endpoints
- Database schema changes
- Authentication refactoring
- UI updates
- Test additions

**Output:** 8 ordered patches:
1. `00_Add_database_models.patch` (150 lines)
2. `01_Implement_authentication_middleware.patch` (200 lines)
3. `02_Create_API_endpoints.patch` (300 lines)
4. `03_Add_frontend_components.patch` (250 lines)
5. `04_Update_configuration.patch` (100 lines)
6. `05_Add_integration_tests.patch` (200 lines)
7. `06_Add_unit_tests.patch` (150 lines)
8. `07_Update_documentation.patch` (150 lines)

Each patch includes:
- Clear description of what it does
- Dependencies on previous patches
- List of files changed
- Automatic annotations for context individual changes

---

## Key Features

### Core Capabilities
- **Multi-language support**: Python, JavaScript, TypeScript, Java, Go, Rust, C, C++
- **Dependency analysis**: Identifies function calls, imports, type dependencies
- **Semantic grouping**: Groups refactorings, feature additions, and related changes
- **Smart splitting**: Respects dependency constraints and size targets
- **Topological ordering**: Ensures patches can be applied in sequence

### Advanced Features
- **LLM enhancement** (optional): Uses AI to improve semantic understanding and naming
- **Monorepo support**: Filters changes to specific subdirectories
- **Untracked files**: Optionally includes new files in analysis
- **Quality metrics**: Measures patch balance, reviewability, and complexity
- **Resplit capability**: Can further split large patches

### Output
- **Standard patch files**: Compatible with `git apply`
- **Metadata**: Detailed JSON with dependencies and annotations
- **Apply script**: Executable bash script to apply all patches
- **Summary**: Human-readable markdown summary

---

## Installation

> Already followed [Quick Start](#quick-start)? Skip to [Usage](#usage).

### Prerequisites

- Python 3.10 or higher
- Git

### Option 1: Quick Setup (Recommended)

```bash
git clone https://github.com/armchr/armchr.git
cd armchr/code-splitter-agent
make setup
source venv/bin/activate  # Linux/macOS
# or: venv\Scripts\activate  # Windows
```

### Option 2: Manual Installation

```bash
git clone https://github.com/armchr/armchr.git
cd armchr/code-splitter-agent

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

### Verify Installation

```bash
python -m code_splitter.main --help
```

---

## Usage

### Basic Examples

#### Split Uncommitted Changes

```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject
```

#### Split a Specific Commit

```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --commit abc123
```

#### Split with Custom Patch Size

```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --target-size 150  # Lines per patch (default: 200)
```

#### Split with LLM Enhancement

```bash
export ANTHROPIC_API_KEY="your-api-key"

python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --api-key $ANTHROPIC_API_KEY \
  --api-base https://api.anthropic.com/v1 \
  --model claude-3-5-sonnet-20241022
```

#### Split Without LLM

```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --no-llm
```

#### Re-split a Large Patch

```bash
python -m code_splitter.main resplit \
  output/uncommitted_20250130_120000 \
  03_Large_patch.patch \
  --source-config source.yaml \
  --target-size 100
```

### Command-Line Reference

#### Main Command: `split`

Splits code changes into dependency-aware patches.

```bash
python -m code_splitter.main split [OPTIONS]
```

**Required Arguments:**

| Argument | Description |
|----------|-------------|
| `--source-config FILE` | Path to source.yaml configuration file (REQUIRED) |

**Repository Selection:**

| Argument | Description |
|----------|-------------|
| `--repo NAME` | Repository name from source.yaml to analyze |

**What to Split:**

| Argument | Description | Default |
|----------|-------------|---------|
| `--commit HASH` | Split a specific commit | Uncommitted changes |
| `--target-branch BRANCH` | Compare against a different branch | Current branch |
| `--base-branch BRANCH` | Base branch for comparison | `main` |
| `--patch FILE` | Split an existing patch file | - |
| `--untracked` | Include untracked (new) files | Tracked only |

**Output Options:**

| Argument | Description | Default |
|----------|-------------|---------|
| `--output-dir DIR` | Where to save patches | `./diff_splits` |
| `--target-size N` | Target lines per patch | `200` |
| `--max-patches N` | Maximum number of patches | No limit |

**LLM Options:**

| Argument | Description | Default |
|----------|-------------|---------|
| `--api-key KEY` | LLM API key | `$OPENAI_API_KEY` |
| `--api-base URL` | LLM API base URL | OpenAI default |
| `--model NAME` | LLM model name | `gpt-4` |
| `--no-llm` | Disable LLM enhancement | LLM enabled |

**Other Options:**

| Argument | Description |
|----------|-------------|
| `--annotate-patches` | Add descriptive comments (default: enabled) |
| `--no-annotate-patches` | Disable patch annotations |
| `--dry-run` | Analyze without generating patches |
| `--verbose` | Show detailed progress |
| `--debug` | Enable debug logging |

#### Resplit Command

Further splits a large patch from a previous run.

```bash
python -m code_splitter.main resplit \
  <output_directory> \
  <patch_filename> \
  --source-config source.yaml \
  [OPTIONS]
```

**Examples:**

```bash
# Re-split a patch into smaller chunks
python -m code_splitter.main resplit \
  output/commit_abc123_20250130 \
  02_Large_refactoring.patch \
  --source-config source.yaml \
  --target-size 100

# Re-split with different LLM model
python -m code_splitter.main resplit \
  output/uncommitted_20250130 \
  05_Big_feature.patch \
  --source-config source.yaml \
  --model gpt-3.5-turbo \
  --target-size 150
```

### Working with Monorepos

The splitter automatically handles monorepos where the git root is at a higher level than your project directory.

**Example:** Git root at `/monorepo`, analyzing `/monorepo/backend`

```yaml
# source.yaml
repositories:
  - name: backend
    path: /monorepo/backend
    description: Backend service
```

When you run:
```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo backend
```

The splitter will:
- Only include changes in `backend/` directory
- Filter out changes in `frontend/`, `docs/`, etc.
- Adjust file paths in patches relative to backend directory
- Work correctly with uncommitted changes and untracked files

**Key Benefits:**
- No need to manually filter diffs
- Cleaner patch files with relative paths
- Correct git status reporting
- Seamless integration with existing workflows

### Python API

For programmatic use or integration into other tools:

```python
from code_splitter import CodeSplitterAgent

# Initialize agent
agent = CodeSplitterAgent(
    llm_api_key="your-api-key",
    llm_base_url="https://api.anthropic.com/v1",
    llm_model="claude-3-5-sonnet-20241022",
    use_llm=True  # Optional LLM enhancement
)

# Read your diff
with open("changes.diff", "r") as f:
    diff_text = f.read()

# Split the changes
result = agent.split_changes(
    diff_text,
    target_patch_size=200,  # Target lines per patch
    max_patches=10,         # Optional limit
    additional_context={
        'commit_message': 'Add new feature',
        'repository_info': {'name': 'myproject'}
    }
)

# Access results
print(f"Created {len(result.patches)} patches")

for patch in result.patches:
    print(f"\nPatch {patch.id}: {patch.name}")
    print(f"  Description: {patch.description}")
    print(f"  Size: {patch.size_lines} lines")
    print(f"  Files: {len(set(c.file for c in patch.changes))}")
    print(f"  Depends on: {patch.depends_on}")

# Export to files
agent.export_patches_to_files(
    result=result,
    diff_text=diff_text,
    output_dir="./output/my_patches",
    repository_info={'name': 'myproject'}
)

# Access quality metrics
print(f"\nQuality Metrics:")
print(f"  Balance score: {result.metadata['metrics']['balance_score']:.2f}")
print(f"  Reviewability: {result.metadata['metrics']['reviewability_score']:.2f}")
```

---

## Architecture

### Five-Phase Pipeline

The splitter operates through five sequential phases:

```
┌─────────────────────────────────────────────────────┐
│  INPUT: Git Diff or Uncommitted Changes            │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 1: Analysis & Dependency Extraction          │
│  • Parse unified diff format (unidiff)              │
│  • Extract symbols using tree-sitter                │
│  • Identify dependencies (imports, calls, types)    │
│  • [LLM] Validate and enhance dependencies          │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 2: Dependency Graph Construction             │
│  • Build directed graph (networkx)                  │
│  • Find strongly connected components               │
│  • Compute transitive closure                       │
│  • Identify atomic groups (can't be split)          │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 3: Semantic Grouping                         │
│  • Group by file proximity                          │
│  • Detect refactoring patterns                      │
│  • Calculate cohesion scores                        │
│  • [LLM] Identify semantic coherence                │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 4: Patch Splitting                           │
│  • Start with atomic groups                         │
│  • Merge compatible changes                         │
│  • Respect size constraints                         │
│  • Topological sort by dependencies                 │
│  • [LLM] Generate meaningful names                  │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  PHASE 5: Validation & Optimization                 │
│  • Validate patch correctness                       │
│  • Measure quality metrics                          │
│  • [LLM] Final validation and suggestions           │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  OUTPUT: Ordered Patch Files + Metadata             │
│  • 00_Name.patch, 01_Name.patch, ...               │
│  • metadata.json                                    │
│  • summary.md                                       │
│  • apply_patches.sh                                 │
└─────────────────────────────────────────────────────┘
```

### Core Components

#### 1. DiffParser (`phase1_analysis.py`)
- Parses unified diff format using `unidiff` library
- Extracts symbols (functions, classes, variables) using tree-sitter
- Supports 8 programming languages
- Fallback to regex-based parsing if tree-sitter unavailable

#### 2. DependencyAnalyzer (`phase1_analysis.py`)
- Identifies dependencies between code changes
- Types of dependencies:
  - **defines_uses**: Function definition → usage
  - **modifies_uses**: Modified function → all usages
  - **import**: Import statement → imported code
  - **call_chain**: Function calls another function
  - **type_dependency**: Type definition → usage

#### 3. DependencyGraph (`phase2_graph.py`)
- Uses NetworkX to build directed dependency graph
- Finds strongly connected components (circular dependencies)
- Computes transitive closure for indirect dependencies
- Identifies "atomic groups" that cannot be split

#### 4. SemanticGrouper (`phase3_grouping.py`)
- Groups changes by:
  - **File proximity**: Changes in same/related files
  - **Refactoring patterns**: Renames, extractions, API changes
  - **Symbol overlap**: Shared function/class names
- Calculates cohesion scores (0.0-1.0)

#### 5. PatchSplitter (`phase4_splitting.py`)
- Splits changes respecting constraints:
  - Atomic groups stay together
  - Dependencies satisfied
  - Size targets respected (±50% flexibility)
- Merges compatible patches using semantic groups
- Sorts patches topologically

#### 6. PatchValidator (`phase5_validation.py`)
- Validates patches can be applied in order
- Measures quality metrics:
  - Balance score: Size distribution evenness
  - Reviewability score: Overall review ease
  - Dependency depth: Longest chain length
- Suggests optimizations

#### 7. GitAnalyzer (`git_integration.py`)
- Handles all git operations
- Filters changes for monorepo subdirectories
- Extracts diffs for commits, branches, or working directory
- Includes untracked files when requested

#### 8. LLMClient (`llm_client.py`) [Optional]
- OpenAI-compatible API integration
- Enhances analysis at 4 points:
  1. **Dependency validation**: Find missing dependencies
  2. **Semantic grouping**: Identify logical boundaries
  3. **Patch naming**: Generate meaningful descriptions
  4. **Final validation**: Check correctness

### Dependency Constraints

The splitter enforces these critical rules:

1. **Function definitions before usage**
   - A function must be defined before or with its first usage
   - Prevents undefined function errors

2. **Modifications with all usages**
   - When modifying a function signature, all call sites updated together
   - Prevents mismatched function calls

3. **Imports before usage**
   - Import statements must precede code that uses them
   - Prevents import errors

4. **Deletions after usage removal**
   - Code being deleted removed after its last usage is removed
   - Prevents undefined reference errors

5. **Atomic groups stay together**
   - Circular dependencies kept in same patch
   - Strongly connected components not split

### Data Models

**Change**: Single code change (hunk)
```python
Change(
    id="file.py:hunk_0",
    file="src/service.py",
    type="modify",  # add, modify, or delete
    symbols=[Symbol("process", "function")],
    line_range=(45, 60),
    content="@@ -45,5 +45,10 @@\n...",
    added_lines=10,
    deleted_lines=5
)
```

**Dependency**: Relationship between changes
```python
Dependency(
    source="file.py:hunk_1",  # Depends on target
    target="file.py:hunk_0",   # Depended upon
    type="call_chain",
    strength=1.0,  # 0.0-1.0 (1.0 = must be together)
    reason="process() calls validate()"
)
```

**Patch**: Final output patch
```python
Patch(
    id=0,
    name="Add user authentication",
    description="Implement JWT authentication system",
    changes=["auth.py:hunk_0", "auth.py:hunk_1"],
    depends_on=[],  # Patch IDs this depends on
    size_lines=150,
    warnings=[]
)
```

---

## Output Format

Each split generates a timestamped directory with:

```
output/uncommitted_20250130_143022/
├── 00_Add_database_models.patch
├── 01_Implement_authentication.patch
├── 02_Create_API_endpoints.patch
├── 03_Add_tests.patch
├── metadata_20250130_143022.json
├── summary_20250130_143022.md
└── apply_patches.sh
```

### Patch Files

Standard unified diff format with header:

```patch
# Add user authentication system
# Category: feature
# Priority: 1
# Generated: 20250130_143022
# Files: src/auth.py, src/middleware.py
# Description: Implement JWT authentication with middleware

diff --git a/src/auth.py b/src/auth.py
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/auth.py
@@ -0,0 +1,50 @@
+import jwt
+from datetime import datetime, timedelta
+
+def generate_token(user_id: str) -> str:
+    """Generate JWT token for user."""
+    payload = {
+        'user_id': user_id,
+        'exp': datetime.utcnow() + timedelta(hours=24)
+    }
+    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')
```

### Metadata JSON

Complete information about the split:

```json
{
  "generated_at": 1706622622,
  "total_patches": 4,
  "goal_summary": "Add user authentication and API endpoints",
  "repository": {
    "name": "myproject",
    "path": "/path/to/repo",
    "language": "python"
  },
  "patches": [
    {
      "id": 0,
      "name": "Add database models",
      "description": "Create User and Session models",
      "category": "feature",
      "priority": 1,
      "files": ["src/models.py"],
      "dependencies": [],
      "filename": "00_Add_database_models.patch",
      "annotations": []
    }
  ]
}
```

### Summary Markdown

Human-readable overview:

```markdown
# Code Changes Summary

**Generated:** 2025-01-30 14:30:22
**Total Patches:** 4

## Patches by Category

### Feature (3 patches)
- **Add database models** (Priority: 1)
  - Create User and Session models
  - Files: src/models.py

- **Implement authentication** (Priority: 2)
  - JWT authentication with middleware
  - Files: src/auth.py, src/middleware.py
```

### Apply Script

Executable bash script:

```bash
#!/bin/bash
# Auto-generated script to apply patches in recommended order

set -e  # Exit on error

echo "Applying patches in recommended order..."

echo "Applying patch 1/4: 00_Add_database_models.patch"
git apply 00_Add_database_models.patch

echo "Applying patch 2/4: 01_Implement_authentication.patch"
git apply 01_Implement_authentication.patch

# ... more patches ...

echo "All patches applied successfully!"
```

**Usage:**
```bash
cd /path/to/your/repo
chmod +x output/uncommitted_20250130_143022/apply_patches.sh
./output/uncommitted_20250130_143022/apply_patches.sh
```

---

## Configuration

### Source Configuration (source.yaml)

**Required** for all operations. Defines repository locations:

```yaml
repositories:
  - name: "myproject"
    path: "/Users/username/projects/myproject"
    description: "Main application"
    language: "python"  # Optional

  - name: "backend"
    path: "/Users/username/monorepo/backend"
    description: "Backend service"

  - name: "frontend"
    path: "/Users/username/monorepo/frontend"
    description: "React frontend"
```

Create from example:
```bash
cp source.example.yaml source.yaml
# Edit with your repository paths
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |

### Target Patch Size Guidance

| Size | Use Case | Pros | Cons |
|------|----------|------|------|
| 50-100 | Very small commits | Easy to review | Many patches |
| 150-200 | **Recommended** | Good balance | - |
| 300-500 | Large features | Fewer patches | Harder to review |

---

## Advanced Features

### LLM Integration

The splitter can use any OpenAI-compatible API:

**OpenAI:**
```bash
export OPENAI_API_KEY="sk-..."
python -m code_splitter.main split \
  --source-config source.yaml \
  --model gpt-4
```

**Anthropic Claude:**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python -m code_splitter.main split \
  --source-config source.yaml \
  --api-base https://api.anthropic.com/v1 \
  --model claude-3-5-sonnet-20241022
```

**Azure OpenAI:**
```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --api-base https://your-resource.openai.azure.com \
  --api-key "your-azure-key" \
  --model gpt-4
```

**Local Models (via LiteLLM):**
```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --api-base http://localhost:8000/v1 \
  --model local-model
```

### Quality Metrics

After splitting, the agent reports:

```
Quality Metrics:
  Balance score: 0.85  (0-1, higher = more even patch sizes)
  Reviewability: 0.92  (0-1, higher = easier to review)
  Max depth: 3         (Longest dependency chain)
  Warnings: 1          (Patches needing attention)
```

### Including Untracked Files

```bash
# Include all untracked (new) files
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --untracked

# Include specific untracked files
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --untracked \
  new_file1.py new_file2.py
```

### Comparing Branches

```bash
# Compare feature branch against main
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --target-branch feature/new-ui \
  --base-branch main
```

### Dry Run

Analyze without generating patches:

```bash
python -m code_splitter.main split \
  --source-config source.yaml \
  --repo myproject \
  --dry-run
```

---

## Limitations

### Known Limitations

1. **Language Support**
   - Tree-sitter parsing may not be 100% accurate for all languages
   - Complex macros or metaprogramming may be challenging
   - Limited support for domain-specific languages

2. **Dependency Detection**
   - Cannot detect runtime dependencies
   - May miss indirect dependencies through configuration files
   - Reflection and dynamic imports may not be caught

3. **Large Files**
   - Very large files (>10,000 lines) may be slow to process
   - Memory usage scales with diff size

4. **LLM Limitations**
   - Requires API access (costs money)
   - Rate limits may apply
   - May occasionally generate suboptimal groupings

### Best Practices

1. **Commit Often**: Split works best on focused changes
2. **Review Generated Patches**: Always review before applying
3. **Use LLM Wisely**: Enable for complex refactorings, disable for simple changes
4. **Test After Applying**: Run tests after each patch or group
5. **Adjust Target Size**: Tune based on your team's review capacity

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas for improvement:
- Additional language support
- More sophisticated dependency analysis
- Better semantic grouping algorithms
- Performance optimization
- Test coverage

### Development Setup

```bash
# Clone repository
git clone https://github.com/yourusername/code-splitter-agent.git
cd code-splitter-agent

# Install with dev dependencies
make install-dev

# Run tests
make test

# Run linting
make lint
```

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Credits

Built with:
- [tree-sitter](https://tree-sitter.github.io/) - Fast, incremental parsing
- [networkx](https://networkx.org/) - Graph algorithms
- [unidiff](https://github.com/matiasb/python-unidiff) - Unified diff parsing
- [OpenAI API](https://platform.openai.com/) - LLM enhancement

---

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/code-splitter-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/code-splitter-agent/discussions)
- **Documentation**: [docs/](docs/)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and migration guides.
