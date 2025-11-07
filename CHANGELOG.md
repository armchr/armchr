# Changelog

All notable changes to Armchair will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1] - 2025-11-06

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

## [v0] - 2025-11-01

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
