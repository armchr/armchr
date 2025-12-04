"""Core data models for the code splitter agent."""

from dataclasses import dataclass, field
from typing import Literal, List, Optional, Tuple
from dataclasses_json import dataclass_json


@dataclass_json
@dataclass
class Symbol:
    """Represents a code symbol (function, class, variable, etc.).

    Symbols can be either definitions (declared in this hunk) or usages
    (referenced from another package/file).
    """

    name: str
    type: Literal["function", "class", "variable", "method", "import", "type", "interface", "field"]
    file: str
    line: int
    role: Literal["definition", "usage"] = "definition"  # Whether this is a definition or usage
    package: Optional[str] = None  # Package/module the symbol belongs to (for usages)
    qualified_name: Optional[str] = None  # Full qualified name (e.g., "smells.DetectorRegistry")
    scope: Optional[str] = None  # Parent class/module name

    def __hash__(self):
        return hash((self.name, self.type, self.file, self.line, self.role))

    def get_qualified_name(self) -> str:
        """Get the fully qualified name of this symbol."""
        if self.qualified_name:
            return self.qualified_name
        if self.package:
            return f"{self.package}.{self.name}"
        return self.name


@dataclass_json
@dataclass
class Change:
    """Represents a single code change (hunk in a diff)."""

    id: str
    file: str
    hunk_id: int
    type: Literal["add", "modify", "delete"]
    symbols: List[Symbol]
    line_range: Tuple[int, int]  # (start, end) in the file
    content: str  # The actual diff content
    added_lines: int = 0
    deleted_lines: int = 0

    def __hash__(self):
        return hash(self.id)


@dataclass_json
@dataclass
class Dependency:
    """Represents a dependency between two changes."""

    source: str  # Change ID that depends on target
    target: str  # Change ID that is depended upon
    type: Literal["defines_uses", "modifies_uses", "import", "call_chain", "type_dependency"]
    strength: float  # 1.0 = must be together, 0.0-0.99 = should be together
    reason: str = ""  # Human-readable explanation

    def __hash__(self):
        return hash((self.source, self.target, self.type))


@dataclass_json
@dataclass
class AtomicGroup:
    """A group of changes that cannot be split."""

    id: str
    change_ids: List[str]
    reason: str

    def __hash__(self):
        return hash(self.id)


@dataclass_json
@dataclass
class SemanticGroup:
    """A semantic grouping of related changes."""

    id: str
    name: str
    change_ids: List[str]
    description: str
    cohesion_score: float = 0.0

    def __hash__(self):
        return hash(self.id)


@dataclass_json
@dataclass
class Patch:
    """Represents a final patch to be applied."""

    id: int
    name: str
    description: str
    changes: List[str]  # Change IDs
    depends_on: List[int] = field(default_factory=list)  # Patch IDs
    rationale: str = ""
    size_lines: int = 0
    warnings: List[str] = field(default_factory=list)

    def __hash__(self):
        return hash(self.id)


@dataclass_json
@dataclass
class PatchSplitResult:
    """Result of the patch splitting operation."""

    patches: List[Patch]
    dependency_order: List[int]  # Patch IDs in topological order
    atomic_groups: List[AtomicGroup]
    semantic_groups: List[SemanticGroup]
    warnings: List[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
