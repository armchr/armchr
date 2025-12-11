# Changelog

All notable changes to Armchair will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **code_explainer_ui**: Added complete frontend and backend source code to the repository
  - React frontend with Material-UI for the Armchair dashboard
  - Express.js backend providing REST API and Git operations
  - Full development environment with Make commands
  - MCP (Model Context Protocol) server mode support
  - Comprehensive documentation for local development and contribution
- **code-splitter-agent**: New technical documentation and improved README
  - `EXPLAINER.md`: Comprehensive technical deep-dive explaining the 5-phase pipeline architecture
  - Detailed documentation of all phases: Analysis, Graph Construction, Semantic Grouping, Patch Splitting, and Validation
  - Debugging guide for dependency detection issues
  - Extension points documentation for adding language support

### Improved
- **code-splitter-agent**: Enhanced Go method call detection for chained selector expressions
  - New `get_selector_chain()` helper function to traverse nested selector expressions (e.g., `t.CodeGraph.UpdateNodeMetaData()`)
  - Correctly extracts method usages from struct field chains like `receiver.Field.Method()`
  - Builds qualified names (e.g., `CodeGraph.UpdateNodeMetaData`) for accurate dependency matching
- **code-splitter-agent**: Multi-strategy dependency resolution in Phase 1
  - Strategy 1: Direct qualified name lookup (e.g., `CodeGraph.UpdateNodeMetaData`)
  - Strategy 2: Type.Method format lookup for method calls
  - Strategy 3: Method name fallback lookup (e.g., `method:UpdateNodeMetaData`)
  - Improved symbol index to include receiver type entries for Go methods
- **code-splitter-agent**: Updated README with better organization
  - Quick Start section moved to top for faster onboarding
  - Detailed Architecture section with Five-Phase Pipeline explanation
  - Added LLM Integration and Quality Metrics documentation

## [v0.2] - 2025-12-04

### Added
- **Enhanced Symbol Analysis**: Extracts both symbol definitions AND usages for accurate cross-file dependency detection
  - Qualified name support (e.g., `package.Symbol`) for precise dependency resolution
  - Type usage tracking for Go and statically-typed languages
  - New `role` field to distinguish definitions from usages
- **Hunk Integrity Verification**: Ensures patches remain valid across different applications
  - MD5 digest calculation for stable hunk identification
  - Automatic verification during patch export
  - Integrity checks independent of line number adjustments
- **Dependency-Ordered File Output**: Files in patches are now ordered so definitions appear before usages
  - Improves patch readability and review experience
  - Automatic cycle detection and breaking for complex dependencies
- **QUICKSTART.md**: New quick start guide for faster onboarding

### Changed
- **Improved LLM Context**: Full Change objects now passed to LLM for better semantic analysis
  - More accurate dependency inference
  - Better semantic grouping recommendations
- **Symbol Model Updates**: Enhanced `Symbol` dataclass with new fields
  - Added `role` (definition/usage), `package`, `qualified_name`, and `field` type
  - New `get_qualified_name()` method for fully qualified symbol names
- **Two-Phase Dependency Analysis**: New architecture for dependency detection
  - Phase 1: Build symbol index from all definitions
  - Phase 2: Resolve usages against the index with qualified name lookup
  - Fallback to import-based package dependencies when symbol lookup fails

### Improved
- More accurate cross-package dependency detection in Go and other languages
- Better handling of type identifiers and field references
- Reduced false positives in import statement detection
- Enhanced tree-sitter traversal with context-aware identifier extraction

## [v0.1] - 2025-11-06

### Added
- **Reviewer Agent**: AI-powered code review capabilities for commits and uncommitted changes
  - Analyzes code for potential issues and best practices
  - Generates detailed review comments and suggestions
  - Supports multiple programming languages
- **Dashboard Settings UI**: Comprehensive settings interface for configuration
  - LLM configuration (API base URL, model name, API key)
  - Repository management (add, edit, remove repositories)
  - All settings accessible directly from the dashboard

### Changed
- **Simplified Setup**: Streamlined installation and configuration process
  - Single script (`armchair.sh`) to get started
  - Interactive workspace selection
  - Automatic browser launch
  - All configuration now done through the dashboard UI
- **Updated Docker Image**: Includes both Splitter and Reviewer agents
- **Enhanced Dashboard**: Updated UI to support both Splitter and Reviewer workflows

### Improved
- Better user experience with centralized configuration
- Reduced manual configuration file editing
- More intuitive onboarding flow

## [v0.0] - 2025-11-01

### Added
- **Splitter Agent**: Initial release of commit/change splitting functionality
  - Breaks down commits into logical chunks
  - Identifies code structures and relationships
  - Generates structured output for analysis
  - Multi-language support
- **Armchair Dashboard**: Web-based UI for code analysis
  - Visual interface for navigating code explanations
  - Browse branches, commits, and uncommitted changes
  - Run splitter analysis from the UI
- **Docker Support**: Containerized deployment
  - Pre-built Docker images
  - Easy setup and portability
- **API Access**: Backend API for programmatic access
  - REST endpoints for analysis triggers
  - Repository and commit information
- **Configuration System**:
  - YAML-based repository configuration
  - JSON-based LLM settings
- **Command-line Tool**: Standalone splitter script for CI/CD integration
