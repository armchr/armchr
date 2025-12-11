"""Language-specific parsing support using tree-sitter."""

import re
from typing import List, Optional, Dict, Set, Tuple
from .models import Symbol


class LanguageParser:
    """Multi-language parser using tree-sitter and regex fallbacks.

    This parser extracts both symbol definitions and symbol usages from code.
    Usages include qualified names (e.g., package.Symbol) which are essential
    for cross-file dependency analysis.
    """

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
        line_number: int,
        definitions_only: bool = True
    ) -> List[Symbol]:
        """Extract symbols from a line of code.

        Args:
            code: The code line
            language: Programming language
            file_path: File path
            line_number: Line number in the file
            definitions_only: If True, only extract definitions (default). If False, also extract usages.

        Returns:
            List of Symbol objects
        """
        if language in self._parsers:
            return self._extract_with_treesitter(code, language, file_path, line_number, definitions_only)
        else:
            return self._extract_with_regex(code, language, file_path, line_number)

    def _extract_with_treesitter(
        self,
        code: str,
        language: str,
        file_path: str,
        line_number: int,
        definitions_only: bool = True
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
            symbols = self._traverse_tree(root_node, code, language, file_path, line_number, definitions_only)
        except Exception as e:
            # Fall back to regex on error
            print(f"Tree-sitter parse error: {e}, falling back to regex")
            symbols = self._extract_with_regex(code, language, file_path, line_number)

        return symbols

    def _find_identifier_node(self, node, max_depth=3, node_context=None):
        """
        Recursively find the first identifier node in the subtree.

        Args:
            node: The tree-sitter node to search
            max_depth: Maximum recursion depth
            node_context: The parent node type for context-aware searching

        Returns:
            The first identifier/type_identifier/name node found, or None
        """
        def search(n, depth=0):
            if depth > max_depth:
                return None

            # For method_declaration, look specifically for field_identifier (the method name)
            # Skip the first parameter_list (receiver) and find field_identifier
            if node_context == 'method_declaration' and n.type == 'field_identifier':
                return n

            # Check if this is an identifier node
            if n.type in ['identifier', 'type_identifier', 'name', 'field_identifier']:
                # For method declarations, skip identifiers in the first parameter_list (receiver)
                if node_context == 'method_declaration':
                    # Check if this node is inside a parameter_list
                    parent = n
                    while parent and parent != node:
                        if parent.type == 'parameter_list':
                            # This is inside a parameter list, skip it
                            return None
                        parent = getattr(parent, 'parent', None)

                return n

            # Search children
            for child in n.children:
                result = search(child, depth + 1)
                if result:
                    return result

            return None

        return search(node)

    def _extract_type_usages(self, node, code: str, file_path: str, line_number: int) -> List[Symbol]:
        """
        Extract all type_identifier nodes that represent type usages (not definitions).
        This captures types used in fields, parameters, return types, etc.
        """
        usages = []
        defining_types = set()

        def collect_definitions(n):
            """Collect type names being defined (to exclude from usages)."""
            if n.type == 'type_declaration':
                # Find the type being defined
                id_node = self._find_identifier_node(n, max_depth=2)
                if id_node:
                    defining_types.add(code[id_node.start_byte:id_node.end_byte])

            for child in n.children:
                collect_definitions(child)

        def collect_usages(n, in_definition=False):
            """Collect type_identifier nodes that are usages."""
            # Mark if we're inside a type being defined
            if n.type == 'type_spec':
                in_definition = True

            # type_identifier nodes are type usages (unless it's the defining name)
            if n.type == 'type_identifier':
                type_name = code[n.start_byte:n.end_byte]
                # Skip if this is the first occurrence in a type_spec (the definition)
                if not (in_definition and type_name in defining_types):
                    usages.append(Symbol(
                        name=type_name,
                        type='type',
                        file=file_path,
                        line=line_number
                    ))
                # After seeing it once in definition, don't skip it anymore
                if in_definition and type_name in defining_types:
                    in_definition = False

            for child in n.children:
                collect_usages(child, in_definition)

        collect_definitions(node)
        collect_usages(node)

        return usages

    def _traverse_tree(
        self,
        node,
        code: str,
        language: str,
        file_path: str,
        line_number: int,
        definitions_only: bool = True
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
                # Extract the symbol name using recursive search
                # Pass node type as context for better extraction
                name_node = self._find_identifier_node(node, node_context=node_type)

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

        # ALSO extract type usages (for Go and other statically-typed languages)
        # Only if definitions_only is False
        if not definitions_only and language in ['go', 'typescript', 'java', 'rust', 'cpp', 'c']:
            type_usages = self._extract_type_usages(node, code, file_path, line_number)
            symbols.extend(type_usages)

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

    def extract_all_symbols(
        self,
        code: str,
        language: str,
        file_path: str,
        base_line_number: int = 1
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Extract all symbols from code: definitions, usages, and imports.

        This is the main entry point for comprehensive symbol extraction.
        It returns:
        1. Definition symbols (functions, types, etc. declared in this code)
        2. Usage symbols (qualified references to external symbols)
        3. Import map (alias -> full package path)

        Args:
            code: The source code to analyze
            language: Programming language
            file_path: File path for symbol attribution
            base_line_number: Starting line number for the code block

        Returns:
            Tuple of (definitions, usages, import_map)
        """
        if language == 'go':
            return self._extract_go_symbols(code, file_path, base_line_number)
        elif language == 'python':
            return self._extract_python_symbols(code, file_path, base_line_number)
        elif language in ['javascript', 'typescript']:
            return self._extract_js_ts_symbols(code, language, file_path, base_line_number)
        elif language == 'java':
            return self._extract_java_symbols(code, file_path, base_line_number)
        else:
            # Fallback to basic extraction
            definitions = self.extract_symbols(code, language, file_path, base_line_number, definitions_only=True)
            return definitions, [], {}

    def _extract_go_symbols(
        self,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Extract symbols from Go code using tree-sitter.

        Go-specific extraction that handles:
        - Function and method declarations
        - Type declarations (struct, interface)
        - Import statements with aliases
        - Qualified usages (package.Symbol)
        - Type usages in fields, parameters, return types
        - Function calls (package.Function())
        """
        definitions = []
        usages = []
        import_map = {}  # alias -> full import path

        parser = self._parsers.get('go')
        if not parser:
            # Fallback to regex
            return self._extract_go_symbols_regex(code, file_path, base_line_number)

        try:
            tree = parser.parse(bytes(code, 'utf8'))
            root_node = tree.root_node

            # First pass: collect imports
            import_map = self._extract_go_imports(root_node, code)

            # Second pass: collect definitions
            definitions = self._extract_go_definitions(root_node, code, file_path, base_line_number)

            # Third pass: collect usages (qualified names)
            usages = self._extract_go_usages(root_node, code, file_path, base_line_number, import_map, definitions)

        except Exception as e:
            print(f"Tree-sitter Go parse error: {e}, falling back to regex")
            return self._extract_go_symbols_regex(code, file_path, base_line_number)

        return definitions, usages, import_map

    def _extract_go_imports(self, root_node, code: str) -> Dict[str, str]:
        """Extract Go import statements and build alias -> path map."""
        import_map = {}

        def visit(node):
            if node.type == 'import_declaration':
                # Handle both single imports and import blocks
                for child in node.children:
                    if child.type == 'import_spec':
                        self._process_go_import_spec(child, code, import_map)
                    elif child.type == 'import_spec_list':
                        for spec in child.children:
                            if spec.type == 'import_spec':
                                self._process_go_import_spec(spec, code, import_map)

            for child in node.children:
                visit(child)

        visit(root_node)
        return import_map

    def _process_go_import_spec(self, spec_node, code: str, import_map: Dict[str, str]):
        """Process a single Go import spec."""
        alias = None
        path = None

        for child in spec_node.children:
            if child.type == 'package_identifier':
                alias = code[child.start_byte:child.end_byte]
            elif child.type == 'interpreted_string_literal':
                # Remove quotes
                path = code[child.start_byte:child.end_byte].strip('"')
            elif child.type == 'blank_identifier':
                alias = '_'
            elif child.type == 'dot':
                alias = '.'

        if path:
            # If no explicit alias, use the last part of the path
            if not alias:
                alias = path.split('/')[-1]
            import_map[alias] = path

    def _extract_go_definitions(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> List[Symbol]:
        """Extract Go symbol definitions."""
        definitions = []
        defined_names = set()

        def visit(node):
            symbol = None

            # Function declaration: func Name(...) { }
            if node.type == 'function_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='function',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)

            # Method declaration: func (r Receiver) Name(...) { }
            elif node.type == 'method_declaration':
                # Find field_identifier which is the method name
                name_node = self._find_child_by_type(node, 'field_identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    # Find receiver type for scope
                    receiver_type = self._find_go_receiver_type(node, code)
                    symbol = Symbol(
                        name=name,
                        type='method',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition',
                        scope=receiver_type
                    )
                    defined_names.add(name)

            # Type declaration: type Name struct/interface { }
            elif node.type == 'type_declaration':
                for child in node.children:
                    if child.type == 'type_spec':
                        name_node = self._find_child_by_type(child, 'type_identifier')
                        if name_node:
                            name = code[name_node.start_byte:name_node.end_byte]
                            # Determine if it's struct, interface, or type alias
                            type_kind = 'type'
                            for subchild in child.children:
                                if subchild.type == 'struct_type':
                                    type_kind = 'type'
                                elif subchild.type == 'interface_type':
                                    type_kind = 'interface'
                            symbol = Symbol(
                                name=name,
                                type=type_kind,
                                file=file_path,
                                line=base_line_number + child.start_point[0],
                                role='definition'
                            )
                            defined_names.add(name)

            # Const/var declarations
            elif node.type in ['const_declaration', 'var_declaration']:
                for child in node.children:
                    if child.type in ['const_spec', 'var_spec']:
                        name_node = self._find_child_by_type(child, 'identifier')
                        if name_node:
                            name = code[name_node.start_byte:name_node.end_byte]
                            symbol = Symbol(
                                name=name,
                                type='variable',
                                file=file_path,
                                line=base_line_number + child.start_point[0],
                                role='definition'
                            )
                            defined_names.add(name)

            if symbol:
                definitions.append(symbol)

            for child in node.children:
                visit(child)

        visit(root_node)
        return definitions

    def _extract_go_usages(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int,
        import_map: Dict[str, str],
        definitions: List[Symbol]
    ) -> List[Symbol]:
        """Extract Go symbol usages (qualified references to external symbols).

        This handles:
        1. Package-qualified references: pkg.Symbol (e.g., fmt.Println)
        2. Method calls on struct fields: t.Field.Method() (e.g., t.CodeGraph.UpdateNodeMetaData)
        3. Qualified types: *pkg.Type
        """
        usages = []
        seen_usages = set()  # (qualified_name, line) to avoid duplicates

        # Get names defined in this file to exclude from usages
        defined_names = {d.name for d in definitions}

        def get_selector_chain(node) -> List[str]:
            """Get the full chain of identifiers in a nested selector expression.

            For 't.CodeGraph.UpdateNodeMetaData', returns ['t', 'CodeGraph', 'UpdateNodeMetaData']
            """
            chain = []
            current = node
            while current:
                if current.type == 'selector_expression':
                    field = self._find_child_by_type(current, 'field_identifier')
                    if field:
                        chain.insert(0, code[field.start_byte:field.end_byte])
                    # Move to the operand (left side)
                    operand = None
                    for child in current.children:
                        if child.type in ['identifier', 'selector_expression']:
                            operand = child
                            break
                    current = operand
                elif current.type == 'identifier':
                    chain.insert(0, code[current.start_byte:current.end_byte])
                    break
                else:
                    break
            return chain

        def visit(node):
            # Selector expression: package.Symbol or receiver.Method or t.Field.Method
            if node.type == 'selector_expression':
                # Get the full selector chain
                chain = get_selector_chain(node)

                if len(chain) >= 2:
                    first_part = chain[0]
                    last_part = chain[-1]
                    line = base_line_number + node.start_point[0]

                    # Case 1: Package-qualified reference (first part is a package)
                    if first_part in import_map:
                        # Direct package.Symbol reference
                        if len(chain) == 2:
                            symbol_name = last_part
                            full_pkg_path = import_map[first_part]
                            qualified_name = f"{first_part}.{symbol_name}"

                            if (qualified_name, line) not in seen_usages:
                                seen_usages.add((qualified_name, line))

                                # Determine type based on naming convention
                                symbol_type = 'type' if symbol_name[0].isupper() else 'function'

                                # Check if it's a function call
                                parent = node.parent
                                if parent and parent.type == 'call_expression':
                                    symbol_type = 'function'

                                usages.append(Symbol(
                                    name=symbol_name,
                                    type=symbol_type,
                                    file=file_path,
                                    line=line,
                                    role='usage',
                                    package=first_part,
                                    qualified_name=qualified_name
                                ))

                    # Case 2: Method call on struct field (e.g., t.CodeGraph.UpdateNodeMetaData)
                    # When the first part is NOT a package (likely a variable/receiver)
                    # and it's a call expression, extract the method name
                    elif len(chain) >= 2:
                        parent = node.parent
                        is_call = parent and parent.type == 'call_expression'

                        if is_call:
                            method_name = last_part
                            # For method calls, the second-to-last part might be the type name
                            # e.g., in t.CodeGraph.UpdateNodeMetaData, CodeGraph is the type
                            potential_type = chain[-2] if len(chain) >= 2 else None

                            # Skip if this method is defined in this file
                            if method_name not in defined_names:
                                # Create a usage with the method name
                                # Use the potential type as a hint for matching
                                if potential_type and potential_type[0].isupper():
                                    # This looks like Type.Method pattern
                                    qualified_name = f"{potential_type}.{method_name}"
                                else:
                                    # Just use the method name
                                    qualified_name = method_name

                                if (qualified_name, line) not in seen_usages:
                                    seen_usages.add((qualified_name, line))
                                    usages.append(Symbol(
                                        name=method_name,
                                        type='method',
                                        file=file_path,
                                        line=line,
                                        role='usage',
                                        package=potential_type,  # Use the type name as package hint
                                        qualified_name=qualified_name
                                    ))

            # Qualified type in declarations: *pkg.Type
            elif node.type == 'qualified_type':
                pkg_node = self._find_child_by_type(node, 'package_identifier')
                type_node = self._find_child_by_type(node, 'type_identifier')

                if pkg_node and type_node:
                    pkg_alias = code[pkg_node.start_byte:pkg_node.end_byte]
                    type_name = code[type_node.start_byte:type_node.end_byte]

                    if pkg_alias in import_map:
                        qualified_name = f"{pkg_alias}.{type_name}"
                        line = base_line_number + node.start_point[0]

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))
                            usages.append(Symbol(
                                name=type_name,
                                type='type',
                                file=file_path,
                                line=line,
                                role='usage',
                                package=pkg_alias,
                                qualified_name=qualified_name
                            ))

            for child in node.children:
                visit(child)

        visit(root_node)
        return usages

    def _find_go_receiver_type(self, method_node, code: str) -> Optional[str]:
        """Find the receiver type for a Go method declaration."""
        for child in method_node.children:
            if child.type == 'parameter_list':
                # This is the receiver parameter list
                for param in child.children:
                    if param.type == 'parameter_declaration':
                        # Find type_identifier or pointer_type
                        for subchild in param.children:
                            if subchild.type == 'type_identifier':
                                return code[subchild.start_byte:subchild.end_byte]
                            elif subchild.type == 'pointer_type':
                                type_id = self._find_child_by_type(subchild, 'type_identifier')
                                if type_id:
                                    return code[type_id.start_byte:type_id.end_byte]
                break  # Only check first parameter_list
        return None

    def _find_child_by_type(self, node, child_type: str):
        """Find the first direct child of a given type."""
        for child in node.children:
            if child.type == child_type:
                return child
        return None

    def _extract_go_symbols_regex(
        self,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Fallback regex-based Go symbol extraction."""
        definitions = []
        usages = []
        import_map = {}

        lines = code.split('\n')

        for i, line in enumerate(lines):
            line_num = base_line_number + i

            # Function definitions
            func_match = re.match(r'^\s*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(', line)
            if func_match:
                definitions.append(Symbol(
                    name=func_match.group(1),
                    type='function',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Method definitions
            method_match = re.match(r'^\s*func\s+\([^)]+\)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(', line)
            if method_match:
                definitions.append(Symbol(
                    name=method_match.group(1),
                    type='method',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Type definitions
            type_match = re.match(r'^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)', line)
            if type_match:
                definitions.append(Symbol(
                    name=type_match.group(1),
                    type='type' if type_match.group(2) == 'struct' else 'interface',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Import statements
            import_match = re.match(r'^\s*"([^"]+)"', line)
            if import_match:
                path = import_match.group(1)
                alias = path.split('/')[-1]
                import_map[alias] = path

            # Aliased imports
            alias_import_match = re.match(r'^\s*([a-z_][a-z0-9_]*)\s+"([^"]+)"', line)
            if alias_import_match:
                alias = alias_import_match.group(1)
                path = alias_import_match.group(2)
                import_map[alias] = path

            # Qualified usages: pkg.Symbol
            for match in re.finditer(r'\b([a-z][a-z0-9_]*)\s*\.\s*([A-Z][A-Za-z0-9_]*)', line):
                pkg_alias = match.group(1)
                symbol_name = match.group(2)
                if pkg_alias in import_map:
                    qualified_name = f"{pkg_alias}.{symbol_name}"
                    usages.append(Symbol(
                        name=symbol_name,
                        type='type',
                        file=file_path,
                        line=line_num,
                        role='usage',
                        package=pkg_alias,
                        qualified_name=qualified_name
                    ))

            # Function calls: pkg.FunctionName(
            for match in re.finditer(r'\b([a-z][a-z0-9_]*)\s*\.\s*([A-Z][A-Za-z0-9_]*)\s*\(', line):
                pkg_alias = match.group(1)
                func_name = match.group(2)
                if pkg_alias in import_map:
                    qualified_name = f"{pkg_alias}.{func_name}"
                    usages.append(Symbol(
                        name=func_name,
                        type='function',
                        file=file_path,
                        line=line_num,
                        role='usage',
                        package=pkg_alias,
                        qualified_name=qualified_name
                    ))

        return definitions, usages, import_map

    def _extract_python_symbols(
        self,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Extract symbols from Python code using tree-sitter.

        Python-specific extraction that handles:
        - Function definitions (def)
        - Class definitions
        - Method definitions (functions inside classes)
        - Import statements (import x, from x import y)
        - Attribute access usages (module.symbol, obj.method)
        - Type annotations (for type hints)
        """
        definitions = []
        usages = []
        import_map = {}

        parser = self._parsers.get('python')
        if not parser:
            return self._extract_python_symbols_regex(code, file_path, base_line_number)

        try:
            tree = parser.parse(bytes(code, 'utf8'))
            root_node = tree.root_node

            # Extract imports first
            import_map = self._extract_python_imports(root_node, code)

            # Extract definitions
            definitions = self._extract_python_definitions(root_node, code, file_path, base_line_number)

            # Extract usages
            usages = self._extract_python_usages(root_node, code, file_path, base_line_number, import_map, definitions)

        except Exception as e:
            print(f"Tree-sitter Python parse error: {e}, falling back to regex")
            return self._extract_python_symbols_regex(code, file_path, base_line_number)

        return definitions, usages, import_map

    def _extract_python_imports(self, root_node, code: str) -> Dict[str, str]:
        """Extract Python import statements."""
        import_map = {}

        def visit(node):
            # import module or import module as alias
            if node.type == 'import_statement':
                for child in node.children:
                    if child.type == 'dotted_name':
                        module = code[child.start_byte:child.end_byte]
                        alias = module.split('.')[-1]
                        import_map[alias] = module
                    elif child.type == 'aliased_import':
                        name_node = self._find_child_by_type(child, 'dotted_name')
                        alias_node = self._find_child_by_type(child, 'identifier')
                        if name_node and alias_node:
                            module = code[name_node.start_byte:name_node.end_byte]
                            alias = code[alias_node.start_byte:alias_node.end_byte]
                            import_map[alias] = module

            # from module import name or from module import name as alias
            elif node.type == 'import_from_statement':
                module_node = self._find_child_by_type(node, 'dotted_name')
                if not module_node:
                    module_node = self._find_child_by_type(node, 'relative_import')

                if module_node:
                    module = code[module_node.start_byte:module_node.end_byte]

                    # Find imported names
                    for child in node.children:
                        if child.type == 'dotted_name' and child != module_node:
                            name = code[child.start_byte:child.end_byte]
                            import_map[name] = f"{module}.{name}"
                        elif child.type == 'identifier':
                            name = code[child.start_byte:child.end_byte]
                            if name not in ['import', 'from', 'as']:
                                import_map[name] = f"{module}.{name}"
                        elif child.type == 'aliased_import':
                            name_node = self._find_child_by_type(child, 'dotted_name')
                            if not name_node:
                                name_node = self._find_child_by_type(child, 'identifier')
                            alias_node = None
                            for subchild in child.children:
                                if subchild.type == 'identifier' and subchild != name_node:
                                    alias_node = subchild
                                    break
                            if name_node:
                                name = code[name_node.start_byte:name_node.end_byte]
                                alias = code[alias_node.start_byte:alias_node.end_byte] if alias_node else name
                                import_map[alias] = f"{module}.{name}"

            for child in node.children:
                visit(child)

        visit(root_node)
        return import_map

    def _extract_python_definitions(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> List[Symbol]:
        """Extract Python symbol definitions."""
        definitions = []
        defined_names = set()

        def visit(node, scope=None):
            symbol = None

            # Function definition
            if node.type == 'function_definition':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol_type = 'method' if scope else 'function'
                    symbol = Symbol(
                        name=name,
                        type=symbol_type,
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition',
                        scope=scope
                    )
                    defined_names.add(name)

            # Class definition (may be inside decorated_definition)
            elif node.type == 'class_definition':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='class',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)
                    definitions.append(symbol)
                    # Visit children with class as scope
                    for child in node.children:
                        visit(child, scope=name)
                    return  # Don't visit children again

            # Decorated definition (contains class or function)
            elif node.type == 'decorated_definition':
                # Just visit children - the class_definition/function_definition inside will be handled
                for child in node.children:
                    visit(child, scope)
                return

            # Assignment (variable/constant definition at module level)
            elif node.type == 'assignment' and scope is None:
                # Only top-level assignments (not inside functions)
                left = node.children[0] if node.children else None
                if left and left.type == 'identifier':
                    name = code[left.start_byte:left.end_byte]
                    # Only consider UPPER_CASE as constants worth tracking
                    if name.isupper():
                        symbol = Symbol(
                            name=name,
                            type='variable',
                            file=file_path,
                            line=base_line_number + node.start_point[0],
                            role='definition'
                        )
                        defined_names.add(name)

            if symbol:
                definitions.append(symbol)

            # Visit children (unless we already did for class)
            for child in node.children:
                visit(child, scope)

        visit(root_node)
        return definitions

    def _extract_python_usages(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int,
        import_map: Dict[str, str],
        definitions: List[Symbol]
    ) -> List[Symbol]:
        """Extract Python symbol usages (references to imported/external symbols)."""
        usages = []
        seen_usages = set()
        defined_names = {d.name for d in definitions}

        def visit(node):
            # Attribute access: module.symbol or obj.attr
            # Structure: identifier . identifier
            if node.type == 'attribute':
                # Get object and attribute
                # attribute node has children: [identifier, '.', identifier]
                # First child is object, last identifier is attribute name
                obj_node = node.children[0] if node.children else None
                # Find the last identifier (the attribute name)
                attr_node = None
                for child in reversed(node.children):
                    if child.type == 'identifier':
                        attr_node = child
                        break

                if obj_node and attr_node and obj_node.type == 'identifier' and obj_node != attr_node:
                    obj_name = code[obj_node.start_byte:obj_node.end_byte]
                    attr_name = code[attr_node.start_byte:attr_node.end_byte]

                    # Check if obj_name is an imported module
                    if obj_name in import_map:
                        qualified_name = f"{obj_name}.{attr_name}"
                        line = base_line_number + node.start_point[0]

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))

                            # Determine type: lowercase = function/method, uppercase = class
                            symbol_type = 'class' if attr_name[0].isupper() else 'function'

                            # Check if it's a call
                            parent = node.parent
                            if parent and parent.type == 'call':
                                symbol_type = 'function'

                            usages.append(Symbol(
                                name=attr_name,
                                type=symbol_type,
                                file=file_path,
                                line=line,
                                role='usage',
                                package=obj_name,
                                qualified_name=qualified_name
                            ))
                            # Don't recurse into this attribute node to avoid duplicates
                            return

            # Type annotations: name: Type or -> Type
            elif node.type == 'type':
                type_text = code[node.start_byte:node.end_byte]
                # Extract simple type names (not generics)
                type_match = re.match(r'^([A-Z][a-zA-Z0-9_]*)', type_text)
                if type_match:
                    type_name = type_match.group(1)
                    if type_name not in defined_names and type_name in import_map:
                        line = base_line_number + node.start_point[0]
                        qualified_name = import_map.get(type_name, type_name)

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))
                            usages.append(Symbol(
                                name=type_name,
                                type='class',
                                file=file_path,
                                line=line,
                                role='usage',
                                package=qualified_name.rsplit('.', 1)[0] if '.' in qualified_name else None,
                                qualified_name=qualified_name
                            ))

            # Direct identifier usage (for imported names used directly)
            # e.g., from mypackage.models import User; user = User()
            elif node.type == 'identifier':
                name = code[node.start_byte:node.end_byte]
                # Check if it's an imported name being used (not defined here)
                if name in import_map and name not in defined_names:
                    parent = node.parent
                    # Skip if this is:
                    # - inside an import statement
                    # - a definition
                    # - inside an attribute expression (handled separately)
                    # - the decorator itself
                    if parent and parent.type not in ['import_statement', 'import_from_statement',
                                                       'function_definition', 'class_definition',
                                                       'aliased_import', 'dotted_name', 'attribute',
                                                       'decorator']:
                        line = base_line_number + node.start_point[0]
                        qualified_name = import_map[name]

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))

                            symbol_type = 'class' if name[0].isupper() else 'function'
                            if parent and parent.type == 'call':
                                symbol_type = 'function'

                            usages.append(Symbol(
                                name=name,
                                type=symbol_type,
                                file=file_path,
                                line=line,
                                role='usage',
                                package=qualified_name.rsplit('.', 1)[0] if '.' in qualified_name else None,
                                qualified_name=qualified_name
                            ))

            for child in node.children:
                visit(child)

        visit(root_node)
        return usages

    def _extract_python_symbols_regex(
        self,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Fallback regex-based Python symbol extraction."""
        definitions = []
        usages = []
        import_map = {}

        lines = code.split('\n')

        for i, line in enumerate(lines):
            line_num = base_line_number + i

            # Function definitions
            func_match = re.match(r'^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if func_match:
                definitions.append(Symbol(
                    name=func_match.group(1),
                    type='function',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Class definitions
            class_match = re.match(r'^\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if class_match:
                definitions.append(Symbol(
                    name=class_match.group(1),
                    type='class',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Import statements: import module
            import_match = re.match(r'^\s*import\s+([a-zA-Z_][a-zA-Z0-9_.]*)', line)
            if import_match:
                module = import_match.group(1)
                import_map[module.split('.')[-1]] = module

            # From imports: from module import thing
            from_match = re.match(r'^\s*from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+(.+)', line)
            if from_match:
                module = from_match.group(1)
                imports = from_match.group(2)
                for imp in imports.split(','):
                    imp = imp.strip().split(' as ')[0].strip()
                    if imp and imp != '*':
                        import_map[imp] = f"{module}.{imp}"

            # Qualified usages: module.symbol
            for match in re.finditer(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)', line):
                module = match.group(1)
                symbol = match.group(2)
                if module in import_map:
                    qualified_name = f"{module}.{symbol}"
                    usages.append(Symbol(
                        name=symbol,
                        type='function' if symbol[0].islower() else 'class',
                        file=file_path,
                        line=line_num,
                        role='usage',
                        package=module,
                        qualified_name=qualified_name
                    ))

        return definitions, usages, import_map

    def _extract_js_ts_symbols(
        self,
        code: str,
        language: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Extract symbols from JavaScript/TypeScript code using tree-sitter.

        JS/TS-specific extraction that handles:
        - Function declarations and expressions
        - Class declarations
        - Interface and type declarations (TypeScript)
        - Arrow functions assigned to const/let
        - Import statements (named, default, namespace)
        - Member access usages (module.symbol)
        """
        definitions = []
        usages = []
        import_map = {}

        parser = self._parsers.get(language)
        if not parser:
            return self._extract_js_ts_symbols_regex(code, language, file_path, base_line_number)

        try:
            tree = parser.parse(bytes(code, 'utf8'))
            root_node = tree.root_node

            # Extract imports first
            import_map = self._extract_js_ts_imports(root_node, code)

            # Extract definitions
            definitions = self._extract_js_ts_definitions(root_node, code, language, file_path, base_line_number)

            # Extract usages
            usages = self._extract_js_ts_usages(root_node, code, file_path, base_line_number, import_map, definitions)

        except Exception as e:
            print(f"Tree-sitter {language} parse error: {e}, falling back to regex")
            return self._extract_js_ts_symbols_regex(code, language, file_path, base_line_number)

        return definitions, usages, import_map

    def _extract_js_ts_imports(self, root_node, code: str) -> Dict[str, str]:
        """Extract JavaScript/TypeScript import statements."""
        import_map = {}

        def visit(node):
            if node.type == 'import_statement':
                # Find the source module
                source_node = None
                for child in node.children:
                    if child.type == 'string':
                        source_node = child
                        break

                if source_node:
                    # Remove quotes from module path
                    module = code[source_node.start_byte:source_node.end_byte].strip('"\'')

                    # Find import clause
                    for child in node.children:
                        # Default import: import Foo from 'module'
                        if child.type == 'identifier':
                            name = code[child.start_byte:child.end_byte]
                            import_map[name] = module

                        # Named imports: import { Foo, Bar } from 'module'
                        elif child.type == 'import_clause':
                            for subchild in child.children:
                                if subchild.type == 'identifier':
                                    name = code[subchild.start_byte:subchild.end_byte]
                                    import_map[name] = module
                                elif subchild.type == 'named_imports':
                                    for spec in subchild.children:
                                        if spec.type == 'import_specifier':
                                            name_node = self._find_child_by_type(spec, 'identifier')
                                            if name_node:
                                                name = code[name_node.start_byte:name_node.end_byte]
                                                import_map[name] = module
                                elif subchild.type == 'namespace_import':
                                    # import * as Foo from 'module'
                                    id_node = self._find_child_by_type(subchild, 'identifier')
                                    if id_node:
                                        name = code[id_node.start_byte:id_node.end_byte]
                                        import_map[name] = module

            for child in node.children:
                visit(child)

        visit(root_node)
        return import_map

    def _extract_js_ts_definitions(
        self,
        root_node,
        code: str,
        language: str,
        file_path: str,
        base_line_number: int
    ) -> List[Symbol]:
        """Extract JavaScript/TypeScript symbol definitions."""
        definitions = []
        defined_names = set()

        def visit(node, scope=None):
            symbol = None

            # Function declaration: function foo() {}
            if node.type == 'function_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='function',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition',
                        scope=scope
                    )
                    defined_names.add(name)

            # Class declaration: class Foo {}
            elif node.type == 'class_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if not name_node:
                    name_node = self._find_child_by_type(node, 'type_identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='class',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)
                    definitions.append(symbol)
                    # Visit class body with class as scope
                    for child in node.children:
                        visit(child, scope=name)
                    return

            # Method definition inside class
            elif node.type == 'method_definition' and scope:
                name_node = self._find_child_by_type(node, 'property_identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='method',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition',
                        scope=scope
                    )
                    defined_names.add(name)

            # TypeScript interface declaration
            elif node.type == 'interface_declaration':
                name_node = self._find_child_by_type(node, 'type_identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='interface',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)

            # TypeScript type alias
            elif node.type == 'type_alias_declaration':
                name_node = self._find_child_by_type(node, 'type_identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='type',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)

            # Variable declaration: const foo = () => {} or const Foo = class {}
            elif node.type in ['lexical_declaration', 'variable_declaration']:
                for child in node.children:
                    if child.type == 'variable_declarator':
                        name_node = self._find_child_by_type(child, 'identifier')
                        value_node = None
                        for subchild in child.children:
                            if subchild.type in ['arrow_function', 'function', 'class']:
                                value_node = subchild
                                break

                        if name_node and value_node:
                            name = code[name_node.start_byte:name_node.end_byte]
                            sym_type = 'function' if value_node.type in ['arrow_function', 'function'] else 'class'
                            symbol = Symbol(
                                name=name,
                                type=sym_type,
                                file=file_path,
                                line=base_line_number + node.start_point[0],
                                role='definition'
                            )
                            defined_names.add(name)
                            definitions.append(symbol)
                            symbol = None  # Already added

            # Export statement might contain definitions
            elif node.type == 'export_statement':
                for child in node.children:
                    visit(child, scope)
                return

            if symbol:
                definitions.append(symbol)

            for child in node.children:
                visit(child, scope)

        visit(root_node)
        return definitions

    def _extract_js_ts_usages(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int,
        import_map: Dict[str, str],
        definitions: List[Symbol]
    ) -> List[Symbol]:
        """Extract JavaScript/TypeScript symbol usages."""
        usages = []
        seen_usages = set()
        defined_names = {d.name for d in definitions}

        def visit(node):
            # Member expression: module.symbol
            if node.type == 'member_expression':
                obj_node = node.children[0] if node.children else None
                prop_node = self._find_child_by_type(node, 'property_identifier')

                if obj_node and prop_node and obj_node.type == 'identifier':
                    obj_name = code[obj_node.start_byte:obj_node.end_byte]
                    prop_name = code[prop_node.start_byte:prop_node.end_byte]

                    if obj_name in import_map:
                        qualified_name = f"{obj_name}.{prop_name}"
                        line = base_line_number + node.start_point[0]

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))

                            symbol_type = 'class' if prop_name[0].isupper() else 'function'
                            parent = node.parent
                            if parent and parent.type == 'call_expression':
                                symbol_type = 'function'

                            usages.append(Symbol(
                                name=prop_name,
                                type=symbol_type,
                                file=file_path,
                                line=line,
                                role='usage',
                                package=obj_name,
                                qualified_name=qualified_name
                            ))

            # Direct identifier usage (imported names used directly)
            # e.g., import UserService from './services'; const svc = new UserService();
            elif node.type == 'identifier':
                name = code[node.start_byte:node.end_byte]
                if name in import_map and name not in defined_names:
                    parent = node.parent
                    # Skip if this identifier is:
                    # - in an import statement
                    # - part of a member expression (handled separately)
                    # - in a declaration
                    # - in a namespace import
                    if parent and parent.type not in ['import_statement', 'import_specifier',
                                                       'import_clause', 'function_declaration',
                                                       'class_declaration', 'variable_declarator',
                                                       'member_expression', 'namespace_import']:
                        line = base_line_number + node.start_point[0]
                        module = import_map[name]
                        qualified_name = f"{module}.{name}"

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))

                            symbol_type = 'class' if name[0].isupper() else 'function'
                            if parent and parent.type == 'call_expression':
                                symbol_type = 'function'

                            usages.append(Symbol(
                                name=name,
                                type=symbol_type,
                                file=file_path,
                                line=line,
                                role='usage',
                                package=module,
                                qualified_name=qualified_name
                            ))

            # TypeScript type references
            elif node.type == 'type_identifier':
                name = code[node.start_byte:node.end_byte]
                if name in import_map and name not in defined_names:
                    parent = node.parent
                    if parent and parent.type not in ['interface_declaration', 'type_alias_declaration',
                                                       'class_declaration']:
                        line = base_line_number + node.start_point[0]
                        module = import_map[name]
                        qualified_name = f"{module}.{name}"

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))
                            usages.append(Symbol(
                                name=name,
                                type='type',
                                file=file_path,
                                line=line,
                                role='usage',
                                package=module,
                                qualified_name=qualified_name
                            ))

            for child in node.children:
                visit(child)

        visit(root_node)
        return usages

    def _extract_js_ts_symbols_regex(
        self,
        code: str,
        language: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Fallback regex-based JavaScript/TypeScript symbol extraction."""
        definitions = []
        usages = []
        import_map = {}

        lines = code.split('\n')

        for i, line in enumerate(lines):
            line_num = base_line_number + i

            # Function declarations
            func_match = re.match(r'^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if func_match:
                definitions.append(Symbol(
                    name=func_match.group(1),
                    type='function',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Arrow functions: const foo = () => or const foo = async () =>
            arrow_match = re.match(r'^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>', line)
            if arrow_match:
                definitions.append(Symbol(
                    name=arrow_match.group(1),
                    type='function',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Class declarations
            class_match = re.match(r'^\s*(?:export\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if class_match:
                definitions.append(Symbol(
                    name=class_match.group(1),
                    type='class',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Interface declarations (TypeScript)
            if language == 'typescript':
                interface_match = re.match(r'^\s*(?:export\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
                if interface_match:
                    definitions.append(Symbol(
                        name=interface_match.group(1),
                        type='interface',
                        file=file_path,
                        line=line_num,
                        role='definition'
                    ))

                type_match = re.match(r'^\s*(?:export\s+)?type\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
                if type_match:
                    definitions.append(Symbol(
                        name=type_match.group(1),
                        type='type',
                        file=file_path,
                        line=line_num,
                        role='definition'
                    ))

            # Named imports: import { Foo, Bar } from 'module'
            named_import_match = re.match(r'^\s*import\s+\{([^}]+)\}\s+from\s+[\'"]([^\'"]+)[\'"]', line)
            if named_import_match:
                imports = named_import_match.group(1)
                module = named_import_match.group(2)
                for imp in imports.split(','):
                    imp = imp.strip().split(' as ')
                    name = imp[-1].strip()  # Use alias if present
                    if name:
                        import_map[name] = module

            # Default import: import Foo from 'module'
            default_import_match = re.match(r'^\s*import\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+[\'"]([^\'"]+)[\'"]', line)
            if default_import_match:
                name = default_import_match.group(1)
                module = default_import_match.group(2)
                import_map[name] = module

            # Namespace import: import * as Foo from 'module'
            namespace_import_match = re.match(r'^\s*import\s+\*\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from\s+[\'"]([^\'"]+)[\'"]', line)
            if namespace_import_match:
                name = namespace_import_match.group(1)
                module = namespace_import_match.group(2)
                import_map[name] = module

            # Member access usages: module.symbol
            for match in re.finditer(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)', line):
                obj_name = match.group(1)
                prop_name = match.group(2)
                if obj_name in import_map:
                    qualified_name = f"{obj_name}.{prop_name}"
                    usages.append(Symbol(
                        name=prop_name,
                        type='function' if prop_name[0].islower() else 'class',
                        file=file_path,
                        line=line_num,
                        role='usage',
                        package=obj_name,
                        qualified_name=qualified_name
                    ))

        return definitions, usages, import_map

    def _extract_java_symbols(
        self,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Extract symbols from Java code using tree-sitter.

        Java-specific extraction that handles:
        - Class declarations (public, abstract, final)
        - Interface declarations
        - Enum declarations
        - Method declarations
        - Field declarations
        - Import statements (regular and static)
        - Type usages (in fields, parameters, return types)
        - Static method calls (ClassName.method())
        """
        definitions = []
        usages = []
        import_map = {}

        parser = self._parsers.get('java')
        if not parser:
            return self._extract_java_symbols_regex(code, file_path, base_line_number)

        try:
            tree = parser.parse(bytes(code, 'utf8'))
            root_node = tree.root_node

            # Extract imports first
            import_map = self._extract_java_imports(root_node, code)

            # Extract definitions
            definitions = self._extract_java_definitions(root_node, code, file_path, base_line_number)

            # Extract usages
            usages = self._extract_java_usages(root_node, code, file_path, base_line_number, import_map, definitions)

        except Exception as e:
            print(f"Tree-sitter Java parse error: {e}, falling back to regex")
            return self._extract_java_symbols_regex(code, file_path, base_line_number)

        return definitions, usages, import_map

    def _extract_java_imports(self, root_node, code: str) -> Dict[str, str]:
        """Extract Java import statements."""
        import_map = {}

        def visit(node):
            if node.type == 'import_declaration':
                # Find the scoped identifier (the full import path)
                for child in node.children:
                    if child.type == 'scoped_identifier':
                        full_path = code[child.start_byte:child.end_byte]
                        # Get the class name (last part)
                        class_name = full_path.split('.')[-1]
                        if class_name != '*':
                            import_map[class_name] = full_path
                    elif child.type == 'identifier':
                        # Simple import like "import Foo;"
                        name = code[child.start_byte:child.end_byte]
                        import_map[name] = name

            for child in node.children:
                visit(child)

        visit(root_node)
        return import_map

    def _extract_java_definitions(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> List[Symbol]:
        """Extract Java symbol definitions."""
        definitions = []
        defined_names = set()

        def visit(node, scope=None):
            symbol = None

            # Class declaration
            if node.type == 'class_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='class',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)
                    # Visit children with class as scope
                    for child in node.children:
                        visit(child, scope=name)
                    if symbol:
                        definitions.append(symbol)
                    return

            # Interface declaration
            elif node.type == 'interface_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='interface',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)

            # Enum declaration
            elif node.type == 'enum_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='type',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition'
                    )
                    defined_names.add(name)

            # Method declaration
            elif node.type == 'method_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='method',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition',
                        scope=scope
                    )
                    defined_names.add(name)

            # Constructor declaration
            elif node.type == 'constructor_declaration':
                name_node = self._find_child_by_type(node, 'identifier')
                if name_node:
                    name = code[name_node.start_byte:name_node.end_byte]
                    symbol = Symbol(
                        name=name,
                        type='method',
                        file=file_path,
                        line=base_line_number + node.start_point[0],
                        role='definition',
                        scope=scope
                    )
                    defined_names.add(name)

            # Field declaration
            elif node.type == 'field_declaration' and scope:
                # Find variable declarators
                for child in node.children:
                    if child.type == 'variable_declarator':
                        name_node = self._find_child_by_type(child, 'identifier')
                        if name_node:
                            name = code[name_node.start_byte:name_node.end_byte]
                            symbol = Symbol(
                                name=name,
                                type='field',
                                file=file_path,
                                line=base_line_number + node.start_point[0],
                                role='definition',
                                scope=scope
                            )
                            defined_names.add(name)
                            definitions.append(symbol)
                symbol = None  # Already added

            if symbol:
                definitions.append(symbol)

            for child in node.children:
                visit(child, scope)

        visit(root_node)
        return definitions

    def _extract_java_usages(
        self,
        root_node,
        code: str,
        file_path: str,
        base_line_number: int,
        import_map: Dict[str, str],
        definitions: List[Symbol]
    ) -> List[Symbol]:
        """Extract Java symbol usages."""
        usages = []
        seen_usages = set()
        defined_names = {d.name for d in definitions}

        def visit(node):
            # Type identifier (usage of a type)
            if node.type == 'type_identifier':
                name = code[node.start_byte:node.end_byte]
                if name in import_map and name not in defined_names:
                    parent = node.parent
                    # Skip if this is the class/interface being declared
                    if parent and parent.type not in ['class_declaration', 'interface_declaration',
                                                       'enum_declaration']:
                        line = base_line_number + node.start_point[0]
                        full_path = import_map[name]
                        qualified_name = full_path

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))
                            usages.append(Symbol(
                                name=name,
                                type='class',
                                file=file_path,
                                line=line,
                                role='usage',
                                package=full_path.rsplit('.', 1)[0] if '.' in full_path else None,
                                qualified_name=qualified_name
                            ))

            # Method invocation on a class (static call): ClassName.method()
            elif node.type == 'method_invocation':
                # Find the object or class being called on
                obj_node = None
                method_node = None
                for child in node.children:
                    if child.type == 'identifier' and obj_node is None:
                        obj_node = child
                    elif child.type == 'identifier' and obj_node is not None:
                        method_node = child

                if obj_node:
                    obj_name = code[obj_node.start_byte:obj_node.end_byte]
                    # Check if it's a static call to an imported class
                    if obj_name in import_map and obj_name[0].isupper():
                        if method_node:
                            method_name = code[method_node.start_byte:method_node.end_byte]
                        else:
                            # Try to get method from field_access pattern
                            method_name = "method"

                        line = base_line_number + node.start_point[0]
                        full_path = import_map[obj_name]
                        qualified_name = f"{obj_name}.{method_name}"

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))
                            usages.append(Symbol(
                                name=method_name,
                                type='function',
                                file=file_path,
                                line=line,
                                role='usage',
                                package=obj_name,
                                qualified_name=qualified_name
                            ))

            # Scoped identifier: package.Class or Class.staticField
            elif node.type == 'scoped_identifier':
                parts = code[node.start_byte:node.end_byte].split('.')
                if len(parts) >= 2:
                    first_part = parts[0]
                    if first_part in import_map or first_part[0].isupper():
                        line = base_line_number + node.start_point[0]
                        qualified_name = code[node.start_byte:node.end_byte]

                        if (qualified_name, line) not in seen_usages:
                            seen_usages.add((qualified_name, line))
                            usages.append(Symbol(
                                name=parts[-1],
                                type='class' if parts[-1][0].isupper() else 'function',
                                file=file_path,
                                line=line,
                                role='usage',
                                package='.'.join(parts[:-1]),
                                qualified_name=qualified_name
                            ))

            # Object creation: new ClassName()
            elif node.type == 'object_creation_expression':
                type_node = self._find_child_by_type(node, 'type_identifier')
                if type_node:
                    type_name = code[type_node.start_byte:type_node.end_byte]
                    if type_name in import_map and type_name not in defined_names:
                        line = base_line_number + node.start_point[0]
                        full_path = import_map[type_name]

                        if (full_path, line) not in seen_usages:
                            seen_usages.add((full_path, line))
                            usages.append(Symbol(
                                name=type_name,
                                type='class',
                                file=file_path,
                                line=line,
                                role='usage',
                                package=full_path.rsplit('.', 1)[0] if '.' in full_path else None,
                                qualified_name=full_path
                            ))

            for child in node.children:
                visit(child)

        visit(root_node)
        return usages

    def _extract_java_symbols_regex(
        self,
        code: str,
        file_path: str,
        base_line_number: int
    ) -> Tuple[List[Symbol], List[Symbol], Dict[str, str]]:
        """Fallback regex-based Java symbol extraction."""
        definitions = []
        usages = []
        import_map = {}

        lines = code.split('\n')

        for i, line in enumerate(lines):
            line_num = base_line_number + i

            # Class declarations
            class_match = re.match(r'^\s*(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if class_match:
                definitions.append(Symbol(
                    name=class_match.group(1),
                    type='class',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Interface declarations
            interface_match = re.match(r'^\s*(?:public\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if interface_match:
                definitions.append(Symbol(
                    name=interface_match.group(1),
                    type='interface',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Enum declarations
            enum_match = re.match(r'^\s*(?:public\s+)?enum\s+([a-zA-Z_][a-zA-Z0-9_]*)', line)
            if enum_match:
                definitions.append(Symbol(
                    name=enum_match.group(1),
                    type='type',
                    file=file_path,
                    line=line_num,
                    role='definition'
                ))

            # Method declarations
            method_match = re.match(r'^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:[\w<>,\s]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', line)
            if method_match:
                name = method_match.group(1)
                if name not in ['if', 'while', 'for', 'switch', 'catch', 'class', 'interface', 'enum']:
                    definitions.append(Symbol(
                        name=name,
                        type='method',
                        file=file_path,
                        line=line_num,
                        role='definition'
                    ))

            # Import statements
            import_match = re.match(r'^\s*import\s+(?:static\s+)?([a-zA-Z_][a-zA-Z0-9_.]*);', line)
            if import_match:
                full_path = import_match.group(1)
                class_name = full_path.split('.')[-1]
                if class_name != '*':
                    import_map[class_name] = full_path

            # Type usages: ClassName variable or new ClassName()
            for match in re.finditer(r'\b([A-Z][a-zA-Z0-9_]*)\b', line):
                type_name = match.group(1)
                if type_name in import_map:
                    qualified_name = import_map[type_name]
                    usages.append(Symbol(
                        name=type_name,
                        type='class',
                        file=file_path,
                        line=line_num,
                        role='usage',
                        package=qualified_name.rsplit('.', 1)[0] if '.' in qualified_name else None,
                        qualified_name=qualified_name
                    ))

            # Static method calls: ClassName.method()
            for match in re.finditer(r'\b([A-Z][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', line):
                class_name = match.group(1)
                method_name = match.group(2)
                if class_name in import_map:
                    qualified_name = f"{class_name}.{method_name}"
                    usages.append(Symbol(
                        name=method_name,
                        type='function',
                        file=file_path,
                        line=line_num,
                        role='usage',
                        package=class_name,
                        qualified_name=qualified_name
                    ))

        return definitions, usages, import_map
