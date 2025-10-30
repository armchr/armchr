"""Phase 5: Validation & Optimization."""

from typing import List, Dict, Optional, Tuple
from .models import Patch, Change


class PatchValidator:
    """Validates patches for correctness and quality."""

    def __init__(self):
        pass

    def validate_patches(
        self,
        patches: List[Patch],
        changes: List[Change]
    ) -> Tuple[bool, List[str]]:
        """Validate all patches.

        Args:
            patches: List of patches to validate
            changes: List of all changes

        Returns:
            Tuple of (is_valid, list_of_issues)
        """
        issues = []

        # 1. Check all changes are included
        all_change_ids = set(c.id for c in changes)
        covered_changes = set()

        for patch in patches:
            covered_changes.update(patch.changes)

        missing = all_change_ids - covered_changes
        if missing:
            issues.append(f"Missing changes not included in any patch: {missing}")

        duplicate = []
        seen = set()
        for patch in patches:
            for change_id in patch.changes:
                if change_id in seen:
                    duplicate.append(change_id)
                seen.add(change_id)

        if duplicate:
            issues.append(f"Duplicate changes in multiple patches: {duplicate}")

        # 2. Verify dependencies are respected
        applied = set()
        for patch in patches:
            for dep_patch_id in patch.depends_on:
                if dep_patch_id >= patch.id:
                    issues.append(
                        f"Patch {patch.id} depends on patch {dep_patch_id} which comes later"
                    )

        is_valid = len(issues) == 0
        return is_valid, issues

    def measure_patch_quality(
        self,
        patches: List[Patch],
        changes: List[Change]
    ) -> Dict:
        """Measure quality metrics for patches.

        Args:
            patches: List of patches
            changes: List of all changes

        Returns:
            Dictionary with quality metrics
        """
        change_map = {c.id: c for c in changes}

        total_lines = sum(
            c.added_lines + c.deleted_lines for c in changes
        )

        patch_sizes = [p.size_lines for p in patches]
        avg_patch_size = sum(patch_sizes) / len(patches) if patches else 0
        max_patch_size = max(patch_sizes) if patches else 0
        min_patch_size = min(patch_sizes) if patches else 0

        # Calculate size variance
        variance = sum((s - avg_patch_size) ** 2 for s in patch_sizes) / len(patches) if patches else 0

        # Count patches with warnings
        patches_with_warnings = sum(1 for p in patches if p.warnings)

        # Calculate dependency depth (longest chain)
        max_depth = self._calculate_max_dependency_depth(patches)

        metrics = {
            'num_patches': len(patches),
            'total_lines': total_lines,
            'avg_patch_size': avg_patch_size,
            'max_patch_size': max_patch_size,
            'min_patch_size': min_patch_size,
            'size_variance': variance,
            'patches_with_warnings': patches_with_warnings,
            'max_dependency_depth': max_depth,
            'balance_score': self._calculate_balance_score(patch_sizes),
            'reviewability_score': self._calculate_reviewability_score(patches),
        }

        return metrics

    def _calculate_max_dependency_depth(self, patches: List[Patch]) -> int:
        """Calculate the maximum dependency chain depth."""
        if not patches:
            return 0

        patch_map = {p.id: p for p in patches}

        def get_depth(patch_id: int, visited: set) -> int:
            if patch_id in visited:
                return 0

            patch = patch_map.get(patch_id)
            if not patch or not patch.depends_on:
                return 1

            visited.add(patch_id)

            max_dep_depth = 0
            for dep_id in patch.depends_on:
                dep_depth = get_depth(dep_id, visited.copy())
                max_dep_depth = max(max_dep_depth, dep_depth)

            return max_dep_depth + 1

        max_depth = 0
        for patch in patches:
            depth = get_depth(patch.id, set())
            max_depth = max(max_depth, depth)

        return max_depth

    def _calculate_balance_score(self, patch_sizes: List[int]) -> float:
        """Calculate how balanced patch sizes are (0.0-1.0, higher is better)."""
        if not patch_sizes or len(patch_sizes) < 2:
            return 1.0

        avg_size = sum(patch_sizes) / len(patch_sizes)
        if avg_size == 0:
            return 1.0

        # Calculate coefficient of variation
        variance = sum((s - avg_size) ** 2 for s in patch_sizes) / len(patch_sizes)
        std_dev = variance ** 0.5
        cv = std_dev / avg_size if avg_size > 0 else 0

        # Convert to score (lower cv = higher score)
        # CV of 0 = perfect balance = score 1.0
        # CV of 1.0 or more = poor balance = score 0
        score = max(0.0, 1.0 - cv)

        return score

    def _calculate_reviewability_score(self, patches: List[Patch]) -> float:
        """Calculate overall reviewability score (0.0-1.0, higher is better)."""
        if not patches:
            return 0.0

        scores = []

        for patch in patches:
            # Factors:
            # 1. Size (smaller is better, but not too small)
            size_score = self._score_patch_size(patch.size_lines)

            # 2. Number of files (fewer is better)
            num_files = len(set(cid.split(':')[0] for cid in patch.changes))
            file_score = 1.0 / (1.0 + (num_files - 1) * 0.2)

            # 3. Warnings (fewer is better)
            warning_score = 1.0 - (len(patch.warnings) * 0.2)
            warning_score = max(0.0, warning_score)

            # Combined score
            patch_score = (size_score * 0.5 + file_score * 0.3 + warning_score * 0.2)
            scores.append(patch_score)

        return sum(scores) / len(scores)

    def _score_patch_size(self, size: int) -> float:
        """Score patch size (sweet spot is 50-200 lines)."""
        if size == 0:
            return 0.0

        if size < 10:
            return 0.3  # Too small

        if 50 <= size <= 200:
            return 1.0  # Ideal

        if size < 50:
            # 10-50: scale from 0.3 to 1.0
            return 0.3 + (size - 10) / 40 * 0.7

        # > 200: decrease score
        # 200-500: scale from 1.0 to 0.3
        # > 500: 0.1
        if size <= 500:
            return 1.0 - (size - 200) / 300 * 0.7
        else:
            return 0.1

    def suggest_optimizations(
        self,
        patches: List[Patch],
        changes: List[Change],
        metrics: Dict
    ) -> List[str]:
        """Suggest optimizations for the patch split.

        Args:
            patches: Current patches
            changes: All changes
            metrics: Quality metrics

        Returns:
            List of optimization suggestions
        """
        suggestions = []

        # Check if patches are too unbalanced
        if metrics['balance_score'] < 0.5:
            suggestions.append(
                "Patches are unbalanced in size. Consider redistributing changes."
            )

        # Check if patches are too large
        large_patches = [p for p in patches if p.size_lines > 500]
        if large_patches:
            suggestions.append(
                f"{len(large_patches)} patches are very large (>500 lines). "
                f"Consider splitting: {[p.id for p in large_patches]}"
            )

        # Check if there are too many small patches
        small_patches = [p for p in patches if p.size_lines < 20]
        if len(small_patches) > len(patches) * 0.3:
            suggestions.append(
                f"{len(small_patches)} patches are very small (<20 lines). "
                f"Consider merging related patches."
            )

        # Check dependency depth
        if metrics['max_dependency_depth'] > 5:
            suggestions.append(
                f"Dependency chain is deep ({metrics['max_dependency_depth']} levels). "
                f"This may make the patches harder to apply sequentially."
            )

        # Check reviewability
        if metrics['reviewability_score'] < 0.6:
            suggestions.append(
                f"Overall reviewability score is low ({metrics['reviewability_score']:.2f}). "
                f"Consider reorganizing patches for easier review."
            )

        return suggestions


