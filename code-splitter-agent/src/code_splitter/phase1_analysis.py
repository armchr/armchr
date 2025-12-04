"""Phase 1: Analysis & Dependency Extraction Tools."""

import re
from typing import List, Dict, Set, Tuple, Optional
from unidiff import PatchSet
from .models import Change, Symbol, Dependency
from .language_support import LanguageParser


class DiffParser:
    """Parse unified diff into structured format."""

    def __init__(self):
        self.language_parser = LanguageParser()

    def parse_diff(self, diff_text: str) -> List[Change]:
        """Parse a unified diff into structured Change objects.

        Args:
            diff_text: The unified diff text

        Returns:
            List of Change objects
        """
        changes = []

        try:
            # Parse diff using unidiff
            patch_set = PatchSet(diff_text)

            for patched_file in patch_set:
                # Get file path (prefer target path)
                file_path = patched_file.target_file.lstrip('b/')
                if not file_path or file_path == '/dev/null':
                    file_path = patched_file.source_file.lstrip('a/')

                # Detect language from file extension
                language = self._detect_language(file_path)

                # Process each hunk in the file
                for hunk_idx, hunk in enumerate(patched_file):
                    change_id = f"{file_path}:hunk_{hunk_idx}"

                    # Build hunk content
                    hunk_content = self._build_hunk_content(hunk)

                    # Extract symbols from the hunk
                    symbols = self._extract_symbols_from_hunk_lines(
                        file_path, hunk, language
                    )

                    # Determine change type
                    change_type = self._determine_change_type_from_hunk(hunk)

                    # Get line range
                    line_range = (hunk.target_start, hunk.target_start + hunk.target_length)

                    # Count added and deleted lines
                    added = hunk.added
                    deleted = hunk.removed

                    change = Change(
                        id=change_id,
                        file=file_path,
                        hunk_id=hunk_idx,
                        type=change_type,
                        symbols=symbols,
                        line_range=line_range,
                        content=hunk_content,
                        added_lines=added,
                        deleted_lines=deleted
                    )
                    changes.append(change)

        except Exception as e:
            # Fallback to simple parsing if unidiff fails
            print(f"Warning: unidiff parsing failed: {e}, using fallback parser")
            changes = self._parse_diff_fallback(diff_text)

        return changes

    def _detect_language(self, file_path: str) -> str:
        """Detect programming language from file extension."""
        ext_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.jsx': 'javascript',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cc': 'cpp',
            '.h': 'c',
            '.hpp': 'cpp',
        }

        for ext, lang in ext_map.items():
            if file_path.endswith(ext):
                return lang

        return 'unknown'

    def _build_hunk_content(self, hunk) -> str:
        """Build hunk content string from unidiff hunk."""
        lines = []

        # Add the @@ hunk header
        header = f"@@ -{hunk.source_start},{hunk.source_length} +{hunk.target_start},{hunk.target_length} @@"
        if hunk.section_header:
            header += f" {hunk.section_header}"
        lines.append(header + '\n')

        # Add all lines from the hunk
        # Note: str(line) already includes trailing newline, so don't join with '\n'
        for line in hunk:
            line_str = str(line)
            # Ensure the line has a newline (some edge cases might not)
            if not line_str.endswith('\n'):
                line_str += '\n'
            lines.append(line_str)

        return ''.join(lines)

    def _extract_symbols_from_hunk_lines(
        self, file_path: str, hunk, language: str
    ) -> List[Symbol]:
        """Extract symbols from a hunk using comprehensive language-specific parsing.

        Uses the new extract_all_symbols method which extracts:
        1. Definitions (functions, types, etc. declared in this hunk)
        2. Usages (qualified references to external symbols)
        3. Import map (for dependency resolution)

        For the Change object, we store both definitions and usages.
        """
        # Collect all added lines for full-content parsing
        added_lines = []
        for line in hunk:
            if line.is_added:
                added_lines.append(line.value)

        if not added_lines:
            return []

        full_content = ''.join(added_lines)

        # Use the comprehensive symbol extraction
        definitions, usages, import_map = self.language_parser.extract_all_symbols(
            full_content, language, file_path, hunk.target_start
        )

        # Combine definitions and usages into a single list
        # The 'role' field distinguishes them
        all_symbols = definitions + usages

        # Add import symbols if we have imports
        if import_map:
            import_symbol = Symbol(
                name='import',
                type='import',
                file=file_path,
                line=hunk.target_start,
                role='definition'
            )
            all_symbols.append(import_symbol)

        # Deduplicate symbols by (name, type, role) - keep first occurrence
        seen = set()
        unique_symbols = []
        for sym in all_symbols:
            key = (sym.name, sym.type, sym.role, sym.package)
            if key not in seen:
                seen.add(key)
                unique_symbols.append(sym)

        return unique_symbols

    def _is_import_statement(self, line: str, language: str) -> bool:
        """Check if a line is an import statement using regex patterns.

        NOTE: These patterns are only used as a FALLBACK when tree-sitter
        doesn't detect imports. They should be conservative to avoid
        false positives.
        """
        import_patterns = {
            'go': [
                # Match "package/path" ONLY if it looks like a Go import path
                # Go import paths typically contain a domain or are stdlib-like
                # e.g., "fmt", "net/http", "github.com/user/repo", "bot-go/internal/..."
                # Exclude: "error", "repo", "class" (common JSON/log keys)
                r'^\s*"[a-z][a-z0-9_.-]*/[^"]+"\s*$',  # "pkg/subpkg" or "domain.com/..."
                r'^\s*"[a-z][a-z0-9_]+"\s*$',  # Simple stdlib like "fmt", "context"
                r'^\s*\w+\s+"[a-z][a-z0-9_.-]*/[^"]+"\s*$',  # aliased: foo "pkg/path"
                r'^\s*import\s+"[^"]+"',  # import "package"
                r'^\s*import\s+\w+\s+"[^"]+"',  # import alias "package"
                r'^\s*import\s+\(',  # import (
            ],
            'python': [
                r'^\s*import\s+\w+',
                r'^\s*from\s+\w+\s+import',
            ],
            'java': [
                r'^\s*import\s+[\w\.]+;',  # Escape the dot
            ],
            'javascript': [
                r'^\s*import\s+',
            ],
            'typescript': [
                r'^\s*import\s+',
            ],
            'rust': [
                r'^\s*use\s+[\w:]+',
            ],
            'c': [
                r'^\s*#include\s*[<"][^>"]+[>"]',
            ],
            'cpp': [
                r'^\s*#include\s*[<"][^>"]+[>"]',
            ],
        }

        patterns = import_patterns.get(language, [])
        for pattern in patterns:
            try:
                if re.match(pattern, line):
                    return True
            except re.error as e:
                # Skip invalid regex patterns
                print(f"Warning: Invalid regex pattern '{pattern}': {e}")
                continue
        return False

    def _determine_change_type_from_hunk(self, hunk) -> str:
        """Determine if hunk is add, modify, or delete."""
        has_additions = hunk.added > 0
        has_deletions = hunk.removed > 0

        if has_additions and has_deletions:
            return 'modify'
        elif has_additions:
            return 'add'
        else:
            return 'delete'

    def _parse_diff_fallback(self, diff_text: str) -> List[Change]:
        """Fallback parser for when unidiff fails."""
        changes = []
        current_file = None
        current_hunk = []
        hunk_idx = 0
        in_hunk = False

        lines = diff_text.split('\n')
        i = 0

        while i < len(lines):
            line = lines[i]

            if line.startswith('diff --git'):
                # New file
                if current_file and current_hunk:
                    # Save previous hunk
                    self._add_fallback_change(changes, current_file, hunk_idx, current_hunk)
                    hunk_idx += 1

                # Extract file path
                parts = line.split()
                if len(parts) >= 4:
                    current_file = parts[3].lstrip('b/')
                    hunk_idx = 0

            elif line.startswith('@@'):
                # New hunk
                if current_hunk and current_file:
                    self._add_fallback_change(changes, current_file, hunk_idx, current_hunk)
                    hunk_idx += 1

                current_hunk = [line]
                in_hunk = True

            elif in_hunk and (line.startswith('+') or line.startswith('-') or line.startswith(' ')):
                current_hunk.append(line)

            elif in_hunk and not line.startswith('\\'):
                # End of hunk
                if current_hunk and current_file:
                    self._add_fallback_change(changes, current_file, hunk_idx, current_hunk)
                    hunk_idx += 1
                current_hunk = []
                in_hunk = False

            i += 1

        # Add last hunk if any
        if current_hunk and current_file:
            self._add_fallback_change(changes, current_file, hunk_idx, current_hunk)

        return changes

    def _add_fallback_change(self, changes: List[Change], file_path: str, hunk_idx: int, hunk_lines: List[str]):
        """Add a change from fallback parser."""
        language = self._detect_language(file_path)
        hunk_content = '\n'.join(hunk_lines)

        # Count additions and deletions
        added = sum(1 for l in hunk_lines if l.startswith('+') and not l.startswith('+++'))
        deleted = sum(1 for l in hunk_lines if l.startswith('-') and not l.startswith('---'))

        # Determine type
        if added > 0 and deleted > 0:
            change_type = 'modify'
        elif added > 0:
            change_type = 'add'
        else:
            change_type = 'delete'

        # Extract line range from @@ header
        line_range = (0, 0)
        for line in hunk_lines:
            if line.startswith('@@'):
                match = re.search(r'\+(\d+),?(\d+)?', line)
                if match:
                    start = int(match.group(1))
                    length = int(match.group(2)) if match.group(2) else 1
                    line_range = (start, start + length)
                break

        # Extract symbols (simple approach for fallback)
        symbols = []
        for line in hunk_lines:
            if line.startswith('+') and not line.startswith('+++'):
                clean_line = line[1:].strip()
                line_symbols = self.language_parser.extract_symbols(
                    clean_line, language, file_path, line_range[0]
                )
                symbols.extend(line_symbols)

        change = Change(
            id=f"{file_path}:hunk_{hunk_idx}",
            file=file_path,
            hunk_id=hunk_idx,
            type=change_type,
            symbols=symbols,
            line_range=line_range,
            content=hunk_content,
            added_lines=added,
            deleted_lines=deleted
        )
        changes.append(change)


