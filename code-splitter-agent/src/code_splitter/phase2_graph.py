"""Phase 2: Dependency Graph Construction."""

import networkx as nx
from typing import List, Dict, Set, Tuple
from .models import Change, Dependency, AtomicGroup


# Maximum size (in lines) for an atomic group before we try to split it
MAX_ATOMIC_GROUP_SIZE = 500


class DependencyGraph:
    """Manages the dependency graph for code changes."""

    def __init__(self):
        self.graph = nx.DiGraph()
        self.changes: Dict[str, Change] = {}
        self.dependencies: List[Dependency] = []

    def add_changes(self, changes: List[Change]):
        """Add changes as nodes to the graph."""
        for change in changes:
            self.graph.add_node(change.id, change=change)
            self.changes[change.id] = change

    def add_dependencies(self, dependencies: List[Dependency]):
        """Add dependencies as edges to the graph."""
        for dep in dependencies:
            self.dependencies.append(dep)
            self.graph.add_edge(
                dep.source,
                dep.target,
                type=dep.type,
                strength=dep.strength,
                reason=dep.reason
            )

    def find_strongly_connected_components(self) -> List[List[str]]:
        """Find strongly connected components (circular dependencies).

        Returns:
            List of lists, where each inner list contains change IDs
            that form a strongly connected component
        """
        sccs = list(nx.strongly_connected_components(self.graph))
        # Filter out single-node components (no cycles)
        return [list(scc) for scc in sccs if len(scc) > 1]

    def compute_transitive_closure(self) -> nx.DiGraph:
        """Compute the transitive closure of the dependency graph.

        Returns:
            A new graph where edges represent both direct and indirect dependencies
        """
        return nx.transitive_closure(self.graph)

    def topological_sort(self) -> List[str]:
        """Perform topological sort on the dependency graph.

        Returns:
            List of change IDs in topological order

        Raises:
            nx.NetworkXError: If the graph contains cycles
        """
        try:
            return list(nx.topological_sort(self.graph))
        except nx.NetworkXError:
            # Graph has cycles - return a best-effort ordering
            # Remove cycles by removing minimum edges
            cycles = list(nx.simple_cycles(self.graph))
            temp_graph = self.graph.copy()

            # Remove one edge from each cycle
            for cycle in cycles:
                if len(cycle) >= 2:
                    temp_graph.remove_edge(cycle[0], cycle[1])

            return list(nx.topological_sort(temp_graph))

    def find_atomic_groups(self) -> List[AtomicGroup]:
        """Identify groups of changes that cannot be split.

        Returns:
            List of AtomicGroup objects
        """
        atomic_groups = []

        print(f"  [Phase 2] Finding atomic groups...")
        print(f"  [Phase 2] Total changes in graph: {len(self.changes)}")
        print(f"  [Phase 2] Total dependencies: {len(self.dependencies)}")

        # 1. Strongly connected components (circular dependencies)
        print(f"  [Phase 2] Looking for strongly connected components...")
        sccs = self.find_strongly_connected_components()
        print(f"  [Phase 2] Found {len(sccs)} SCCs")
        for idx, scc in enumerate(sccs):
            print(f"  [Phase 2]   SCC {idx}: {scc}")
            group = AtomicGroup(
                id=f"scc_{idx}",
                change_ids=scc,
                reason="Circular dependency - changes must stay together"
            )
            atomic_groups.append(group)

        # 2. Changes with very strong dependencies (strength = 1.0)
        # NOTE: Now uses SCCs instead of undirected connected components
        # to avoid over-grouping one-way dependency chains
        print(f"  [Phase 2] Looking for strong dependency groups (using SCCs)...")
        strong_groups = self._find_strong_dependency_groups()
        print(f"  [Phase 2] Found {len(strong_groups)} strong groups")
        for idx, group_changes in enumerate(strong_groups):
            print(f"  [Phase 2]   Strong group {idx}: {group_changes}")
            group = AtomicGroup(
                id=f"strong_{idx}",
                change_ids=group_changes,
                reason="Critical dependencies - must not be split"
            )
            atomic_groups.append(group)

        # 3. Check for oversized atomic groups and try to split them
        print(f"  [Phase 2] Checking for oversized atomic groups (max {MAX_ATOMIC_GROUP_SIZE} lines)...")
        final_groups = []
        for group in atomic_groups:
            group_size = self._calculate_group_size(group.change_ids)
            if group_size > MAX_ATOMIC_GROUP_SIZE:
                print(f"  [Phase 2]   Group {group.id} is oversized ({group_size} lines), attempting to split...")
                subgroups = self._split_large_atomic_group(group)
                if len(subgroups) > 1:
                    print(f"  [Phase 2]   Split into {len(subgroups)} subgroups")
                    final_groups.extend(subgroups)
                else:
                    print(f"  [Phase 2]   Could not split further, keeping as-is")
                    final_groups.append(group)
            else:
                final_groups.append(group)

        print(f"  [Phase 2] Total atomic groups created: {len(final_groups)}")
        return final_groups

    def _calculate_group_size(self, change_ids: List[str]) -> int:
        """Calculate total size (lines) of a group of changes."""
        total = 0
        for cid in change_ids:
            if cid in self.changes:
                change = self.changes[cid]
                total += change.added_lines + change.deleted_lines
        return total

    def _split_large_atomic_group(self, group: AtomicGroup) -> List[AtomicGroup]:
        """Attempt to split a large atomic group into smaller subgroups.

        Uses minimum edge cut to find natural split points while
        preserving the most critical dependencies.

        Args:
            group: The oversized atomic group to split

        Returns:
            List of smaller AtomicGroup objects, or [group] if cannot split
        """
        if len(group.change_ids) <= 2:
            return [group]

        # Build subgraph for this group
        subgraph = nx.DiGraph()
        for cid in group.change_ids:
            subgraph.add_node(cid)

        # Add edges within this group
        for dep in self.dependencies:
            if dep.source in group.change_ids and dep.target in group.change_ids:
                # Use inverse of strength as weight (weaker = easier to cut)
                weight = 1.0 / max(dep.strength, 0.1)
                subgraph.add_edge(dep.source, dep.target, weight=weight)

        # Try to find a natural split point using sub-package boundaries
        subpackage_groups = self._group_by_subpackage(group.change_ids)
        if len(subpackage_groups) > 1:
            print(f"  [Phase 2]     Found {len(subpackage_groups)} sub-package groups")
            result = []
            for idx, (subpkg, change_ids) in enumerate(subpackage_groups.items()):
                subgroup = AtomicGroup(
                    id=f"{group.id}_subpkg_{idx}",
                    change_ids=change_ids,
                    reason=f"Sub-package group: {subpkg}"
                )
                result.append(subgroup)
            return result

        # Try to split by file type (interfaces vs implementations)
        interface_changes, impl_changes = self._split_by_file_type(group.change_ids)
        if interface_changes and impl_changes:
            print(f"  [Phase 2]     Split by file type: {len(interface_changes)} interface, {len(impl_changes)} impl")
            return [
                AtomicGroup(
                    id=f"{group.id}_interfaces",
                    change_ids=interface_changes,
                    reason="Interface and model definitions"
                ),
                AtomicGroup(
                    id=f"{group.id}_impl",
                    change_ids=impl_changes,
                    reason="Implementation files"
                )
            ]

        # Could not find a good split point
        return [group]

    def _group_by_subpackage(self, change_ids: List[str]) -> Dict[str, List[str]]:
        """Group changes by their immediate parent directory (sub-package)."""
        from collections import defaultdict
        subpackage_map = defaultdict(list)

        for cid in change_ids:
            if cid in self.changes:
                file_path = self.changes[cid].file
                parts = file_path.split('/')
                if len(parts) >= 2:
                    # Use parent directory as sub-package
                    subpackage = '/'.join(parts[:-1])
                else:
                    subpackage = 'root'
                subpackage_map[subpackage].append(cid)

        return dict(subpackage_map)

    def _split_by_file_type(self, change_ids: List[str]) -> Tuple[List[str], List[str]]:
        """Split changes into interface/model files vs implementation files."""
        interface_patterns = [
            '/model/', '/models/', '/types/', '/interfaces/',
            'interface.go', 'types.go', 'model.go', 'models.go',
            '_interface.py', '_types.py', '_model.py',
            '.d.ts',  # TypeScript declaration files
        ]

        interfaces = []
        implementations = []

        for cid in change_ids:
            if cid in self.changes:
                file_path = self.changes[cid].file.lower()
                is_interface = any(pattern in file_path for pattern in interface_patterns)
                if is_interface:
                    interfaces.append(cid)
                else:
                    implementations.append(cid)

        return interfaces, implementations

    def _find_strong_dependency_groups(self) -> List[List[str]]:
        """Find groups connected by very strong (1.0) dependencies.

        IMPORTANT: Uses strongly connected components (SCCs) instead of
        undirected connected components to avoid over-grouping.

        Only changes with BIDIRECTIONAL strong dependencies (true circular deps)
        are grouped together. One-way strong dependencies are respected via
        topological ordering but don't force changes into the same patch.
        """
        # Create a subgraph with only strength=1.0 edges
        strong_graph = nx.DiGraph()

        for change_id in self.changes:
            strong_graph.add_node(change_id)

        for dep in self.dependencies:
            if dep.strength >= 1.0:
                strong_graph.add_edge(dep.source, dep.target)

        # Find STRONGLY connected components (bidirectional paths required)
        # This is more precise than undirected connected components
        # A -> B -> C with no back edges will NOT be grouped together
        # Only true cycles (A -> B -> A) will be grouped
        sccs = list(nx.strongly_connected_components(strong_graph))

        # Only return groups with more than one change (actual cycles)
        result = [list(comp) for comp in sccs if len(comp) > 1]

        print(f"  [Phase 2] Strong dependency SCCs found: {len(result)}")
        for idx, scc in enumerate(result):
            print(f"  [Phase 2]   Strong SCC {idx}: {len(scc)} changes")

        return result

    def find_critical_paths(self) -> List[List[str]]:
        """Find critical paths in the dependency graph.

        Returns:
            List of paths (each path is a list of change IDs)
        """
        critical_paths = []

        # Find all paths from nodes with no predecessors to nodes with no successors
        sources = [n for n in self.graph.nodes() if self.graph.in_degree(n) == 0]
        sinks = [n for n in self.graph.nodes() if self.graph.out_degree(n) == 0]

        for source in sources:
            for sink in sinks:
                try:
                    # Find all simple paths
                    paths = nx.all_simple_paths(self.graph, source, sink)
                    for path in paths:
                        if len(path) > 2:  # Only paths with multiple nodes
                            critical_paths.append(path)
                except nx.NetworkXNoPath:
                    continue

        return critical_paths

    def get_dependencies_for_change(self, change_id: str) -> List[str]:
        """Get all changes that a given change depends on.

        Args:
            change_id: The change ID

        Returns:
            List of change IDs that must come before this change
        """
        if change_id not in self.graph:
            return []

        # Get all predecessors (changes this one depends on)
        predecessors = list(self.graph.predecessors(change_id))
        return predecessors

    def get_dependents_for_change(self, change_id: str) -> List[str]:
        """Get all changes that depend on a given change.

        Args:
            change_id: The change ID

        Returns:
            List of change IDs that must come after this change
        """
        if change_id not in self.graph:
            return []

        # Get all successors (changes that depend on this one)
        successors = list(self.graph.successors(change_id))
        return successors

    def can_changes_be_separated(self, change_id1: str, change_id2: str) -> bool:
        """Check if two changes can be placed in different patches.

        Args:
            change_id1: First change ID
            change_id2: Second change ID

        Returns:
            True if changes can be separated, False if they must stay together
        """
        # Check if there's a path between them in either direction
        try:
            has_path_1_to_2 = nx.has_path(self.graph, change_id1, change_id2)
            has_path_2_to_1 = nx.has_path(self.graph, change_id2, change_id1)

            # If there's a path in both directions, they're in a cycle
            if has_path_1_to_2 and has_path_2_to_1:
                return False

            # Check if they share a strong (1.0) dependency
            for dep in self.dependencies:
                if dep.strength >= 1.0:
                    if (dep.source == change_id1 and dep.target == change_id2) or \
                       (dep.source == change_id2 and dep.target == change_id1):
                        return False

            return True
        except nx.NodeNotFound:
            return True

    def get_graph_statistics(self) -> Dict:
        """Get statistics about the dependency graph.

        Returns:
            Dictionary with graph statistics
        """
        stats = {
            'num_nodes': self.graph.number_of_nodes(),
            'num_edges': self.graph.number_of_edges(),
            'num_sccs': len(list(nx.strongly_connected_components(self.graph))),
            'is_dag': nx.is_directed_acyclic_graph(self.graph),
            'avg_in_degree': sum(d for _, d in self.graph.in_degree()) / max(1, self.graph.number_of_nodes()),
            'avg_out_degree': sum(d for _, d in self.graph.out_degree()) / max(1, self.graph.number_of_nodes()),
        }

        return stats
