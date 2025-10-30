"""Phase 4: Patch Splitting with Constraints."""

from typing import List, Dict, Set, Optional, Tuple
from .models import Change, Dependency, Patch, AtomicGroup, SemanticGroup
from .phase2_graph import DependencyGraph


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

        # Start with atomic groups as building blocks
        patch_candidates = []

        # Add atomic groups as initial patches
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
        except nx.NetworkXError as e:
            # Has cycles - use best effort
            print(f"  [Phase 4] WARNING: Topological sort failed (cycles detected): {e}")
            print(f"  [Phase 4] Using best-effort ordering")
            sorted_ids = list(patch_graph.nodes())

        # Update dependencies in patches
        print(f"  [Phase 4] Updating patch dependencies...")
        patch_map = {p.id: p for p in patches}

        for patch_id in sorted_ids:
            patch = patch_map[patch_id]
            # Get predecessors as dependencies
            patch.depends_on = list(patch_graph.predecessors(patch_id))
            if patch.depends_on:
                print(f"  [Phase 4]   Patch {patch_id} depends on: {patch.depends_on}")

        # Return patches in sorted order
        print(f"  [Phase 4] Returning {len(sorted_ids)} sorted patches")
        return [patch_map[pid] for pid in sorted_ids]

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
