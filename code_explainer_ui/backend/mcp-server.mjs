import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'yaml';
import { performCodeReview } from './review-service.js';

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
    // Store handlers as instance methods for direct access
    this.listToolsHandler = async () => ({
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
    });

    this.callToolHandler = async (request) => {
      const { name, arguments: args } = request;

      if (name === 'review_uncommitted_changes') {
        return await this.handleReviewUncommittedChanges(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    };

    // Register with MCP server
    this.server.setRequestHandler(ListToolsRequestSchema, this.listToolsHandler);
    this.server.setRequestHandler(CallToolRequestSchema, this.callToolHandler);
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
      const result = await performCodeReview({
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

  getExpressHandler() {
    return async (req, res) => {
      try {
        // Handle JSON-RPC over HTTP POST
        if (req.method === 'POST') {
          const request = req.body;

          console.log('[MCP] Received request:', JSON.stringify(request, null, 2));

          // Handle the request using the MCP server
          let response;

          if (request.method === 'initialize') {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: request.params?.protocolVersion || '2024-11-05',
                capabilities: {
                  tools: {}
                },
                serverInfo: {
                  name: SERVER_NAME,
                  version: SERVER_VERSION
                }
              }
            };
          } else if (request.method === 'tools/list') {
            const result = await this.listToolsHandler(request.params || {});
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result
            };
          } else if (request.method === 'tools/call') {
            const result = await this.callToolHandler(request.params);
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result
            };
          } else if (request.method === 'notifications/initialized') {
            // Acknowledge notification, no response needed
            res.status(200).send();
            return;
          } else {
            response = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: `Method not found: ${request.method}`
              }
            };
          }

          console.log('[MCP] Sending response:', JSON.stringify(response, null, 2));
          res.json(response);
        } else {
          res.status(405).json({ error: 'Method not allowed' });
        }
      } catch (error) {
        console.error('[MCP] Error handling request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id,
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        });
      }
    };
  }
}

export default ArmchairMCPServer;