class DependencyAnalyzer:
    """Analyze dependencies between changes using two-phase symbol analysis.

    Phase 1: Build a symbol index from all definitions across all changes
    Phase 2: For each change, find usages and resolve them against the index

    This approach provides accurate cross-file dependency detection by:
    1. Extracting both definitions AND usages (with qualified names)
    2. Building a qualified name index (e.g., "smells.DetectorRegistry" -> change_id)
    3. Resolving usages to their defining changes via qualified name lookup
    4. Falling back to import-based package dependencies when symbol lookup fails
    """

    def __init__(self):
        self.language_parser = LanguageParser()

    def analyze_dependencies(
        self,
        changes: List[Change],
        codebase_context: Optional[Dict[str, str]] = None
    ) -> List[Dependency]:
        """Analyze dependencies between changes using two-phase approach.

        Args:
            changes: List of Change objects
            codebase_context: Optional dict mapping file paths to full file content

        Returns:
            List of Dependency objects
        """
        dependencies = []
        seen_deps = set()  # (source, target, type) to avoid duplicates

        print(f"  [DependencyAnalyzer] Analyzing {len(changes)} changes...")

        # Phase 1: Extract all symbols (definitions and usages) from all changes
        print(f"  [DependencyAnalyzer] Phase 1: Extracting symbols...")
        change_symbols = {}  # change_id -> (definitions, usages, import_map)
        for change in changes:
            definitions, usages, import_map = self._extract_all_symbols(change)
            change_symbols[change.id] = (definitions, usages, import_map)

        # Phase 2: Build qualified symbol index from definitions
        print(f"  [DependencyAnalyzer] Phase 2: Building symbol index...")
        symbol_index = self._build_qualified_symbol_index(changes, change_symbols)
        print(f"  [DependencyAnalyzer]   Index contains {len(symbol_index)} qualified symbols")

        # Phase 3: Build import path to change mapping for package-level dependencies
        print(f"  [DependencyAnalyzer] Phase 3: Building package index...")
        package_index = self._build_package_index(changes, change_symbols)
        print(f"  [DependencyAnalyzer]   Package index contains {len(package_index)} packages")

        # Phase 4: Resolve usages to dependencies
        print(f"  [DependencyAnalyzer] Phase 4: Resolving dependencies...")
        for change in changes:
            definitions, usages, import_map = change_symbols[change.id]

            # 4a: Symbol-level dependencies (qualified name lookup)
            for usage in usages:
                qualified_name = usage.get_qualified_name()

                # Try to find the defining change
                defining_change_id = symbol_index.get(qualified_name)

                if defining_change_id and defining_change_id != change.id:
                    dep_key = (change.id, defining_change_id, 'symbol')
                    if dep_key not in seen_deps:
                        seen_deps.add(dep_key)

                        # Determine strength based on change types
                        strength = self._calculate_dependency_strength(
                            change, changes, defining_change_id
                        )

                        dep = Dependency(
                            source=change.id,
                            target=defining_change_id,
                            type="defines_uses",
                            strength=strength,
                            reason=f"Uses {qualified_name} defined in {defining_change_id}"
                        )
                        dependencies.append(dep)

            # 4b: Package-level dependencies (fallback for unresolved symbols)
            for pkg_alias, full_path in import_map.items():
                # Find changes that define symbols in this package
                defining_changes = package_index.get(full_path, set())

                for defining_change_id in defining_changes:
                    if defining_change_id != change.id:
                        dep_key = (change.id, defining_change_id, 'package')
                        if dep_key not in seen_deps:
                            seen_deps.add(dep_key)

                            strength = self._calculate_dependency_strength(
                                change, changes, defining_change_id
                            )

                            dep = Dependency(
                                source=change.id,
                                target=defining_change_id,
                                type="import",
                                strength=strength,
                                reason=f"Imports package {full_path} which has definitions in {defining_change_id}"
                            )
                            dependencies.append(dep)

        print(f"  [DependencyAnalyzer] Found {len(dependencies)} dependencies")
        return dependencies

    def _extract_all_symbols(self, change: Change) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Extract definitions, usages, and imports from a change.

        Returns:
            Tuple of (definitions, usages, import_map)
        """
        # Get added lines from the change content
        lines = change.content.split('\n')
        added_lines = []
        for line in lines:
            if line.startswith('+') and not line.startswith('+++'):
                added_lines.append(line[1:])

        if not added_lines:
            return [], [], {}

        full_content = '\n'.join(added_lines)
        language = self._detect_language(change.file)

        # Use the new comprehensive symbol extraction
        definitions, usages, import_map = self.language_parser.extract_all_symbols(
            full_content, language, change.file, change.line_range[0]
        )

        return definitions, usages, import_map

    def _build_qualified_symbol_index(
        self,
        changes: List[Change],
        change_symbols: Dict[str, Tuple[List[Symbol], List[Symbol], Dict[str, str]]]
    ) -> Dict[str, str]:
        """Build an index mapping qualified symbol names to defining change IDs.

        Index structure:
        - "smells.DetectorRegistry" -> "internal/smells/registry.go:hunk_0"
        - "signals.ClassInfoExtractor" -> "internal/signals/extractor.go:hunk_0"
        """
        index = {}

        for change in changes:
            definitions, usages, import_map = change_symbols[change.id]

            # Get the package name for this file
            file_package = self._get_package_from_file(change.file)

            for symbol in definitions:
                # Create qualified name: package.SymbolName
                if file_package:
                    qualified_name = f"{file_package}.{symbol.name}"
                    index[qualified_name] = change.id

                # Also index by just the symbol name (for same-package references)
                # Use file:symbol as key to avoid conflicts
                index[f"{change.file}:{symbol.name}"] = change.id

        return index

    def _build_package_index(
        self,
        changes: List[Change],
        change_symbols: Dict[str, Tuple[List[Symbol], List[Symbol], Dict[str, str]]]
    ) -> Dict[str, Set[str]]:
        """Build an index mapping import paths to changes that define symbols in that package.

        Index structure:
        - "bot-go/internal/smells" -> {"internal/smells/registry.go:hunk_0", "internal/smells/detector.go:hunk_0"}
        """
        index = {}

        for change in changes:
            # Get the full import path for this file's package
            import_path = self._get_import_path_from_file(change.file)

            if import_path:
                if import_path not in index:
                    index[import_path] = set()
                index[import_path].add(change.id)

        return index

    def _get_package_from_file(self, file_path: str) -> Optional[str]:
        """Get the package/module name from a file path.

        For Go: internal/smells/registry.go -> "smells"
        For Python: mypackage/module.py -> "module"
        """
        # Get the parent directory name as the package
        parts = file_path.replace('\\', '/').split('/')
        if len(parts) >= 2:
            # Return the immediate parent directory
            return parts[-2]
        return None

    def _get_import_path_from_file(self, file_path: str) -> Optional[str]:
        """Get the full import path from a file path.

        For Go files in a project: internal/smells/registry.go
        Could map to: bot-go/internal/smells

        This is a heuristic - we use the directory path without the filename.
        """
        # Remove file extension and filename, keep directory path
        parts = file_path.replace('\\', '/').split('/')
        if len(parts) >= 2:
            # Return directory path (without filename)
            return '/'.join(parts[:-1])
        return None

    def _calculate_dependency_strength(
        self,
        source_change: Change,
        all_changes: List[Change],
        target_change_id: str
    ) -> float:
        """Calculate dependency strength based on change types.

        Returns:
            1.0 for critical dependencies (existing code modifications)
            0.8 for orderable dependencies (both are new additions)
        """
        # Find target change
        target_change = None
        for c in all_changes:
            if c.id == target_change_id:
                target_change = c
                break

        if not target_change:
            return 1.0

        # If both changes are new additions, they can be ordered but don't need to be atomic
        both_new = source_change.type == 'add' and target_change.type == 'add'

        if both_new:
            return 0.8  # Can be split with proper ordering
        else:
            return 1.0  # Critical - must be together or strictly ordered

    def _build_symbol_index(self, changes: List[Change]) -> Dict[str, List[Change]]:
        """Build an index of symbol names to changes that define them.

        DEPRECATED: Use _build_qualified_symbol_index instead.
        Kept for backward compatibility.
        """
        index = {}

        for change in changes:
            if change.type in ['add', 'modify']:
                for symbol in change.symbols:
                    if symbol.type in ['function', 'class', 'method', 'type', 'interface']:
                        if symbol.name not in index:
                            index[symbol.name] = []
                        index[symbol.name].append(change)

        return index

    def _find_used_symbols(
        self,
        change: Change,
        codebase_context: Optional[Dict[str, str]] = None
    ) -> List[Symbol]:
        """Find symbols that are used (referenced) in this change.

        DEPRECATED: Use _extract_all_symbols instead which returns
        both definitions and usages with qualified names.
        """
        used_symbols = []

        # Parse the change content to find function calls, variable references, etc.
        lines = change.content.split('\n')

        # Collect all added lines for full parsing
        added_lines = []
        for line in lines:
            if line.startswith('+') and not line.startswith('+++'):
                added_lines.append(line[1:])

        # Use language parser to extract type usages from full content
        if added_lines:
            full_content = '\n'.join(added_lines)
            language = self._detect_language(change.file)

            # Extract symbols with definitions_only=False to get usages
            type_usages = self.language_parser.extract_symbols(
                full_content,
                language,
                change.file,
                change.line_range[0],
                definitions_only=False
            )
            used_symbols.extend(type_usages)

        # Also find function calls line by line
        for line in lines:
            if line.startswith('+') and not line.startswith('+++'):
                clean_line = line[1:]

                # Find function calls (simple regex-based approach)
                # Pattern: identifier followed by (
                function_calls = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', clean_line)

                for func_name in function_calls:
                    # Skip common keywords
                    if func_name not in ['if', 'for', 'while', 'def', 'class', 'return']:
                        symbol = Symbol(
                            name=func_name,
                            type='function',
                            file=change.file,
                            line=change.line_range[0]
                        )
                        used_symbols.append(symbol)

        return used_symbols

    def _detect_language(self, file_path: str) -> str:
        """Detect language from file extension."""
        if file_path.endswith('.go'):
            return 'go'
        elif file_path.endswith('.py'):
            return 'python'
        elif file_path.endswith(('.js', '.jsx')):
            return 'javascript'
        elif file_path.endswith(('.ts', '.tsx')):
            return 'typescript'
        elif file_path.endswith('.java'):
            return 'java'
        elif file_path.endswith('.rs'):
            return 'rust'
        elif file_path.endswith(('.c', '.h')):
            return 'c'
        elif file_path.endswith(('.cpp', '.cc', '.hpp')):
            return 'cpp'
        return 'unknown'

    def _extract_imported_packages(self, change: Change, language: str) -> Set[str]:
        """
        Extract package/module names that are imported in this change.

        Returns a set of package names, e.g.:
        - Go: {"fmt", "os", "bot-go/internal/db"}
        - Python: {"os", "sys", "mypackage.module"}
        - Java: {"java.util", "com.example.MyClass"}
        """
        packages = set()

        # Language-specific import extraction patterns
        import_patterns = {
            'go': [
                r'^\+\s*"([^"]+)"',  # import "package"
                r'^\+\s*import\s+"([^"]+)"',  # import "package"
                r'^\+\s*import\s+\(\s*$',  # import ( - will extract from next lines
            ],
            'python': [
                r'^\+\s*import\s+([a-zA-Z0-9_.]+)',  # import module
                r'^\+\s*from\s+([a-zA-Z0-9_.]+)\s+import',  # from module import
            ],
            'java': [
                r'^\+\s*import\s+([a-zA-Z0-9_.]+)',  # import package.Class;
            ],
            'javascript': [
                r'^\+\s*import\s+.*from\s+[\'"]([^\'"]+)[\'"]',  # import ... from "module"
                r'^\+\s*import\s+[\'"]([^\'"]+)[\'"]',  # import "module"
            ],
            'typescript': [
                r'^\+\s*import\s+.*from\s+[\'"]([^\'"]+)[\'"]',  # import ... from "module"
                r'^\+\s*import\s+[\'"]([^\'"]+)[\'"]',  # import "module"
            ],
            'rust': [
                r'^\+\s*use\s+([a-zA-Z0-9_:]+)',  # use crate::module
            ],
            'cpp': [
                r'^\+\s*#include\s*[<"]([^>"]+)[>"]',  # #include <header> or "header"
            ],
            'c': [
                r'^\+\s*#include\s*[<"]([^>"]+)[>"]',  # #include <header> or "header"
            ],
        }

        patterns = import_patterns.get(language, [])

        for line in change.content.split('\n'):
            if line.startswith('+'):
                for pattern in patterns:
                    match = re.search(pattern, line)
                    if match and match.lastindex and match.lastindex >= 1:
                        # Only extract if there's a capture group
                        package_name = match.group(1)
                        packages.add(package_name)

        return packages

    def _extract_package_usages(self, change: Change, language: str) -> Set[str]:
        """
        Extract package prefixes and symbols used in code that might require imports.

        Examples:
        - Go: db.NewConnection() → "db"
        - Python: os.path.join() → "os"
        - Java: List<String> → "List"
        - C/C++: sha256.Sum256() → "sha256"
        """
        usages = set()

        if language == 'go':
            # Pattern: package_name.SymbolName (package starts with lowercase or uppercase)
            for line in change.content.split('\n'):
                if line.startswith('+'):
                    # Find all package.Symbol patterns
                    matches = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\.[A-Z]', line)
                    usages.update(matches)
                    # Also find lowercase package references (e.g., db.Open())
                    matches = re.findall(r'\b([a-z][a-z0-9_]*)\.[a-zA-Z]', line)
                    usages.update(matches)

        elif language == 'python':
            # Pattern: module.function or module.Class
            for line in change.content.split('\n'):
                if line.startswith('+'):
                    matches = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\.[a-zA-Z]', line)
                    usages.update(matches)

        elif language in ['java', 'javascript', 'typescript']:
            # For Java/JS/TS, check for type names and function calls
            for line in change.content.split('\n'):
                if line.startswith('+'):
                    # Find capitalized identifiers (likely types)
                    matches = re.findall(r'\b([A-Z][a-zA-Z0-9_]*)', line)
                    usages.update(matches)

        elif language in ['c', 'cpp']:
            # For C/C++, look for function calls and type usage
            for line in change.content.split('\n'):
                if line.startswith('+'):
                    # Find symbols followed by ( or used as types
                    matches = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', line)
                    usages.update(matches)

        # Also check symbols extracted by tree-sitter
        for symbol in change.symbols:
            if symbol.type in ['type', 'class', 'interface']:
                # Type usage might need an import
                usages.add(symbol.name)

        return usages

    def _classify_import_type(self, package: str, language: str) -> str:
        """Classify an import as stdlib, external, or internal.

        Returns:
            'stdlib': Standard library (no dependency constraint needed)
            'external': Third-party package (no dependency in diff)
            'internal': Internal package (may need dependency constraint)
        """
        # Standard library patterns by language
        stdlib_patterns = {
            'go': [
                'fmt', 'os', 'io', 'net', 'http', 'strings', 'strconv',
                'time', 'context', 'sync', 'errors', 'log', 'path',
                'encoding', 'crypto', 'sort', 'math', 'reflect', 'regexp',
                'bytes', 'bufio', 'unicode', 'testing', 'flag', 'runtime',
            ],
            'python': [
                'os', 'sys', 'io', 're', 'json', 'time', 'datetime',
                'collections', 'itertools', 'functools', 'typing', 'abc',
                'pathlib', 'logging', 'unittest', 'argparse', 'subprocess',
                'threading', 'multiprocessing', 'socket', 'http', 'urllib',
            ],
            'java': [
                'java.', 'javax.', 'sun.', 'com.sun.',
            ],
            'javascript': [],  # JS has no stdlib in the traditional sense
            'typescript': [],
            'rust': [
                'std::', 'core::', 'alloc::',
            ],
            'c': [
                'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'time.h',
                'ctype.h', 'errno.h', 'limits.h', 'stddef.h', 'stdint.h',
            ],
            'cpp': [
                'iostream', 'vector', 'string', 'map', 'set', 'algorithm',
                'memory', 'functional', 'thread', 'mutex', 'chrono',
                'cstdio', 'cstdlib', 'cstring', 'cmath',
            ],
        }

        # Check if it's a stdlib import
        patterns = stdlib_patterns.get(language, [])
        package_lower = package.lower()
        package_base = package.split('/')[-1].split('.')[0]

        for pattern in patterns:
            if package_lower.startswith(pattern) or package_base == pattern:
                return 'stdlib'

        # Check for common external package indicators
        external_indicators = [
            'github.com/', 'gitlab.com/', 'bitbucket.org/',  # Go modules
            'golang.org/', 'google.golang.org/',
            'node_modules/', '@',  # JS/TS packages
            'com.google.', 'org.apache.', 'io.netty.',  # Java packages
        ]

        for indicator in external_indicators:
            if indicator in package:
                return 'external'

        # Default to internal (project-local imports)
        return 'internal'

    def _analyze_import_dependencies(self, changes: List[Change]) -> List[Dependency]:
        """
        Analyze import/include dependencies with improved strength calculation.

        Rule: If hunk B uses a package/symbol imported by hunk A,
        then B depends on A (B must come after A or be in the same patch).

        Strength levels:
        - 1.0: Modifying existing code that uses imports (critical)
        - 0.8: New code depending on new imports (can be ordered but not atomic)
        - 0.0: Stdlib/external imports (no constraint from this diff)
        """
        dependencies = []

        # Build a map of change_id -> change for quick lookup
        change_map = {c.id: c for c in changes}

        # Group changes by file
        file_changes = {}
        for change in changes:
            if change.file not in file_changes:
                file_changes[change.file] = []
            file_changes[change.file].append(change)

        # For each file, analyze import dependencies
        for file_path, changes_in_file in file_changes.items():
            language = self._detect_language(file_path)

            # Step 1: Find all import hunks and what they import
            import_hunks = {}  # change_id -> set of package names
            for change in changes_in_file:
                if any(s.type == 'import' for s in change.symbols):
                    packages = self._extract_imported_packages(change, language)
                    if packages:
                        import_hunks[change.id] = packages

            # Step 2: For each non-import hunk, check if it uses imported packages
            for change in changes_in_file:
                if change.id not in import_hunks:  # Not an import hunk itself
                    usages = self._extract_package_usages(change, language)

                    if not usages:
                        continue

                    # Step 3: Create dependencies to import hunks
                    for import_change_id, imported_packages in import_hunks.items():
                        matched_packages = set()
                        import_types = set()  # Track what types of imports we're matching

                        if language == 'go':
                            # For Go, extract the last part of import path
                            # "bot-go/internal/db" → "db"
                            # "crypto/sha256" → "sha256"
                            for pkg in imported_packages:
                                pkg_base = pkg.split('/')[-1]
                                if pkg_base in usages:
                                    matched_packages.add(pkg_base)
                                    import_types.add(self._classify_import_type(pkg, language))

                        elif language in ['python', 'java', 'javascript', 'typescript', 'rust']:
                            # For these languages, check direct package name matches
                            for usage in usages:
                                for pkg in imported_packages:
                                    if usage == pkg or pkg.startswith(usage + '.') or usage in pkg.split('.'):
                                        matched_packages.add(usage)
                                        import_types.add(self._classify_import_type(pkg, language))

                        elif language in ['c', 'cpp']:
                            # For C/C++, match header names with function names
                            for pkg in imported_packages:
                                header_base = pkg.replace('.h', '').replace('.hpp', '')
                                if header_base in usages:
                                    matched_packages.add(header_base)
                                    import_types.add(self._classify_import_type(pkg, language))

                        if matched_packages:
                            # Determine strength based on:
                            # 1. Type of import (internal vs stdlib/external)
                            # 2. Whether both changes are new additions

                            # Skip stdlib/external-only imports (no constraint needed)
                            if import_types == {'stdlib'} or import_types == {'external'}:
                                continue

                            # Get the source and target changes
                            source_change = change_map.get(change.id)
                            target_change = change_map.get(import_change_id)

                            # Determine if both are new files/additions
                            both_new = (
                                source_change and target_change and
                                source_change.type == 'add' and target_change.type == 'add'
                            )

                            # Calculate strength
                            if both_new:
                                # Both changes are new - they can be split with proper ordering
                                # Lower strength allows topological ordering without atomic grouping
                                strength = 0.8
                                reason_suffix = " (both new, can be ordered)"
                            else:
                                # Modifying existing code - must be together or ordered strictly
                                strength = 1.0
                                reason_suffix = " (critical - existing code)"

                            dep = Dependency(
                                source=change.id,  # Code hunk depends on import
                                target=import_change_id,  # Import hunk
                                type='import',
                                strength=strength,
                                reason=f"{change.id} uses packages {matched_packages} imported by {import_change_id}{reason_suffix}"
                            )
                            dependencies.append(dep)

        return dependencies

    def _analyze_call_dependencies(self, changes: List[Change]) -> List[Dependency]:
        """Analyze function call dependencies with improved strength calculation.

        Strength levels:
        - 1.0: Modifying existing code that calls a function (critical)
        - 0.8: New code calling new functions (can be ordered but not atomic)
        """
        dependencies = []

        # Build a map of change_id -> change for quick lookup
        change_map = {c.id: c for c in changes}

        # Build map of function definitions
        function_defs = {}
        for change in changes:
            for symbol in change.symbols:
                if symbol.type in ['function', 'method']:
                    function_defs[symbol.name] = change.id

        # Find call dependencies
        for change in changes:
            used_symbols = self._find_used_symbols(change, None)

            for symbol in used_symbols:
                if symbol.name in function_defs:
                    target_change_id = function_defs[symbol.name]

                    if target_change_id != change.id:
                        # Check if both changes are new additions
                        source_change = change_map.get(change.id)
                        target_change = change_map.get(target_change_id)

                        both_new = (
                            source_change and target_change and
                            source_change.type == 'add' and target_change.type == 'add'
                        )

                        if both_new:
                            # Both changes are new - can be split with proper ordering
                            strength = 0.8
                            reason_suffix = " (both new, can be ordered)"
                        else:
                            # Modifying existing code - critical dependency
                            strength = 1.0
                            reason_suffix = " (critical - existing code)"

                        dep = Dependency(
                            source=change.id,
                            target=target_change_id,
                            type='call_chain',
                            strength=strength,
                            reason=f"{change.id} calls function {symbol.name} defined in {target_change_id}{reason_suffix}"
                        )
                        dependencies.append(dep)

        return dependencies
