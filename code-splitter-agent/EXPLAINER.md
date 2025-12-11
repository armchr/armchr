# Code Splitter Agent - Technical Explainer

## Overview

The Code Splitter Agent is a sophisticated tool that splits large code changes (diffs) into smaller, dependency-aware, reviewable patches. It uses static analysis, graph algorithms, and optional LLM enhancement to intelligently group related changes while ensuring patches can be applied independently without breaking compilation or runtime behavior.

## High-Level Architecture

The agent operates as a **5-phase pipeline**, where each phase builds upon the previous one:

```
Diff Input → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Patches Output
            Analysis  Graph    Grouping Splitting Validation
```

### Main Orchestrator

**File:** `src/code_splitter/agent.py`

The `CodeSplitterAgent` class orchestrates the entire pipeline. Key responsibilities:
- Initializes all phase components (parsers, analyzers, groupers, splitters, validators)
- Manages LLM client for optional enhancement
- Coordinates data flow between phases
- Exports final patches to files in a compatible format

**Entry point:** `CodeSplitterAgent.split_changes()` (line 43)

---

## Phase 1: Analysis & Dependency Extraction

**File:** `src/code_splitter/phase1_analysis.py`

### Purpose
Parse the unified diff and extract:
- Individual code changes (hunks)
- Symbols (functions, classes, variables) in each change
- Dependencies between changes

### Key Classes

#### 1. DiffParser (line 10)
Parses unified diff format into structured `Change` objects.

**Main method:** `parse_diff(diff_text)` (line 16)

**How it works:**
1. Uses `unidiff` library to parse diff into files and hunks
2. Detects programming language from file extension (line 82)
3. For each hunk:
   - Extracts symbols using `LanguageParser` (line 48)
   - Determines change type: add/modify/delete (line 145)
   - Builds `Change` object with metadata
4. Fallback parser for when unidiff fails (line 157)

**Symbol extraction:** Uses language-specific parsing to identify functions, classes, methods, variables, and imports from added lines (line 122).

#### 2. DependencyAnalyzer (line 355)
Analyzes dependencies between changes using a **four-phase algorithm**.

**Main method:** `analyze_dependencies(changes, codebase_context)` (line 371)

**Four-Phase Algorithm:**

**Phase 1: Symbol Extraction** (line 390-395)
For each change, extract:
- **Definitions**: Symbols declared in this hunk (functions, methods, types, variables)
- **Usages**: Symbols referenced in this hunk (qualified names like `pkg.Symbol`)
- **Import Map**: Mapping of package aliases to full import paths

```python
change_symbols[change.id] = (definitions, usages, import_map)
```

**Phase 2: Qualified Symbol Index Construction** (line 397-400)
Builds a multi-strategy index from all definitions:

```
Index entries for a method like `func (cg *CodeGraph) UpdateNodeMetaData(...) error`:
- "codegraph.UpdateNodeMetaData" → change_id (package.name)
- "CodeGraph.UpdateNodeMetaData" → change_id (ReceiverType.name)
- "method:UpdateNodeMetaData" → change_id (fallback)
- "file.go:UpdateNodeMetaData" → change_id (file:name)
```

**Phase 3: Package Index Construction** (line 402-405)
Maps import paths to changes that define symbols in that package:

```
"internal/service/codegraph" → {code_graph.go:hunk_0, code_graph.go:hunk_1, ...}
```

**Phase 4: Dependency Resolution** (line 407-472)
For each usage symbol, resolves to its defining change using multiple lookup strategies:
1. **Direct qualified lookup**: `usage.qualified_name` (e.g., "CodeGraph.UpdateNodeMetaData")
2. **Type.Method lookup**: `usage.package + "." + usage.name`
3. **Method fallback**: `"method:" + usage.name`
4. **Package fallback**: Find changes that define symbols in the same package

**Dependency types:**
- `defines_uses`: A change uses a symbol defined in another change
- `import`: Import statements must precede usage

**Dependency strength values:**
- **1.0 (Critical)**: Modifications to existing code - must be together or strictly ordered
- **0.8 (Orderable)**: Both changes are new additions - can be split with proper ordering

---

## Phase 2: Dependency Graph Construction

