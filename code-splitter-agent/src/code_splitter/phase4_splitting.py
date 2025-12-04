"""Phase 4: Patch Splitting with Constraints."""

from typing import List, Dict, Set, Optional, Tuple
from .models import Change, Dependency, Patch, AtomicGroup, SemanticGroup
from .phase2_graph import DependencyGraph


# File patterns for different layers (used in interface-first splitting)
INTERFACE_PATTERNS = [
    '/model/', '/models/', '/types/', '/interfaces/', '/dto/',
    'interface.go', 'types.go', 'model.go', 'models.go',
    '_interface.py', '_types.py', '_model.py', '_models.py',
    '.d.ts', 'types.ts', 'interfaces.ts',
    'result.go', 'result.py',  # Result types often come first
]

UTIL_PATTERNS = [
    '/utils/', '/util/', '/helpers/', '/helper/', '/common/',
    '_utils.py', '_util.py', '_helper.py', '_helpers.py',
    'utils.go', 'util.go', 'helpers.go', 'helper.go',
    'utils.ts', 'util.ts', 'helpers.ts', 'helper.ts',
]

CONTROLLER_PATTERNS = [
    '/controller/', '/controllers/', '/handler/', '/handlers/',
    '/api/', '/routes/', '/endpoints/',
    '_controller.py', '_handler.py', '_api.py',
    'controller.go', 'handler.go',
    '.controller.ts', '.handler.ts',
]


