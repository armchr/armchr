# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Code Splitter Agent is a dependency-aware code splitting tool that analyzes large diffs and splits them into reviewable, semantically-grouped patches. It uses tree-sitter for code analysis and optionally LLM for enhanced semantic understanding.

## Core Architecture

### Five-Phase Pipeline

The agent operates through 5 sequential phases:

1. **Phase 1: Analysis & Dependency Extraction** (`phase1_analysis.py`)
   - Parses unified diff format using unidiff
   - Extracts symbols (functions, classes, variables) using tree-sitter
   - Identifies dependencies between changes via DependencyAnalyzer
   - Detects import relationships and call chains
   - **LLM enhancement**: Validates dependencies and identifies missing ones

2. **Phase 2: Dependency Graph Construction** (`phase2_graph.py`)
   - Builds directed graph of dependencies using networkx
   - Finds strongly connected components (circular dependencies)
   - Computes transitive closures
   - Identifies atomic groups that cannot be split

3. **Phase 3: Semantic Grouping** (`phase3_grouping.py`)
   - Groups changes by file proximity
   - Identifies refactoring patterns (renames, extractions, API changes)
   - Clusters related changes based on symbol overlap
   - Calculates cohesion scores
   - **LLM enhancement**: Identifies high-level semantic coherence and feature boundaries

4. **Phase 4: Patch Splitting** (`phase4_splitting.py`)
   - Splits changes into patches respecting dependency constraints
   - Merges compatible changes guided by semantic groups
   - Ensures dependencies are satisfied
   - Sorts patches in topological order
   - **LLM enhancement**: Generates purpose-driven patch names and descriptions

5. **Phase 5: Validation & Optimization** (`phase5_validation.py`)
   - Validates patch correctness
   - Measures quality metrics (balance score, reviewability)
   - Suggests optimizations
   - Ensures patches can be applied in order
   - **LLM enhancement**: Validates split correctness and suggests improvements

### Key Components

- **CodeSplitterAgent** (`agent.py`): Main orchestrator that runs all phases
- **GitAnalyzer** (`git_integration.py`): Git operations and diff extraction with automatic path filtering
- **LLMClient** (`llm_client.py`): Optional OpenAI-compatible API integration
- **Models** (`models.py`): Data models (Change, Dependency, Patch, etc.)

### Path Filtering for Monorepos

When the git root is at a higher level than the repository path specified in `source.yaml`, the GitAnalyzer automatically filters uncommitted and untracked changes to include **only files within the specified repository directory**.

**Example:**
- Git root: `/Users/username/monorepo`
- Repository path in `source.yaml`: `/Users/username/monorepo/backend`
- When analyzing uncommitted changes, only files under `backend/` are included
- Files in `frontend/`, `docs/`, etc. are automatically excluded

This ensures that when you specify `--repo backend`, you only see changes relevant to that subdirectory, even if the git repository contains multiple projects.

## Development Commands

### Setup and Installation

```bash
# Quick setup (creates venv and installs everything)
make setup
source venv/bin/activate

# Or manual setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -e .

# With dev dependencies
make install-dev
```

### Running the Splitter

**IMPORTANT**: The `--source-config` parameter is REQUIRED for all operations.

```bash
# Create source config from example first
cp source.example.yaml source.yaml
# Edit source.yaml with your repository paths

# Basic usage - split uncommitted changes
python -m code_splitter.main split --source-config source.yaml

# Split specific commit
python -m code_splitter.main split --source-config source.yaml --commit abc123

# Split specific repository from config
python -m code_splitter.main split --source-config source.yaml --repo myproject

# Split with options
python -m code_splitter.main split \
  --source-config source.yaml \
  --target-size 150 \
  --output-dir ./patches \
  --no-llm

# Re-split an existing patch
python -m code_splitter.main resplit \
  output/uncommitted_20251015_084549 \
  01_Large_patch.patch \
  --source-config source.yaml \
  --target-size 100
```

### Testing

```bash
# Run all tests
make test
# Or
pytest tests/ -v

# Run specific test file
pytest tests/test_basic.py -v

# Run example
python example.py
# Or
make run-example
```

