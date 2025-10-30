"""Main CLI interface matching simple-splitter-agent interface."""

import click
import sys
import os
import yaml
from pathlib import Path
from datetime import datetime
from .agent import CodeSplitterAgent
from .git_integration import GitAnalyzer


@click.command()
@click.option('--source-config', required=True, type=click.Path(exists=True), help='Path to source repositories configuration file (REQUIRED)')
@click.option('--base-branch', '-b', default='main', help='Base branch to compare against (default: main)')
@click.option('--target-branch', '-t', default=None, help='Target branch for comparison or validation (default: current working directory)')
@click.option('--commit', default=None, help='Specific commit ID to analyze (compares commit with its parent). If --target-branch is also specified, validates that commit exists in that branch.')
@click.option('--compare-with', default=None, help='Compare commit with this branch/commit instead of parent')
@click.option('--patch', '-p', default=None, help='Path to patch file to analyze (bypasses git operations)')
@click.option('--output-dir', '-o', default='./diff_splits', help='Output directory for patches (default: ./diff_splits)')
@click.option('--api-key', '-k', default=None, help='API key for LLM service (required if any LLM param provided)')
@click.option('--api-base', default=None, help='Base URL for API service (required if any LLM param provided)')
@click.option('--model', '-m', default=None, help='Model name to use (required if any LLM param provided)')
@click.option('--config-file', '-c', default=None, help='Path to configuration file')
@click.option('--mcp-config', default=None, help='Path to MCP configuration file')
@click.option('--repo', default=None, help='Repository name from source config to analyze')
@click.option('--dry-run', is_flag=True, help='Analyze changes without generating patches')
@click.option('--annotate-patches/--no-annotate-patches', default=True, help='Add descriptive comments to patch sections (default: enabled)')
@click.option('--verbose', '-v', is_flag=True, help='Verbose output')
@click.option('--debug', is_flag=True, help='Enable debug logging')
@click.option('--log-file', default=None, help='Write detailed logs to file')
@click.option('--target-size', '-s', type=int, default=200, help='Target size for each patch in lines (default: 200)')
@click.option('--no-llm', is_flag=True, help='Disable LLM-enhanced analysis')
@click.option('--untracked', is_flag=True, help='Include untracked (new) files in uncommitted changes')
@click.argument('untracked_files', nargs=-1)
def main(source_config, base_branch, target_branch, commit, compare_with, patch, output_dir, api_key,
         api_base, model, config_file, mcp_config, repo, dry_run,
         annotate_patches, verbose, debug, log_file, target_size, no_llm, untracked, untracked_files):
    """Split git diffs into meaningful, semantically-grouped patches using AI analysis.

    Compatible with simple-splitter-agent interface.

    REQUIRED PARAMETER:
    - --source-config: Path to source repositories configuration file (YAML/JSON)

    Repository selection:
    - Use --repo to specify a repository name from source configuration
    - Repository path will be resolved from the source config file
    - If --repo is not specified, uses current working directory

    Modes of operation:
    1. Working directory: Compare current changes against base branch (default)
    2. Branch comparison: --target-branch to compare two branches
    3. Commit analysis: --commit to analyze a specific commit against its parent
    4. Custom commit comparison: --commit with --compare-with to compare against specific ref
    5. Branch-scoped commit: --commit with --target-branch validates the commit exists in that branch
    6. Patch file: --patch to analyze a standalone patch file (bypasses git operations)

    Note: When both --commit and --target-branch are specified, the commit will be analyzed
    and validated to exist within the specified branch.

    Example:
        python -m code_splitter.main split --source-config repos.yaml
        python -m code_splitter.main split --source-config repos.yaml --repo myproject
        python -m code_splitter.main split --source-config repos.yaml --commit abc123
    """

    try:
        # Use only command-line provided values (no environment variable fallback)
        model_name = model

        # Resolve repository path
        repo_path = os.getcwd()
        repo_name = repo or os.path.basename(repo_path)

        if source_config and repo:
            # Load source configuration
            repo_path = _resolve_repo_from_config(source_config, repo)
            if not repo_path:
                click.echo(f"❌ Error: Repository '{repo}' not found in source config", err=True)
                sys.exit(1)

        if verbose:
            click.echo("🔍 Code Splitter Agent")
            click.echo("=" * 50)
            click.echo(f"Repository: {repo_name}")
            click.echo(f"Path: {repo_path}")
            click.echo(f"Model: {model_name}")
            click.echo(f"Output: {output_dir}")
            click.echo(f"LLM: {'Disabled' if no_llm else 'Enabled'}")
            click.echo("=" * 50)

        # Get the diff
        if patch:
            # Patch file mode - bypass git operations
            if verbose:
                click.echo(f"\n📝 Analyzing patch file: {patch}")

            patch_path = Path(patch)
            if not patch_path.exists():
                click.echo(f"❌ Error: Patch file not found: {patch}", err=True)
                sys.exit(1)

            try:
                with open(patch_path, 'r') as f:
                    diff_text = f.read()
            except Exception as e:
                click.echo(f"❌ Error reading patch file: {e}", err=True)
                sys.exit(1)

            if not diff_text or not diff_text.strip():
                click.echo("❌ Patch file is empty", err=True)
                sys.exit(1)

            # Set analysis mode and minimal repo info
            commit_info = None
            analysis_mode = "patch_file"

            # Try to detect language from patch content
            language = _detect_language_from_patch(diff_text)

        else:
            git_analyzer = GitAnalyzer(repo_path)

            if commit:
                # Validate that if target_branch is specified, commit exists in that branch
                if target_branch:
                    if not git_analyzer.commit_exists_in_branch(commit, target_branch):
                        click.echo(f"❌ Error: Commit '{commit}' does not exist in branch '{target_branch}'", err=True)
                        sys.exit(1)
                    if verbose:
                        click.echo(f"\n📝 Analyzing commit: {commit} (verified in branch: {target_branch})")

                # Commit analysis mode
                if verbose and not target_branch:
                    click.echo(f"\n📝 Analyzing commit: {commit}")

                compare_ref = compare_with if compare_with else f"{commit}^"
                diff_text = git_analyzer.get_diff(compare_ref, commit)

                if not diff_text or not diff_text.strip():
                    click.echo("❌ No changes found in commit", err=True)
                    sys.exit(1)

                commit_info = git_analyzer.get_commit_info(commit)
                analysis_mode = "commit"
                language = git_analyzer.detect_language()

            elif target_branch:
                # Branch comparison mode
                if verbose:
                    click.echo(f"\n📝 Comparing branches: {base_branch}..{target_branch}")

                diff_text = git_analyzer.get_diff(base_branch, target_branch)

                if not diff_text or not diff_text.strip():
                    click.echo(f"❌ No changes between {base_branch} and {target_branch}", err=True)
                    sys.exit(1)

                commit_info = None
                analysis_mode = "branch"
                language = git_analyzer.detect_language()

            else:
                # Working directory mode
                if verbose:
                    click.echo(f"\n📝 Analyzing working directory changes against {base_branch}")
                    if untracked:
                        if untracked_files:
                            click.echo(f"   Including {len(untracked_files)} specific untracked files")
                        else:
                            click.echo("   Including all untracked (new) files")

                # Convert untracked_files tuple to list if provided
                untracked_list = list(untracked_files) if untracked_files else None
                diff_text = git_analyzer.get_working_directory_diff(base_branch, include_untracked=untracked, untracked_file_list=untracked_list)

                if not diff_text or not diff_text.strip():
                    click.echo(f"❌ No changes in working directory compared to {base_branch}", err=True)
                    sys.exit(1)

                commit_info = None
                analysis_mode = "working_directory"
                language = git_analyzer.detect_language()

        if verbose:
            if patch:
                # For patch files, calculate stats from the patch content
                diff_stats = _calculate_patch_stats(diff_text)
            else:
                diff_stats = git_analyzer.get_diff_stats(diff_text)
            click.echo(f"\n📊 Changes: +{diff_stats['additions']} -{diff_stats['deletions']} lines")
            click.echo(f"📁 Files: {diff_stats['files_changed']}")

        if dry_run:
            click.echo("\n✅ Dry run complete - no patches generated")
            return

        # Create agent
        if verbose:
            click.echo("\n🤖 Initializing Code Splitter Agent...")

        use_llm = not no_llm

        # Check if LLM parameters are provided
        if use_llm and not api_key:
            click.echo("\n⚠️  WARNING: No LLM API key provided via --api-key", err=True)
            click.echo("   LLM-enhanced analysis will be DISABLED.", err=True)
            click.echo("   This may significantly degrade functionality:", err=True)
            click.echo("     - Patch descriptions will be structural, not semantic", err=True)
            click.echo("     - Dependency detection will be basic pattern-matching", err=True)
            click.echo("     - Semantic grouping will be limited", err=True)
            click.echo("   To enable LLM: use --api-key, --api-base (optional), --model (optional)", err=True)
            click.echo("")
            use_llm = False

        if use_llm:
            # Validate required LLM parameters
            if not api_base:
                click.echo("\n⚠️  WARNING: No --api-base provided, using OpenAI default", err=True)
            if verbose:
                click.echo(f"   LLM Model: {model_name}")
                click.echo(f"   LLM Base URL: {api_base or 'https://api.openai.com/v1 (default)'}")

        agent = CodeSplitterAgent(
            llm_api_key=api_key or "dummy",
            llm_base_url=api_base,
            llm_model=model_name,
            use_llm=use_llm
        )

        # Split changes
        if verbose:
            click.echo("\n🔄 Analyzing dependencies and splitting patches...")

        # Prepare additional context for LLM
        additional_context = {
            'repository_info': {
                'name': repo_name,
                'path': str(repo_path),
                'language': language if not patch else _detect_language_from_patch(diff_text)
            }
        }

        # Add commit message if analyzing a specific commit
        if commit_info:
            commit_message = commit_info.get('summary', '')
            if commit_info.get('body'):
                commit_message += '\n\n' + commit_info.get('body')
            additional_context['commit_message'] = commit_message

        result = agent.split_changes(
            diff_text,
            target_patch_size=target_size,
            additional_context=additional_context
        )

        # Build repository info
        if patch:
            # Minimal repo info for patch files
            repo_info = {
                "path": str(repo_path),
                "name": repo_name,
                "current_branch": "N/A",
                "source_repo_name": repo_name,
                "language": language,
                "description": f"Patch file: {os.path.basename(patch)}",
                "analysis": {"mode": analysis_mode, "patch_file": patch},
                "base_branch": "N/A",
                "patch_file": os.path.basename(patch)
            }
        else:
            repo_info = {
                "path": str(repo_path),
                "name": repo_name,
                "current_branch": git_analyzer.get_current_branch(),
                "source_repo_name": repo_name,
                "language": language,
                "description": commit_info.get('summary') if commit_info else None,
                "analysis": {"mode": analysis_mode},
                "base_branch": base_branch
            }
            # Add commit_id if analyzing a specific commit
            if commit:
                repo_info["commit_id"] = commit

        # Create timestamped output directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if patch:
            patch_basename = os.path.splitext(os.path.basename(patch))[0]
            output_subdir = os.path.join(output_dir, f"patch_{patch_basename}_{timestamp}")
        elif commit:
            output_subdir = os.path.join(output_dir, f"commit_{commit[:8]}_{timestamp}")
        elif target_branch:
            output_subdir = os.path.join(output_dir, f"branch_{target_branch.replace('/', '_')}_{timestamp}")
        else:
            output_subdir = os.path.join(output_dir, f"uncommitted_{timestamp}")

        # Export patches
        if verbose:
            click.echo(f"\n📦 Exporting {len(result.patches)} patches to {output_subdir}/")

        agent.export_patches_to_files(result, diff_text, output_subdir, repo_info)

        # Display summary
        click.echo("\n" + "=" * 50)
        click.echo("✅ Patch Generation Complete!")
        click.echo("=" * 50)
        click.echo(f"📂 Output directory: {output_subdir}")
        click.echo(f"📝 Patches created: {len(result.patches)}")
        click.echo(f"📊 Total changes: {result.metadata['num_changes']} hunks")
        click.echo(f"🔗 Dependencies: {result.metadata['num_dependencies']}")

        if result.warnings:
            click.echo(f"\n⚠️  Warnings: {len(result.warnings)}")
            for warning in result.warnings[:5]:
                click.echo(f"   - {warning}")
            if len(result.warnings) > 5:
                click.echo(f"   ... and {len(result.warnings) - 5} more")

        click.echo("\n💡 To apply patches:")
        click.echo(f"   cd {output_subdir}")
        click.echo("   chmod +x apply_patches.sh")
        click.echo("   ./apply_patches.sh")
        click.echo("")

    except KeyboardInterrupt:
        click.echo("\n\n❌ Interrupted by user", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"\n❌ Error: {e}", err=True)
        if debug:
            import traceback
            traceback.print_exc()
        sys.exit(1)