**File:** `src/code_splitter/phase2_graph.py`

### Purpose
Build a directed graph of dependencies and identify atomic groups (changes that cannot be split).

### Key Class: DependencyGraph (line 8)

Uses NetworkX for graph operations.

**Initialization:**
- `add_changes()`: Adds changes as nodes (line 16)
- `add_dependencies()`: Adds dependencies as directed edges (line 22)

**Critical algorithms:**

#### 1. Find Strongly Connected Components (line 34)
Identifies circular dependencies using NetworkX's SCC algorithm.

**Why it matters:** Changes in a cycle must stay together in one patch.

**Example:** If change A depends on B, B depends on C, and C depends on A, they form an SCC.

#### 2. Compute Transitive Closure (line 45)
Finds all indirect dependencies.

**Why it matters:** If A depends on B, and B depends on C, then A indirectly depends on C.

#### 3. Topological Sort (line 53)
Orders changes so dependencies come before dependents.

**Handles cycles:** If cycles exist, removes minimum edges to break them and provides best-effort ordering.

#### 4. Find Atomic Groups (line 77)
Identifies two types of atomic groups:

**a) Strongly Connected Components** (line 86)
- Circular dependencies
- Reason: "Circular dependency - changes must stay together"

**b) Strong Dependency Groups** (line 96)
- Connected by strength=1.0 dependencies
- Uses undirected connected components on strong-edge subgraph
- Reason: "Critical dependencies - must not be split"

**Graph statistics:** `get_graph_statistics()` (line 213) provides metrics like node count, edge count, DAG status, average degree.

---

## Phase 3: Semantic Grouping

**File:** `src/code_splitter/phase3_grouping.py`

### Purpose
Identify semantically related changes that should be grouped together (but can be split if needed, unlike atomic groups).

### Key Class: SemanticGrouper (line 9)

**Main method:** `identify_semantic_groups(changes, atomic_groups)` (line 15)

**Three grouping strategies:**

#### 1. Group by File Proximity (line 54)
- Groups changes in the same file
- Calculates cohesion score based on line distance (line 82)
- Closer line numbers = higher cohesion (0.5-1.0)

**Example:** Changes at lines 10-15 and 20-25 are more cohesive than changes at lines 10 and 1000.

#### 2. Identify Refactoring Patterns (line 110)

**a) Renames** (line 132)
- Detects when same symbol appears in 3+ changes
- Likely indicates rename refactoring
- High cohesion score: 0.95

**b) Extractions** (line 157)
- Detects new function/class definitions with related deletions
- Indicates extract method/class refactoring
- Cohesion score: 0.9

**c) API Changes** (line 190)
- Detects function signature modifications + usage updates
- Groups definition change with all call sites
- Cohesion score: 0.85

#### 3. Group by Symbol Similarity (line 224)
- Builds symbol co-occurrence map
- Calculates Jaccard similarity between change symbol sets
- Groups changes with >30% symbol overlap
- Cohesion score: 0.7

**Deduplication:** Removes overlapping groups, keeping higher-quality ones (line 298).

**Cohesion scoring:** `score_cohesion()` (line 323) combines:
- File proximity (40% weight)
- Symbol overlap (40% weight)
- Line proximity (20% weight)

---

## Phase 4: Patch Splitting

**File:** `src/code_splitter/phase4_splitting.py`

### Purpose
Split changes into patches while respecting dependency constraints and semantic groupings.

### Key Class: PatchSplitter (line 8)

**Main method:** `split_into_patches(changes, atomic_groups, semantic_groups, target_patch_size, max_patches)` (line 13)

**Algorithm flow:**

#### 1. Initialize Patch Candidates (line 38-69)
- Start with atomic groups as complete patches (can't be split)
- Add individual changes not in atomic groups as single-change patches

#### 2. Merge Compatible Patches (line 72)
**Merging rules** (`_can_merge_patches`, line 145):

**a) Must merge if:**
- Changes have circular dependency or strength=1.0 dependency (line 154-158)

**b) Can merge if all true:**
- Combined size ≤ target_size * 1.5 (line 168)
- Semantic similarity score > 0.5 (line 179)

