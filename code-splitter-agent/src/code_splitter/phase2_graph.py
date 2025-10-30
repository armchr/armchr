"""Phase 2: Dependency Graph Construction."""

import networkx as nx
from typing import List, Dict, Set, Tuple
from .models import Change, Dependency, AtomicGroup


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
        print(f"  [Phase 2] Looking for strong dependency groups...")
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

        print(f"  [Phase 2] Total atomic groups created: {len(atomic_groups)}")
        return atomic_groups

    def _find_strong_dependency_groups(self) -> List[List[str]]:
        """Find groups connected by very strong (1.0) dependencies."""
        # Create a subgraph with only strength=1.0 edges
        strong_graph = nx.DiGraph()

        for change_id in self.changes:
            strong_graph.add_node(change_id)

        for dep in self.dependencies:
            if dep.strength >= 1.0:
                strong_graph.add_edge(dep.source, dep.target)

        # Find connected components in undirected version
        undirected = strong_graph.to_undirected()
        components = list(nx.connected_components(undirected))

        # Only return groups with more than one change
        return [list(comp) for comp in components if len(comp) > 1]

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
