/**
 * Generate OpenAI-compatible tool definitions from Bartleby tools
 *
 * Converts Tool objects with Zod schemas into OpenAI ChatCompletionTool format,
 * enabling structured outputs and 100% reliable tool calls.
 */

import type OpenAI from 'openai';
import type { Tool } from './types.js';
import { zodToOpenAISchema } from './schema-converter.js';
import { validateToolParams } from './schemas.js';
import { warn } from '../utils/logger.js';

/**
 * Convert a Bartleby Tool to OpenAI ChatCompletionTool format
 */
export function toolToOpenAI(tool: Tool): OpenAI.ChatCompletionTool | null {
  // Tools without schemas fall back to legacy parameters format
  if (!tool.schema) {
    if (tool.parameters) {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as OpenAI.FunctionParameters,
        },
      };
    }
    // No schema and no parameters - skip this tool for LLM use
    return null;
  }

  // Convert Zod schema to OpenAI parameters
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToOpenAISchema(tool.schema),
    },
  };
}

/**
 * Generate OpenAI tool definitions from an array of Bartleby tools
 */
export function generateOpenAITools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  const openaiTools: OpenAI.ChatCompletionTool[] = [];

  for (const tool of tools) {
    const openaiTool = toolToOpenAI(tool);
    if (openaiTool) {
      openaiTools.push(openaiTool);
    } else {
      warn(`Tool ${tool.name} has no schema or parameters, skipping for LLM`);
    }
  }

  return openaiTools;
}

/**
 * Validate tool call parameters using schema if available
 *
 * Returns validated data or throws with clear error message
 */
export function validateToolCall<T = any>(
  tool: Tool,
  args: unknown
): { valid: true; data: T } | { valid: false; error: string } {
  // If tool has schema, validate with it
  if (tool.schema) {
    const result = validateToolParams<T>(tool.name, args);
    if (result.success) {
      return { valid: true, data: result.data };
    } else {
      return { valid: false, error: result.error };
    }
  }

  // No schema - trust the args (legacy behavior)
  return { valid: true, data: args as T };
}
