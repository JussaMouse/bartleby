// src/tools/memory.ts
import { Tool } from './types.js';
import { MemoryTools } from './memory-tools.js';

/**
 * Memory management tools for agent-controlled learning
 *
 * These tools allow the LLM to manage its own memory, creating a self-improving
 * agent that learns from interactions and maintains context over time.
 */

export const storeObservation: Tool = {
  name: 'storeObservation',
  description: 'Store a fact or observation about an entity in memory',

  routing: {
    patterns: [
      /^(remember|store|save|note) (that|the fact that)\s+(.+)/i,
      /^make a note (that|of)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['remember', 'store', 'save', 'note', 'record'],
      nouns: ['fact', 'observation', 'memory'],
    },
    examples: [
      'remember that user prefers dark mode',
      'store the fact that project deadline is March 15',
      'note that user is working from home today',
    ],
    priority: 70,
  },

  parseArgs: (input) => {
    // Extract key-value pairs from natural language
    // This is a simple parser - can be enhanced
    const match = input.match(/remember that\s+(.+?)\s+(is|are|has|have|prefers?)\s+(.+)/i);
    if (match) {
      return {
        entityId: 'user', // Default to user entity
        key: match[1].trim(),
        value: match[3].trim(),
      };
    }
    return { raw: input };
  },

  execute: async (args, context) => {
    const memoryTools = new MemoryTools(context.services.learning);

    const { entityId = 'user', key, value, confidence, expiresIn, supersedes } = args as any;

    if (!key || !value) {
      return 'Please specify what to remember. Example: remember that user prefers dark mode';
    }

    const result = memoryTools.storeObservation({
      entityId,
      key,
      value,
      confidence,
      expiresIn,
      supersedes,
    });

    if (result.success) {
      return `✓ Remembered: ${key} = ${value}`;
    } else {
      return '✗ Failed to store observation';
    }
  },
};

export const retrieveContext: Tool = {
  name: 'retrieveContext',
  description: 'Retrieve observations and context about an entity from memory',

  routing: {
    patterns: [
      /^(what do you know about|tell me about|recall|retrieve)\s+(.+)/i,
      /^(show|list|get) (my|the)\s+(.+)\s+(memory|memories|facts|observations)/i,
    ],
    keywords: {
      verbs: ['recall', 'retrieve', 'remember', 'know'],
      nouns: ['context', 'memory', 'facts', 'observations'],
    },
    examples: [
      'what do you know about user',
      'retrieve context about project-123',
      'show my preferences',
    ],
    priority: 65,
  },

  parseArgs: (input) => {
    const match = input.match(/(?:about|for)\s+(.+)/i);
    return {
      entityId: match ? match[1].trim() : 'user',
    };
  },

  execute: async (args, context) => {
    const memoryTools = new MemoryTools(context.services.learning);

    const { entityId = 'user', keys, since, limit } = args as any;

    const result = memoryTools.retrieveContext({
      entityId,
      keys,
      since,
      limit,
    });

    if (result.observations.length === 0 && result.relationships.length === 0) {
      return `No observations or relationships found for ${entityId}`;
    }

    const lines: string[] = [`**Context for ${entityId}:**\n`];

    if (result.observations.length > 0) {
      lines.push('**Observations:**');
      for (const obs of result.observations.slice(0, 10)) {
        lines.push(`- ${obs.key}: ${obs.value} (confidence: ${(obs.confidence * 100).toFixed(0)}%)`);
      }
      if (result.observations.length > 10) {
        lines.push(`  ... and ${result.observations.length - 10} more`);
      }
      lines.push('');
    }

    if (result.relationships.length > 0) {
      lines.push('**Relationships:**');
      for (const rel of result.relationships.slice(0, 10)) {
        const strength = rel.strength ? ` (${(rel.strength * 100).toFixed(0)}%)` : '';
        lines.push(`- ${rel.type} → ${rel.target}${strength}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  },
};

export const updateObservation: Tool = {
  name: 'updateObservation',
  description: 'Update an existing observation with new information',

  routing: {
    patterns: [
      /^update (the )?observation\s+(.+)\s+to\s+(.+)/i,
      /^change (the )?fact (that|about)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['update', 'change', 'correct', 'modify'],
      nouns: ['observation', 'fact', 'memory'],
    },
    examples: [
      'update observation obs-123 to new value',
      'correct the fact about user preference',
    ],
    priority: 60,
  },

  parseArgs: (input) => {
    // Simple parser - can be enhanced
    return { raw: input };
  },

  execute: async (args, context) => {
    const memoryTools = new MemoryTools(context.services.learning);

    const { observationId, newValue, reason } = args as any;

    if (!observationId || !newValue) {
      return 'Please specify the observation ID and new value';
    }

    const result = memoryTools.updateObservation({
      observationId,
      newValue,
      reason,
    });

    if (result.success) {
      return `✓ Updated observation ${observationId}`;
    } else {
      return `✗ Failed to update observation (not found: ${observationId})`;
    }
  },
};

export const forgetObservation: Tool = {
  name: 'forgetObservation',
  description: 'Mark an observation as no longer relevant',

  routing: {
    patterns: [
      /^forget (the )?observation\s+(.+)/i,
      /^remove (the )?fact (that|about)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['forget', 'remove', 'delete', 'clear'],
      nouns: ['observation', 'fact', 'memory'],
    },
    examples: [
      'forget observation obs-123',
      'remove the fact about old preference',
    ],
    priority: 60,
  },

  parseArgs: (input) => {
    return { raw: input };
  },

  execute: async (args, context) => {
    const memoryTools = new MemoryTools(context.services.learning);

    const { observationId, reason } = args as any;

    if (!observationId) {
      return 'Please specify the observation ID to forget';
    }

    const result = memoryTools.forgetObservation({
      observationId,
      reason,
    });

    if (result.success) {
      return `✓ Marked observation ${observationId} as forgotten`;
    } else {
      return `✗ Failed to forget observation (not found: ${observationId})`;
    }
  },
};

// Export all memory tools
export const memoryTools: Tool[] = [
  storeObservation,
  retrieveContext,
  updateObservation,
  forgetObservation,
];