### Cleanup

```bash
# Clean build artifacts
make clean

# Clean everything including venv
make clean-all
```

## Source Configuration

The `source.yaml` file is REQUIRED and defines repository locations:

```yaml
repositories:
  - name: "my-project"
    path: "/Users/username/projects/my-project"
    description: "Main project"

  - name: "backend"
    path: "/Users/username/projects/backend"
    description: "Backend service"
```

## Output Format

The splitter generates a timestamped directory with:

- `00_Patch_Name.patch`, `01_Next_Patch.patch`, etc. - Individual patches
- `metadata_YYYYMMDD_HHMMSS.json` - Complete metadata with annotations
- `summary_YYYYMMDD_HHMMSS.md` - Human-readable summary
- `apply_patches.sh` - Executable script to apply all patches

### Applying Patches

```bash
cd /path/to/repository

# Method 1: Use provided script (recommended)
chmod +x output/uncommitted_20251015_084549/apply_patches.sh
output/uncommitted_20251015_084549/apply_patches.sh

# Method 2: Manual git apply
git apply output/uncommitted_20251015_084549/00_First_patch.patch
git apply output/uncommitted_20251015_084549/01_Second_patch.patch

# Method 3: Loop through all patches
for patch in output/uncommitted_20251015_084549/*.patch; do
    git apply "$patch"
done
```

## Key Constraints

The splitter enforces critical dependency constraints:

1. **Function definitions before usage** - A function must be defined before/with its first usage
2. **Modification with usages** - When modifying a function signature, all usage sites must be updated in the same patch
3. **Imports before usage** - Import/include statements must precede code that uses them
4. **Deletion after usage** - Code being deleted must be removed after its last usage is removed
5. **Atomic groups** - Circular dependencies and strongly connected components stay together

## Language Support

Supports multiple languages via tree-sitter:
- Python (tree-sitter-python)
- JavaScript/TypeScript (tree-sitter-javascript, tree-sitter-typescript)
- Java (tree-sitter-java)
- Go (tree-sitter-go)
- Rust (tree-sitter-rust)
- C/C++ (tree-sitter-c, tree-sitter-cpp)

Fallback to regex-based parsing if tree-sitter unavailable.

## LLM Integration

LLM usage is optional but significantly enhances analysis through semantic understanding and feedback loops.

### Basic Usage

```bash
# Set API key
export OPENAI_API_KEY="your-api-key"

# Use with custom endpoint (e.g., Azure, local model)
python -m code_splitter.main split \
  --source-config source.yaml \
  --api-base https://api.custom.com/v1 \
  --model gpt-4

# Disable LLM
python -m code_splitter.main split --source-config source.yaml --no-llm
```

### LLM Enhancement Points

The LLM is used at four critical points in the pipeline:

#### 1. **Phase 1: Dependency Enhancement** (`_enhance_dependencies_with_llm`)

**What we pass to the LLM:**
- Summary of all changes (up to 50 changes): file paths, change types, symbols, and line counts
- List of detected dependencies (up to 50): source/target change IDs, dependency type, strength, and reason

**What we ask:**
```
For each dependency:
1. Is it correct?
2. What is the strength (0.0-1.0)?
3. Can it be violated or is it critical?

Also identify any missing dependencies that should be added.
```

**Expected JSON response:**
```json
{
  "validated_dependencies": [
    {"source": "change_id", "target": "change_id", "strength": 1.0, "reason": "..."}
  ],
  "missing_dependencies": [
    {"source": "change_id", "target": "change_id", "strength": 1.0, "reason": "..."}
  ],
  "notes": "Any additional observations"
}
```

**What we do with the feedback:**
- Add newly identified dependencies to the dependency list
- These dependencies are used in Phase 2 for graph construction
- Missing dependencies help prevent incorrect splits that would break builds

#### 2. **Phase 3: Semantic Group Refinement** (`_enhance_semantic_groups_with_llm`)

**What we pass to the LLM:**
- Summary of all changes
- Summary of dependencies
- (Implicitly) Context about what semantic groups were already found heuristically

