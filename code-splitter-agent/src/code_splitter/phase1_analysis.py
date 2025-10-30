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
        """Extract symbols from a hunk using language-specific parsing."""
        symbols = []
        current_line = hunk.target_start

        for line in hunk:
            if line.is_added:
                # This is an added line
                clean_line = line.value.strip()

                # Use language parser to extract symbols
                line_symbols = self.language_parser.extract_symbols(
                    clean_line, language, file_path, current_line
                )
                symbols.extend(line_symbols)
                current_line += 1
            elif not line.is_removed:
                current_line += 1

        return symbols

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
    """Analyze dependencies between changes."""

    def __init__(self):
        self.language_parser = LanguageParser()

    def analyze_dependencies(
        self,
        changes: List[Change],
        codebase_context: Optional[Dict[str, str]] = None
    ) -> List[Dependency]:
        """Analyze dependencies between changes.

        Args:
            changes: List of Change objects
            codebase_context: Optional dict mapping file paths to full file content

        Returns:
            List of Dependency objects
        """
        dependencies = []

        # Build symbol index: symbol -> change that defines/modifies it
        symbol_definitions = self._build_symbol_index(changes)

        # Find dependencies
        for change in changes:
            # Check if this change uses any symbols defined in other changes
            used_symbols = self._find_used_symbols(change, codebase_context)

            for used_symbol in used_symbols:
                # Find which change defines this symbol
                defining_changes = symbol_definitions.get(used_symbol.name, [])

                for def_change in defining_changes:
                    if def_change.id != change.id:
                        dep = Dependency(
                            source=change.id,
                            target=def_change.id,
                            type="defines_uses",
                            strength=1.0,
                            reason=f"{change.id} uses {used_symbol.name} defined in {def_change.id}"
                        )
                        dependencies.append(dep)

        # Analyze import dependencies
        import_deps = self._analyze_import_dependencies(changes)
        dependencies.extend(import_deps)

        # Analyze call chain dependencies
        call_deps = self._analyze_call_dependencies(changes)
        dependencies.extend(call_deps)

        return dependencies

    def _build_symbol_index(self, changes: List[Change]) -> Dict[str, List[Change]]:
        """Build an index of symbol names to changes that define them."""
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
        """Find symbols that are used (referenced) in this change."""
        used_symbols = []

        # Parse the change content to find function calls, variable references, etc.
        lines = change.content.split('\n')

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

    def _analyze_import_dependencies(self, changes: List[Change]) -> List[Dependency]:
        """Analyze import/include dependencies."""
        dependencies = []

        # Group changes by file
        file_changes = {}
        for change in changes:
            if change.file not in file_changes:
                file_changes[change.file] = []
            file_changes[change.file].append(change)

        # Look for import statements
        for change in changes:
            if any(s.type == 'import' for s in change.symbols):
                # This change adds/modifies imports
                # Find changes in the same file that use code
                for other_change in file_changes.get(change.file, []):
                    if other_change.id != change.id and other_change.type != 'delete':
                        dep = Dependency(
                            source=other_change.id,
                            target=change.id,
                            type='import',
                            strength=0.9,
                            reason=f"Import changes should come before usage"
                        )
                        dependencies.append(dep)

        return dependencies

    def _analyze_call_dependencies(self, changes: List[Change]) -> List[Dependency]:
        """Analyze function call dependencies."""
        dependencies = []

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
                        dep = Dependency(
                            source=change.id,
                            target=target_change_id,
                            type='call_chain',
                            strength=1.0,
                            reason=f"{change.id} calls function {symbol.name} defined in {target_change_id}"
                        )
                        dependencies.append(dep)

        return dependencies
