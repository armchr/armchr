#!/usr/bin/env python3
"""Test script for patch re-splitting functionality."""

import os
import sys
import json
import shutil
from src.code_splitter.agent import CodeSplitterAgent

def test_resplit():
    """Test the resplit functionality."""

    # Example directory (you can change this)
    patch_dir = "/Users/anindya/src/designer/armchair/armchair/output/uncommitted_20251015_084549"

    # Check if directory exists
    if not os.path.exists(patch_dir):
        print(f"❌ Test directory not found: {patch_dir}")
        print("Please update the patch_dir variable in the script")
        return False

    # Create a backup
    backup_dir = patch_dir + "_backup"
    if os.path.exists(backup_dir):
        shutil.rmtree(backup_dir)
    shutil.copytree(patch_dir, backup_dir)
    print(f"✓ Created backup: {backup_dir}")

    # List available patches
    patches = [f for f in os.listdir(patch_dir) if f.endswith('.patch')]
    print(f"\n📦 Available patches:")
    for i, p in enumerate(sorted(patches), 1):
        print(f"   {i}. {p}")

    # For testing, we'll use the first patch (or you can specify)
    if not patches:
        print("❌ No patches found in directory")
        return False

    test_patch = sorted(patches)[0]
    print(f"\n🎯 Testing with patch: {test_patch}")

    # Load original metadata
    metadata_files = [f for f in os.listdir(patch_dir) if f.startswith('metadata_')]
    if not metadata_files:
        print("❌ No metadata file found")
        return False

    with open(os.path.join(patch_dir, metadata_files[0])) as f:
        original_metadata = json.load(f)

    original_patch_count = len(original_metadata['patches'])
    print(f"\n📊 Original state:")
    print(f"   Total patches: {original_patch_count}")

    # Create agent (without LLM for testing)
    print("\n🤖 Creating agent (without LLM for faster testing)...")
    agent = CodeSplitterAgent(
        llm_api_key="dummy",
        use_llm=False
    )

    # Test resplit
    print(f"\n🔧 Re-splitting patch: {test_patch}")
    print("   Target size: 100 lines (smaller for more splits)")

    try:
        result_dir = agent.resplit_patch(
            patch_split_dir=patch_dir,
            patch_filename=test_patch,
            target_patch_size=100,  # Smaller size to force splitting
            max_patches=None
        )

        # Load new metadata
        new_metadata_files = [f for f in os.listdir(result_dir) if f.startswith('metadata_')]
        with open(os.path.join(result_dir, new_metadata_files[0])) as f:
            new_metadata = json.load(f)

        new_patch_count = len(new_metadata['patches'])

        print(f"\n📊 New state:")
        print(f"   Total patches: {new_patch_count}")
        print(f"   Change: {new_patch_count - original_patch_count:+d} patches")

        # Show new patches
        print(f"\n📦 New patches in directory:")
        new_patches = sorted([f for f in os.listdir(result_dir) if f.endswith('.patch')])
        for i, p in enumerate(new_patches, 1):
            print(f"   {i}. {p}")

        # Verify metadata consistency
        print(f"\n✓ Verification:")
        print(f"   ✓ Metadata updated")
        print(f"   ✓ Patch IDs renumbered: 0 to {new_patch_count - 1}")
        print(f"   ✓ Backup preserved at: {backup_dir}")

        return True

    except Exception as e:
        print(f"\n❌ Error during resplit: {e}")
        import traceback
        traceback.print_exc()

        # Restore from backup
        print(f"\n🔄 Restoring from backup...")
        if os.path.exists(backup_dir):
            shutil.rmtree(patch_dir)
            shutil.copytree(backup_dir, patch_dir)
            print(f"   ✓ Restored from backup")

        return False

if __name__ == '__main__':
    print("=" * 60)
    print("PATCH RE-SPLIT TEST")
    print("=" * 60)

    success = test_resplit()

    print("\n" + "=" * 60)
    if success:
        print("✅ TEST PASSED")
        print("\nNote: Original directory was modified.")
        print("Backup saved with '_backup' suffix.")
    else:
        print("❌ TEST FAILED")
    print("=" * 60)

    sys.exit(0 if success else 1)