**What we ask:**
```
Identify semantic groups that represent coherent units of work.

Consider:
- Changes to the same feature/component
- Refactoring patterns (renames, extractions)
- API changes and their usages
- Test changes related to implementation changes
```

**Expected JSON response:**
```json
{
  "groups": [
    {
      "name": "group name",
      "change_ids": ["change1", "change2"],
      "description": "what these changes accomplish together",
      "cohesion_score": 0.9
    }
  ]
}
```

**What we do with the feedback:**
- Add LLM-identified groups to the existing semantic groups found heuristically
- Semantic groups guide the merging strategy in Phase 4
- High-cohesion groups (score > 0.5) are preferentially kept together
- Groups help identify feature boundaries that shouldn't be split across patches

#### 3. **Phase 4: Patch Naming and Description** (`_generate_patch_name_with_llm`)

**What we pass to the LLM:**
- Detailed change information: files, symbols, types, line counts, content previews (300 chars)
- **Additional context:**
  - Original commit message (if available)
  - Repository description
  - Previous 3 patches (name + description) for consistency

**What we ask:**
```
Analyze the code changes and generate a concise description of what this patch
is trying to achieve.

Focus on the PURPOSE or GOAL of the changes and a bit of HOW.

Return a JSON object with a "description" field.

Good examples:
- "Add commit filtering by deletion status to reduce redundant commits"
- "Implement JWT authentication system"

Bad examples:
- "Changes in api.py"
- "Update functions"
```

**Expected JSON response:**
```json
{
  "description": "Add commit filtering by deletion status to reduce the number of redundant commits to be processed"
}
```

**What we do with the feedback:**
- Use the description as both the patch name and detailed description
- If description > 80 chars, truncate to 77 chars + "..." for the name
- Descriptions appear in patch files, metadata.json, and summary.md
- Helps reviewers understand the purpose without reading the diff

**Robust JSON parsing:**
The system includes fallback parsing to handle various LLM response formats:
1. Try parsing entire response as JSON
2. Extract JSON from within text using regex
3. Extract description using pattern matching
4. Use entire response as description (last resort)

This handles cases where the LLM returns markdown code blocks, explanatory text, or malformed JSON.

#### 4. **Phase 5: Patch Validation** (`_refine_patches_with_llm`)

**What we pass to the LLM:**
- Summary of all proposed patches: names, change counts, line counts, dependencies
- Summary of dependencies

**What we ask:**
```
Validate the patch split for correctness.

Check for:
1. Are all dependencies satisfied?
2. Is the ordering correct?
3. Are there any potential compilation or runtime errors?
4. Are the patches well-balanced and reviewable?
```

**Expected JSON response:**
```json
{
  "is_valid": true,
  "issues": ["list of any issues found"],
  "suggestions": ["list of suggestions for improvement"],
  "overall_assessment": "brief assessment"
}
```

**What we do with the feedback:**
- Log validation issues and suggestions to console
- Warnings are included in the PatchSplitResult metadata
- Currently used for informational purposes (could be enhanced to automatically adjust splits)

### LLM Feedback Loop Summary

