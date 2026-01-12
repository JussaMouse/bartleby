// src/agent/index.ts
import OpenAI from 'openai';
import { ServiceContainer } from '../services/index.js';
import { allTools, getToolByName, getToolDescriptions } from '../tools/index.js';
import { Tool, ToolContext } from '../tools/types.js';
import { buildSimplePrompt, buildComplexPrompt } from './prompts.js';
import { debug, warn, info, error } from '../utils/logger.js';

export class Agent {
  private services: ServiceContainer;
  private toolSchemas: OpenAI.ChatCompletionTool[];

  constructor(services: ServiceContainer) {
    this.services = services;
    this.toolSchemas = this.buildToolSchemas();
  }

  /**
   * Handle a simple request using Fast model with single tool call
   */
  async handleSimple(input: string): Promise<string> {
    const profile = this.services.memory.getProfileSummary();
    const lastSession = this.services.memory.getLastSession();
    const contextStr = lastSession ? `Last conversation: ${lastSession.summary}` : undefined;

    const tools = getToolDescriptions();
    const systemPrompt = buildSimplePrompt(tools, profile, contextStr);

    try {
      const response = await this.services.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ], { tier: 'fast' });

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
          return tool.execute(args, context);
        } else {
          warn('Agent referenced unknown tool', { tool: toolName });
        }
      }

      // No tool call - return conversational response
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
    const profile = this.services.memory.getProfileSummary();
    const lastSession = this.services.memory.getLastSession();
    const contextStr = lastSession ? `Last conversation: ${lastSession.summary}` : undefined;

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
                result = await tool.execute(args, context);
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
          const finalResponse = response.content || "I've completed the task.";
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
          description: { type: 'string', description: 'Task description' },
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
            description: 'Task number or title' 
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
    };

    return schemas[tool.name] || { type: 'object', properties: {} };
  }
}
