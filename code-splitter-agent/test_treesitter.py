#!/usr/bin/env python3
"""Quick test for tree-sitter initialization."""

import sys

try:
    import tree_sitter_typescript as ts
    print(f"✅ tree_sitter_typescript imported")
    print(f"   Available attributes: {[x for x in dir(ts) if not x.startswith('_')]}")

    from tree_sitter import Language, Parser

    if hasattr(ts, 'language_typescript'):
        lang_capsule = ts.language_typescript()
        print(f"✅ language_typescript() works")
        # Newer API returns PyCapsule, need to wrap in Language
        lang = Language(lang_capsule)
    elif hasattr(ts, 'language'):
        lang = ts.language()
        print(f"✅ language() works")
    else:
        print(f"❌ No language function found")
        sys.exit(1)

    parser = Parser(lang)
    print(f"✅ Parser created successfully")

    print("\nAll tree-sitter tests passed!")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