**Semantic similarity** (line 181):
- Uses Jaccard similarity on semantic group membership
- If changes belong to same semantic groups → high similarity

#### 3. Create Final Patches (line 210)
- Generates descriptive names based on files and symbols (line 252)
- Generates descriptions based on change types (line 280)
- Adds warnings for large patches (>500 lines) or many changes (>20 hunks)

#### 4. Sort Topologically (line 302)
- Builds patch dependency graph
- One patch depends on another if any of its changes depend on any change in the other
- Returns patches in dependency order

**Validation:** `validate_patch()` (line 349) checks if all dependencies are satisfied before applying.

---

## Phase 5: Validation & Optimization

**File:** `src/code_splitter/phase5_validation.py`

### Purpose
Validate correctness and measure quality of the patch split.

### Key Classes

#### 1. PatchValidator (line 7)

**Validation** (`validate_patches`, line 13):
- Ensures all changes are included exactly once
- Verifies dependencies are respected (dependents come after dependencies)

**Quality Metrics** (`measure_patch_quality`, line 63):

| Metric | Description |
|--------|-------------|
| `num_patches` | Total number of patches |
| `avg_patch_size` | Average lines per patch |
| `max_patch_size` | Largest patch size |
| `size_variance` | How varied patch sizes are |
| `max_dependency_depth` | Longest dependency chain (line 112) |
| `balance_score` | 0-1, how evenly sized patches are (line 143) |
| `reviewability_score` | 0-1, overall ease of review (line 164) |

**Balance score:** Uses coefficient of variation (CV). Perfect balance (all patches same size) = 1.0, poor balance = 0.

**Reviewability score** (line 164):
Combines per-patch scores:
- **Size score** (50% weight): Sweet spot is 50-200 lines (line 190)
  - <10 lines: 0.3 (too small)
  - 50-200 lines: 1.0 (ideal)
  - \>500 lines: 0.1 (too large)
- **File score** (30% weight): Fewer files = better (line 178)
- **Warning score** (20% weight): Fewer warnings = better (line 181)

**Optimization suggestions** (`suggest_optimizations`, line 213):
- Unbalanced patches (balance < 0.5)
- Very large patches (>500 lines)
- Too many small patches (>30% under 20 lines)
- Deep dependency chains (>5 levels)
- Low reviewability (<0.6)

#### 2. PatchOptimizer (line 270)

**Current implementation:**
- Splits very large patches (>2x target size) in half (line 306)

**Future potential:**
- Merge small patches
- Reorder to reduce dependency depth
- Balance patch sizes

---

## Data Models

**File:** `src/code_splitter/models.py`

### Core Models

#### Symbol (line 10)
Represents a code symbol (function, class, variable, etc.)
- `name`: Symbol name
- `type`: function | class | variable | method | import | type | interface | field
- `file`: File path
- `line`: Line number
- `role`: "definition" | "usage" - whether this is a definition or usage
- `package`: Package/module the symbol belongs to (for usages, e.g., "CodeGraph")
- `qualified_name`: Full qualified name (e.g., "CodeGraph.UpdateNodeMetaData")
- `scope`: Parent class/module name (e.g., receiver type for Go methods)

**Method:** `get_qualified_name()` - Returns the fully qualified name for dependency matching

#### Change (line 25)
Represents a single hunk in a diff
- `id`: Unique identifier (format: `file:hunk_N`)
- `file`: File path
- `hunk_id`: Hunk number within file
- `type`: add | modify | delete
- `symbols`: List of symbols defined/modified
- `line_range`: (start, end) line numbers
- `content`: Actual diff content
- `added_lines`, `deleted_lines`: Line counts

#### Dependency (line 44)
Represents a dependency between changes
- `source`: Change ID that depends on target
- `target`: Change ID being depended upon
- `type`: defines_uses | modifies_uses | import | call_chain | type_dependency
- `strength`: 0.0-1.0 (1.0 = must be together)
- `reason`: Human-readable explanation

#### AtomicGroup (line 59)
A group of changes that cannot be split
- `id`: Unique identifier
- `change_ids`: List of change IDs
- `reason`: Why they can't be split

