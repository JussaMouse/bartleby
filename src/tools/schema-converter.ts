/**
 * Convert Zod schemas to OpenAI-compatible JSON schemas
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type OpenAI from 'openai';
import { toolSchemas } from './schemas.js';

/**
 * Convert a Zod schema to OpenAI function parameters format
 */
export function zodToOpenAISchema(schema: z.ZodSchema): OpenAI.FunctionParameters {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none', // Don't use $ref, inline everything
  });

  // Remove the $schema property that zodToJsonSchema adds
  const { $schema, ...rest } = jsonSchema as any;

  return rest as OpenAI.FunctionParameters;
}

/**
 * Convert a tool name to OpenAI function definition
 */
export function toolToOpenAIFunction(
  toolName: string,
  description: string
): OpenAI.ChatCompletionTool {
  const schema = toolSchemas[toolName as keyof typeof toolSchemas];

  if (!schema) {
    throw new Error(`No schema found for tool: ${toolName}`);
  }

  return {
    type: 'function',
    function: {
      name: toolName,
      description,
      parameters: zodToOpenAISchema(schema),
    },
  };
}

/**
 * Generate OpenAI function definitions for multiple tools
 */
export function generateToolDefinitions(
  tools: Array<{ name: string; description: string }>
): OpenAI.ChatCompletionTool[] {
  return tools
    .filter(tool => toolSchemas[tool.name as keyof typeof toolSchemas])
    .map(tool => toolToOpenAIFunction(tool.name, tool.description));
}
