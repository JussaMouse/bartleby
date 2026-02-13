// src/agent/index.ts
import OpenAI from 'openai';
import { ServiceContainer } from '../services/index.js';
import { allTools, getToolByName, getToolDescriptions } from '../tools/index.js';
import { Tool, ToolContext } from '../tools/types.js';
import { buildSimplePrompt, buildComplexPrompt } from './prompts.js';
import { debug, warn, info, error } from '../utils/logger.js';
import { cleanLLMOutput } from '../utils/llm.js';
import { loadConfig } from '../config.js';

export class Agent {
  private services: ServiceContainer;
  private toolSchemas: OpenAI.ChatCompletionTool[];
  private llmVerbose: boolean;

  constructor(services: ServiceContainer) {
    this.services = services;
    this.toolSchemas = this.buildToolSchemas();
    const config = loadConfig();
    this.llmVerbose = config.logging.llmVerbose;
  }

  /**
   * Build rich context from learning system for LLM prompts
   */
  private async buildRichContext(input: string): Promise<{ profile: string; context: string }> {
    if (!this.services.learning) {
      throw new Error('Learning system not available');
    }

    try {
      const userProfile = this.services.learning.getUserProfile();
      const recentWork = this.services.learning.getRecentWorkContext(7);
      const relevantObs = this.services.learning.searchObservations(input, 5);

      // Build profile section
      const profileParts: string[] = [];

      if (Object.keys(userProfile.preferences).length > 0) {
        profileParts.push('**Preferences:**');
        for (const [key, value] of Object.entries(userProfile.preferences)) {
          profileParts.push(`- ${key}: ${value}`);
        }
      }

      if (Object.keys(userProfile.patterns).length > 0) {
        profileParts.push('\n**Patterns:**');
        for (const [key, value] of Object.entries(userProfile.patterns)) {
          profileParts.push(`- ${key}: ${JSON.stringify(value)}`);
        }
      }

      if (userProfile.goals.length > 0) {
        profileParts.push(`\n**Current Goal:** ${userProfile.goals[0]}`);
      }

      // Build context section
      const contextParts: string[] = [];

      if (recentWork.records.length > 0) {
        contextParts.push(`**Recent Work (last 7 days):**`);
        contextParts.push(`- ${recentWork.records.length} records worked on`);
        if (recentWork.topics.length > 0) {
          contextParts.push(`- Topics: ${recentWork.topics.slice(0, 5).join(', ')}`);
        }
        if (recentWork.projects.length > 0) {
          contextParts.push(`- Projects: ${recentWork.projects.slice(0, 3).join(', ')}`);
        }
      }

      // Get last session summary
      const lastSession = this.services.context.getLastSession();
      if (lastSession) {
        contextParts.push(`\n**Last Conversation:** ${lastSession.summary}`);
      }

      if (relevantObs.length > 0) {
        contextParts.push(`\n**Relevant Context:**`);
        for (const obs of relevantObs) {
          contextParts.push(`- ${obs.key}: ${obs.value.slice(0, 60)}`);
        }
      }

      const profile = profileParts.length > 0 ? profileParts.join('\n') : 'No profile yet';
      const context = contextParts.length > 0 ? contextParts.join('\n') : 'First interaction';

      return { profile, context };
    } catch (err) {
      warn('Failed to build rich context from learning system', { error: String(err) });
      // Return minimal context on error
      return {
        profile: 'No profile yet',
        context: 'First interaction'
      };
    }
  }

  /**
   * Handle a simple request using Fast model with single tool call
   */
  async handleSimple(input: string): Promise<string> {
    const { profile, context: contextStr } = await this.buildRichContext(input);

    const tools = getToolDescriptions();
    const systemPrompt = buildSimplePrompt(tools, profile, contextStr);

    try {
      const rawResponse = await this.services.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ], { tier: 'fast' });

      // Clean thinking tags and special tokens
      const response = cleanLLMOutput(rawResponse, this.llmVerbose);

      // Parse for tool call (text-based format for simple model)
      const toolMatch = response.match(/TOOL:\s*(\w+)/i);
      const argsMatch = response.match(/ARGS:\s*(\{.*?\})/is);

      if (toolMatch) {
        const toolName = toolMatch[1];
        const tool = getToolByName(toolName);

        if (tool) {
          let args: Record<string, unknown> = {};
          if (argsMatch) {
            try {
              args = JSON.parse(argsMatch[1]);
            } catch {
              debug('Failed to parse tool args', { raw: argsMatch[1] });
            }
          }

          const context: ToolContext = { input, services: this.services };
          debug('Simple agent tool call', { tool: toolName, args });
          const result = await tool.execute(args, context);
          return result ?? '';
        } else {
          warn('Agent referenced unknown tool', { tool: toolName });
        }
      }

