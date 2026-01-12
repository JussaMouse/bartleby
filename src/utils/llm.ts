// src/utils/llm.ts

/**
 * Clean LLM output by removing thinking tags, special tokens, etc.
 * @param text - The raw LLM output
 * @param verbose - If true, preserve thinking blocks (useful for debugging)
 */
export function cleanLLMOutput(text: string, verbose: boolean = false): string {
  let result = text;
  
  if (!verbose) {
    // Remove <think>...</think> blocks (including multiline)
    result = result.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Remove stray opening/closing think tags
    result = result.replace(/<\/?think>/gi, '');
  } else {
    // In verbose mode, format thinking blocks nicely
    result = result.replace(/<think>/gi, '\n💭 [Thinking]\n');
    result = result.replace(/<\/think>/gi, '\n[/Thinking]\n');
  }
  
  // Always remove model end tokens
  result = result
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
    
  return result;
}
