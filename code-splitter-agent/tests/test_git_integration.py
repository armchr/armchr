"""Tests for git integration functionality."""

import pytest
import subprocess
import tempfile
import os
from pathlib import Path
from src.code_splitter.git_integration import GitAnalyzer


@pytest.fixture
def temp_git_repo():
    """Create a temporary git repository for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir)

        # Initialize git repo
        subprocess.run(['git', 'init'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(['git', 'config', 'user.email', 'test@example.com'], cwd=repo_path, check=True)
        subprocess.run(['git', 'config', 'user.name', 'Test User'], cwd=repo_path, check=True)

        # Create initial commit on main branch
        test_file = repo_path / 'test.py'
        test_file.write_text('print("hello")\n')
        subprocess.run(['git', 'add', 'test.py'], cwd=repo_path, check=True)
        subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=repo_path, check=True, capture_output=True)

        # Create a feature branch and add a commit
        subprocess.run(['git', 'checkout', '-b', 'feature'], cwd=repo_path, check=True, capture_output=True)
        test_file.write_text('print("hello world")\n')
        subprocess.run(['git', 'add', 'test.py'], cwd=repo_path, check=True)
        subprocess.run(['git', 'commit', '-m', 'Update message'], cwd=repo_path, check=True, capture_output=True)

        # Get the commit SHA from feature branch
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=repo_path,
            check=True,
            capture_output=True,
            text=True
        )
        feature_commit = result.stdout.strip()

        # Create another branch without that commit
        subprocess.run(['git', 'checkout', 'main'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(['git', 'checkout', '-b', 'other-branch'], cwd=repo_path, check=True, capture_output=True)

        yield {
            'path': str(repo_path),
            'feature_commit': feature_commit,
            'feature_branch': 'feature',
            'other_branch': 'other-branch',
            'main_branch': 'main'
        }


def test_git_analyzer_init(temp_git_repo):
    """Test GitAnalyzer initialization."""
    analyzer = GitAnalyzer(temp_git_repo['path'])
    assert analyzer.repo_path == Path(temp_git_repo['path']).resolve()


def test_commit_exists_in_branch_positive(temp_git_repo):
    """Test that commit is found in the correct branch."""
    analyzer = GitAnalyzer(temp_git_repo['path'])

    # The feature commit should exist in the feature branch
    assert analyzer.commit_exists_in_branch(
        temp_git_repo['feature_commit'],
        temp_git_repo['feature_branch']
    )


def test_commit_exists_in_branch_negative(temp_git_repo):
    """Test that commit is not found in branches it doesn't belong to."""
    analyzer = GitAnalyzer(temp_git_repo['path'])

    # The feature commit should NOT exist in the other-branch
    # (since other-branch was created from main before the feature commit)
    assert not analyzer.commit_exists_in_branch(
        temp_git_repo['feature_commit'],
        temp_git_repo['other_branch']
    )


def test_commit_exists_in_branch_invalid_commit(temp_git_repo):
    """Test with an invalid commit reference."""
    analyzer = GitAnalyzer(temp_git_repo['path'])

    # Invalid commit should return False
    assert not analyzer.commit_exists_in_branch(
        'invalid_commit_sha',
        temp_git_repo['feature_branch']
    )


def test_commit_exists_in_branch_invalid_branch(temp_git_repo):
    """Test with an invalid branch name."""
    analyzer = GitAnalyzer(temp_git_repo['path'])

    # Invalid branch should return False
    assert not analyzer.commit_exists_in_branch(
        temp_git_repo['feature_commit'],
        'nonexistent_branch'
    )


def test_get_commit_info(temp_git_repo):
    """Test getting commit information."""
    analyzer = GitAnalyzer(temp_git_repo['path'])

    commit_info = analyzer.get_commit_info(temp_git_repo['feature_commit'])

    assert commit_info is not None
    assert commit_info['sha'] == temp_git_repo['feature_commit']
    assert 'author' in commit_info
    assert 'summary' in commit_info
    assert commit_info['summary'] == 'Update message'


def test_get_diff(temp_git_repo):
    """Test getting diff between branches."""
    analyzer = GitAnalyzer(temp_git_repo['path'])

    diff = analyzer.get_diff('main', 'feature')

    assert diff is not None
    assert len(diff) > 0
    assert 'hello world' in diff


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
