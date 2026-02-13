/**
 * Prompt Handler
 *
 * Handles pending prompts for projects/contacts content.
 * Uses Layer 0 routing (contextual) to bypass all other routing.
 *
 * When a project or contact is created, a pending prompt is set in the FactsService.
 * The next user input is captured by this handler and used as the content/description.
 */

import type { Tool, ToolContext } from './types.js';
import { debug } from '../utils/logger.js';

export const promptHandler: Tool = {
  name: 'promptHandler',
  description: 'Internal: Handle pending content prompts',

  // Layer 0: Check for pending prompts BEFORE routing
  shouldHandle: async (input: string, context: ToolContext): Promise<boolean> => {
    const pendingPrompt = context.services.context.getFact('system', 'pending_prompt');
    return !!pendingPrompt;
  },

  execute: async (args, context) => {
    const { __raw_input: input } = args as { __raw_input: string };

    // Get pending prompt data
    const pendingData = context.services.context.getFact('system', 'pending_prompt');
    if (!pendingData) {
      return 'No pending prompt.';
    }

    const { recordId, recordType, recordTitle } = pendingData as {
      recordId: string;
      recordType: 'project' | 'contact' | 'page' | 'event';
      recordTitle: string;
    };

    // Allow skipping with empty input
    if (!input.trim()) {
      context.services.context.setFact('system', 'pending_prompt', false, { source: 'explicit' });
      return `✓ Skipped description for "${recordTitle}"`;
    }

    // Update record with content
    const updated = context.services.garden.update(recordId, {
      content: input.trim(),
    });

    // Clear pending prompt
    context.services.context.setFact('system', 'pending_prompt', false, { source: 'explicit' });

    if (!updated) {
      return `Failed to update ${recordType}: ${recordTitle}`;
    }

    const preview = input.trim().substring(0, 80);
    const ellipsis = input.trim().length > 80 ? '...' : '';

    return `✓ Added description to "${recordTitle}":\n  ${preview}${ellipsis}`;
  },
};
