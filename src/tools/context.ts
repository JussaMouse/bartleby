// src/tools/context.ts
import { Tool } from './types.js';

export const recallConversation: Tool = {
  name: 'recallConversation',
  description: 'Search past conversations',

  routing: {
    patterns: [
      /^what did we (talk|discuss|say) about\s+(.+)/i,
      /^remind me (what|about)\s+(.+)/i,
      /^when did (i|we) (mention|discuss)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['recall', 'remember', 'remind', 'talked'],
      nouns: ['conversation', 'discussion', 'about'],
    },
    examples: ['what did we talk about last week', 'remind me about the website discussion'],
    priority: 75,
  },

  parseArgs: (input) => {
    const topic = input
      .replace(/^(what did we (talk|discuss|say) about|remind me (what|about)|when did (i|we) (mention|discuss))\s*/i, '')
      .trim();
    return { topic };
  },

  execute: async (args, context) => {
    const { topic } = args as { topic: string };

    if (!topic) {
      return 'Please specify what to recall. Example: what did we talk about the website';
    }

    const episodes = context.services.context.recallRelevant(topic, 5);

    if (episodes.length === 0) {
      return "I don't have any conversations about that in my memory.";
    }

    const lines = [`Found ${episodes.length} related conversation(s):\n`];
    for (const ep of episodes) {
      const date = new Date(ep.timestamp);
      const ago = formatTimeAgo(date);
      lines.push(`**${ago}**: ${ep.summary}`);
      if (ep.topics.length) lines.push(`  Topics: ${ep.topics.join(', ')}`);
      lines.push('');
    }

    return lines.join('\n');
  },
};

export const setPreference: Tool = {
  name: 'setPreference',
  description: 'Set a user preference',

  routing: {
    patterns: [
      /^(remember|note) that i (prefer|like|want|am|'m)\s+(.+)/i,
      /^i (prefer|always|never)\s+(.+)/i,
      /^i('m| am) (a |an )?(\w+)\s+(person|type|kind)/i,  // "I am a morning person"
      /^i('m| am) (a |an )?(.+)/i,  // "I am a vegetarian", "I'm lactose intolerant"
      /^i (like|love|hate|enjoy|dislike)\s+(.+)/i,
    ],
    keywords: {
      verbs: ['remember', 'note', 'prefer'],
      nouns: ['preference', 'like', 'always'],
    },
    priority: 75,  // Higher than before to beat addContact
  },

  parseArgs: (input) => {
    // Handle "I am a X person/type" → "morning person"
    const personMatch = input.match(/^i('m| am) (a |an )?(\w+)\s+(person|type|kind)/i);
    if (personMatch) {
      return { preference: `${personMatch[3]} ${personMatch[4]}` };
    }

    // Handle "I am a X" → "vegetarian", "I'm lactose intolerant" 
    const amMatch = input.match(/^i('m| am) (a |an )?(.+)$/i);
    if (amMatch) {
      return { preference: amMatch[3].trim() };
    }

    // Handle "I like/love/hate X"
    const likeMatch = input.match(/^i (like|love|hate|enjoy|dislike)\s+(.+)$/i);
    if (likeMatch) {
      return { preference: `${likeMatch[1]} ${likeMatch[2]}` };
    }

    const preference = input
      .replace(/^(remember|note) that i (prefer|like|want|am|'m)\s*/i, '')
      .replace(/^i (prefer|always|never)\s*/i, '')
      .trim();
    return { preference };
  },

  execute: async (args, context) => {
    const { preference } = args as { preference: string };

    if (!preference) {
      return 'Please specify a preference. Example: I prefer morning meetings';
    }

    context.services.context.setFact('preference', preference, true, {
      source: 'explicit',
      confidence: 1.0,
    });

    return `✓ Got it! I'll remember that.`;
  },
};

export const viewProfile: Tool = {
  name: 'viewProfile',
  description: 'Show what Bartleby knows about the user',

  routing: {
    patterns: [
      /^what do you know about me/i,
      /^show (my )?profile/i,
      /^(my )?preferences/i,
    ],
    keywords: {
      verbs: ['show', 'view', 'what'],
      nouns: ['profile', 'preferences', 'about me', 'know'],
    },
    priority: 80,
  },

  execute: async (args, context) => {
    const summary = context.services.context.getProfileSummary();
    const episodeCount = context.services.context.getEpisodeCount();

    if (!summary && episodeCount === 0) {
      return "I don't know much about you yet. As we chat, I'll learn your preferences and remember our conversations.";
    }

    let response = '## What I Know About You\n\n';
    if (summary) response += summary;
    response += `\n\n*Based on ${episodeCount} conversation(s).*`;

    return response;
  },
};

export const clearFollowup: Tool = {
  name: 'clearFollowup',
  description: 'Mark a follow-up as done',

  routing: {
    patterns: [
      /^(done|completed?|finished?)\s+checking\s+(.+)/i,
      /^i (did|completed?|finished?)\s+(.+)/i,
    ],
    priority: 60,
  },

  parseArgs: (input) => {
    const description = input
      .replace(/^(done|completed?|finished?|i (did|completed?|finished?))\s*(checking\s+)?/i, '')
      .trim();
    return { description };
  },

  execute: async (args, context) => {
    const { description } = args as { description: string };

    const cleared = context.services.context.clearMatchingFollowup(description);

    if (cleared) {
      return `✓ Cleared follow-up: "${cleared}"`;
    }
    return `No pending follow-up found matching "${description}"`;
  },
};

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}

export const contextTools: Tool[] = [
  recallConversation,
  setPreference,
  viewProfile,
  clearFollowup,
];