#### SemanticGroup (line 72)
A semantic grouping of related changes
- `id`: Unique identifier
- `name`: Descriptive name
- `change_ids`: List of change IDs
- `description`: What the grouping represents
- `cohesion_score`: 0.0-1.0 strength of relationship

#### Patch (line 87)
A final patch to apply
- `id`: Patch number
- `name`: Descriptive name
- `description`: What the patch does
- `changes`: List of change IDs
- `depends_on`: List of patch IDs this depends on
- `rationale`: Why grouped this way (optional)
- `size_lines`: Total lines changed
- `warnings`: Any warnings about this patch

#### PatchSplitResult (line 105)
Complete result of the splitting operation
- `patches`: List of Patch objects
- `dependency_order`: Patch IDs in topological order
- `atomic_groups`: Atomic groups identified
- `semantic_groups`: Semantic groups identified
- `warnings`: Overall warnings
- `metadata`: Additional metadata (metrics, settings, etc.)

---

## LLM Enhancement (Optional)

**File:** `src/code_splitter/llm_client.py`

The agent can optionally use an LLM (OpenAI-compatible API) to enhance analysis.

**When LLM is used** (in `agent.py`):

### 1. Dependency Enhancement (line 156)
- Sends changes and dependencies to LLM
- LLM validates dependencies and suggests missing ones
- Adds LLM-identified dependencies to the graph

### 2. Semantic Group Refinement (line 196)
- LLM identifies additional semantic groupings based on intent
- Adds LLM-suggested groups with cohesion scores

### 3. Patch Validation (line 235)
- LLM reviews final patch split
- Provides validation feedback and suggestions

**Trade-off:** LLM provides better analysis but requires API access and has costs.

---

## Output Format

**Export function:** `agent.py:export_patches_to_files()` (line 340)

### Files Generated

#### 1. Patch Files (`01_Name.patch`, `02_Name.patch`, ...)
**Format:**
```
# Patch Name
# Category: feature|refactor|other
# Priority: N
# Generated: YYYYMMDD_HHMMSS
# Files: file1.py, file2.py
# Description: What this patch does

diff --git a/file.py b/file.py
index 1234567..abcdefg 100644
--- a/file.py
+++ b/file.py
@@ -10,5 +10,7 @@ context
-deleted line
+added line
 context
```

**Categorization** (line 461):
- `refactor`: Contains import changes
- `feature`: Contains functions/classes
- `other`: Everything else

#### 2. Metadata File (`metadata_YYYYMMDD_HHMMSS.json`)
Contains:
- Generation timestamp
- Total patches
- Goal summary
- Repository info
- Per-patch metadata (files, dependencies, annotations, category, priority)

**Annotations** (line 479): Detailed info for each change including file path, hunk header, line range, description.

#### 3. Summary File (`summary_YYYYMMDD_HHMMSS.md`)
Human-readable summary with:
- AI analysis notes
- Patches grouped by category
- Recommended application order
- Usage instructions

#### 4. Apply Script (`apply_patches.sh`)
Executable bash script that:
- Applies patches in recommended order
- Checks each patch before applying
- Exits on first failure
- Made executable (chmod 755)

---

## Key Constraints Enforced

The agent enforces critical dependency constraints:

1. **Function definitions before usage:** A function must be defined before or with its first usage
2. **Modification with usages:** When modifying a function signature, all call sites must be updated in the same patch
3. **Imports before usage:** Import statements must precede code that uses them
4. **Deletion after usage:** Code being deleted must be removed after its last usage is removed
5. **Atomic groups:** Circular dependencies and strongly connected components stay together

These are enforced via:
- Dependency analysis (Phase 1)
- Atomic group detection (Phase 2)
- Topological sorting (Phase 4)

---

## Usage Example

```python
from code_splitter import CodeSplitterAgent

# Create agent (with or without LLM)
agent = CodeSplitterAgent(
    llm_api_key="your-key",
    llm_model="gpt-4",
    use_llm=True
)

# Read diff
with open("changes.diff") as f:
    diff_text = f.read()

# Split changes
result = agent.split_changes(
    diff_text,
    target_patch_size=200,  # Target lines per patch
    max_patches=10          # Optional limit
)

# Export to files
agent.export_patches_to_files(result, diff_text, "./output")
```

