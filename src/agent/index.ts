// src/agent/index.ts
import OpenAI from 'openai';
import { ServiceContainer, ConversationTurn } from '../services/index.js';
import { allTools, getToolByName, getToolDescriptions } from '../tools/index.js';
import { Tool, ToolContext } from '../tools/types.js';
import { buildSimplePrompt, buildComplexPrompt } from './prompts.js';
import { debug, warn, info, error } from '../utils/logger.js';
import { cleanLLMOutput } from '../utils/llm.js';

export class Agent {
  private services: ServiceContainer;
  private toolSchemas: OpenAI.ChatCompletionTool[];
  private toolSchemaByName: Map<string, OpenAI.ChatCompletionTool>;
  private toolStats: Map<string, { attempts: number; successes: number; failures: number; lastUsedAt: number }>;
  private llmVerbose: boolean;

  constructor(services: ServiceContainer) {
    this.services = services;
    this.toolSchemas = this.buildToolSchemas();
    this.toolSchemaByName = new Map(this.toolSchemas.map(schema => [schema.function.name, schema]));
    this.toolStats = new Map(
      allTools.map(tool => [tool.name, { attempts: 0, successes: 0, failures: 0, lastUsedAt: 0 }])
    );
    this.llmVerbose = services.config.logging.llmVerbose;
  }

  /**
   * Build rich context from learning system for LLM prompts
   * Phase 5: Uses hot tier and relationship-aware search for efficiency
   */
  private async buildRichContext(input: string): Promise<{ profile: string; context: string; instructions: string }> {
    if (!this.services.learning) {
      throw new Error('Learning system not available');
    }

    try {
      // Use hot tier for profile (most accessed/relevant observations only)
      const userProfile = this.services.learning.getUserProfile('hot');
      const recentWork = this.services.learning.getRecentWorkContext(7);

      // Use relationship-aware search for richer context
      const relevantObs = this.services.learning.searchObservationsWithRelationships(input, 5);

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

      // Get recent commands
      const recentCommands = this.services.learning.getRecentCommands(10);
      if (recentCommands.length > 0) {
        contextParts.push(`\n**Recent Commands:**`);
        for (const cmd of recentCommands.slice(0, 5)) {
          const timeAgo = this.formatTimeAgo(new Date(cmd.timestamp));
          const status = cmd.success ? '✓' : '✗';
          contextParts.push(`- ${status} ${timeAgo}: ${cmd.rawInput}`);
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

          // Include relationship context if available
          if (obs.relatedContext && obs.relatedContext.length > 0) {
            for (const related of obs.relatedContext.slice(0, 2)) {
              contextParts.push(`  └─ ${related}`);
            }
          }
        }
      }

      const profile = profileParts.length > 0 ? profileParts.join('\n') : 'No profile yet';
      const context = contextParts.length > 0 ? contextParts.join('\n') : 'First interaction';

      // Fetch standing instructions — always loaded, not hot-tier filtered
      const allInstructions = this.services.learning.getObservations('user', { keyPrefix: 'instruction.' });
      const supersededIds = new Set(allInstructions.map(o => o.supersedes).filter(Boolean) as string[]);
      const activeInstructions = allInstructions
        .filter(o => !supersededIds.has(o.id) && o.confidence > 0)
        .sort((a, b) => a.key.localeCompare(b.key));
      const instructions = activeInstructions.length > 0
        ? activeInstructions.map(o => `- ${o.value}`).join('\n')
        : '';

      return { profile, context, instructions };
    } catch (err) {
      warn('Failed to build rich context from learning system', { error: String(err) });
      // Return minimal context on error
      return {
        profile: 'No profile yet',
        context: 'First interaction',
        instructions: '',
      };
    }
  }

  /**
   * Trigger reflection on conversation turn (async, non-blocking)
   */
  private triggerReflection(input: string, response: string, success: boolean): void {
    const turn: ConversationTurn = {
      userInput: input,
      agentResponse: response,
      timestamp: new Date(),
      success,
    };

    // Run reflection asynchronously - don't await to avoid blocking
    this.services.reflection.reflect(turn).catch(err => {
      debug('Background reflection failed', { error: String(err) });
    });
  }