The LLM integration creates a multi-stage feedback loop:

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUT: Git Diff                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: Static Analysis                                        │
│ • Parse diff → Changes                                           │
│ • Tree-sitter → Symbols, Dependencies                           │
│                                                                  │
│         ┌────────────────────────────────┐                      │
│         │ LLM Enhancement 1              │                      │
│         │ Validate deps, find missing    │                      │
│         │ → Enhanced Dependencies        │                      │
│         └────────────────────────────────┘                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: Graph Construction                                     │
│ • Build dependency graph                                         │
│ • Find strongly connected components                            │
│ • Identify atomic groups (HARD CONSTRAINTS)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: Semantic Grouping                                      │
│ • Group by file proximity                                        │
│ • Detect refactoring patterns (rename, extract, API changes)    │
│ • Group by symbol similarity                                     │
│                                                                  │
│         ┌────────────────────────────────┐                      │
│         │ LLM Enhancement 2              │                      │
│         │ Identify semantic coherence    │                      │
│         │ → Enhanced Semantic Groups     │                      │
│         └────────────────────────────────┘                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 4: Patch Splitting                                        │
│ • Start with atomic groups                                       │
│ • Merge based on semantic similarity (score > 0.5)              │
│ • Respect size constraints (target ± 50%)                       │
│ • Topological sort by dependencies                              │
│                                                                  │
│    For each patch:                                               │
│         ┌────────────────────────────────┐                      │
│         │ LLM Enhancement 3              │                      │
│         │ Generate purpose-driven name   │                      │
│         │ Use commit msg & prev context  │                      │
│         │ → Meaningful Description       │                      │
│         └────────────────────────────────┘                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 5: Validation                                             │
│ • Check dependency satisfaction                                  │
│ • Measure quality metrics                                        │
│                                                                  │
│         ┌────────────────────────────────┐                      │
│         │ LLM Enhancement 4              │                      │
│         │ Validate correctness           │                      │
│         │ Suggest improvements           │                      │
│         │ → Issues & Suggestions         │                      │
│         └────────────────────────────────┘                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OUTPUT: Patch Files                          │
│ • 00_Patch_name.patch, 01_Next.patch, ...                      │
│ • metadata.json (with LLM-generated descriptions)               │
│ • summary.md                                                     │
│ • apply_patches.sh                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points:**
1. **Static analysis** (tree-sitter, regex) identifies initial dependencies and changes
2. **LLM validates and enhances** dependencies (adds missing ones, validates existing)
3. **Graph construction** uses enhanced dependencies to find atomic groups
4. **Heuristic grouping** identifies semantic groups by file, symbols, and patterns
5. **LLM refines** semantic groups based on higher-level understanding
6. **Patch splitting** uses both atomic constraints (hard) and semantic groups (soft)
7. **LLM names** each patch based on purpose, using commit context
8. **LLM validates** final patch split for correctness

### Error Handling

All LLM calls are wrapped in try-except blocks:
- JSON parsing errors fall back to heuristic methods
- Network errors are logged but don't stop the pipeline
- The system degrades gracefully: if LLM fails, static analysis results are used
- Temperature settings: 0.3 (deterministic) for validation/naming, 0.5 for semantic grouping

### Performance Considerations

- Change summaries are limited to first 50 changes to avoid token limits
- Content previews are truncated to 300 characters
- LLM calls are sequential (not parallel) to maintain context
- JSON response format is requested when supported for more reliable parsing

### Example LLM Interactions

**Example 1: Dependency Enhancement**

Input to LLM:
```
Changes:
- change_1: add in api.py, symbols: [authenticate, User], 15+ 0-
- change_2: modify in routes.py, symbols: [login_route], 5+ 3-
- change_3: add in models.py, symbols: [User], 20+ 0-

Detected Dependencies:
- change_2 -> change_1 (call_chain, strength=0.8): login_route calls authenticate
```

LLM Response:
```json
{
  "validated_dependencies": [
    {"source": "change_2", "target": "change_1", "strength": 1.0,
     "reason": "login_route directly calls authenticate function"}
  ],
  "missing_dependencies": [
    {"source": "change_1", "target": "change_3", "strength": 1.0,
     "reason": "authenticate function uses User model which must be defined first"}
  ],
  "notes": "User model is fundamental and should be in the first patch"
}
```

Impact: The system now knows that change_3 (User model) must come before change_1 (authenticate), preventing a patch split that would cause import errors.

**Example 2: Semantic Grouping**

Input to LLM:
```
Changes:
- change_1: add in auth/jwt.py, symbols: [generate_token]
- change_2: add in auth/middleware.py, symbols: [auth_middleware]
- change_3: modify in api/routes.py, symbols: [protected_route]
- change_4: add in tests/test_auth.py, symbols: [test_jwt]
```

LLM Response:
```json
{
  "groups": [
    {
      "name": "JWT Authentication System",
      "change_ids": ["change_1", "change_2", "change_3"],
      "description": "Complete JWT authentication implementation with token generation, middleware, and route protection",
      "cohesion_score": 0.95
    },
    {
      "name": "Authentication Tests",
      "change_ids": ["change_4"],
      "description": "Test coverage for JWT authentication",
      "cohesion_score": 0.8
    }
  ]
}
```

