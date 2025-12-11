const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const path = require('path');
const fs = require('fs-extra');
const yaml = require('yaml');
const reviewService = require('./review-service.js');

const SERVER_NAME = 'armchair-code-reviewer';
const SERVER_VERSION = '1.0.0';

class ArmchairMCPServer {
  constructor(configPath, outputPath, config) {
    this.configPath = configPath;
    this.outputPath = outputPath;
    this.config = config || {};

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
  }

  async loadConfig() {
    if (Object.keys(this.config).length > 0) {
      console.log(`[MCP] Using provided config`);
      return;
    }
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = yaml.parse(configData);
      console.log(`[MCP] Loaded config from: ${this.configPath}`);
    } catch (error) {
      console.error(`[MCP] Error loading config file: ${error.message}`);
      throw error;
    }
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
    const repositories = this.config.source?.repositories || [];
    let repo = repositories.find(r => path.resolve(r.path) === repoPath);

    // If not found by exact match, try to find by checking if the repo path is a parent or child
    if (!repo) {
      repo = repositories.find(r => {
        const configPath = path.resolve(r.path);
        return repoPath.startsWith(configPath) || configPath.startsWith(repoPath);
      });
    }

    if (!repo) {
      throw new Error(`Repository not found in config for path: ${repoPath}. Please add it to ${this.configPath}`);
    }

    const repoName = repo.name;

    try {
      // Perform the code review
      const result = await reviewService.performCodeReview({
        repoPath,
        repoName,
        description,
        outputPath: this.outputPath,
        sourceConfigPath: this.configPath
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
  }

  async connectTransport(transport) {
    await this.server.connect(transport);
    console.log('[MCP] Transport connected');
  }

  getExpressHandler() {
    return async (req, res) => {
      // Handle SSE endpoint
      if (req.path === '/sse') {
        const transport = new SSEServerTransport('/message', res);
        await this.connectTransport(transport);
        return;
      }

      // Handle message endpoint
      if (req.path === '/message' && req.method === 'POST') {
        // The transport will handle the message
        return;
      }

      res.status(404).json({ error: 'Not found' });
    };
  }
}

module.exports = ArmchairMCPServer;