class PatchSplitter:
    """Splits changes into patches while respecting dependencies."""

    def __init__(self, dependency_graph: DependencyGraph, llm_client=None, additional_context=None):
        self.graph = dependency_graph
        self.llm_client = llm_client
        self.additional_context = additional_context or {}

    def split_into_patches(
        self,
        changes: List[Change],
        atomic_groups: List[AtomicGroup],
        semantic_groups: List[SemanticGroup],
        target_patch_size: int = 200,
        max_patches: Optional[int] = None
    ) -> List[Patch]:
        """Split changes into patches respecting constraints.

        Args:
            changes: List of all changes
            atomic_groups: Groups that cannot be split
            semantic_groups: Semantic groupings for guidance
            target_patch_size: Target number of lines per patch
            max_patches: Maximum number of patches (None for no limit)

        Returns:
            List of Patch objects in dependency order
        """
        print(f"  [Phase 4] Starting patch splitting with {len(changes)} changes")
        print(f"  [Phase 4] Target patch size: {target_patch_size} lines")
        print(f"  [Phase 4] Atomic groups: {len(atomic_groups)}")
        print(f"  [Phase 4] Semantic groups: {len(semantic_groups)}")

        # Build lookup maps
        change_map = {c.id: c for c in changes}
        atomic_membership = self._build_atomic_membership(atomic_groups)
        print(f"  [Phase 4] Built change map and atomic membership")

        # Check if this is primarily a new feature (mostly additions)
        new_file_changes = [c for c in changes if c.type == 'add']
        is_new_feature = len(new_file_changes) > len(changes) * 0.7

        if is_new_feature:
            print(f"  [Phase 4] Detected new feature addition ({len(new_file_changes)}/{len(changes)} are additions)")
            print(f"  [Phase 4] Using interface-first splitting strategy")

        # Start with atomic groups as building blocks
        patch_candidates = []

        # Add atomic groups as initial patches
        # For new features, try to split large atomic groups using interface-first strategy
        print(f"  [Phase 4] Creating patch candidates from atomic groups...")
        for idx, group in enumerate(atomic_groups):
            print(f"  [Phase 4]   Processing atomic group {idx+1}/{len(atomic_groups)}")
            print(f"  [Phase 4]     Group ID: {group.id}")
            print(f"  [Phase 4]     Reason: {group.reason}")
            print(f"  [Phase 4]     Change IDs in group: {group.change_ids}")

            # Check if all change_ids exist in change_map
            missing_changes = [cid for cid in group.change_ids if cid not in change_map]
            if missing_changes:
                print(f"  [Phase 4]     ERROR: Missing changes in change_map: {missing_changes}")
                print(f"  [Phase 4]     Available change_ids: {list(change_map.keys())[:10]}...")
                raise KeyError(f"Change IDs in atomic group not found in change_map: {missing_changes}")

            size = sum(
                change_map[cid].added_lines + change_map[cid].deleted_lines
                for cid in group.change_ids
            )
            print(f"  [Phase 4]   Atomic group {idx+1}: {len(group.change_ids)} changes, {size} lines")

            # For large new feature groups, try interface-first splitting
            if is_new_feature and size > target_patch_size * 2:
                print(f"  [Phase 4]     Large atomic group detected, trying interface-first split...")
                layer_patches = self._split_by_layer(group.change_ids, change_map, target_patch_size)
                if len(layer_patches) > 1:
                    print(f"  [Phase 4]     Split into {len(layer_patches)} layer-based patches")
                    patch_candidates.extend(layer_patches)
                    continue

            patch_candidates.append({
                'change_ids': set(group.change_ids),
                'size': size,
                'atomic': True,
                'name': f"Atomic: {group.reason[:50]}",
                'description': group.reason
            })

        # Add individual changes not in atomic groups
        assigned = set()
        for group in atomic_groups:
            assigned.update(group.change_ids)

        # For new features, group individual changes by layer first
        unassigned_changes = [c for c in changes if c.id not in assigned]

        if is_new_feature and len(unassigned_changes) > 5:
            print(f"  [Phase 4] Grouping {len(unassigned_changes)} unassigned changes by layer...")
            unassigned_ids = [c.id for c in unassigned_changes]
            layer_patches = self._split_by_layer(unassigned_ids, change_map, target_patch_size)
            if layer_patches:
                print(f"  [Phase 4]   Created {len(layer_patches)} layer-based patches from unassigned changes")
                patch_candidates.extend(layer_patches)
                # Mark all as assigned
                for lp in layer_patches:
                    assigned.update(lp['change_ids'])

        individual_count = 0
        print(f"  [Phase 4] Adding individual changes not in atomic groups...")
        for change in changes:
            if change.id not in assigned:
                individual_count += 1
                size = change.added_lines + change.deleted_lines
                patch_candidates.append({
                    'change_ids': {change.id},
                    'size': size,
                    'atomic': False,
                    'name': f"Change in {change.file}",
                    'description': f"{change.type} in {change.file}"
                })
        print(f"  [Phase 4] Added {individual_count} individual changes")
        print(f"  [Phase 4] Total patch candidates: {len(patch_candidates)}")

        # Try to merge compatible patches guided by semantic groups
        print(f"  [Phase 4] Merging compatible patches...")
        merged_patches = self._merge_patches(
            patch_candidates,
            semantic_groups,
            target_patch_size,
            change_map
        )
        print(f"  [Phase 4] After merging: {len(merged_patches)} patches")

        # Create final patch objects with dependencies
        print(f"  [Phase 4] Creating final patch objects...")
        final_patches = self._create_final_patches(merged_patches, change_map)
        print(f"  [Phase 4] Created {len(final_patches)} final patches")

        # Sort patches in topological order
        print(f"  [Phase 4] Sorting patches topologically...")
        sorted_patches = self._sort_patches_topologically(final_patches)
        print(f"  [Phase 4] Topological sort complete")

        return sorted_patches

    def _split_by_layer(
        self,
        change_ids: List[str],
        change_map: Dict[str, Change],
        target_size: int
    ) -> List[Dict]:
        """Split changes into patches based on architectural layers.

        This implements the interface-first splitting strategy:
        1. Interfaces, types, and models (define contracts first)
        2. Utility functions
        3. Core implementations (grouped by sub-package)
        4. Controllers/handlers (integration layer)

        Args:
            change_ids: List of change IDs to split
            change_map: Map of change_id -> Change
            target_size: Target size for each patch

        Returns:
            List of patch candidate dictionaries
        """
        # Classify changes by layer
        interfaces = []
        utils = []
        controllers = []
        implementations = {}  # sub-package -> list of change_ids

        for cid in change_ids:
            if cid not in change_map:
                continue
            change = change_map[cid]
            file_path = change.file.lower()

            if any(pattern in file_path for pattern in INTERFACE_PATTERNS):
                interfaces.append(cid)
            elif any(pattern in file_path for pattern in UTIL_PATTERNS):
                utils.append(cid)
            elif any(pattern in file_path for pattern in CONTROLLER_PATTERNS):
                controllers.append(cid)
            else:
                # Group implementations by sub-package
                parts = change.file.split('/')
                if len(parts) >= 2:
                    subpackage = '/'.join(parts[:-1])
                else:
                    subpackage = 'root'
                if subpackage not in implementations:
                    implementations[subpackage] = []
                implementations[subpackage].append(cid)

        patches = []

        # Create patches for each layer
        if interfaces:
            size = sum(change_map[cid].added_lines + change_map[cid].deleted_lines for cid in interfaces)
            patches.append({
                'change_ids': set(interfaces),
                'size': size,
                'atomic': False,
                'name': "Interfaces and Models",
                'description': "Interface definitions, types, and data models"
            })

        if utils:
            size = sum(change_map[cid].added_lines + change_map[cid].deleted_lines for cid in utils)
            patches.append({
                'change_ids': set(utils),
                'size': size,
                'atomic': False,
                'name': "Utilities",
                'description': "Utility functions and helpers"
            })

        # Group implementations by sub-package, potentially merging small ones
        impl_groups = []
        current_group = []
        current_size = 0

        for subpkg, impl_changes in sorted(implementations.items()):
            subpkg_size = sum(change_map[cid].added_lines + change_map[cid].deleted_lines for cid in impl_changes)

            # If this sub-package alone is large enough, make it its own patch
            if subpkg_size >= target_size * 0.5:
                # Save any accumulated small groups first
                if current_group:
                    impl_groups.append((current_group, current_size))
                    current_group = []
                    current_size = 0
                impl_groups.append((impl_changes, subpkg_size))
            else:
                # Accumulate small sub-packages
                if current_size + subpkg_size > target_size * 1.5:
                    # Save current group and start new one
                    if current_group:
                        impl_groups.append((current_group, current_size))
                    current_group = impl_changes
                    current_size = subpkg_size
                else:
                    current_group.extend(impl_changes)
                    current_size += subpkg_size

        if current_group:
            impl_groups.append((current_group, current_size))

        # Create patches for implementation groups
        for idx, (impl_changes, size) in enumerate(impl_groups):
            # Get the most common sub-package for naming
            subpkgs = set()
            for cid in impl_changes:
                if cid in change_map:
                    parts = change_map[cid].file.split('/')
                    if len(parts) >= 2:
                        subpkgs.add(parts[-2])  # Parent directory name

            name_suffix = f" ({', '.join(list(subpkgs)[:2])})" if subpkgs else f" {idx+1}"

            patches.append({
                'change_ids': set(impl_changes),
                'size': size,
                'atomic': False,
                'name': f"Implementation{name_suffix}",
                'description': f"Core implementation files"
            })

        if controllers:
            size = sum(change_map[cid].added_lines + change_map[cid].deleted_lines for cid in controllers)
            patches.append({
                'change_ids': set(controllers),
                'size': size,
                'atomic': False,
                'name': "Controllers",
                'description': "Controllers, handlers, and API endpoints"
            })

        return patches

    def _build_atomic_membership(self, atomic_groups: List[AtomicGroup]) -> Dict[str, str]:
        """Build map of change_id -> atomic_group_id."""
        membership = {}
        for group in atomic_groups:
            for change_id in group.change_ids:
                membership[change_id] = group.id
        return membership

    def _merge_patches(
        self,
        candidates: List[Dict],
        semantic_groups: List[SemanticGroup],
        target_size: int,
        change_map: Dict[str, Change]
    ) -> List[Dict]:
        """Merge compatible patch candidates."""
        # Build semantic group map for quick lookup
        semantic_map = {}
        for group in semantic_groups:
            for change_id in group.change_ids:
                if change_id not in semantic_map:
                    semantic_map[change_id] = []
                semantic_map[change_id].append(group)

        merged = []
        used = set()

        for i, candidate in enumerate(candidates):
            if i in used:
                continue

            current = candidate.copy()
            current['change_ids'] = set(current['change_ids'])

            # Try to merge with other candidates
            for j in range(i + 1, len(candidates)):
                if j in used:
                    continue

                other = candidates[j]

                # Check if we can merge
                if self._can_merge_patches(
                    current['change_ids'],
                    set(other['change_ids']),
                    target_size,
                    semantic_map
                ):
                    current['change_ids'].update(other['change_ids'])
                    current['size'] += other['size']
                    current['atomic'] = current['atomic'] or other['atomic']
                    used.add(j)

            merged.append(current)
            used.add(i)

        return merged

    def _can_merge_patches(
        self,
        patch1_changes: Set[str],
        patch2_changes: Set[str],
        target_size: int,
        semantic_map: Dict[str, List[SemanticGroup]]
    ) -> bool:
        """Check if two patches can be merged."""
        # Check if changes can be separated (no critical dependencies)
        for c1 in patch1_changes:
            for c2 in patch2_changes:
                if not self.graph.can_changes_be_separated(c1, c2):
                    # They have circular dependency or must stay together
                    return True  # Should merge

        # Calculate combined size
        combined_changes = patch1_changes | patch2_changes
        combined_size = sum(
            self.graph.changes[cid].added_lines + self.graph.changes[cid].deleted_lines
            for cid in combined_changes
        )

        # Don't merge if it would be too large
        if combined_size > target_size * 1.5:
            return False

        # Check semantic similarity
        semantic_score = self._calculate_semantic_similarity(
            patch1_changes,
            patch2_changes,
            semantic_map
        )

        # Merge if semantically similar
        return semantic_score > 0.5

    def _calculate_semantic_similarity(
        self,
        changes1: Set[str],
        changes2: Set[str],
        semantic_map: Dict[str, List[SemanticGroup]]
    ) -> float:
        """Calculate semantic similarity between two sets of changes."""
        # Check if they belong to the same semantic group
        groups1 = set()
        for cid in changes1:
            if cid in semantic_map:
                for group in semantic_map[cid]:
                    groups1.add(group.id)

        groups2 = set()
        for cid in changes2:
            if cid in semantic_map:
                for group in semantic_map[cid]:
                    groups2.add(group.id)

        if not groups1 or not groups2:
            return 0.0

        # Jaccard similarity
        intersection = groups1 & groups2
        union = groups1 | groups2

        return len(intersection) / len(union) if union else 0.0

    def _create_final_patches(
        self,
        merged_patches: List[Dict],
        change_map: Dict[str, Change]
    ) -> List[Patch]:
        """Create final Patch objects with dependencies."""
        patches = []

        print(f"  [Phase 4] Creating {len(merged_patches)} final patch objects...")
        for idx, patch_data in enumerate(merged_patches):
            try:
                change_ids = list(patch_data['change_ids'])
                print(f"  [Phase 4]   Patch {idx+1}: {len(change_ids)} changes")

                # Calculate patch size
                size = sum(
                    change_map[cid].added_lines + change_map[cid].deleted_lines
                    for cid in change_ids
                )
                print(f"  [Phase 4]     Size: {size} lines")

                # Generate name and description
                # Pass previous patches as context
                previous_patches = patches[:idx]
                print(f"  [Phase 4]     Generating name and description...")
                name, description = self._generate_patch_name(change_ids, change_map, previous_patches)
                print(f"  [Phase 4]     Name: {name[:80]}")

                # Check for warnings
                warnings = []
                if size > 500:
                    warnings.append(f"Large patch: {size} lines")

                if len(change_ids) > 20:
                    warnings.append(f"Many changes: {len(change_ids)} hunks")

                if warnings:
                    print(f"  [Phase 4]     Warnings: {warnings}")

                patch = Patch(
                    id=idx,
                    name=name,
                    description=description,
                    changes=change_ids,
                    size_lines=size,
                    warnings=warnings
                )

                patches.append(patch)
            except Exception as e:
                print(f"  [Phase 4]   ERROR creating patch {idx+1}: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
                raise

        print(f"  [Phase 4] Successfully created all {len(patches)} patches")
        return patches

    def _generate_patch_name(
        self,
        change_ids: List[str],
        change_map: Dict[str, Change],
        previous_patches: List[Patch] = None
    ) -> Tuple[str, str]:
        """Generate a descriptive name and description for a patch.

        Returns:
            Tuple of (name, description)
        """
        changes = [change_map[cid] for cid in change_ids]

        # Try to use LLM for generating a meaningful description
        if self.llm_client:
            llm_result = self._generate_patch_name_with_llm(changes, previous_patches or [])
            if llm_result:
                return llm_result  # Returns (name, description) tuple

        # Fallback to heuristic-based naming
        # Collect files and symbols
        files = set(c.file for c in changes)
        symbols = set()

        for change in changes:
            for symbol in change.symbols[:3]:  # Limit to first 3 symbols
                symbols.add(symbol.name)

        # Generate name
        if len(files) == 1:
            file_name = list(files)[0].split('/')[-1]
            if symbols:
                name = f"Update {file_name}: {', '.join(list(symbols)[:2])}"
            else:
                name = f"Changes in {file_name}"
        else:
            if symbols:
                name = f"Update {', '.join(list(symbols)[:2])}"
            else:
                name = f"Changes across {len(files)} files"

        # Generate description using existing method
        description = "no_llm_" + self._generate_patch_description(change_ids, change_map)

        return name, description

    def _generate_patch_name_with_llm(self, changes: List[Change], previous_patches: List[Patch]) -> Optional[Tuple[str, str]]:
        """Use LLM to generate a meaningful patch name and description.

        Args:
            changes: List of changes in the patch
            previous_patches: List of patches that were already generated

        Returns:
            Tuple of (name, description) where description is the full LLM response
            and name is a trimmed version, or None if LLM fails
        """
        import json

        try:
            print(f"  [Phase 4]       Calling LLM for patch naming ({len(changes)} changes)...")
            # Build context for LLM
            change_summaries = []
            for change in changes:
                symbols_info = [{"name": s.name, "type": s.type} for s in change.symbols[:5]]
                change_summaries.append({
                    "file": change.file,
                    "type": change.type,
                    "symbols": symbols_info,
                    "added_lines": change.added_lines,
                    "deleted_lines": change.deleted_lines,
                    "content_preview": change.content[:300]  # First 300 chars
                })

            # Build context from additional_context (commit message, repo info)
            context_parts = []

            # Add commit message if available
            if self.additional_context.get('commit_message'):
                commit_msg = self.additional_context['commit_message']
                context_parts.append(f"Original commit message: {commit_msg}")

            # Add repository context if available
            if self.additional_context.get('repository_info'):
                repo_info = self.additional_context['repository_info']
                if repo_info.get('description'):
                    context_parts.append(f"Repository description: {repo_info['description']}")

            # Add previous patches for context
            if previous_patches:
                prev_patch_summaries = [f"- {p.name}: {p.description}" for p in previous_patches[-3:]]  # Last 3 patches
                if prev_patch_summaries:
                    context_parts.append(f"Previous patches:\n" + "\n".join(prev_patch_summaries))

            additional_context_str = "\n\n".join(context_parts) if context_parts else "No additional context available."

            # Request a concise name from LLM
            prompt = f"""Analyze the following code changes and generate a concise description of what this patch is trying to achieve.

Focus on the PURPOSE or GOAL of the changes and a bit of HOW.

ADDITIONAL CONTEXT:
{additional_context_str}

Changes:
{json.dumps(change_summaries, indent=2)}

Return a JSON object with a "description" field containing the patch description.

Example good names:
- "Add commit filtering by deletion status to reduce the number of redundant commits to be processed"
- "Implement JWT authentication system"
- "Fix memory leak in image processor"
- "Refactor database connection handling"
- "Add user profile management endpoints"

Example bad names:
- "Changes in api.py"
- "Update functions"
- "Modify files"

IMPORTANT: Use the additional context (commit message, previous patches) to understand the broader goal and generate a name that fits within that context.
"""

            messages = [
                {"role": "system", "content": "You are a code analysis expert specializing in understanding the purpose and goals of code changes."},
                {"role": "user", "content": prompt}
            ]

            # Try with JSON format first, fallback if it fails
            response_text = None
            try:
                response_text = self.llm_client.chat_completion(
                    messages=messages,
                    temperature=0.3,
                    response_format={"type": "json_object"}
                )
            except Exception as json_format_error:
                # Some models don't support response_format, try without it
                print(f"JSON format not supported, trying without: {json_format_error}")
                response_text = self.llm_client.chat_completion(
                    messages=messages,
                    temperature=0.3
                )

            # Parse JSON response more robustly
            print(f"  [Phase 4]       Parsing LLM response...")
            response = self._parse_json_response(response_text)
            print(f"  [Phase 4]       Parsed response type: {type(response)}")

            # Parse response
            if isinstance(response, dict) and 'description' in response:
                full_description = response['description'].strip()
                print(f"  [Phase 4]       LLM generated description: {full_description[:100]}...")

                # Create name by trimming description if too long
                if len(full_description) > 80:
                    name = full_description[:77] + "..."
                else:
                    name = full_description

                print(f"  [Phase 4]       LLM patch naming successful")
                return name, full_description
            else:
                print(f"  [Phase 4]       WARNING: Response doesn't have 'description' field: {response}")

        except Exception as e:
            # Debug: Print the exception details
            print(f"  [Phase 4]       ERROR: LLM patch naming failed: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            # Silently fail and use fallback
            pass

        print(f"  [Phase 4]       Falling back to heuristic naming")
        return None

    def _parse_json_response(self, response_text: str) -> dict:
        """Parse JSON response more robustly, handling various response formats."""
        import json
        import re
        
        if not response_text:
            return {}
        
        response_text = response_text.strip()
        
        # First, try to parse the entire response as JSON
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            pass
        
        # If that fails, try to find JSON within the response
        # Look for content between { and } (including nested braces)
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            json_candidate = json_match.group(0)
            try:
                return json.loads(json_candidate)
            except json.JSONDecodeError:
                pass
        
        # If still no valid JSON, try to extract description from text
        # Look for patterns like "description": "..." or description: ...
        desc_patterns = [
            r'"description"\s*:\s*"([^"]+)"',
            r'description\s*:\s*"([^"]+)"',
            r'description\s*:\s*([^\n,}]+)'
        ]
        
        for pattern in desc_patterns:
            match = re.search(pattern, response_text, re.IGNORECASE)
            if match:
                return {"description": match.group(1).strip()}
        
        # Last resort: use the entire response as description
        # Remove common prefixes/suffixes
        clean_text = re.sub(r'^(here\'s|the description is|description:)\s*', '', response_text, flags=re.IGNORECASE)
        clean_text = re.sub(r'\s*(\.)?$', '', clean_text)
        
        if clean_text:
            return {"description": clean_text}
        
        return {}

    def _generate_patch_description(
        self,
        change_ids: List[str],
        change_map: Dict[str, Change]
    ) -> str:
        """Generate a description for a patch."""
        changes = [change_map[cid] for cid in change_ids]

        add_count = sum(1 for c in changes if c.type == 'add')
        modify_count = sum(1 for c in changes if c.type == 'modify')
        delete_count = sum(1 for c in changes if c.type == 'delete')

        parts = []
        if add_count:
            parts.append(f"{add_count} additions")
        if modify_count:
            parts.append(f"{modify_count} modifications")
        if delete_count:
            parts.append(f"{delete_count} deletions")

        return ", ".join(parts)

    def _sort_patches_topologically(self, patches: List[Patch]) -> List[Patch]:
        """Sort patches in topological order respecting dependencies."""
        print(f"  [Phase 4] Building patch dependency graph...")
        # Build patch dependency graph
        import networkx as nx
        patch_graph = nx.DiGraph()

        for patch in patches:
            patch_graph.add_node(patch.id)

        # Add edges based on change dependencies
        edge_count = 0
        print(f"  [Phase 4] Checking dependencies between {len(patches)} patches...")
        for i, patch1 in enumerate(patches):
            for j, patch2 in enumerate(patches):
                if i != j:
                    # Check if patch1 depends on patch2
                    if self._patch_depends_on(patch1, patch2):
                        patch_graph.add_edge(patch1.id, patch2.id)
                        edge_count += 1
        print(f"  [Phase 4] Found {edge_count} dependency edges between patches")

        # Topological sort
        try:
            print(f"  [Phase 4] Performing topological sort...")
            sorted_ids = list(nx.topological_sort(patch_graph))
            print(f"  [Phase 4] Topological sort successful")
        except (nx.NetworkXError, nx.NetworkXUnfeasible) as e:
            # Has cycles - use best effort
            print(f"  [Phase 4] WARNING: Topological sort failed (cycles detected): {e}")
            print(f"  [Phase 4] Detecting and breaking cycles...")

            # Find cycles
            try:
                cycles = list(nx.simple_cycles(patch_graph))
                if cycles:
                    print(f"  [Phase 4] Found {len(cycles)} cycle(s):")
                    for i, cycle in enumerate(cycles[:5]):  # Show first 5 cycles
                        print(f"  [Phase 4]   Cycle {i+1}: {' -> '.join(map(str, cycle))} -> {cycle[0]}")

                    # Break cycles by removing edges with weakest dependencies
                    for cycle in cycles:
                        if len(cycle) >= 2:
                            # Remove edge from last to first node in cycle
                            patch_graph.remove_edge(cycle[-1], cycle[0])
                            print(f"  [Phase 4]   Broke cycle by removing edge: {cycle[-1]} -> {cycle[0]}")

                    # Try topological sort again
                    sorted_ids = list(nx.topological_sort(patch_graph))
                    print(f"  [Phase 4] Topological sort successful after breaking cycles")
                else:
                    print(f"  [Phase 4] No cycles found, using node order")
                    sorted_ids = list(patch_graph.nodes())
            except Exception as e2:
                print(f"  [Phase 4] Cycle detection failed: {e2}")
                print(f"  [Phase 4] Using best-effort ordering")
                sorted_ids = list(patch_graph.nodes())

        # Reassign patch IDs to match the sorted order
        # This ensures that dependencies always point to lower-numbered patches
        print(f"  [Phase 4] Reassigning patch IDs to match sorted order...")
        patch_map = {p.id: p for p in patches}
        old_to_new_id = {}

        for new_id, old_id in enumerate(sorted_ids):
            old_to_new_id[old_id] = new_id

        # Update patch IDs and dependencies
        print(f"  [Phase 4] Updating patch dependencies...")
        sorted_patches = []

        for new_id, old_id in enumerate(sorted_ids):
            patch = patch_map[old_id]
            patch.id = new_id

            # Update dependencies to use new IDs
            old_deps = list(patch_graph.predecessors(old_id))
            patch.depends_on = [old_to_new_id[old_dep] for old_dep in old_deps if old_dep in old_to_new_id]

            if patch.depends_on:
                print(f"  [Phase 4]   Patch {new_id} depends on: {patch.depends_on}")

            sorted_patches.append(patch)

        # Return patches in sorted order with new IDs
        print(f"  [Phase 4] Returning {len(sorted_patches)} sorted patches with reassigned IDs")
        return sorted_patches

    def _patch_depends_on(self, patch1: Patch, patch2: Patch) -> bool:
        """Check if patch1 depends on patch2."""
        # Check if any change in patch1 depends on any change in patch2
        for c1_id in patch1.changes:
            for c2_id in patch2.changes:
                # Check if c1 depends on c2
                dependencies = self.graph.get_dependencies_for_change(c1_id)
                if c2_id in dependencies:
                    return True

        return False

    def validate_patch(self, patch: Patch, applied_patches: List[Patch]) -> Tuple[bool, List[str]]:
        """Validate if a patch can be applied given already applied patches.

        Args:
            patch: Patch to validate
            applied_patches: List of patches already applied

        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        issues = []

        # Get all changes in applied patches
        applied_changes = set()
        for p in applied_patches:
            applied_changes.update(p.changes)

        # Check if all dependencies are satisfied
        for change_id in patch.changes:
            dependencies = self.graph.get_dependencies_for_change(change_id)

            for dep_id in dependencies:
                if dep_id not in applied_changes and dep_id not in patch.changes:
                    issues.append(
                        f"Change {change_id} depends on {dep_id} which is not yet applied"
                    )

        is_valid = len(issues) == 0
        return is_valid, issues