def _resolve_repo_from_config(config_path: str, repo_name: str) -> str:
    """Resolve repository path from source configuration."""
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)

        # Handle both direct repositories list and source.repositories structure
        repos = config.get('repositories', [])
        if not repos and 'source' in config:
            repos = config['source'].get('repositories', [])

        for repo_config in repos:
            if repo_config.get('name') == repo_name:
                return repo_config.get('path')

        return None
    except Exception as e:
        click.echo(f"⚠️  Warning: Could not load source config: {e}", err=True)
        return None


def _detect_language_from_patch(patch_text: str) -> str:
    """Detect programming language from patch file contents.

    Args:
        patch_text: The patch file content

    Returns:
        Detected language name
    """
    # Extract file paths from diff headers
    lines = patch_text.split('\n')
    extensions = {}

    for line in lines:
        if line.startswith('diff --git') or line.startswith('---') or line.startswith('+++'):
            # Extract file path
            parts = line.split()
            for part in parts:
                if '/' in part and not part.startswith('---') and not part.startswith('+++'):
                    # Remove a/ or b/ prefix if present
                    file_path = part.lstrip('ab/')
                    ext = os.path.splitext(file_path)[1]
                    if ext:
                        extensions[ext] = extensions.get(ext, 0) + 1

    if not extensions:
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
    most_common_ext = max(extensions.items(), key=lambda x: x[1])[0]
    return lang_map.get(most_common_ext, 'unknown')


