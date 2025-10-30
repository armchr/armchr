"""Language-specific parsing support using tree-sitter."""

import re
from typing import List, Optional
from .models import Symbol


class LanguageParser:
    """Multi-language parser using tree-sitter and regex fallbacks."""

    def __init__(self):
        self._parsers = {}
        self._init_parsers()

    def _init_parsers(self):
        """Initialize tree-sitter parsers for supported languages."""
        try:
            from tree_sitter import Language, Parser

            # Try to import language modules
            language_modules = {}
            try:
                import tree_sitter_python as tspython
                language_modules['python'] = tspython
            except ImportError:
                pass

            try:
                import tree_sitter_javascript as tsjavascript
                language_modules['javascript'] = tsjavascript
            except ImportError:
                pass

            try:
                import tree_sitter_typescript as tstypescript
                # TypeScript has two variants
                language_modules['typescript'] = tstypescript
                language_modules['tsx'] = tstypescript  # TSX uses same module
            except ImportError:
                pass

            try:
                import tree_sitter_java as tsjava
                language_modules['java'] = tsjava
            except ImportError:
                pass

            try:
                import tree_sitter_go as tsgo
                language_modules['go'] = tsgo
            except ImportError:
                pass

            try:
                import tree_sitter_rust as tsrust
                language_modules['rust'] = tsrust
            except ImportError:
                pass

            try:
                import tree_sitter_c as tsc
                language_modules['c'] = tsc
            except ImportError:
                pass

            try:
                import tree_sitter_cpp as tscpp
                language_modules['cpp'] = tscpp
            except ImportError:
                pass

            # Initialize parsers for each available language
            for lang_name, module in language_modules.items():
                try:
                    # Special handling for TypeScript which has two variants
                    if lang_name == 'typescript':
                        if hasattr(module, 'language_typescript'):
                            lang_capsule = module.language_typescript()
                            language = Language(lang_capsule)
                        elif hasattr(module, 'language'):
                            language = module.language()
                        elif hasattr(module, 'Language'):
                            language = module.Language()
                        else:
                            print(f"Warning: Could not get language for {lang_name}")
                            continue
                    elif lang_name == 'tsx':
                        if hasattr(module, 'language_tsx'):
                            lang_capsule = module.language_tsx()
                            language = Language(lang_capsule)
                        else:
                            # TSX not available, skip
                            continue
                    # Try new API first (0.21+)
                    elif hasattr(module, 'language'):
                        lang_capsule = module.language()
                        # Newer versions return PyCapsule, wrap in Language
                        try:
                            language = Language(lang_capsule)
                        except TypeError:
                            # Already a Language object
                            language = lang_capsule
                    # Try old API
                    elif hasattr(module, 'Language'):
                        language = module.Language()
                    else:
                        print(f"Warning: Could not get language for {lang_name}")
                        continue

                    parser = Parser(language)
                    self._parsers[lang_name] = parser
                except Exception as e:
                    print(f"Warning: Failed to initialize parser for {lang_name}: {e}")
                    continue

        except ImportError as e:
            # Tree-sitter not available, will fall back to regex
            print(f"Warning: tree-sitter not fully available: {e}")
            print("Falling back to regex-based parsing")
        except Exception as e:
            print(f"Warning: Error initializing tree-sitter: {e}")
            print("Falling back to regex-based parsing")

    def extract_symbols(
        self,
        code: str,
        language: str,
        file_path: str,
        line_number: int
    ) -> List[Symbol]:
        """Extract symbols from a line of code.

        Args:
            code: The code line
            language: Programming language
            file_path: File path
            line_number: Line number in the file

        Returns:
            List of Symbol objects
        """
        if language in self._parsers:
            return self._extract_with_treesitter(code, language, file_path, line_number)
        else:
            return self._extract_with_regex(code, language, file_path, line_number)

    def _extract_with_treesitter(
        self,
        code: str,
        language: str,
        file_path: str,
        line_number: int
    ) -> List[Symbol]:
        """Extract symbols using tree-sitter parser."""
        symbols = []
        parser = self._parsers.get(language)

        if not parser:
            return self._extract_with_regex(code, language, file_path, line_number)

        try:
            tree = parser.parse(bytes(code, 'utf8'))
            root_node = tree.root_node

            # Traverse the tree and extract relevant nodes
            symbols = self._traverse_tree(root_node, code, language, file_path, line_number)
        except Exception as e:
            # Fall back to regex on error
            print(f"Tree-sitter parse error: {e}, falling back to regex")
            symbols = self._extract_with_regex(code, language, file_path, line_number)

        return symbols

    def _traverse_tree(
        self,
        node,
        code: str,
        language: str,
        file_path: str,
        line_number: int
    ) -> List[Symbol]:
        """Traverse tree-sitter AST and extract symbols."""
        symbols = []

        # Define node types to look for based on language
        symbol_types = {
            'python': {
                'function_definition': 'function',
                'class_definition': 'class',
                'import_statement': 'import',
                'import_from_statement': 'import',
            },
            'javascript': {
                'function_declaration': 'function',
                'class_declaration': 'class',
                'method_definition': 'method',
                'import_statement': 'import',
            },
            'typescript': {
                'function_declaration': 'function',
                'class_declaration': 'class',
                'method_definition': 'method',
                'interface_declaration': 'interface',
                'type_alias_declaration': 'type',
                'import_statement': 'import',
            },
            'java': {
                'method_declaration': 'method',
                'class_declaration': 'class',
                'interface_declaration': 'interface',
                'import_declaration': 'import',
            },
            'go': {
                'function_declaration': 'function',
                'method_declaration': 'method',
                'type_declaration': 'type',
                'import_declaration': 'import',
            },
            'rust': {
                'function_item': 'function',
                'struct_item': 'type',
                'enum_item': 'type',
                'trait_item': 'interface',
                'use_declaration': 'import',
            },
        }

        type_map = symbol_types.get(language, {})

        def visit(node):
            node_type = node.type
            if node_type in type_map:
                # Extract the symbol name
                name_node = None
                for child in node.children:
                    if child.type in ['identifier', 'type_identifier', 'name']:
                        name_node = child
                        break

                if name_node:
                    symbol_name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=symbol_name,
                        type=type_map[node_type],
                        file=file_path,
                        line=line_number
                    )
                    symbols.append(symbol)

            # Recursively visit children
            for child in node.children:
                visit(child)

        visit(node)
        return symbols

    def _extract_with_regex(
        self,
        code: str,
        language: str,
        file_path: str,
        line_number: int
    ) -> List[Symbol]:
        """Extract symbols using regex patterns (fallback method)."""
        symbols = []

        patterns = {
            'python': [
                (r'^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'function'),
                (r'^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'class'),
                (r'^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)', 'import'),
                (r'^\s*from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import', 'import'),
            ],
            'javascript': [
                (r'^\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'function'),
                (r'^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'class'),
                (r'^\s*const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function', 'function'),
                (r'^\s*const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\(', 'function'),
                (r'^\s*import\s+.*from\s+[\'"]([^\'"]+)[\'"]', 'import'),
            ],
            'typescript': [
                (r'^\s*function\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'function'),
                (r'^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'class'),
                (r'^\s*interface\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'interface'),
                (r'^\s*type\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'type'),
                (r'^\s*const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=', 'variable'),
                (r'^\s*import\s+.*from\s+[\'"]([^\'"]+)[\'"]', 'import'),
            ],
            'java': [
                (r'^\s*public\s+class\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'class'),
                (r'^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'class'),
                (r'^\s*interface\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'interface'),
                (r'^\s*public\s+\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'method'),
                (r'^\s*private\s+\w+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', 'method'),
                (r'^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)', 'import'),
            ],
            'go': [
                (r'^\s*func\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'function'),
                (r'^\s*type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+struct', 'type'),
                (r'^\s*type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+interface', 'interface'),
                (r'^\s*import\s+[\'"]([^\'"]+)[\'"]', 'import'),
            ],
            'rust': [
                (r'^\s*fn\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'function'),
                (r'^\s*struct\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'type'),
                (r'^\s*enum\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'type'),
                (r'^\s*trait\s+([a-zA-Z_][a-zA-Z0-9_]*)', 'interface'),
                (r'^\s*use\s+([a-zA-Z_][a-zA-Z0-9_:]*)', 'import'),
            ],
        }

        lang_patterns = patterns.get(language, [])

        for pattern, symbol_type in lang_patterns:
            matches = re.finditer(pattern, code)
            for match in matches:
                symbol_name = match.group(1)
                symbol = Symbol(
                    name=symbol_name,
                    type=symbol_type,
                    file=file_path,
                    line=line_number
                )
                symbols.append(symbol)

        return symbols

    def find_references(
        self,
        symbol_name: str,
        code: str,
        language: str
    ) -> List[int]:
        """Find all line numbers where a symbol is referenced.

        Args:
            symbol_name: Symbol to search for
            code: Full code content
            language: Programming language

        Returns:
            List of line numbers where symbol is referenced
        """
        references = []
        lines = code.split('\n')

        # Simple regex search for symbol usage
        pattern = rf'\b{re.escape(symbol_name)}\b'

        for i, line in enumerate(lines, 1):
            if re.search(pattern, line):
                references.append(i)

        return references