  /**
   * Handle a simple request using Fast model with single tool call
   */
  async handleSimple(input: string): Promise<string> {
    const { profile, context: contextStr, instructions } = await this.buildRichContext(input);

    const tools = getToolDescriptions();
    const systemPrompt = buildSimplePrompt(tools, profile, contextStr, instructions);

    let finalResponse: string;
    let success = true;

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
          finalResponse = result ?? '';
        } else {
          warn('Agent referenced unknown tool', { tool: toolName });
          success = false;
          finalResponse = response
            .replace(/TOOL:.*$/gim, '')
            .replace(/ARGS:.*$/gim, '')
            .trim();
        }
      } else {
        // No tool call - return conversational response (already cleaned)
        finalResponse = response
          .replace(/TOOL:.*$/gim, '')
          .replace(/ARGS:.*$/gim, '')
          .trim() || "I'm not sure how to help with that. Try 'help' for commands.";
      }

    } catch (err) {
      warn('Simple LLM call failed', { error: String(err) });
      success = false;
      finalResponse = "I'm having trouble connecting. Try a simpler command or 'help'.";
    }

    // Trigger background reflection (non-blocking)
    this.triggerReflection(input, finalResponse, success);

    return finalResponse;
  }

  /**
   * Handle a simple request with streaming output
   *
   * Yields chunks as they arrive for real-time display.
   * The final yielded value is the complete response.
   */
  async *handleSimpleStream(input: string): AsyncGenerator<string> {
    const { profile, context: contextStr, instructions } = await this.buildRichContext(input);

    const tools = getToolDescriptions();
    const systemPrompt = buildSimplePrompt(tools, profile, contextStr, instructions);

    let finalResponse = '';
    let success = true;

    try {
      const stream = this.services.llm.chatStream([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ], { tier: 'fast' });

      let rawResponse = '';

      // Collect and yield chunks as they arrive
      for await (const chunk of stream) {
        rawResponse += chunk;
        yield chunk;
      }

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
          debug('Simple agent tool call (streaming)', { tool: toolName, args });
          const result = await tool.execute(args, context);
          finalResponse = result ?? '';
        } else {
          warn('Agent referenced unknown tool', { tool: toolName });
          success = false;
          finalResponse = response
            .replace(/TOOL:.*$/gim, '')
            .replace(/ARGS:.*$/gim, '')
            .trim();
        }
      } else {
        // No tool call - use the streamed response
        finalResponse = response
          .replace(/TOOL:.*$/gim, '')
          .replace(/ARGS:.*$/gim, '')
          .trim() || "I'm not sure how to help with that. Try 'help' for commands.";
      }

    } catch (err) {
      warn('Simple LLM streaming call failed', { error: String(err) });
      success = false;
      finalResponse = "I'm having trouble connecting. Try a simpler command or 'help'.";
    }

    // Trigger background reflection (non-blocking)
    this.triggerReflection(input, finalResponse, success);

    // Note: finalResponse is set but streaming already happened
    // For conversational responses, the streamed content is the response
    // For tool calls, the tool result is in finalResponse but wasn't streamed
  }

  /**
   * Handle a complex request using Thinking model with agentic loop
   * Uses OpenAI function calling for structured tool invocation
   */
  async handleComplex(input: string): Promise<string> {
    const { profile, context: contextStr, instructions } = await this.buildRichContext(input);

    const systemPrompt = buildComplexPrompt(profile, contextStr, instructions);
    const maxIterations = this.services.llm.getMaxIterations();

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ];

    let activeTools = this.selectInitialToolShortlist(input, 10);
    let fallbackExpansions = 0;
    const maxFallbackExpansions = 2;
    let lastToolCallSignature: string | null = null;
    let consecutiveDuplicateToolCalls = 0;
    let duplicateCircuitTrips = 0;
    const maxConsecutiveDuplicateToolCalls = 2;
    const maxDuplicateCircuitTrips = 2;

    info('Starting agentic loop', {
      input: input.slice(0, 50),
      maxIterations,
      activeToolCount: activeTools.length,
      totalToolCount: this.toolSchemas.length,
    });

    let finalResponse: string;
    let success = true;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        debug('Agentic loop iteration', { iteration: iteration + 1, activeToolCount: activeTools.length });

        const response = await this.services.llm.chatWithTools(
          messages,
          activeTools,
          'thinking'
        );

        if (response.tool_calls && response.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.tool_calls,
          });

          const toolCallSignature = this.buildToolCallSignature(response.tool_calls);
          if (toolCallSignature === lastToolCallSignature) {
            consecutiveDuplicateToolCalls++;
            warn('Detected repeated identical tool-call batch', {
              iteration: iteration + 1,
              consecutiveDuplicateToolCalls,
            });
          } else {
            lastToolCallSignature = toolCallSignature;
            consecutiveDuplicateToolCalls = 0;
          }

          if (consecutiveDuplicateToolCalls >= maxConsecutiveDuplicateToolCalls) {
            duplicateCircuitTrips++;
            consecutiveDuplicateToolCalls = 0;

            const breakerMessage = duplicateCircuitTrips >= maxDuplicateCircuitTrips
              ? 'Circuit breaker: repeated identical tool calls were detected multiple times. Stop calling tools and provide the best possible final answer from available context.'
              : 'Circuit breaker: repeated identical tool calls were detected. Do not repeat the same call. Use a different tool or provide a final answer.';

            warn('Tool-call duplicate circuit breaker tripped', {
              duplicateCircuitTrips,
              iteration: iteration + 1,
            });

            for (const toolCall of response.tool_calls) {
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: breakerMessage,
              });
            }

            if (duplicateCircuitTrips >= maxDuplicateCircuitTrips) {
              success = false;
              finalResponse = "I got stuck repeating the same tool calls and stopped to avoid an infinite loop. Please rephrase the request or split it into smaller steps.";
              this.triggerReflection(input, finalResponse, success);
              return finalResponse;
            }

            continue;
          }

          let failedToolForExpansion: string | undefined;

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
                this.recordToolOutcome(toolName, true);
              } catch (err) {
                error('Tool execution failed', { tool: toolName, error: String(err) });
                this.recordToolOutcome(toolName, false);
                failedToolForExpansion = failedToolForExpansion ?? toolName;
                result = `Error executing ${toolName}: ${err}`;
              }
            } else {
              result = `Unknown tool: ${toolName}`;
              warn('Agentic loop referenced unknown tool', { tool: toolName });
              this.recordToolOutcome(toolName, false);
              failedToolForExpansion = failedToolForExpansion ?? toolName;
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }

          if (failedToolForExpansion && fallbackExpansions < maxFallbackExpansions) {
            const expanded = this.expandToolShortlist(activeTools, input, failedToolForExpansion, 6);
            if (expanded.length > activeTools.length) {
              activeTools = expanded;
              fallbackExpansions++;
              info('Expanded tool shortlist after tool failure', {
                triggerTool: failedToolForExpansion,
                activeToolCount: activeTools.length,
                fallbackExpansions,
              });
            }
          }
        } else {
          const responseContent = response.content || '';

          if (fallbackExpansions < maxFallbackExpansions && this.shouldExpandToolShortlist(responseContent, iteration)) {
            const expanded = this.expandToolShortlist(activeTools, input, undefined, 6);
            if (expanded.length > activeTools.length) {
              activeTools = expanded;
              fallbackExpansions++;
              info('Expanded tool shortlist on uncertain no-tool response', {
                activeToolCount: activeTools.length,
                fallbackExpansions,
                iteration: iteration + 1,
              });
              continue;
            }
          }

          finalResponse = cleanLLMOutput(responseContent || "I've completed the task.", this.llmVerbose);
          info('Agentic loop complete', { iterations: iteration + 1 });

          this.triggerReflection(input, finalResponse, success);
          return finalResponse;
        }
      }

      warn('Agentic loop hit max iterations', { maxIterations });
      success = false;
      finalResponse = "I wasn't able to complete that task within the allowed steps. Please try breaking it down into smaller requests.";

    } catch (err) {
      error('Agentic loop failed', { error: String(err) });
      success = false;
      finalResponse = "I encountered an error while working on your request. Please try again or simplify the request.";
    }

    this.triggerReflection(input, finalResponse, success);
    return finalResponse;
  }

  /**
   * Select a compact, reliability-aware shortlist of tools for a complex request.
   */
  private selectInitialToolShortlist(input: string, limit: number): OpenAI.ChatCompletionTool[] {
    if (this.toolSchemas.length <= limit) {
      return this.toolSchemas;
    }

    const inputTokens = this.tokenize(input);
    const inputLower = input.toLowerCase();

    const ranked = allTools
      .map(tool => {
        const reliability = this.getReliabilityScore(tool.name);
        const priority = (tool.routing?.priority ?? 0) / 100;

        let lexicalScore = 0;
        const nouns = tool.routing?.keywords?.nouns ?? [];
        const verbs = tool.routing?.keywords?.verbs ?? [];

        for (const noun of nouns) {
          if (inputLower.includes(noun.toLowerCase())) lexicalScore += 1.2;
          for (const token of this.tokenize(noun)) {
            if (inputTokens.has(token)) lexicalScore += 0.5;
          }
        }

        for (const verb of verbs) {
          if (inputLower.includes(verb.toLowerCase())) lexicalScore += 0.8;
          for (const token of this.tokenize(verb)) {
            if (inputTokens.has(token)) lexicalScore += 0.35;
          }
        }

        const score = lexicalScore * 1.7 + reliability + priority * 0.4;
        return { name: tool.name, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const selected: OpenAI.ChatCompletionTool[] = [];
    for (const item of ranked) {
      const schema = this.toolSchemaByName.get(item.name);
      if (schema) selected.push(schema);
    }

    if (selected.length === 0) {
      return this.toolSchemas.slice(0, limit);
    }

    debug('Selected reliability-aware tool shortlist', {
      shortlistSize: selected.length,
      totalTools: this.toolSchemas.length,
      tools: selected.map(t => t.function.name),
    });

    return selected;
  }

  private shouldExpandToolShortlist(responseContent: string, iteration: number): boolean {
    const content = responseContent.trim();
    if (iteration === 0 && content.length < 80) {
      return true;
    }

    const uncertaintyPattern = /\b(cannot|can't|unable|unsure|not sure|don't have|do not have|need more|insufficient)\b/i;
    return uncertaintyPattern.test(content);
  }

  private expandToolShortlist(
    activeTools: OpenAI.ChatCompletionTool[],
    input: string,
    triggerToolName?: string,
    addCount: number = 6
  ): OpenAI.ChatCompletionTool[] {
    const activeNames = new Set(activeTools.map(tool => tool.function.name));
    const inputTokens = this.tokenize(input);

    const triggerTool = triggerToolName ? getToolByName(triggerToolName) : undefined;
    const focusTokens = new Set<string>(inputTokens);
    if (triggerTool) {
      for (const token of this.getToolCapabilityTokens(triggerTool)) {
        focusTokens.add(token);
      }
    }

    const candidates = allTools
      .filter(tool => !activeNames.has(tool.name))
      .map(tool => {
        const capabilityTokens = this.getToolCapabilityTokens(tool);
        const overlap = this.countTokenOverlap(focusTokens, capabilityTokens);

        let lexical = 0;
        for (const token of capabilityTokens) {
          if (inputTokens.has(token)) lexical += 0.6;
        }

        const reliability = this.getReliabilityScore(tool.name);
        const priority = (tool.routing?.priority ?? 0) / 100;
        const score = overlap * 1.4 + lexical + reliability * 0.8 + priority * 0.3;

        return { name: tool.name, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, addCount);

    if (candidates.length === 0) {
      return activeTools;
    }

    const expanded = [...activeTools];
    for (const candidate of candidates) {
      const schema = this.toolSchemaByName.get(candidate.name);
      if (schema) expanded.push(schema);
    }

    debug('Capability-cluster fallback expansion', {
      triggerToolName,
      before: activeTools.length,
      after: expanded.length,
      addedTools: candidates.map(candidate => candidate.name),
    });

    return expanded;
  }

  private getToolCapabilityTokens(tool: Tool): Set<string> {
    const tokens = new Set<string>(this.tokenize(tool.name));
    const nouns = tool.routing?.keywords?.nouns ?? [];
    const verbs = tool.routing?.keywords?.verbs ?? [];

    for (const noun of nouns) {
      for (const token of this.tokenize(noun)) tokens.add(token);
    }

    for (const verb of verbs) {
      for (const token of this.tokenize(verb)) tokens.add(token);
    }

    return tokens;
  }

  private countTokenOverlap(left: Set<string>, right: Set<string>): number {
    let overlap = 0;
    for (const token of right) {
      if (left.has(token)) overlap += 1;
    }
    return overlap;
  }

  private buildToolCallSignature(
    toolCalls: NonNullable<OpenAI.ChatCompletionMessage['tool_calls']>
  ): string {
    return toolCalls
      .map(toolCall => {
        const normalizedArgs = this.normalizeToolArguments(toolCall.function.arguments || '{}');
        return `${toolCall.function.name}:${normalizedArgs}`;
      })
      .join('|');
  }

  private normalizeToolArguments(rawArgs: string): string {
    try {
      const parsed = JSON.parse(rawArgs);
      const normalized = this.sortObjectKeys(parsed);
      return JSON.stringify(normalized);
    } catch {
      return rawArgs.replace(/\s+/g, ' ').trim();
    }
  }

  private sortObjectKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(item => this.sortObjectKeys(item));
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, this.sortObjectKeys(entryValue)]);
      return Object.fromEntries(entries);
    }

    return value;
  }

  private recordToolOutcome(toolName: string, success: boolean): void {
    const current = this.toolStats.get(toolName) ?? {
      attempts: 0,
      successes: 0,
      failures: 0,
      lastUsedAt: 0,
    };

    current.attempts += 1;
    if (success) {
      current.successes += 1;
    } else {
      current.failures += 1;
    }
    current.lastUsedAt = Date.now();
    this.toolStats.set(toolName, current);
  }

  private getReliabilityScore(toolName: string): number {
    const stats = this.toolStats.get(toolName);
    if (!stats || stats.attempts === 0) {
      return 0.65;
    }

    return (stats.successes + 1) / (stats.attempts + 2);
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length >= 3)
    );
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
   * Format time ago for display
   */
  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
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