Impact: The implementation changes (change_1, change_2, change_3) are kept together in one patch due to high cohesion, while tests can optionally be in a separate patch.

**Example 3: Patch Naming with Context**

Input to LLM:
```
Additional Context:
Original commit message: "Add filtering for deleted commits to improve performance"
Repository description: "Code commit analyzer and splitter"
Previous patches:
- Add commit data models and storage layer
- Implement commit fetching from Git repositories

Changes:
- File: src/commit_filter.py, type: add, symbols: [filter_deleted_commits]
  Content: "def filter_deleted_commits(commits: List[Commit]) -> List[Commit]:
            return [c for c in commits if not c.is_deleted]"
- File: src/api.py, type: modify, symbols: [list_commits]
  Content: "@app.get('/commits')... commits = filter_deleted_commits(commits)..."
```

LLM Response:
```json
{
  "description": "Add commit filtering by deletion status to reduce the number of redundant commits processed by the analyzer"
}
```

Impact: The patch gets a clear, purpose-driven name instead of generic "Changes in commit_filter.py". The description explains the "why" (reduce redundant commits) not just the "what" (add filter).

## Modes of Operation

1. **Working directory changes**: Compare current changes against base branch
   ```bash
   python -m code_splitter.main split --source-config source.yaml
   ```

2. **Branch comparison**: Compare two branches
   ```bash
   python -m code_splitter.main split --source-config source.yaml --target-branch feature/new-ui
   ```

3. **Commit analysis**: Analyze specific commit
   ```bash
   python -m code_splitter.main split --source-config source.yaml --commit abc123
   ```

4. **Patch file**: Analyze standalone patch
   ```bash
   python -m code_splitter.main split --source-config source.yaml --patch changes.patch
   ```

5. **Untracked files**: Include new/untracked files
   ```bash
   python -m code_splitter.main split --source-config source.yaml --untracked
   ```

## Docker Usage

```bash
# Build image
make build

# Push to registry
make push REGISTRY=your-registry.com

# Run container
docker run --rm $(IMAGE_NAME):$(IMAGE_TAG) --help
```

## Project Structure

```
src/code_splitter/
├── __init__.py          - Package initialization
├── __main__.py          - CLI entry point
├── agent.py             - Main orchestrator
├── cli.py               - Legacy CLI interface
├── main.py              - Primary CLI with split/resplit commands
├── models.py            - Data models (Change, Dependency, Patch, etc.)
├── phase1_analysis.py   - Diff parsing and dependency analysis
├── phase2_graph.py      - Dependency graph construction
├── phase3_grouping.py   - Semantic grouping
├── phase4_splitting.py  - Patch splitting logic
├── phase5_validation.py - Validation and optimization
├── git_integration.py   - Git operations
├── language_support.py  - Tree-sitter language support
└── llm_client.py        - LLM API client

tests/
├── test_basic.py        - Basic functionality tests
└── test_git_integration.py - Git integration tests
```

## Important Notes

- **Always use `--source-config`** - It's a required parameter
- **Patches must be applied in order** - They are numbered by dependencies
- **Validate before committing** - Always review generated patches
- **Target size guidance**: 50-100 (many small patches), 150-200 (default balance), 300-500 (fewer larger patches)
- **Re-splitting feature**: Can break down large patches further using the `resplit` command

## Common Workflows

### Split uncommitted changes and apply
```bash
# Split changes
python -m code_splitter.main split --source-config source.yaml

# Review output
ls output/uncommitted_*/

# Apply patches
cd /path/to/repo
output/uncommitted_*/apply_patches.sh
```

### Split a commit for review
```bash
# Split specific commit
python -m code_splitter.main split \
  --source-config source.yaml \
  --commit abc123 \
  --target-size 100

# Output goes to: output/commit_abc123_TIMESTAMP/
```

### Re-split a large patch
```bash
# If a patch is too large, split it further
python -m code_splitter.main resplit \
  output/commit_abc123_TIMESTAMP \
  02_Large_change.patch \
  --source-config source.yaml \
  --target-size 50
```
