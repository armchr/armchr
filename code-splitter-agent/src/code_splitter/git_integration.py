"""Git integration for analyzing repositories."""

import subprocess
import os
from typing import Optional, Dict
from pathlib import Path


class GitAnalyzer:
    """Analyze git repositories and extract diffs."""

    def __init__(self, repo_path: str):
        """Initialize git analyzer.

        Args:
            repo_path: Path to git repository
        """
        self.repo_path = Path(repo_path).resolve()

        if not self._is_git_repo():
            raise ValueError(f"Not a git repository: {repo_path}")

        # Determine git root and relative path for filtering
        self.git_root = self._get_git_root()
        self.relative_path = self._get_relative_path_from_root()

    def _is_git_repo(self) -> bool:
        """Check if path is a git repository."""
        try:
            self._run_git_command(['rev-parse', '--git-dir'])
            return True
        except subprocess.CalledProcessError:
            return False

    def _get_git_root(self) -> Path:
        """Get the git repository root directory.

        Returns:
            Path to git root
        """
        try:
            root = self._run_git_command(['rev-parse', '--show-toplevel']).strip()
            return Path(root).resolve()
        except subprocess.CalledProcessError:
            # Fallback to repo_path if command fails
            return self.repo_path

    def _get_relative_path_from_root(self) -> Optional[str]:
        """Get the relative path from git root to repo_path.

        Returns:
            Relative path string, or None if repo_path is git root
        """
        try:
            rel_path = self.repo_path.relative_to(self.git_root)
            # Return None if they're the same (relative path is '.')
            return str(rel_path) if str(rel_path) != '.' else None
        except ValueError:
            # repo_path is not relative to git_root (shouldn't happen)
            return None

    def _run_git_command(self, args: list, check_output=True) -> str:
        """Run a git command in the repository.

        Args:
            args: Git command arguments
            check_output: Whether to return output

        Returns:
            Command output if check_output=True
        """
        cmd = ['git', '-C', str(self.repo_path)] + args

        if check_output:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout
        else:
            subprocess.run(cmd, check=True)
            return ""

    def get_diff(self, ref1: str, ref2: str) -> str:
        """Get diff between two refs.

        Args:
            ref1: First ref (base)
            ref2: Second ref (target)

        Returns:
            Unified diff text
        """
        try:
            diff = self._run_git_command(['diff', ref1, ref2])
            return self._filter_diff_by_path(diff)
        except subprocess.CalledProcessError as e:
            raise ValueError(f"Failed to get diff between {ref1} and {ref2}: {e}")

    def get_working_directory_diff(self, base_branch: str = 'main', include_untracked: bool = False, untracked_file_list: list = None) -> str:
        """Get diff of working directory changes against base branch.

        Args:
            base_branch: Branch to compare against
            include_untracked: Include untracked (new) files in the diff
            untracked_file_list: Specific list of untracked files to include (if None, includes all)

        Returns:
            Unified diff text
        """
        try:
            # Get diff including staged and unstaged changes for tracked files
            tracked_diff = self._run_git_command(['diff', base_branch])
            # Filter to only files in repo_path subdirectory
            tracked_diff = self._filter_diff_by_path(tracked_diff)

            if not include_untracked:
                return tracked_diff

            # Get list of untracked files
            if untracked_file_list:
                # Use the provided list of untracked files
                untracked_files = untracked_file_list
            else:
                # Get all untracked files
                untracked_files = self._get_untracked_files()

            # Filter untracked files to only those in repo_path subdirectory
            untracked_files = self._filter_files_by_path(untracked_files)

            if not untracked_files:
                return tracked_diff

            # Generate diffs for untracked files
            untracked_diffs = []
            for file_path in untracked_files:
                file_diff = self._generate_new_file_diff(file_path)
                if file_diff:
                    untracked_diffs.append(file_diff)

            # Combine tracked and untracked diffs
            all_diffs = [tracked_diff] if tracked_diff.strip() else []
            all_diffs.extend(untracked_diffs)

            return '\n'.join(all_diffs)

        except subprocess.CalledProcessError as e:
            raise ValueError(f"Failed to get working directory diff: {e}")

    def get_commit_info(self, commit_ref: str) -> Optional[Dict]:
        """Get information about a commit.

        Args:
            commit_ref: Commit reference

        Returns:
            Dictionary with commit info or None if not found
        """
        try:
            # Get commit details
            sha = self._run_git_command(['rev-parse', commit_ref]).strip()
            short_sha = self._run_git_command(['rev-parse', '--short', commit_ref]).strip()

            # Get commit message and author
            log_format = '%H%n%h%n%an%n%ae%n%at%n%s%n%b%n%P'
            log_output = self._run_git_command([
                'log', '-1', f'--format={log_format}', commit_ref
            ])

            lines = log_output.strip().split('\n')

            if len(lines) < 7:
                return None

            parents = lines[7].strip().split() if len(lines) > 7 and lines[7].strip() else []

            return {
                'sha': lines[0],
                'short_sha': lines[1],
                'author': lines[2],
                'email': lines[3],
                'timestamp': lines[4],
                'summary': lines[5],
                'body': '\n'.join(lines[6:7]),
                'parents': parents
            }
        except subprocess.CalledProcessError:
            return None

    def get_current_branch(self) -> str:
        """Get current branch name.

        Returns:
            Current branch name or 'HEAD' if detached
        """
        try:
            return self._run_git_command(['rev-parse', '--abbrev-ref', 'HEAD']).strip()
        except subprocess.CalledProcessError:
            return 'HEAD'

    def commit_exists_in_branch(self, commit_ref: str, branch: str) -> bool:
        """Check if a commit exists in a specific branch.

        Args:
            commit_ref: Commit reference to check
            branch: Branch name to check against

        Returns:
            True if commit exists in branch, False otherwise
        """
        try:
            # Get the full SHA of the commit
            commit_sha = self._run_git_command(['rev-parse', commit_ref]).strip()

            # Use git branch --contains to check if commit is in the branch
            # This checks if the commit is an ancestor of the branch
            result = self._run_git_command([
                'branch', '-r', '-l', '--contains', commit_sha
            ])

            # Check if the branch name appears in the output
            # Format could be origin/branch or just branch
            branches = [line.strip() for line in result.strip().split('\n') if line.strip()]

            # Match both local and remote branch references
            for branch_line in branches:
                # Remove leading asterisk if present (current branch)
                branch_line = branch_line.lstrip('* ')
                # Check if this is our target branch (handle origin/ prefix)
                if branch_line == branch or branch_line == f'origin/{branch}' or branch_line.endswith(f'/{branch}'):
                    return True

            # Also check local branches
            result = self._run_git_command([
                'branch', '-l', '--contains', commit_sha
            ])

            branches = [line.strip().lstrip('* ') for line in result.strip().split('\n') if line.strip()]
            return branch in branches

        except subprocess.CalledProcessError:
            return False

    def _get_untracked_files(self) -> list:
        """Get list of untracked files.

        Returns:
            List of untracked file paths
        """
        try:
            # Get untracked files, excluding ignored files
            output = self._run_git_command(['ls-files', '--others', '--exclude-standard'])
            files = [f.strip() for f in output.strip().split('\n') if f.strip()]
            return files
        except subprocess.CalledProcessError:
            return []

    def _generate_new_file_diff(self, file_path: str) -> Optional[str]:
        """Generate a unified diff for a new (untracked) file.

        Args:
            file_path: Path to the new file (relative to repo root)

        Returns:
            Unified diff string for the new file, or None if failed
        """
        try:
            full_path = self.repo_path / file_path

            # Skip if not a regular file
            if not full_path.is_file():
                return None

            # Read file content
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except (UnicodeDecodeError, IOError):
                # Skip binary files or unreadable files
                return None

            # Generate unified diff format for new file
            lines = content.split('\n')

            # Build diff header
            diff_lines = [
                f"diff --git a/{file_path} b/{file_path}",
                "new file mode 100644",
                "index 0000000..1111111",
                f"--- /dev/null",
                f"+++ b/{file_path}",
                f"@@ -0,0 +1,{len(lines)} @@"
            ]

            # Add file content as additions
            for line in lines:
                diff_lines.append(f"+{line}")

            return '\n'.join(diff_lines)

        except Exception:
            # Silently skip files that can't be processed
            return None

    def detect_language(self) -> str:
        """Detect primary programming language in repository.

        Returns:
            Language name
        """
        # Simple language detection based on file extensions
        try:
            files = self._run_git_command(['ls-files']).strip().split('\n')

            ext_counts = {}
            for file_path in files:
                ext = Path(file_path).suffix
                if ext:
                    ext_counts[ext] = ext_counts.get(ext, 0) + 1

            if not ext_counts:
                return 'unknown'

            # Map extensions to languages
            lang_map = {
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
                '.rb': 'ruby',
                '.php': 'php',
            }

            # Find most common extension
            most_common_ext = max(ext_counts.items(), key=lambda x: x[1])[0]

            return lang_map.get(most_common_ext, 'unknown')

        except subprocess.CalledProcessError:
            return 'unknown'

    def get_diff_stats(self, diff_text: str) -> Dict:
        """Parse diff statistics.

        Args:
            diff_text: Unified diff text

        Returns:
            Dictionary with stats
        """
        lines = diff_text.split('\n')

        additions = 0
        deletions = 0
        files = set()

        for line in lines:
            if line.startswith('diff --git'):
                # Extract file path
                parts = line.split()
                if len(parts) >= 4:
                    file_path = parts[3].lstrip('b/')
                    files.add(file_path)

            elif line.startswith('+') and not line.startswith('+++'):
                additions += 1
            elif line.startswith('-') and not line.startswith('---'):
                deletions += 1

        return {
            'additions': additions,
            'deletions': deletions,
            'files_changed': len(files),
            'files': sorted(list(files))
        }

    def _filter_files_by_path(self, file_paths: list) -> list:
        """Filter file paths to only include files within repo_path subdirectory.

        Args:
            file_paths: List of file paths relative to git root

        Returns:
            Filtered list of file paths
        """
        if not self.relative_path:
            # repo_path is the git root, no filtering needed
            return file_paths

        # Filter files that start with the relative path
        prefix = self.relative_path + '/'
        filtered = []
        for file_path in file_paths:
            if file_path.startswith(prefix) or file_path == self.relative_path:
                filtered.append(file_path)

        return filtered

    def _filter_diff_by_path(self, diff_text: str) -> str:
        """Filter unified diff to only include files within repo_path subdirectory.

        Args:
            diff_text: Unified diff text

        Returns:
            Filtered diff text containing only files in repo_path
        """
        if not self.relative_path:
            # repo_path is the git root, no filtering needed
            return diff_text

        if not diff_text or not diff_text.strip():
            return diff_text

        # Parse diff into file chunks
        lines = diff_text.split('\n')
        filtered_chunks = []
        current_chunk = []
        include_current_chunk = False
        prefix = self.relative_path + '/'

        for line in lines:
            if line.startswith('diff --git '):
                # Save previous chunk if it should be included
                if include_current_chunk and current_chunk:
                    filtered_chunks.append('\n'.join(current_chunk))

                # Start new chunk
                current_chunk = [line]
                include_current_chunk = False

                # Check if this file is in the repo_path subdirectory
                # Format: diff --git a/path/to/file b/path/to/file
                parts = line.split()
                if len(parts) >= 4:
                    file_path = parts[2].lstrip('a/')
                    if file_path.startswith(prefix) or file_path == self.relative_path:
                        include_current_chunk = True
            else:
                # Add line to current chunk
                current_chunk.append(line)

        # Don't forget the last chunk
        if include_current_chunk and current_chunk:
            filtered_chunks.append('\n'.join(current_chunk))

        return '\n'.join(filtered_chunks)