class PatchOptimizer:
    """Optimizes patch splits for better quality."""

    def __init__(self):
        self.validator = PatchValidator()

    def optimize_patches(
        self,
        patches: List[Patch],
        changes: List[Change],
        target_patch_size: int = 200
    ) -> List[Patch]:
        """Attempt to optimize the patch split.

        Args:
            patches: Current patches
            changes: All changes
            target_patch_size: Target size for patches

        Returns:
            Optimized list of patches
        """
        # For now, just return the patches as-is
        # In the future, could implement:
        # - Splitting large patches
        # - Merging small patches
        # - Reordering to reduce dependency depth
        # - Balancing patch sizes

        optimized = patches.copy()

        # Try to split very large patches
        optimized = self._split_large_patches(optimized, changes, target_patch_size)

        return optimized

    def _split_large_patches(
        self,
        patches: List[Patch],
        changes: List[Change],
        target_size: int
    ) -> List[Patch]:
        """Split patches that are significantly larger than target."""
        result = []
        next_id = max(p.id for p in patches) + 1 if patches else 0

        for patch in patches:
            if patch.size_lines > target_size * 2 and len(patch.changes) > 1:
                # Try to split this patch
                # Simple strategy: split in half
                mid = len(patch.changes) // 2

                patch1_changes = patch.changes[:mid]
                patch2_changes = patch.changes[mid:]

                change_map = {c.id: c for c in changes}

                size1 = sum(
                    change_map[cid].added_lines + change_map[cid].deleted_lines
                    for cid in patch1_changes
                )

                size2 = sum(
                    change_map[cid].added_lines + change_map[cid].deleted_lines
                    for cid in patch2_changes
                )

                patch1 = Patch(
                    id=patch.id,
                    name=f"{patch.name} (part 1)",
                    description=patch.description,
                    changes=patch1_changes,
                    depends_on=patch.depends_on,
                    size_lines=size1,
                    warnings=[]
                )

                patch2 = Patch(
                    id=next_id,
                    name=f"{patch.name} (part 2)",
                    description=patch.description,
                    changes=patch2_changes,
                    depends_on=[patch.id],
                    size_lines=size2,
                    warnings=[]
                )

                result.append(patch1)
                result.append(patch2)
                next_id += 1
            else:
                result.append(patch)

        return result