**CLI usage:**
```bash
python -m code_splitter.cli changes.diff -o ./patches -s 200
```

---

## Language Support

**File:** `src/code_splitter/language_support.py`

The `LanguageParser` class provides comprehensive symbol extraction using tree-sitter with regex fallbacks.

### Supported Languages
- Go (tree-sitter-go)
- Python (tree-sitter-python)
- JavaScript/TypeScript (tree-sitter-javascript, tree-sitter-typescript)
- Java (tree-sitter-java)
- Rust (tree-sitter-rust)
- C/C++ (tree-sitter-c, tree-sitter-cpp)

### Symbol Extraction Architecture

**Main method:** `extract_all_symbols(code, language, file_path, base_line_number)` (line 462)

Returns a tuple of `(definitions, usages, import_map)`:
1. **Definitions**: Symbols declared in the code (functions, methods, types, variables)
2. **Usages**: Symbols referenced in the code (qualified names like `pkg.Symbol`)
3. **Import Map**: Mapping of package aliases to full import paths

For each language, extraction follows a three-pass approach:
- **Pass 1**: Collect imports and build alias → path map
- **Pass 2**: Extract definitions (functions, types, etc.)
- **Pass 3**: Extract usages (qualified references)

### Go-Specific Handling

**File:** `language_support.py`, methods `_extract_go_symbols()`, `_extract_go_usages()` (line 680)

Go has special handling for **method calls on struct fields** (e.g., `t.CodeGraph.UpdateNodeMetaData()`):

#### 1. Selector Chain Extraction
The `get_selector_chain()` helper function (line 702) traverses nested selector expressions:

```go
// Input: t.CodeGraph.UpdateNodeMetaData
// Output: ['t', 'CodeGraph', 'UpdateNodeMetaData']
```

#### 2. Method Usage Detection
For chained selector expressions that are call expressions:

```go
t.CodeGraph.UpdateNodeMetaData(ctx, nodeID, fileID, metadata)
```

The parser extracts:
- **Method name**: `UpdateNodeMetaData`
- **Potential type**: `CodeGraph` (second-to-last in chain, used as package hint)
- **Qualified name**: `CodeGraph.UpdateNodeMetaData`

#### 3. Method Definition Extraction
For method declarations:

```go
func (cg *CodeGraph) UpdateNodeMetaData(ctx context.Context, ...) error
```

The parser extracts:
- **Name**: `UpdateNodeMetaData`
- **Type**: `method`
- **Scope/Receiver**: `CodeGraph`

This allows the dependency analyzer to match usages like `t.CodeGraph.UpdateNodeMetaData()` with definitions like `func (cg *CodeGraph) UpdateNodeMetaData(...)`.

---

## Extension Points

### Adding Language Support

To add a new language:
1. Install tree-sitter grammar: `pip install tree-sitter-{language}`
2. Add language module import in `language_support.py:_init_parsers()` (line 20)
3. Add `_extract_{lang}_symbols()` method following the three-pass pattern
4. Add case in `extract_all_symbols()` (line 486)
5. Add file extension in `phase1_analysis.py:_detect_language()` (line 82)

### Custom Semantic Grouping
Extend `SemanticGrouper` to add new pattern detection:
- Add method in `phase3_grouping.py`
- Call from `identify_semantic_groups()`

### Advanced Optimization
Extend `PatchOptimizer` to implement:
- Smart patch merging
- Dependency depth reduction
- Size balancing algorithms

---

## Performance Considerations

**Graph algorithms** (Phase 2):
- SCC detection: O(V + E) using Tarjan's algorithm
- Topological sort: O(V + E)
- Transitive closure: O(V³) - can be expensive for large graphs

**Semantic analysis** (Phase 3):
- Symbol similarity: O(N²) where N = number of changes
- Mitigated by processing in batches

**LLM calls:**
- Summarizes first 50 changes/dependencies to control token usage
- Optional and can be disabled for speed

---

## Testing

**File:** `tests/test_basic.py`

Basic tests for parsing and dependency detection.

**Running tests:**
```bash
pytest tests/
```

---

## Key Files Reference

