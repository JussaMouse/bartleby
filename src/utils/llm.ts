// src/utils/llm.ts

/**
 * Clean LLM output by removing thinking tags, special tokens, etc.
 */
export function cleanLLMOutput(text: string): string {
  return text
    // Remove <think>...</think> blocks (including multiline)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Remove stray opening/closing think tags
    .replace(/<\/?think>/gi, '')
    // Remove model end tokens
    .replace(/<\|im_end\|>/gi, '')
    .replace(/<\|im_start\|>/gi, '')
    .replace(/<\|end\|>/gi, '')
    .replace(/<\|eot_id\|>/gi, '')
    // Remove other common artifacts
    .replace(/<\|assistant\|>/gi, '')
    .replace(/<\|user\|>/gi, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
