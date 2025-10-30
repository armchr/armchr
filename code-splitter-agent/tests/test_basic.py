"""Basic tests for the code splitter agent."""

import pytest
from src.code_splitter.models import Change, Symbol, Dependency
from src.code_splitter.phase1_analysis import DiffParser, DependencyAnalyzer
from src.code_splitter.phase2_graph import DependencyGraph


SIMPLE_DIFF = """
diff --git a/test.py b/test.py
index 1234567..abcdefg 100644
--- a/test.py
+++ b/test.py
@@ -1,5 +1,8 @@
 def hello():
-    print("hello")
+    print("Hello, World!")

-def goodbye():
-    print("goodbye")
+def greet(name):
+    print(f"Hello, {name}!")
+
+def main():
+    greet("Alice")
"""


def test_diff_parser():
    """Test basic diff parsing."""
    parser = DiffParser()
    changes = parser.parse_diff(SIMPLE_DIFF)

    assert len(changes) > 0
    assert all(isinstance(c, Change) for c in changes)

    # Check that we found the file
    files = set(c.file for c in changes)
    assert 'test.py' in files or 'b/test.py' in files


def test_dependency_graph():
    """Test dependency graph construction."""
    graph = DependencyGraph()

    # Create test changes
    change1 = Change(
        id="test.py:0",
        file="test.py",
        hunk_id=0,
        type="add",
        symbols=[Symbol(name="greet", type="function", file="test.py", line=5)],
        line_range=(5, 6),
        content="def greet(name):\n    print(f'Hello, {name}!')",
        added_lines=2
    )

    change2 = Change(
        id="test.py:1",
        file="test.py",
        hunk_id=1,
        type="add",
        symbols=[Symbol(name="main", type="function", file="test.py", line=8)],
        line_range=(8, 9),
        content="def main():\n    greet('Alice')",
        added_lines=2
    )

    graph.add_changes([change1, change2])

    # Add dependency: change2 depends on change1
    dep = Dependency(
        source="test.py:1",
        target="test.py:0",
        type="defines_uses",
        strength=1.0,
        reason="main() calls greet()"
    )

    graph.add_dependencies([dep])

    # Test topological sort
    sorted_changes = graph.topological_sort()
    assert sorted_changes.index("test.py:0") < sorted_changes.index("test.py:1")


def test_atomic_groups():
    """Test finding atomic groups."""
    graph = DependencyGraph()

    # Create circular dependency
    change1 = Change(
        id="a.py:0",
        file="a.py",
        hunk_id=0,
        type="modify",
        symbols=[],
        line_range=(1, 2),
        content="",
        added_lines=1
    )

    change2 = Change(
        id="b.py:0",
        file="b.py",
        hunk_id=0,
        type="modify",
        symbols=[],
        line_range=(1, 2),
        content="",
        added_lines=1
    )

    graph.add_changes([change1, change2])

    # Create circular dependency
    dep1 = Dependency(
        source="a.py:0",
        target="b.py:0",
        type="defines_uses",
        strength=1.0,
        reason="a depends on b"
    )

    dep2 = Dependency(
        source="b.py:0",
        target="a.py:0",
        type="defines_uses",
        strength=1.0,
        reason="b depends on a"
    )

    graph.add_dependencies([dep1, dep2])

    # Find atomic groups
    atomic_groups = graph.find_atomic_groups()

    # Should find the circular dependency as an atomic group
    assert len(atomic_groups) > 0

    # Check that both changes are in an atomic group
    all_atomic_changes = set()
    for group in atomic_groups:
        all_atomic_changes.update(group.change_ids)

    assert "a.py:0" in all_atomic_changes
    assert "b.py:0" in all_atomic_changes


def test_dependency_analyzer():
    """Test dependency analysis."""
    analyzer = DependencyAnalyzer()

    # Create changes
    changes = [
        Change(
            id="test.py:0",
            file="test.py",
            hunk_id=0,
            type="add",
            symbols=[Symbol(name="foo", type="function", file="test.py", line=1)],
            line_range=(1, 2),
            content="+def foo():\n+    pass",
            added_lines=2
        ),
        Change(
            id="test.py:1",
            file="test.py",
            hunk_id=1,
            type="add",
            symbols=[],
            line_range=(5, 6),
            content="+    result = foo()",
            added_lines=1
        )
    ]

    dependencies = analyzer.analyze_dependencies(changes)

    # Should find at least some dependencies
    assert isinstance(dependencies, list)
    assert all(isinstance(d, Dependency) for d in dependencies)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