def _calculate_patch_stats(patch_text: str) -> dict:
    """Calculate statistics from patch file content.

    Args:
        patch_text: The patch file content

    Returns:
        Dictionary with additions, deletions, and files_changed counts
    """
    lines = patch_text.split('\n')
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


@click.command()
@click.argument('patch_split_dir', type=click.Path(exists=True))
@click.argument('patch_filename')
@click.option('--source-config', required=True, type=click.Path(exists=True), help='Path to source repositories configuration file (REQUIRED)')
@click.option('--target-size', '-s', type=int, default=200, help='Target size for each patch in lines (default: 200)')
@click.option('--max-patches', '-m', type=int, default=None, help='Maximum number of patches (default: no limit)')
@click.option('--api-key', '-k', default=None, help='API key for LLM service (required for LLM mode)')
@click.option('--api-base', default=None, help='Base URL for API service (optional, defaults to OpenAI)')
@click.option('--model', default='gpt-4', help='Model name to use (default: gpt-4)')
@click.option('--no-llm', is_flag=True, help='Disable LLM-enhanced analysis')
def resplit(patch_split_dir, patch_filename, source_config, target_size, max_patches, api_key, api_base, model, no_llm):
    """Re-split a specific patch from an existing patch split directory.

    PATCH_SPLIT_DIR: Path to the patch split directory (e.g., output/uncommitted_20251015_084549)
    PATCH_FILENAME: Name of the patch file to re-split (e.g., 01_Add_feature.patch)

    REQUIRED PARAMETER:
    - --source-config: Path to source repositories configuration file (YAML/JSON)

    Example:
        python -m code_splitter.main resplit output/uncommitted_20251015_084549 01_Add_feature.patch --source-config source.yaml
        python -m code_splitter.main resplit output/dir patch.patch --source-config source.yaml --target-size 100
    """
    # Use only command-line provided values (no environment variable fallback)
    use_llm = not no_llm

    # Check if LLM parameters are provided
    if use_llm and not api_key:
        click.echo("\n⚠️  WARNING: No LLM API key provided via --api-key", err=True)
        click.echo("   LLM-enhanced analysis will be DISABLED.", err=True)
        click.echo("   This may significantly degrade functionality:", err=True)
        click.echo("     - Patch descriptions will be structural, not semantic", err=True)
        click.echo("     - Dependency detection will be basic pattern-matching", err=True)
        click.echo("     - Semantic grouping will be limited", err=True)
        click.echo("   To enable LLM: use --api-key, --api-base (optional), --model (optional)", err=True)
        click.echo("")
        use_llm = False

    if use_llm and not api_base:
        click.echo("⚠️  WARNING: No --api-base provided, using OpenAI default", err=True)

    # Create agent
    agent = CodeSplitterAgent(
        llm_api_key=api_key or "dummy",
        llm_base_url=api_base,
        llm_model=model,
        use_llm=use_llm
    )

    click.echo(f"📦 Re-splitting patch from {patch_split_dir}")
    click.echo(f"   Target patch: {patch_filename}")
    click.echo()

    try:
        result_dir = agent.resplit_patch(
            patch_split_dir=patch_split_dir,
            patch_filename=patch_filename,
            target_patch_size=target_size,
            max_patches=max_patches
        )

        click.echo()
        click.echo("=" * 50)
        click.echo("✅ Re-split Complete!")
        click.echo("=" * 50)
        click.echo(f"📂 Updated directory: {result_dir}")
        click.echo()

    except Exception as e:
        click.echo(f"❌ Error: {e}", err=True)
        if '--debug' in sys.argv:
            import traceback
            traceback.print_exc()
        sys.exit(1)


# Create a Click group for multiple commands
@click.group()
def cli():
    """Code Splitter Agent - Split code changes into dependency-aware patches."""
    pass


# Add commands to the group
cli.add_command(main, name='split')
cli.add_command(resplit)


if __name__ == '__main__':
    cli()
