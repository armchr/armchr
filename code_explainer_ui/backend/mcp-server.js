#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import yaml from 'yaml';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reviewService = require('./review-service.js');

const SERVER_NAME = 'armchair-code-reviewer';
const SERVER_VERSION = '1.0.0';

// Load configuration
const CONFIG_PATH = process.env.ARMCHAIR_SOURCE_YAML || path.join(__dirname, '../config/source.yaml');
const OUTPUT_PATH = process.env.ARMCHAIR_OUTPUT || path.join(__dirname, '../../output');

let config = {};
try {
  const configData = await fs.readFile(CONFIG_PATH, 'utf8');
  config = yaml.parse(configData);
  console.error(`Loaded config from: ${CONFIG_PATH}`);
} catch (error) {
  console.error(`Error loading config file: ${error.message}`);
  process.exit(1);
}

class ArmchairMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'review_uncommitted_changes',
          description: 'Performs a detailed code review of all uncommitted changes in a repository directory. Returns comprehensive review in markdown format including security issues, code quality concerns, complexity analysis, and positive feedback.',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Absolute path to the repository directory containing uncommitted changes to review'
              },
              description: {
                type: 'string',
                description: 'Optional description or context for the review'
              }
            },
            required: ['directory']
          }
        }
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'review_uncommitted_changes') {
        return await this.handleReviewUncommittedChanges(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async handleReviewUncommittedChanges(args) {
    const { directory, description } = args;

    if (!directory) {
      throw new Error('directory parameter is required');
    }

    // Resolve to absolute path
    const repoPath = path.resolve(directory);

    // Check if directory exists
    if (!await fs.pathExists(repoPath)) {
      throw new Error(`Directory does not exist: ${repoPath}`);
    }

    // Check if it's a git repository
    const gitDir = path.join(repoPath, '.git');
    if (!await fs.pathExists(gitDir)) {
      throw new Error(`Directory is not a git repository: ${repoPath}`);
    }

    // Find repository in config by path
    const repositories = config.source?.repositories || [];
    let repo = repositories.find(r => path.resolve(r.path) === repoPath);

    // If not found by exact match, try to find by checking if the repo path is a parent or child
    if (!repo) {
      repo = repositories.find(r => {
        const configPath = path.resolve(r.path);
        return repoPath.startsWith(configPath) || configPath.startsWith(repoPath);
      });
    }

    if (!repo) {
      throw new Error(`Repository not found in config for path: ${repoPath}. Please add it to ${CONFIG_PATH}`);
    }

    const repoName = repo.name;

    try {
      // Perform the code review
      const result = await reviewService.performCodeReview({
        repoPath,
        repoName,
        description,
        outputPath: OUTPUT_PATH,
        sourceConfigPath: CONFIG_PATH
      });

      // Extract the markdown review from the result
      const reviewMarkdown = result.reviewData?.review_markdown || result.reviewData?.markdown || 'No review content available';

      return {
        content: [
          {
            type: 'text',
            text: reviewMarkdown
          }
        ]
      };
    } catch (error) {
      throw new Error(`Code review failed: ${error.message}`);
    }
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Armchair MCP Server running on stdio');
  }
}

// Start the server
const mcpServer = new ArmchairMCPServer();
mcpServer.start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