      // No tool call - return conversational response (already cleaned)
      return response
        .replace(/TOOL:.*$/gim, '')
        .replace(/ARGS:.*$/gim, '')
        .trim() || "I'm not sure how to help with that. Try 'help' for commands.";

    } catch (err) {
      warn('Simple LLM call failed', { error: String(err) });
      return "I'm having trouble connecting. Try a simpler command or 'help'.";
    }
  }

  /**
   * Handle a complex request using Thinking model with agentic loop
   * Uses OpenAI function calling for structured tool invocation
   */
  async handleComplex(input: string): Promise<string> {
    const { profile, context: contextStr } = await this.buildRichContext(input);

    const systemPrompt = buildComplexPrompt(profile, contextStr);
    const maxIterations = this.services.llm.getMaxIterations();

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ];

    info('Starting agentic loop', { input: input.slice(0, 50), maxIterations });

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        debug('Agentic loop iteration', { iteration: iteration + 1 });

        // Call Thinking model with function calling
        const response = await this.services.llm.chatWithTools(
          messages,
          this.toolSchemas,
          'thinking'
        );

        // Check if model wants to call tools
        if (response.tool_calls && response.tool_calls.length > 0) {
          // Add assistant message with tool calls
          messages.push({
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.tool_calls,
          });

          // Execute each tool call
          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            const tool = getToolByName(toolName);

            let result: string;
            if (tool) {
              try {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                const context: ToolContext = { input, services: this.services };
                
                debug('Agentic tool call', { tool: toolName, args, iteration });
                result = await tool.execute(args, context) ?? '';
              } catch (err) {
                error('Tool execution failed', { tool: toolName, error: String(err) });
                result = `Error executing ${toolName}: ${err}`;
              }
            } else {
              result = `Unknown tool: ${toolName}`;
              warn('Agentic loop referenced unknown tool', { tool: toolName });
            }

            // Add tool result to messages
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        } else {
          // No tool calls - model is done, return final response
          const finalResponse = cleanLLMOutput(response.content || "I've completed the task.", this.llmVerbose);
          info('Agentic loop complete', { iterations: iteration + 1 });
          return finalResponse;
        }
      }

      // Max iterations reached
      warn('Agentic loop hit max iterations', { maxIterations });
      return "I wasn't able to complete that task within the allowed steps. Please try breaking it down into smaller requests.";

    } catch (err) {
      error('Agentic loop failed', { error: String(err) });
      return "I encountered an error while working on your request. Please try again or simplify the request.";
    }
  }

  /**
   * Build OpenAI function calling schemas from tools
   */
  private buildToolSchemas(): OpenAI.ChatCompletionTool[] {
    return allTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.inferParameters(tool),
      },
    }));
  }

  /**
   * Infer JSON schema parameters from tool's parseArgs function
   * This is a simplified version - in production you'd want explicit schemas
   */
  private inferParameters(tool: Tool): Record<string, unknown> {
    // Map known tools to their parameter schemas
    const schemas: Record<string, Record<string, unknown>> = {
      addTask: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Action description' },
          context: { type: 'string', description: 'GTD context (e.g., @home, @errands)' },
          project: { type: 'string', description: 'Project name' },
        },
        required: ['description'],
      },
      markDone: {
        type: 'object',
        properties: {
          identifier: { 
            oneOf: [{ type: 'string' }, { type: 'number' }],
            description: 'Action number or title' 
          },
        },
        required: ['identifier'],
      },
      capture: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to capture to inbox' },
        },
        required: ['text'],
      },
      findContact: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Name or email to search' },
        },
        required: ['query'],
      },
      addContact: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Contact name' },
          email: { type: 'string', description: 'Email address' },
          phone: { type: 'string', description: 'Phone number' },
        },
        required: ['name'],
      },
      addEvent: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title' },
          start_time: { type: 'string', description: 'Start time (ISO 8601)' },
          end_time: { type: 'string', description: 'End time (ISO 8601)' },
        },
        required: ['title', 'start_time', 'end_time'],
      },
      recallConversation: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Topic to search for in past conversations' },
        },
        required: ['topic'],
      },
      ingestDocument: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to the document file' },
        },
        required: ['filepath'],
      },
      askShed: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Question to ask about ingested documents' },
        },
        required: ['question'],
      },
      scheduleReminder: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Reminder message' },
          when: { type: 'string', description: 'When to remind (ISO 8601 datetime)' },
        },
        required: ['message', 'when'],
      },
      listFiles: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path to list (supports ~ expansion)' },
        },
        required: ['path'],
      },
      ingestCsv: {
        type: 'object',
        properties: {
          filepath: { type: 'string', description: 'Path to CSV/TSV file' },
          tableName: { type: 'string', description: 'SQLite table name to create' },
          replace: { type: 'boolean', description: 'Drop existing table first' },
          append: { type: 'boolean', description: 'Append to existing table' },
          noHeader: { type: 'boolean', description: 'File has no header row' },
          skipLines: { type: 'number', description: 'Skip N lines at start (for preambles)' },
        },
        required: ['filepath', 'tableName'],
      },
      sqlQuery: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SQL query to execute on data database' },
        },
        required: ['sql'],
      },
      listTables: {
        type: 'object',
        properties: {},
      },
      describeTable: {
        type: 'object',
        properties: {
          tableName: { type: 'string', description: 'Table name to describe' },
        },
        required: ['tableName'],
      },
    };

    return schemas[tool.name] || { type: 'object', properties: {} };
  }
}
