"""Command-line interface for the code splitter agent."""

import argparse
import sys
import os
from .agent import CodeSplitterAgent


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Split code changes into dependency-aware patches"
    )

    parser.add_argument(
        "diff_file",
        help="Path to the diff file (or - for stdin)"
    )

    parser.add_argument(
        "--output-dir",
        "-o",
        default="./patches",
        help="Output directory for patches (default: ./patches)"
    )

    parser.add_argument(
        "--target-size",
        "-s",
        type=int,
        default=200,
        help="Target size for each patch in lines (default: 200)"
    )

    parser.add_argument(
        "--max-patches",
        "-m",
        type=int,
        default=None,
        help="Maximum number of patches (default: no limit)"
    )

    parser.add_argument(
        "--api-key",
        "-k",
        default=None,
        help="LLM API key (required for LLM mode)"
    )

    parser.add_argument(
        "--base-url",
        "-u",
        default=None,
        help="LLM API base URL (default: OpenAI)"
    )

    parser.add_argument(
        "--model",
        "-M",
        default="gpt-4",
        help="LLM model to use (default: gpt-4)"
    )

    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Disable LLM-enhanced analysis"
    )

    args = parser.parse_args()

    # Use only command-line provided values (no environment variable fallback)
    api_key = args.api_key
    use_llm = not args.no_llm

    # Check if LLM parameters are provided
    if use_llm and not api_key:
        print("\n⚠️  WARNING: No LLM API key provided via --api-key")
        print("   LLM-enhanced analysis will be DISABLED.")
        print("   This may significantly degrade functionality:")
        print("     - Patch descriptions will be structural, not semantic")
        print("     - Dependency detection will be basic pattern-matching")
        print("     - Semantic grouping will be limited")
        print("   To enable LLM: use --api-key, --base-url (optional), --model (optional)")
        print("")
        use_llm = False

    if use_llm and not args.base_url:
        print("⚠️  WARNING: No --base-url provided, using OpenAI default")

    # Read diff
    if args.diff_file == "-":
        diff_text = sys.stdin.read()
    else:
        if not os.path.exists(args.diff_file):
            print(f"Error: File not found: {args.diff_file}")
            sys.exit(1)

        with open(args.diff_file, 'r') as f:
            diff_text = f.read()

    # Create agent
    agent = CodeSplitterAgent(
        llm_api_key=api_key or "dummy",
        llm_base_url=args.base_url,
        llm_model=args.model,
        use_llm=use_llm
    )

    # Split changes
    print(f"Processing diff from {args.diff_file}...")
    print()

    try:
        result = agent.split_changes(
            diff_text,
            target_patch_size=args.target_size,
            max_patches=args.max_patches
        )

        print()
        print("=" * 80)
        print("RESULTS")
        print("=" * 80)
        print()
        print(f"Created {len(result.patches)} patches:")
        print()

        for patch in result.patches:
            deps_str = f" (depends on {patch.depends_on})" if patch.depends_on else ""
            warnings_str = f" ⚠️  {', '.join(patch.warnings)}" if patch.warnings else ""
            print(f"  Patch {patch.id}: {patch.name}")
            print(f"    {patch.description}")
            print(f"    Size: {patch.size_lines} lines, {len(patch.changes)} changes{deps_str}")
            if warnings_str:
                print(f"    {warnings_str}")
            print()

        if result.warnings:
            print("⚠️  Warnings:")
            for warning in result.warnings:
                print(f"  - {warning}")
            print()

        print("Metrics:")
        for key, value in result.metadata.get('metrics', {}).items():
            if isinstance(value, float):
                print(f"  {key}: {value:.2f}")
            else:
                print(f"  {key}: {value}")
        print()

        # Export patches with repository info
        repo_info = None
        try:
            # Try to get git info if available
            import subprocess
            repo_path = os.getcwd()

            try:
                branch = subprocess.check_output(
                    ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                    stderr=subprocess.DEVNULL
                ).decode().strip()
            except:
                branch = 'main'

            try:
                repo_name = os.path.basename(
                    subprocess.check_output(
                        ['git', 'rev-parse', '--show-toplevel'],
                        stderr=subprocess.DEVNULL
                    ).decode().strip()
                )
            except:
                repo_name = os.path.basename(repo_path)

            repo_info = {
                "path": repo_path,
                "name": repo_name,
                "current_branch": branch,
                "source_repo_name": repo_name,
                "language": "unknown",
                "description": None,
                "analysis": {"mode": "diff_file"},
                "base_branch": branch
            }
        except:
            pass

        agent.export_patches_to_files(result, diff_text, args.output_dir, repo_info)

        print()
        print(f"✓ Successfully split changes into {len(result.patches)} patches")
        print(f"  Output directory: {args.output_dir}")
        print(f"  Files created:")
        print(f"    - {len(result.patches)} .patch files")
        print(f"    - metadata_*.json")
        print(f"    - summary_*.md")
        print(f"    - apply_patches.sh")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
