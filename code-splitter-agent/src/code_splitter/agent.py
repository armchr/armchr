"""Main Code Splitter Agent orchestrator."""

import os
import json
from typing import List, Dict, Optional
from .models import PatchSplitResult, Change, Dependency, AtomicGroup, SemanticGroup, Patch
from .phase1_analysis import DiffParser, DependencyAnalyzer
from .phase2_graph import DependencyGraph
from .phase3_grouping import SemanticGrouper
from .phase4_splitting import PatchSplitter
from .phase5_validation import PatchValidator, PatchOptimizer
from .llm_client import LLMClient


class CodeSplitterAgent:
    """Main agent for splitting code changes into dependency-aware patches."""

    def __init__(
        self,
        llm_api_key: str,
        llm_base_url: Optional[str] = None,
        llm_model: str = "gpt-4",
        use_llm: bool = True
    ):
        """Initialize the code splitter agent.

        Args:
            llm_api_key: API key for LLM service
            llm_base_url: Base URL for LLM API (None for OpenAI default)
            llm_model: Model name to use
            use_llm: Whether to use LLM for enhanced analysis
        """
        self.llm_client = LLMClient(llm_api_key, llm_base_url, llm_model) if use_llm else None
        self.use_llm = use_llm

        # Initialize phase components
        self.diff_parser = DiffParser()
        self.dependency_analyzer = DependencyAnalyzer()
        self.semantic_grouper = SemanticGrouper()
        self.validator = PatchValidator()
        self.optimizer = PatchOptimizer()

    def split_changes(
        self,
        diff_text: str,
        target_patch_size: int = 200,
        max_patches: Optional[int] = None,
        codebase_context: Optional[Dict[str, str]] = None,
        additional_context: Optional[Dict] = None
    ) -> PatchSplitResult:
        """Split code changes into patches.

        Args:
            diff_text: Unified diff text
            target_patch_size: Target number of lines per patch
            max_patches: Maximum number of patches (None for no limit)
            codebase_context: Optional dict mapping file paths to full file content
            additional_context: Optional dict with commit_message, repository_info, etc.

        Returns:
            PatchSplitResult with patches and metadata
        """
        # Ensure additional_context exists
        if additional_context is None:
            additional_context = {}
        # Phase 1: Parse diff and analyze dependencies
        print("Phase 1: Analyzing changes and dependencies...")
        changes = self.diff_parser.parse_diff(diff_text)
        dependencies = self.dependency_analyzer.analyze_dependencies(changes, codebase_context)

        print(f"  Found {len(changes)} changes and {len(dependencies)} dependencies")

        # Optionally enhance with LLM
        if self.use_llm and self.llm_client:
            print("  Using LLM to validate dependencies...")
            dependencies = self._enhance_dependencies_with_llm(changes, dependencies)

        # Phase 2: Build dependency graph
        print("Phase 2: Building dependency graph...")
        dep_graph = DependencyGraph()
        dep_graph.add_changes(changes)
        dep_graph.add_dependencies(dependencies)

        # Find atomic groups
        atomic_groups = dep_graph.find_atomic_groups()
        print(f"  Found {len(atomic_groups)} atomic groups")

        # Phase 3: Identify semantic groups
        print("Phase 3: Identifying semantic groups...")
        semantic_groups = self.semantic_grouper.identify_semantic_groups(changes, atomic_groups)
        print(f"  Found {len(semantic_groups)} semantic groups")

        # Optionally enhance with LLM
        if self.use_llm and self.llm_client:
            print("  Using LLM to refine semantic groups...")
            semantic_groups = self._enhance_semantic_groups_with_llm(
                changes, dependencies, semantic_groups
            )

        # Phase 4: Split into patches
        print("Phase 4: Splitting into patches...")
        splitter = PatchSplitter(
            dep_graph,
            llm_client=self.llm_client if self.use_llm else None,
            additional_context=additional_context
        )
        patches = splitter.split_into_patches(
            changes,
            atomic_groups,
            semantic_groups,
            target_patch_size,
            max_patches
        )
        print(f"  Created {len(patches)} patches")

        # Optionally use LLM to refine the split
        if self.use_llm and self.llm_client:
            print("  Using LLM to review patch split...")
            patches = self._refine_patches_with_llm(
                changes, dependencies, atomic_groups, semantic_groups, patches, target_patch_size
            )

        # Phase 5: Validate and optimize
        print("Phase 5: Validating patches...")
        is_valid, issues = self.validator.validate_patches(patches, changes)

        if not is_valid:
            print(f"  Validation issues found: {issues}")
        else:
            print("  Validation passed!")

        metrics = self.validator.measure_patch_quality(patches, changes)
        suggestions = self.validator.suggest_optimizations(patches, changes, metrics)

        print(f"  Quality metrics: {metrics}")

        # Optionally optimize
        if suggestions:
            print(f"  Optimization suggestions: {suggestions}")

        # Create result
        dependency_order = [p.id for p in patches]

        warnings = []
        if not is_valid:
            warnings.extend(issues)
        warnings.extend(suggestions)

        result = PatchSplitResult(
            patches=patches,
            dependency_order=dependency_order,
            atomic_groups=atomic_groups,
            semantic_groups=semantic_groups,
            warnings=warnings,
            metadata={
                'num_changes': len(changes),
                'num_dependencies': len(dependencies),
                'metrics': metrics,
                'llm_used': self.use_llm,
            }
        )

        return result

    def _enhance_dependencies_with_llm(
        self,
        changes: List[Change],
        dependencies: List[Dependency]
    ) -> List[Dependency]:
        """Use LLM to validate and enhance dependencies."""
        if not self.llm_client:
            return dependencies

        # Create summaries
        changes_summary = self._summarize_changes(changes)
        dep_summary = self._summarize_dependencies(dependencies)

        # Get LLM analysis
        try:
            analysis = self.llm_client.analyze_dependencies(changes_summary, dep_summary)

            if 'error' in analysis:
                print(f"  LLM error: {analysis['error']}")
                return dependencies

            # Add missing dependencies
            if 'missing_dependencies' in analysis:
                print(f"  [LLM] Adding {len(analysis['missing_dependencies'])} missing dependencies...")
                for idx, dep_data in enumerate(analysis['missing_dependencies']):
                    source = dep_data['source']
                    target = dep_data['target']
                    print(f"  [LLM]   Dep {idx+1}: {source} -> {target}")

                    # Validate that source and target are valid change IDs
                    if '*' in source or '*' in target:
                        print(f"  [LLM]   WARNING: Dependency contains wildcard: {source} -> {target}")
                        print(f"  [LLM]   Skipping this dependency")
                        continue

                    dep = Dependency(
                        source=source,
                        target=target,
                        type='call_chain',
                        strength=dep_data.get('strength', 0.8),
                        reason=dep_data.get('reason', 'Identified by LLM')
                    )
                    dependencies.append(dep)

            print(f"  LLM added {len(analysis.get('missing_dependencies', []))} dependencies")

        except Exception as e:
            print(f"  LLM analysis failed: {e}")

        return dependencies

    def _enhance_semantic_groups_with_llm(
        self,
        changes: List[Change],
        dependencies: List[Dependency],
        semantic_groups: List[SemanticGroup]
    ) -> List[SemanticGroup]:
        """Use LLM to refine semantic groups."""
        if not self.llm_client:
            return semantic_groups

        changes_summary = self._summarize_changes(changes)
        dep_summary = self._summarize_dependencies(dependencies)

        try:
            result = self.llm_client.identify_semantic_groups(changes_summary, dep_summary)

            if 'error' in result:
                print(f"  LLM error: {result['error']}")
                return semantic_groups

            # Add LLM-identified groups
            if 'groups' in result:
                for idx, group_data in enumerate(result['groups']):
                    group = SemanticGroup(
                        id=f"llm_{idx}",
                        name=group_data.get('name', 'LLM group'),
                        change_ids=group_data.get('change_ids', []),
                        description=group_data.get('description', ''),
                        cohesion_score=group_data.get('cohesion_score', 0.7)
                    )
                    semantic_groups.append(group)

                print(f"  LLM added {len(result['groups'])} semantic groups")

        except Exception as e:
            print(f"  LLM semantic analysis failed: {e}")

        return semantic_groups

    def _refine_patches_with_llm(
        self,
        changes: List[Change],
        dependencies: List[Dependency],
        atomic_groups: List[AtomicGroup],
        semantic_groups: List[SemanticGroup],
        patches: List[Patch],
        target_size: int
    ) -> List[Patch]:
        """Use LLM to review and potentially refine patches."""
        if not self.llm_client:
            return patches

        changes_summary = self._summarize_changes(changes)
        dep_summary = self._summarize_dependencies(dependencies)
        atomic_summary = self._summarize_atomic_groups(atomic_groups)
        semantic_summary = self._summarize_semantic_groups(semantic_groups)

        try:
            # Get LLM validation
            patches_summary = self._summarize_patches(patches)
            validation = self.llm_client.validate_patches(patches_summary, dep_summary)

            if 'error' not in validation:
                if not validation.get('is_valid', True):
                    print(f"  LLM found issues: {validation.get('issues', [])}")

                if validation.get('suggestions'):
                    print(f"  LLM suggestions: {validation.get('suggestions', [])}")

        except Exception as e:
            print(f"  LLM validation failed: {e}")

        return patches

    def _summarize_changes(self, changes: List[Change]) -> str:
        """Create a concise summary of changes for LLM."""
        summary_lines = []

        for change in changes[:50]:  # Limit to first 50 changes
            symbols_str = ", ".join([s.name for s in change.symbols[:3]])
            summary_lines.append(
                f"- {change.id}: {change.type} in {change.file}, "
                f"symbols: [{symbols_str}], "
                f"{change.added_lines}+ {change.deleted_lines}-"
            )

        if len(changes) > 50:
            summary_lines.append(f"... and {len(changes) - 50} more changes")

        return "\n".join(summary_lines)

    def _summarize_dependencies(self, dependencies: List[Dependency]) -> str:
        """Create a concise summary of dependencies for LLM."""
        summary_lines = []

        for dep in dependencies[:50]:  # Limit to first 50
            summary_lines.append(
                f"- {dep.source} -> {dep.target} "
                f"({dep.type}, strength={dep.strength:.1f}): {dep.reason}"
            )

        if len(dependencies) > 50:
            summary_lines.append(f"... and {len(dependencies) - 50} more dependencies")

        return "\n".join(summary_lines)

    def _summarize_atomic_groups(self, groups: List[AtomicGroup]) -> str:
        """Create a concise summary of atomic groups for LLM."""
        summary_lines = []

        for group in groups:
            summary_lines.append(
                f"- {group.id}: [{', '.join(group.change_ids[:5])}{'...' if len(group.change_ids) > 5 else ''}] "
                f"- {group.reason}"
            )

        return "\n".join(summary_lines)

    def _summarize_semantic_groups(self, groups: List[SemanticGroup]) -> str:
        """Create a concise summary of semantic groups for LLM."""
        summary_lines = []

        for group in groups:
            summary_lines.append(
                f"- {group.name} (cohesion={group.cohesion_score:.2f}): "
                f"{group.description} "
                f"[{len(group.change_ids)} changes]"
            )

        return "\n".join(summary_lines)

    def _summarize_patches(self, patches: List[Patch]) -> str:
        """Create a concise summary of patches for LLM."""
        summary_lines = []

        for patch in patches:
            deps_str = f"depends on {patch.depends_on}" if patch.depends_on else "no dependencies"
            summary_lines.append(
                f"- Patch {patch.id}: {patch.name} "
                f"({len(patch.changes)} changes, {patch.size_lines} lines, {deps_str})"
            )

        return "\n".join(summary_lines)

    def export_patches_to_files(
        self,
        result: PatchSplitResult,
        diff_text: str,
        output_dir: str,
        repository_info: Optional[Dict] = None,
        patch_annotations: Optional[Dict[int, List[Dict]]] = None
    ):
        """Export patches to separate diff files matching simple_splitter_agent format.

        Args:
            result: PatchSplitResult from split_changes
            diff_text: Original diff text
            output_dir: Directory to write patch files
            repository_info: Optional repository metadata
            patch_annotations: Optional dict mapping patch_id to list of annotation dicts.
                             Each annotation dict should have: file_path, hunk_header,
                             start_line, end_line, description
        """
        import os
        from datetime import datetime, timezone

        print(f"[Export] Starting patch export to {output_dir}")
        print(f"[Export] Number of patches to export: {len(result.patches)}")

        os.makedirs(output_dir, exist_ok=True)

        # Parse original diff to reconstruct full diffs per patch
        print(f"[Export] Parsing original diff ({len(diff_text)} chars)...")
        changes = self.diff_parser.parse_diff(diff_text)
        change_map = {c.id: c for c in changes}
        print(f"[Export] Parsed {len(changes)} changes")

        # Generate timestamps
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")  # For filenames
        utc_timestamp = int(datetime.now(timezone.utc).timestamp())  # For metadata

        # Track patch filenames and metadata
        patch_metadata = []

        # Write each patch file
        print(f"[Export] Writing {len(result.patches)} patch files...")
        for idx, patch in enumerate(result.patches):
            try:
                print(f"[Export]   Processing patch {idx+1}/{len(result.patches)}: {patch.name[:60]}...")
                # Create filename: 01_Patch_name.patch
                safe_name = patch.name.replace(' ', '_').replace('/', '_')[:50]
                filename = f"{patch.id:02d}_{safe_name}.patch"
                filepath = os.path.join(output_dir, filename)
                print(f"[Export]     Filename: {filename}")

                # Collect files involved in this patch
                files_in_patch = set()
                for change_id in patch.changes:
                    if change_id in change_map:
                        files_in_patch.add(change_map[change_id].file)
                print(f"[Export]     Files in patch: {len(files_in_patch)}")

                # Build patch metadata
                # Use provided annotations if available, otherwise generate them
                print(f"[Export]     Building metadata...")
                annotations = (patch_annotations.get(patch.id) if patch_annotations
                              else self._generate_annotations(patch, change_map))
                print(f"[Export]     Annotations: {len(annotations)}")

                patch_meta = {
                    "id": patch.id,
                    "name": patch.name,
                    "description": patch.description,
                    "category": self._categorize_patch(patch, change_map),
                    "priority": len(patch.depends_on) + 1,  # Priority based on dependency depth
                    "files": sorted(list(files_in_patch)),
                    "dependencies": patch.depends_on,
                    "filename": filename,
                    "annotations": annotations
                }
                patch_metadata.append(patch_meta)

                # Write patch file
                print(f"[Export]     Writing patch file...")
                with open(filepath, 'w') as f:
                    # Header matching simple_splitter_agent format
                    f.write(f"# {patch.name}\n")
                    f.write(f"# Category: {patch_meta['category']}\n")
                    f.write(f"# Priority: {patch_meta['priority']}\n")
                    f.write(f"# Generated: {timestamp}\n")
                    f.write(f"# Files: {', '.join(sorted(files_in_patch))}\n")
                    f.write(f"# Description: {patch.description}\n")
                    f.write("\n")

                    # Group changes by file to reconstruct proper diff format
                    file_changes = {}
                    for change_id in patch.changes:
                        if change_id in change_map:
                            change = change_map[change_id]
                            if change.file not in file_changes:
                                file_changes[change.file] = []
                            file_changes[change.file].append(change)

                    # Write diffs for each file
                    for file_path in sorted(file_changes.keys()):
                        # Write git diff header
                        f.write(f"diff --git a/{file_path} b/{file_path}\n")
                        f.write(f"index 1234567..abcdefg 100644\n")
                        f.write(f"--- a/{file_path}\n")
                        f.write(f"+++ b/{file_path}\n")

                        # Sort hunks by line number (ascending order)
                        sorted_changes = sorted(file_changes[file_path],
                                              key=lambda c: c.line_range[0])

                        # Write hunks in sorted order
                        for change in sorted_changes:
                            f.write(change.content)
                            if not change.content.endswith('\n'):
                                f.write('\n')

                print(f"[Export]     ✓ Patch file written successfully")

            except Exception as e:
                print(f"[Export]     ERROR writing patch {idx+1}: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
                raise

        print(f"[Export] All patch files written successfully")

        # Write metadata.json
        # Use repository description as goal_summary if available
        # For uncommitted changes (no description), generate a summary using LLM or patch names
        if repository_info and repository_info.get("description"):
            goal_summary = repository_info.get("description")
        else:
            # Generate summary for uncommitted changes
            goal_summary = self._generate_goal_summary(result.patches, changes)

        metadata = {
            "generated_at": utc_timestamp,
            "total_patches": len(result.patches),
            "goal_summary": goal_summary,
            "repository": repository_info or {
                "path": os.getcwd(),
                "name": os.path.basename(os.getcwd()),
                "current_branch": "main",
                "source_repo_name": os.path.basename(os.getcwd()),
                "language": "unknown",
                "description": None,
                "analysis": {"mode": "diff_only"},
                "base_branch": "main"
            },
            "patches": patch_metadata
        }

        metadata_path = os.path.join(output_dir, f"metadata_{timestamp}.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        # Write summary.md
        self._write_summary_markdown(result, patch_metadata, output_dir, timestamp)

        # Write apply_patches.sh
        self._write_apply_script(patch_metadata, output_dir)

        print(f"Exported {len(result.patches)} patches to {output_dir}")

    def _categorize_patch(self, patch: Patch, change_map: Dict[str, Change]) -> str:
        """Categorize patch based on changes."""
        # Analyze symbols to determine category
        all_symbols = []
        for change_id in patch.changes:
            if change_id in change_map:
                all_symbols.extend(change_map[change_id].symbols)

        # Simple categorization logic
        if any(s.type == 'import' for s in all_symbols):
            return "refactor"
        elif any(s.type in ['function', 'method'] for s in all_symbols):
            return "feature"
        elif any(s.type == 'class' for s in all_symbols):
            return "feature"
        else:
            return "other"

    def _generate_annotations(self, patch: Patch, change_map: Dict[str, Change]) -> List[Dict]:
        """Generate annotations for each change in the patch."""
        annotations = []

        # Collect changes for this patch
        changes = []
        for change_id in patch.changes:
            if change_id in change_map:
                changes.append(change_map[change_id])

        # Sort changes by file and then by line number to match patch file order
        changes.sort(key=lambda c: (c.file, c.line_range[0]))

        # Use LLM to generate meaningful descriptions if available
        if self.use_llm and self.llm_client:
            descriptions = self._generate_descriptions_with_llm(changes, patch)
        else:
            descriptions = [self._generate_change_description(change) for change in changes]

        # Generate annotations in sorted order
        for i, change in enumerate(changes):
            # Extract hunk header from content
            lines = change.content.split('\n')
            hunk_header = None
            for line in lines:
                if line.startswith('@@'):
                    hunk_header = line
                    break

            if not hunk_header:
                hunk_header = f"@@ -{change.line_range[0]},1 +{change.line_range[0]},1 @@"

            # Parse hunk header to extract oldStart and newStart
            # Format: @@ -oldStart,oldCount +newStart,newCount @@ context
            import re
            match = re.match(r'@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@', hunk_header)
            if match:
                old_start = int(match.group(1))
                new_start = int(match.group(2))
            else:
                # Fallback if parsing fails
                old_start = change.line_range[0]
                new_start = change.line_range[0]

            annotation = {
                "file_path": change.file,
                "hunk_header": hunk_header,
                "start_line": old_start,  # oldStart from @@ -oldStart
                "end_line": new_start,     # newStart from @@ +newStart
                "description": descriptions[i] if i < len(descriptions) else self._generate_change_description(change)
            }
            annotations.append(annotation)

        return annotations

    def _generate_descriptions_with_llm(self, changes: List[Change], patch: Patch) -> List[str]:
        """Use LLM to generate meaningful descriptions for changes.

        Args:
            changes: List of changes to describe
            patch: The patch containing these changes

        Returns:
            List of descriptions, one per change
        """
        if not self.llm_client:
            return [self._generate_change_description(change) for change in changes]

        try:
            # Build context for LLM
            context = {
                "patch_name": patch.name,
                "patch_description": patch.description,
                "changes": []
            }

            for change in changes:
                change_info = {
                    "file": change.file,
                    "type": change.type,
                    "symbols": [{"name": s.name, "type": s.type} for s in change.symbols],
                    "added_lines": change.added_lines,
                    "deleted_lines": change.deleted_lines,
                    "content": change.content[:500]  # Limit content size
                }
                context["changes"].append(change_info)

            # Request descriptions from LLM
            prompt = f"""Analyze the following code changes and generate a concise, meaningful description for each change.
Each description should explain WHAT the change is trying to achieve, not just what files it modifies.

Patch: {patch.name}
Description: {patch.description}

Changes:
{json.dumps(context['changes'], indent=2)}

Return a JSON object with a "descriptions" array containing one description per change.
Each description should be a single sentence that explains the purpose or effect of the change.

Example good descriptions:
- "Adds a filter to skip commits marked as 'deleted' when listing commits"
- "Implements error handling for network timeouts in API requests"
- "Refactors authentication logic to use JWT tokens instead of sessions"

Example bad descriptions:
- "Modifies src/api.py"
- "Changes function foo"
- "Updates file"
"""

            messages = [
                {"role": "system", "content": "You are a code analysis expert specializing in understanding code changes and their purposes."},
                {"role": "user", "content": prompt}
            ]

            response_text = self.llm_client.chat_completion(
                messages=messages,
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            response = json.loads(response_text)

            # Parse response
            if isinstance(response, dict) and 'descriptions' in response:
                descriptions = response['descriptions']
                if len(descriptions) == len(changes):
                    return descriptions

            # Fallback if parsing fails
            print("  LLM description generation failed, using fallback")

        except Exception as e:
            print(f"  LLM description generation error: {e}")

        # Fallback to basic descriptions
        return [self._generate_change_description(change) for change in changes]

    def _generate_change_description(self, change: Change) -> str:
        """Generate a basic description for a change (fallback)."""
        if change.symbols:
            symbol_names = ", ".join([s.name for s in change.symbols[:3]])
            if change.type == 'add':
                return f"Adds {symbol_names} to {change.file}"
            elif change.type == 'modify':
                return f"Modifies {symbol_names} in {change.file}"
            elif change.type == 'delete':
                return f"Removes {symbol_names} from {change.file}"

        if change.type == 'add':
            return f"Adds {change.added_lines} lines to {change.file}"
        elif change.type == 'modify':
            return f"Modifies {change.file}"
        elif change.type == 'delete':
            return f"Removes {change.deleted_lines} lines from {change.file}"

        return f"Changes in {change.file}"

    def _generate_goal_summary(self, patches: List[Patch], changes: List[Change]) -> str:
        """Generate a short summary of all changes for uncommitted changes.

        Args:
            patches: List of patches
            changes: List of changes

        Returns:
            A concise summary describing the overall goal of the changes
        """
        # Try to use LLM for generating a meaningful summary
        if self.use_llm and self.llm_client:
            llm_summary = self._generate_goal_summary_with_llm(patches, changes)
            if llm_summary:
                return llm_summary

        # Fallback: concatenate patch names
        return "; ".join([p.name for p in patches])

    def _generate_goal_summary_with_llm(self, patches: List[Patch], changes: List[Change]) -> Optional[str]:
        """Use LLM to generate a short summary of all changes.

        Args:
            patches: List of patches
            changes: List of changes

        Returns:
            A 1-2 sentence summary, or None if LLM fails
        """
        try:
            # Build context for LLM
            patch_summaries = []
            for patch in patches:
                patch_summaries.append({
                    "name": patch.name,
                    "description": patch.description,
                    "num_changes": len(patch.changes),
                    "size_lines": patch.size_lines
                })

            # Get file statistics
            files = set(c.file for c in changes)
            total_added = sum(c.added_lines for c in changes)
            total_deleted = sum(c.deleted_lines for c in changes)

            context = {
                "num_patches": len(patches),
                "num_files": len(files),
                "total_added_lines": total_added,
                "total_deleted_lines": total_deleted,
                "patches": patch_summaries[:10]  # Limit to first 10 patches
            }

            # Request summary from LLM
            prompt = f"""Analyze the following code changes and generate a concise 1-2 sentence summary that describes the overall goal or purpose of all these changes.

Context:
{json.dumps(context, indent=2)}

Return a JSON object with a "summary" field containing the overall summary.

The summary should:
- Be 1-2 sentences maximum
- Describe the HIGH-LEVEL goal or purpose
- Be specific enough to understand what's being accomplished
- NOT just list files or patch names

Example good summaries:
- "Implements user authentication system with JWT tokens and session management"
- "Refactors database layer to use connection pooling and adds error handling"
- "Adds commit filtering functionality and updates UI to display filtered results"
- "Fixes memory leaks in image processing pipeline and optimizes performance"

Example bad summaries:
- "Updates multiple files"
- "Makes changes to the codebase"
- "Modifies api.py, db.py, and utils.py"
"""

            messages = [
                {"role": "system", "content": "You are a code analysis expert specializing in understanding the purpose and goals of code changes."},
                {"role": "user", "content": prompt}
            ]

            response_text = self.llm_client.chat_completion(
                messages=messages,
                temperature=0.3,
                response_format={"type": "json_object"}
            )

            response = json.loads(response_text)

            # Parse response
            if isinstance(response, dict) and 'summary' in response:
                summary = response['summary'].strip()
                # Ensure summary is not too long (max ~200 chars)
                if len(summary) > 200:
                    summary = summary[:197] + "..."
                return summary

        except Exception as e:
            # Silently fail and use fallback
            pass

        return None

    def _write_summary_markdown(
        self,
        result: PatchSplitResult,
        patch_metadata: List[Dict],
        output_dir: str,
        timestamp: str
    ):
        """Write summary.md file."""
        summary_path = os.path.join(output_dir, f"summary_{timestamp}.md")

        with open(summary_path, 'w') as f:
            f.write("# Code Changes Summary\n\n")
            f.write(f"**Generated:** {timestamp}\n")
            f.write(f"**Total Patches:** {len(result.patches)}\n\n")

            # Group by category
            by_category = {}
            for patch_meta in patch_metadata:
                cat = patch_meta['category']
                if cat not in by_category:
                    by_category[cat] = []
                by_category[cat].append(patch_meta)

            # Write AI Analysis section (placeholder)
            f.write("## AI Analysis\n\n")
            if result.metadata.get('llm_used'):
                f.write("Dependencies analyzed and validated by LLM.\n\n")
            else:
                f.write("Analysis performed using static analysis.\n\n")

            # Write patch details
            f.write("## Patch Details\n\n")

            for category in sorted(by_category.keys()):
                f.write(f"### {category.title()} Changes\n\n")

                for patch_meta in by_category[category]:
                    f.write(f"**{patch_meta['name']}** (Priority: {patch_meta['priority']})\n")
                    f.write(f"- {patch_meta['description']}\n")
                    f.write(f"- Files: {', '.join(patch_meta['files'])}\n\n")

            # Write application order
            f.write("## Recommended Application Order\n\n")
            for i, patch_meta in enumerate(patch_metadata, 1):
                f.write(f"{i}. `{patch_meta['filename']}` - {patch_meta['name']}\n")

            f.write("\n## Usage\n\n")
            f.write("To apply patches in the recommended order:\n")
            f.write("```bash\n")
            f.write("chmod +x apply_patches.sh\n")
            f.write("./apply_patches.sh\n")
            f.write("```\n\n")
            f.write("To apply individual patches:\n")
            f.write("```bash\n")
            f.write("git apply <patch_file>\n")
            f.write("```\n")

    def _write_apply_script(self, patch_metadata: List[Dict], output_dir: str):
        """Write apply_patches.sh script."""
        script_path = os.path.join(output_dir, "apply_patches.sh")

        with open(script_path, 'w') as f:
            f.write("#!/bin/bash\n")
            f.write("# Auto-generated script to apply patches in recommended order\n")
            f.write("# Generated by code-splitter-agent\n\n")
            f.write("set -e  # Exit on any error\n\n")
            f.write('echo "Applying patches in recommended order..."\n')
            f.write('echo ""\n\n')

            for i, patch_meta in enumerate(patch_metadata, 1):
                filename = patch_meta['filename']
                name = patch_meta['name']

                f.write(f'echo "Step {i}: Applying {name}..."\n')
                f.write(f'if git apply --check "{filename}" 2>/dev/null; then\n')
                f.write(f'    git apply "{filename}"\n')
                f.write(f'    echo "✓ Successfully applied {filename}"\n')
                f.write('else\n')
                f.write(f'    echo "✗ Failed to apply {filename}"\n')
                f.write('    echo "Please check for conflicts and apply manually"\n')
                f.write('    exit 1\n')
                f.write('fi\n')
                f.write('echo ""\n\n')

            f.write('echo "All patches applied successfully!"\n')
            f.write('echo "Consider reviewing changes and running tests before committing."\n')

        # Make script executable
        os.chmod(script_path, 0o755)

    def resplit_patch(
        self,
        patch_split_dir: str,
        patch_filename: str,
        target_patch_size: int = 200,
        max_patches: Optional[int] = None
    ) -> str:
        """Re-split a specific patch from an existing patch split directory.

        Args:
            patch_split_dir: Path to existing patch split directory
            patch_filename: Name of the patch file to re-split (e.g., "01_Add_feature.patch")
            target_patch_size: Target number of lines per patch
            max_patches: Maximum number of patches (None for no limit)

        Returns:
            Path to the updated patch split directory
        """
        import shutil
        from datetime import datetime, timezone
        import tempfile

        # Validate inputs
        if not os.path.exists(patch_split_dir):
            raise FileNotFoundError(f"Patch split directory not found: {patch_split_dir}")

        patch_file_path = os.path.join(patch_split_dir, patch_filename)
        if not os.path.exists(patch_file_path):
            raise FileNotFoundError(f"Patch file not found: {patch_file_path}")

        # Find and load the metadata file
        metadata_files = [f for f in os.listdir(patch_split_dir) if f.startswith('metadata_') and f.endswith('.json')]
        if not metadata_files:
            raise FileNotFoundError(f"No metadata file found in {patch_split_dir}")

        metadata_path = os.path.join(patch_split_dir, metadata_files[0])
        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Find the patch entry in metadata
        patch_entry = None
        patch_index = None
        for i, p in enumerate(metadata['patches']):
            if p['filename'] == patch_filename:
                patch_entry = p
                patch_index = i
                break

        if not patch_entry:
            raise ValueError(f"Patch {patch_filename} not found in metadata")

        print(f"Re-splitting patch: {patch_entry['name']}")
        print(f"  Original: {len(patch_entry['files'])} files, priority {patch_entry['priority']}")

        # Read the patch file content
        with open(patch_file_path, 'r') as f:
            patch_content = f.read()

        # Extract the actual diff (skip header comments)
        diff_lines = []
        in_diff = False
        for line in patch_content.split('\n'):
            if line.startswith('diff --git'):
                in_diff = True
            if in_diff:
                diff_lines.append(line)

        diff_text = '\n'.join(diff_lines)

        # Split the patch
        print("\nSplitting patch into smaller pieces...")
        result = self.split_changes(
            diff_text,
            target_patch_size=target_patch_size,
            max_patches=max_patches
        )

        print(f"  Created {len(result.patches)} new patches")

        # Create a temporary directory for the new split
        with tempfile.TemporaryDirectory() as temp_dir:
            # Export the new patches to temp directory
            temp_metadata_path = self._export_split_patches(
                result,
                diff_text,
                temp_dir,
                metadata.get('repository'),
                patch_entry
            )

            # Load the new metadata
            with open(temp_metadata_path, 'r') as f:
                new_metadata = json.load(f)

            # Update patch IDs to fit into the existing sequence
            # New patches will replace the old patch and take its ID and subsequent IDs
            old_patch_id = patch_entry['id']
            num_new_patches = len(new_metadata['patches'])

            # Adjust IDs: patches before the old patch stay the same,
            # new patches take old_patch_id, old_patch_id+1, etc.,
            # patches after get shifted by (num_new_patches - 1)
            updated_patches = []
            new_patch_entries = []

            for i, p in enumerate(metadata['patches']):
                if i < patch_index:
                    # Patches before the split patch remain unchanged
                    updated_patches.append(p)
                elif i == patch_index:
                    # Replace with new split patches
                    for j, new_p in enumerate(new_metadata['patches']):
                        new_id = old_patch_id + j
                        new_p['id'] = new_id

                        # Update filename to include new ID
                        old_filename = new_p['filename']
                        # Extract name part (everything after the ID prefix)
                        name_part = '_'.join(old_filename.split('_')[1:])
                        new_filename = f"{new_id:02d}_{name_part}"
                        new_p['filename'] = new_filename

                        # Update dependencies to account for new IDs
                        updated_deps = []
                        for dep in new_p.get('dependencies', []):
                            if dep < old_patch_id:
                                # Dependencies before the split remain unchanged
                                updated_deps.append(dep)
                            else:
                                # Dependencies within or after the split get adjusted
                                updated_deps.append(dep - patch_index + old_patch_id)
                        new_p['dependencies'] = updated_deps

                        updated_patches.append(new_p)
                        new_patch_entries.append(new_p)
                else:
                    # Patches after the split patch get their IDs shifted
                    p['id'] = p['id'] + (num_new_patches - 1)

                    # Update filename
                    old_filename = p['filename']
                    name_part = '_'.join(old_filename.split('_')[1:])
                    p['filename'] = f"{p['id']:02d}_{name_part}"

                    # Update dependencies
                    updated_deps = []
                    for dep in p.get('dependencies', []):
                        if dep < old_patch_id:
                            updated_deps.append(dep)
                        elif dep == old_patch_id:
                            # Depended on the split patch, now depends on the first new patch
                            updated_deps.append(old_patch_id)
                        else:
                            updated_deps.append(dep + (num_new_patches - 1))
                    p['dependencies'] = updated_deps

                    updated_patches.append(p)

            # Update metadata
            metadata['patches'] = updated_patches
            metadata['total_patches'] = len(updated_patches)
            metadata['generated_at'] = int(datetime.now(timezone.utc).timestamp())

            # Copy all files from original directory except the patch being split and metadata
            print("\nUpdating patch directory...")
            for filename in os.listdir(patch_split_dir):
                src_path = os.path.join(patch_split_dir, filename)

                # Skip the patch being split and metadata files
                if filename == patch_filename or filename.startswith('metadata_'):
                    continue

                # Copy patch files with potentially updated IDs
                if filename.endswith('.patch'):
                    # Check if this patch needs to be renamed
                    old_id = int(filename.split('_')[0])

                    if old_id < patch_index:
                        # No change needed
                        dst_path = src_path
                    elif old_id == patch_index:
                        # This is the patch being split, skip it
                        continue
                    else:
                        # Rename with new ID
                        new_id = old_id + (num_new_patches - 1)
                        name_part = '_'.join(filename.split('_')[1:])
                        new_filename = f"{new_id:02d}_{name_part}"
                        dst_path = os.path.join(patch_split_dir, new_filename)

                        # Rename the file
                        if src_path != dst_path:
                            shutil.move(src_path, dst_path)
                            print(f"  Renamed: {filename} -> {new_filename}")

            # Copy new patch files from temp directory
            for new_patch in new_patch_entries:
                temp_patch_path = os.path.join(temp_dir, new_metadata['patches'][new_patch_entries.index(new_patch)]['filename'])
                # The filename in temp might be different, need to find it
                temp_files = [f for f in os.listdir(temp_dir) if f.endswith('.patch')]

                # Find the corresponding temp file by index
                idx = new_patch_entries.index(new_patch)
                if idx < len(temp_files):
                    temp_filename = sorted(temp_files)[idx]
                    temp_patch_path = os.path.join(temp_dir, temp_filename)

                    dst_path = os.path.join(patch_split_dir, new_patch['filename'])
                    shutil.copy2(temp_patch_path, dst_path)
                    print(f"  Created: {new_patch['filename']}")

            # Write updated metadata
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            new_metadata_path = os.path.join(patch_split_dir, f"metadata_{timestamp_str}.json")
            with open(new_metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)

            # Remove old metadata file
            os.remove(metadata_path)
            print(f"  Updated: metadata")

        print(f"\n✓ Successfully re-split patch into {num_new_patches} patches")
        print(f"  Total patches now: {len(updated_patches)}")

        return patch_split_dir

    def _export_split_patches(
        self,
        result: PatchSplitResult,
        diff_text: str,
        output_dir: str,
        repository_info: Optional[Dict],
        original_patch_entry: Dict
    ) -> str:
        """Export split patches to directory (helper for resplit_patch).

        Returns:
            Path to the metadata file
        """
        from datetime import datetime, timezone

        # Parse diff
        changes = self.diff_parser.parse_diff(diff_text)
        change_map = {c.id: c for c in changes}

        # Generate timestamps
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        utc_timestamp = int(datetime.now(timezone.utc).timestamp())

        # Track patch filenames and metadata
        patch_metadata = []

        # Write each patch file
        for patch in result.patches:
            # Create filename
            safe_name = patch.name.replace(' ', '_').replace('/', '_')[:50]
            filename = f"{patch.id:02d}_{safe_name}.patch"
            filepath = os.path.join(output_dir, filename)

            # Collect files involved in this patch
            files_in_patch = set()
            for change_id in patch.changes:
                if change_id in change_map:
                    files_in_patch.add(change_map[change_id].file)

            # Generate annotations
            annotations = self._generate_annotations(patch, change_map)

            patch_meta = {
                "id": patch.id,
                "name": patch.name,
                "description": patch.description,
                "category": original_patch_entry.get('category', 'other'),
                "priority": original_patch_entry.get('priority', 1),
                "files": sorted(list(files_in_patch)),
                "dependencies": patch.depends_on,
                "filename": filename,
                "annotations": annotations
            }
            patch_metadata.append(patch_meta)

            # Write patch file
            with open(filepath, 'w') as f:
                f.write(f"# {patch.name}\n")
                f.write(f"# Category: {patch_meta['category']}\n")
                f.write(f"# Priority: {patch_meta['priority']}\n")
                f.write(f"# Generated: {timestamp}\n")
                f.write(f"# Files: {', '.join(sorted(files_in_patch))}\n")
                f.write(f"# Description: {patch.description}\n")
                f.write("\n")

                # Group changes by file
                file_changes = {}
                for change_id in patch.changes:
                    if change_id in change_map:
                        change = change_map[change_id]
                        if change.file not in file_changes:
                            file_changes[change.file] = []
                        file_changes[change.file].append(change)

                # Write diffs for each file
                for file_path in sorted(file_changes.keys()):
                    f.write(f"diff --git a/{file_path} b/{file_path}\n")
                    f.write(f"index 1234567..abcdefg 100644\n")
                    f.write(f"--- a/{file_path}\n")
                    f.write(f"+++ b/{file_path}\n")

                    sorted_changes = sorted(file_changes[file_path],
                                          key=lambda c: c.line_range[0])

                    for change in sorted_changes:
                        f.write(change.content)
                        if not change.content.endswith('\n'):
                            f.write('\n')

        # Write metadata
        goal_summary = original_patch_entry.get('name', 'Re-split patches')

        metadata = {
            "generated_at": utc_timestamp,
            "total_patches": len(result.patches),
            "goal_summary": goal_summary,
            "repository": repository_info,
            "patches": patch_metadata
        }

        metadata_path = os.path.join(output_dir, f"metadata_{timestamp}.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        return metadata_path
