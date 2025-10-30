"""Example usage of the Code Splitter Agent."""

import os
from src.code_splitter import CodeSplitterAgent

# Example diff (simplified Python refactoring)
EXAMPLE_DIFF = """
diff --git a/service.py b/service.py
index 1234567..abcdefg 100644
--- a/service.py
+++ b/service.py
@@ -1,10 +1,15 @@
 class UserService:
-    def get_user(self, user_id):
-        # Old implementation
-        return self.db.query(user_id)
+    def get_user(self, user_id: int) -> User:
+        # New implementation with type hints
+        return self._fetch_user(user_id)
+
+    def _fetch_user(self, user_id: int) -> User:
+        # Extracted helper method
+        return self.db.query(user_id)

-    def update_user(self, user_id, data):
-        user = self.get_user(user_id)
+    def update_user(self, user_id: int, data: dict) -> User:
+        # Updated to use new type hints
+        user = self._fetch_user(user_id)
         user.update(data)
         return user

diff --git a/controller.py b/controller.py
index 2345678..bcdefgh 100644
--- a/controller.py
+++ b/controller.py
@@ -5,8 +5,8 @@ from service import UserService
 class UserController:
     def __init__(self):
         self.service = UserService()

-    def handle_get(self, request):
-        user_id = request.params['id']
+    def handle_get(self, request) -> Response:
+        user_id = int(request.params['id'])
         user = self.service.get_user(user_id)
         return Response(user)

diff --git a/types.py b/types.py
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/types.py
@@ -0,0 +1,10 @@
+from dataclasses import dataclass
+from typing import Optional
+
+@dataclass
+class User:
+    id: int
+    name: str
+    email: str
+    age: Optional[int] = None
+
"""


def main():
    """Run example."""
    print("=" * 80)
    print("Code Splitter Agent - Example Usage")
    print("=" * 80)
    print()

    # Get API key from environment
    api_key = os.environ.get("OPENAI_API_KEY")

    if not api_key:
        print("Note: OPENAI_API_KEY not set. Running without LLM enhancement.")
        print("Set OPENAI_API_KEY environment variable to enable LLM features.")
        print()
        use_llm = False
    else:
        use_llm = True

    # Create agent
    agent = CodeSplitterAgent(
        llm_api_key=api_key or "dummy",
        llm_model="gpt-4",
        use_llm=use_llm
    )

    # Split the example diff
    print("Analyzing example diff...")
    print()

    result = agent.split_changes(
        EXAMPLE_DIFF,
        target_patch_size=150
    )

    # Display results
    print()
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)
    print()

    print(f"Found {result.metadata['num_changes']} changes")
    print(f"Found {result.metadata['num_dependencies']} dependencies")
    print(f"Identified {len(result.atomic_groups)} atomic groups")
    print(f"Identified {len(result.semantic_groups)} semantic groups")
    print()

    print(f"Created {len(result.patches)} patches:")
    print()

    for patch in result.patches:
        print(f"Patch {patch.id}: {patch.name}")
        print(f"  Description: {patch.description}")
        print(f"  Size: {patch.size_lines} lines")
        print(f"  Changes: {len(patch.changes)}")

        if patch.depends_on:
            print(f"  Depends on: {patch.depends_on}")

        if patch.warnings:
            print(f"  Warnings: {', '.join(patch.warnings)}")

        print(f"  Rationale: {patch.rationale}")
        print()

    if result.warnings:
        print("Overall warnings:")
        for warning in result.warnings:
            print(f"  - {warning}")
        print()

    print("Quality Metrics:")
    metrics = result.metadata['metrics']
    print(f"  Number of patches: {metrics['num_patches']}")
    print(f"  Average patch size: {metrics['avg_patch_size']:.1f} lines")
    print(f"  Balance score: {metrics['balance_score']:.2f}")
    print(f"  Reviewability score: {metrics['reviewability_score']:.2f}")
    print()

    # Export to files
    from datetime import datetime
    output_dir = f"./example_patches_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    print(f"Exporting patches to {output_dir}/")

    # Optional repository info
    repo_info = {
        "path": os.getcwd(),
        "name": "code-splitter-example",
        "current_branch": "main",
        "source_repo_name": "code-splitter-example",
        "language": "python",
        "description": "Example code splitter output",
        "analysis": {"mode": "diff_only"},
        "base_branch": "main"
    }

    agent.export_patches_to_files(result, EXAMPLE_DIFF, output_dir, repo_info)
    print(f"✓ Exported {len(result.patches)} patch files")
    print(f"  - {len(result.patches)} .patch files")
    print(f"  - metadata_*.json")
    print(f"  - summary_*.md")
    print(f"  - apply_patches.sh")
    print()

    print("=" * 80)
    print("Example complete!")
    print("=" * 80)


if __name__ == "__main__":
    main()