| File | Purpose | Key Components |
|------|---------|----------------|
| `agent.py` | Main orchestrator | CodeSplitterAgent |
| `models.py` | Data structures | Change, Symbol, Dependency, Patch, SemanticGroup |
| `phase1_analysis.py` | Parsing & 4-phase dependency extraction | DiffParser, DependencyAnalyzer |
| `phase2_graph.py` | Graph construction with SCC detection | DependencyGraph |
| `phase3_grouping.py` | Semantic grouping by file, symbols, patterns | SemanticGrouper |
| `phase4_splitting.py` | Patch creation with topological ordering | PatchSplitter |
| `phase5_validation.py` | Validation & metrics | PatchValidator, PatchOptimizer |
| `language_support.py` | Tree-sitter symbol extraction (Go, Python, JS/TS, Java, etc.) | LanguageParser |
| `git_integration.py` | Git operations with monorepo path filtering | GitAnalyzer |
| `llm_client.py` | LLM integration (OpenAI-compatible) | LLMClient |
| `main.py` | Primary CLI with split/resplit commands | click-based CLI |
| `cli.py` | Legacy CLI interface | main() |

---

## Debugging Dependency Detection

If patches are incorrectly ordered (using a symbol before it's defined), debug with these steps:

### 1. Check Symbol Extraction

```python
from code_splitter.language_support import LanguageParser

parser = LanguageParser()

# Test extraction from code that USES a method
code_usage = """
t.CodeGraph.UpdateNodeMetaData(ctx, funcNode.ID, t.FileID, map[string]any{})
"""
definitions, usages, import_map = parser.extract_all_symbols(code_usage, 'go', 'test.go', 1)
print("Usages:", [(u.name, u.qualified_name, u.package) for u in usages])
# Expected: [('UpdateNodeMetaData', 'CodeGraph.UpdateNodeMetaData', 'CodeGraph')]

# Test extraction from code that DEFINES a method
code_def = """
func (cg *CodeGraph) UpdateNodeMetaData(ctx context.Context, nodeID ast.NodeID) error {}
"""
definitions, usages, import_map = parser.extract_all_symbols(code_def, 'go', 'test.go', 1)
print("Definitions:", [(d.name, d.type, d.scope) for d in definitions])
# Expected: [('UpdateNodeMetaData', 'method', 'CodeGraph')]
```

### 2. Check Symbol Index

```python
from code_splitter.phase1_analysis import DependencyAnalyzer

analyzer = DependencyAnalyzer()
# ... build change_symbols dict from changes ...
symbol_index = analyzer._build_qualified_symbol_index(changes, change_symbols)
print("Index keys:", list(symbol_index.keys()))
# Look for entries like:
# - "CodeGraph.UpdateNodeMetaData"
# - "method:UpdateNodeMetaData"
```

### 3. Console Output Interpretation

The splitter prints debugging info during execution:

```
[DependencyAnalyzer] Analyzing 34 changes...
[DependencyAnalyzer] Phase 2: Building symbol index...
[DependencyAnalyzer]   Index contains 531 qualified symbols
[DependencyAnalyzer] Found 50 dependencies
```

Low dependency count relative to changes may indicate missed dependencies.

### 4. Common Issues

| Symptom | Likely Cause | Fix Location |
|---------|--------------|--------------|
| Method usage not detected | Chained selector not traversed | `get_selector_chain()` in `_extract_go_usages()` |
| Method not found in index | Receiver type not indexed | `_build_qualified_symbol_index()` - check `symbol.scope` handling |
| Wrong patch order | Dependency not resolved | Phase 4 multi-strategy lookup in `analyze_dependencies()` |
| Missing package dependency | Import not parsed | `_extract_go_imports()` |

---

## Summary

The Code Splitter Agent transforms a monolithic diff into reviewable patches through:

1. **Static analysis** to extract symbols and detect dependencies
2. **Graph algorithms** to identify atomic groups and ordering constraints
3. **Pattern recognition** to find semantic groupings (refactorings, API changes, etc.)
4. **Constraint-based splitting** that respects dependencies and targets reasonable patch sizes
5. **Quality validation** with metrics and optimization suggestions
6. **Optional LLM enhancement** for improved accuracy

The result is a set of patches that can be reviewed and applied independently, with clear dependencies and rationale for each grouping.
