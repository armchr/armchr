"""Phase 3: Semantic Grouping."""

import re
from typing import List, Dict, Set, Optional
from collections import defaultdict
from .models import Change, SemanticGroup, AtomicGroup


class SemanticGrouper:
    """Groups related changes based on semantic similarity."""

    def __init__(self):
        pass

    def identify_semantic_groups(
        self,
        changes: List[Change],
        atomic_groups: List[AtomicGroup]
    ) -> List[SemanticGroup]:
        """Identify semantic groups of related changes.

        Args:
            changes: List of all changes
            atomic_groups: Atomic groups that cannot be split

        Returns:
            List of SemanticGroup objects
        """
        semantic_groups = []

        # Build atomic group membership map
        atomic_membership = {}
        for group in atomic_groups:
            for change_id in group.change_ids:
                atomic_membership[change_id] = group.id

        # 1. Group by file proximity
        file_groups = self._group_by_file(changes, atomic_membership)
        semantic_groups.extend(file_groups)

        # 2. Identify refactoring patterns
        refactoring_groups = self._identify_refactoring_patterns(changes, atomic_membership)
        semantic_groups.extend(refactoring_groups)

        # 3. Group by symbol similarity
        symbol_groups = self._group_by_symbols(changes, atomic_membership)
        semantic_groups.extend(symbol_groups)

        # Remove duplicate groupings
        semantic_groups = self._deduplicate_groups(semantic_groups)

        return semantic_groups

    def _group_by_file(
        self,
        changes: List[Change],
        atomic_membership: Dict[str, str]
    ) -> List[SemanticGroup]:
        """Group changes by file proximity."""
        file_map = defaultdict(list)

        for change in changes:
            file_map[change.file].append(change.id)

        groups = []
        for idx, (file_path, change_ids) in enumerate(file_map.items()):
            if len(change_ids) > 1:
                # Calculate cohesion based on line proximity
                cohesion = self._calculate_file_cohesion(changes, change_ids)

                group = SemanticGroup(
                    id=f"file_{idx}",
                    name=f"Changes in {file_path}",
                    change_ids=change_ids,
                    description=f"Multiple changes in the same file: {file_path}",
                    cohesion_score=cohesion
                )
                groups.append(group)

        return groups

    def _calculate_file_cohesion(
        self,
        changes: List[Change],
        change_ids: List[str]
    ) -> float:
        """Calculate how closely related changes in a file are."""
        change_map = {c.id: c for c in changes if c.id in change_ids}

        if len(change_ids) < 2:
            return 1.0

        # Calculate average line distance between changes
        line_ranges = [change_map[cid].line_range for cid in change_ids]
        line_ranges.sort(key=lambda x: x[0])

        total_distance = 0
        for i in range(len(line_ranges) - 1):
            distance = line_ranges[i + 1][0] - line_ranges[i][1]
            total_distance += max(0, distance)

        avg_distance = total_distance / (len(line_ranges) - 1)

        # Convert distance to cohesion score (closer = higher cohesion)
        # Score from 0.5 (far apart) to 1.0 (adjacent)
        cohesion = max(0.5, 1.0 - (avg_distance / 100.0))

        return cohesion

    def _identify_refactoring_patterns(
        self,
        changes: List[Change],
        atomic_membership: Dict[str, str]
    ) -> List[SemanticGroup]:
        """Identify common refactoring patterns like renames, extractions."""
        groups = []

        # Pattern 1: Function/Class renames
        rename_groups = self._detect_renames(changes)
        groups.extend(rename_groups)

        # Pattern 2: Extract method/class
        extract_groups = self._detect_extractions(changes)
        groups.extend(extract_groups)

        # Pattern 3: API changes (function signature changes + usage updates)
        api_groups = self._detect_api_changes(changes)
        groups.extend(api_groups)

        return groups

    def _detect_renames(self, changes: List[Change]) -> List[SemanticGroup]:
        """Detect rename refactoring patterns."""
        groups = []

        # Look for patterns where multiple changes affect the same symbol name
        symbol_changes = defaultdict(list)

        for change in changes:
            for symbol in change.symbols:
                symbol_changes[symbol.name].append(change.id)

        # If a symbol appears in many changes, it might be a rename
        for idx, (symbol_name, change_ids) in enumerate(symbol_changes.items()):
            if len(change_ids) >= 3:  # Rename affects at least 3 places
                group = SemanticGroup(
                    id=f"rename_{idx}",
                    name=f"Rename '{symbol_name}'",
                    change_ids=change_ids,
                    description=f"Rename refactoring affecting symbol: {symbol_name}",
                    cohesion_score=0.95
                )
                groups.append(group)

        return groups

    def _detect_extractions(self, changes: List[Change]) -> List[SemanticGroup]:
        """Detect extract method/class refactoring patterns."""
        groups = []

        # Look for new function/class definitions with related deletions
        new_definitions = [c for c in changes if c.type == 'add' and
                           any(s.type in ['function', 'class'] for s in c.symbols)]

        deletions = [c for c in changes if c.type == 'delete']

        for idx, new_def in enumerate(new_definitions):
            # Find related deletions in the same file or nearby files
            related_deletions = [
                d.id for d in deletions
                if d.file == new_def.file or
                   self._are_files_related(d.file, new_def.file)
            ]

            if related_deletions:
                change_ids = [new_def.id] + related_deletions
                symbol_names = [s.name for s in new_def.symbols]

                group = SemanticGroup(
                    id=f"extract_{idx}",
                    name=f"Extract {', '.join(symbol_names)}",
                    change_ids=change_ids,
                    description=f"Extract method/class refactoring",
                    cohesion_score=0.9
                )
                groups.append(group)

        return groups

    def _detect_api_changes(self, changes: List[Change]) -> List[SemanticGroup]:
        """Detect API changes (function signature modifications + usage updates)."""
        groups = []

        # Find modifications to function/method definitions
        api_modifications = [
            c for c in changes
            if c.type == 'modify' and any(s.type in ['function', 'method'] for s in c.symbols)
        ]

        for idx, api_change in enumerate(api_modifications):
            # Find changes that might be updating usages
            symbol_names = {s.name for s in api_change.symbols}

            related_changes = [
                c.id for c in changes
                if c.id != api_change.id and
                   any(s.name in symbol_names for s in c.symbols)
            ]

            if related_changes:
                change_ids = [api_change.id] + related_changes

                group = SemanticGroup(
                    id=f"api_{idx}",
                    name=f"API change: {', '.join(symbol_names)}",
                    change_ids=change_ids,
                    description=f"API modification and usage updates",
                    cohesion_score=0.85
                )
                groups.append(group)

        return groups

    def _group_by_symbols(
        self,
        changes: List[Change],
        atomic_membership: Dict[str, str]
    ) -> List[SemanticGroup]:
        """Group changes that affect related symbols."""
        groups = []

        # Build symbol co-occurrence map
        symbol_to_changes = defaultdict(set)

        for change in changes:
            for symbol in change.symbols:
                symbol_to_changes[symbol.name].add(change.id)

        # Find sets of changes that share multiple symbols
        change_symbol_sets = defaultdict(set)

        for symbol_name, change_ids in symbol_to_changes.items():
            if len(change_ids) >= 2:
                for change_id in change_ids:
                    change_symbol_sets[change_id].add(symbol_name)

        # Group changes with high symbol overlap
        processed = set()
        for idx, change_id in enumerate(change_symbol_sets.keys()):
            if change_id in processed:
                continue

            related = [change_id]
            my_symbols = change_symbol_sets[change_id]

            for other_id, other_symbols in change_symbol_sets.items():
                if other_id != change_id and other_id not in processed:
                    # Calculate Jaccard similarity
                    intersection = my_symbols & other_symbols
                    union = my_symbols | other_symbols

                    if union and len(intersection) / len(union) > 0.3:
                        related.append(other_id)
                        processed.add(other_id)

            if len(related) >= 2:
                processed.add(change_id)

                group = SemanticGroup(
                    id=f"symbol_{idx}",
                    name=f"Related symbol changes",
                    change_ids=related,
                    description=f"Changes affecting related symbols: {', '.join(list(my_symbols)[:3])}",
                    cohesion_score=0.7
                )
                groups.append(group)

        return groups

    def _are_files_related(self, file1: str, file2: str) -> bool:
        """Check if two files are related (same directory, similar names, etc.)."""
        # Check if in the same directory
        dir1 = '/'.join(file1.split('/')[:-1])
        dir2 = '/'.join(file2.split('/')[:-1])

        if dir1 == dir2:
            return True

        # Check if file names are similar (e.g., foo.py and foo_test.py)
        base1 = file1.split('/')[-1].split('.')[0]
        base2 = file2.split('/')[-1].split('.')[0]

        if base1 in base2 or base2 in base1:
            return True

        return False

    def _deduplicate_groups(self, groups: List[SemanticGroup]) -> List[SemanticGroup]:
        """Remove duplicate or highly overlapping groups."""
        if not groups:
            return []

        # Sort by cohesion score (keep higher quality groups)
        groups.sort(key=lambda g: g.cohesion_score, reverse=True)

        unique_groups = []
        covered_changes = set()

        for group in groups:
            group_set = set(group.change_ids)

            # Calculate overlap with already covered changes
            overlap = len(group_set & covered_changes)
            overlap_ratio = overlap / len(group_set) if group_set else 0

            # Keep group if it has low overlap (< 50%)
            if overlap_ratio < 0.5:
                unique_groups.append(group)
                covered_changes.update(group_set)

        return unique_groups

    def score_cohesion(self, changes: List[Change], change_ids: List[str]) -> float:
        """Calculate cohesion score for a group of changes.

        Args:
            changes: All changes
            change_ids: IDs of changes in this group

        Returns:
            Cohesion score from 0.0 to 1.0
        """
        if len(change_ids) < 2:
            return 1.0

        change_map = {c.id: c for c in changes if c.id in change_ids}

        # Factors:
        # 1. File proximity (same file = higher score)
        # 2. Symbol overlap (shared symbols = higher score)
        # 3. Line proximity (close line numbers = higher score)

        files = set(change_map[cid].file for cid in change_ids)
        file_score = 1.0 if len(files) == 1 else 0.5

        # Symbol overlap
        all_symbols = set()
        symbol_counts = defaultdict(int)

        for cid in change_ids:
            for symbol in change_map[cid].symbols:
                all_symbols.add(symbol.name)
                symbol_counts[symbol.name] += 1

        shared_symbols = sum(1 for count in symbol_counts.values() if count > 1)
        symbol_score = shared_symbols / max(1, len(all_symbols))

        # Line proximity (only for same file)
        line_score = 0.5
        if len(files) == 1:
            line_ranges = [change_map[cid].line_range for cid in change_ids]
            line_score = 1.0 - self._calculate_line_distance_score(line_ranges)

        # Weighted average
        cohesion = (file_score * 0.4 + symbol_score * 0.4 + line_score * 0.2)

        return cohesion

    def _calculate_line_distance_score(self, line_ranges: List[tuple]) -> float:
        """Calculate normalized distance score for line ranges."""
        if len(line_ranges) < 2:
            return 0.0

        line_ranges.sort(key=lambda x: x[0])

        total_distance = 0
        for i in range(len(line_ranges) - 1):
            distance = line_ranges[i + 1][0] - line_ranges[i][1]
            total_distance += max(0, distance)

        # Normalize by dividing by 100 lines (arbitrary unit)
        return min(1.0, total_distance / 100.0)
