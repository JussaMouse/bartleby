// src/utils/format.ts
// Terminal formatting utilities for enhanced CLI output

// ANSI color codes
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

// Check if colors should be disabled
const shouldUseColors = () => {
  return process.stdout.isTTY && process.env.NO_COLOR !== '1';
};

/**
 * Apply color to text
 */
export function colorize(text: string, color: keyof typeof colors): string {
  if (!shouldUseColors()) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Make text bold
 */
export function bold(text: string): string {
  if (!shouldUseColors()) return text;
  return `${colors.bold}${text}${colors.reset}`;
}

/**
 * Make text dim/muted
 */
export function dim(text: string): string {
  if (!shouldUseColors()) return text;
  return `${colors.dim}${text}${colors.reset}`;
}

/**
 * Create a header with emoji and formatting
 */
export function header(text: string, emoji?: string): string {
  const title = emoji ? `${emoji}  ${text}` : text;
  if (!shouldUseColors()) {
    return `\n${title}\n${'─'.repeat(50)}\n`;
  }
  return `\n${bold(colorize(title, 'brightCyan'))}\n${colorize('─'.repeat(50), 'gray')}\n`;
}

/**
 * Create a section header
 */
export function section(text: string): string {
  if (!shouldUseColors()) {
    return `\n${text}`;
  }
  return `\n${bold(colorize(text, 'brightWhite'))}`;
}

/**
 * Create a success message
 */
export function success(text: string): string {
  if (!shouldUseColors()) {
    return `✓ ${text}`;
  }
  return `${colorize('✓', 'brightGreen')} ${text}`;
}

/**
 * Create an error message
 */
export function errorText(text: string): string {
  if (!shouldUseColors()) {
    return `✗ ${text}`;
  }
  return `${colorize('✗', 'brightRed')} ${colorize(text, 'red')}`;
}

/**
 * Create a warning message
 */
export function warning(text: string): string {
  if (!shouldUseColors()) {
    return `⚠ ${text}`;
  }
  return `${colorize('⚠', 'brightYellow')} ${colorize(text, 'yellow')}`;
}

/**
 * Create an info message
 */
export function info(text: string): string {
  if (!shouldUseColors()) {
    return `ℹ ${text}`;
  }
  return `${colorize('ℹ', 'brightBlue')} ${text}`;
}

/**
 * Format a key-value pair
 */
export function keyValue(key: string, value: string, indent = 0): string {
  const spaces = ' '.repeat(indent);
  if (!shouldUseColors()) {
    return `${spaces}${key}: ${value}`;
  }
  return `${spaces}${colorize(key, 'cyan')}: ${value}`;
}

/**
 * Create a bullet list item
 */
export function bullet(text: string, indent = 0, symbol = '•'): string {
  const spaces = ' '.repeat(indent);
  if (!shouldUseColors()) {
    return `${spaces}${symbol} ${text}`;
  }
  return `${spaces}${colorize(symbol, 'gray')} ${text}`;
}

/**
 * Create a numbered list item
 */
export function numbered(num: number, text: string, indent = 0): string {
  const spaces = ' '.repeat(indent);
  if (!shouldUseColors()) {
    return `${spaces}${num}. ${text}`;
  }
  return `${spaces}${colorize(`${num}.`, 'cyan')} ${text}`;
}

/**
 * Create a box around text
 */
export function box(text: string, title?: string): string {
  const lines = text.split('\n');
  const maxWidth = Math.max(
    ...lines.map(l => l.length),
    title ? title.length + 2 : 0
  );
  const width = Math.min(maxWidth + 4, 80);

  let result = '';

  // Top border
  if (title) {
    const padding = width - title.length - 4;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    result += `┌${'─'.repeat(leftPad)} ${title} ${'─'.repeat(rightPad)}┐\n`;
  } else {
    result += `┌${'─'.repeat(width - 2)}┐\n`;
  }

  // Content
  for (const line of lines) {
    const padding = width - line.length - 4;
    result += `│ ${line}${' '.repeat(padding)} │\n`;
  }

  // Bottom border
  result += `└${'─'.repeat(width - 2)}┘\n`;

  if (shouldUseColors()) {
    return colorize(result, 'gray');
  }
  return result;
}

/**
 * Create a simple table
 */
export function table(rows: Array<Record<string, string>>, columns: string[]): string {
  if (rows.length === 0) return '';

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col] = col.length;
    for (const row of rows) {
      widths[col] = Math.max(widths[col], (row[col] || '').length);
    }
  }

  let result = '';

  // Header
  const headerParts = columns.map(col => col.padEnd(widths[col]));
  result += headerParts.join('  ') + '\n';

  // Separator
  const separatorParts = columns.map(col => '─'.repeat(widths[col]));
  result += separatorParts.join('  ') + '\n';

  // Rows
  for (const row of rows) {
    const rowParts = columns.map(col => (row[col] || '').padEnd(widths[col]));
    result += rowParts.join('  ') + '\n';
  }

  if (shouldUseColors()) {
    const lines = result.split('\n');
    lines[0] = bold(colorize(lines[0], 'cyan')); // Header
    lines[1] = colorize(lines[1], 'gray'); // Separator
    return lines.join('\n');
  }

  return result;
}

/**
 * Create a horizontal rule
 */
export function hr(char = '─', width = 50): string {
  if (!shouldUseColors()) {
    return char.repeat(width);
  }
  return colorize(char.repeat(width), 'gray');
}

/**
 * Add a footer with metadata
 */
export function footer(text: string): string {
  if (!shouldUseColors()) {
    return `\n${text}\n`;
  }
  return `\n${dim(colorize(text, 'gray'))}\n`;
}

/**
 * Highlight text with a background color effect
 */
export function highlight(text: string): string {
  if (!shouldUseColors()) {
    return `**${text}**`;
  }
  return bold(colorize(text, 'brightYellow'));
}

/**
 * Format a percentage with color based on value
 */
export function percentage(value: number): string {
  const text = `${(value * 100).toFixed(0)}%`;
  if (!shouldUseColors()) {
    return text;
  }

  if (value >= 0.9) return colorize(text, 'brightGreen');
  if (value >= 0.7) return colorize(text, 'brightYellow');
  return colorize(text, 'yellow');
}

/**
 * Format a confidence indicator
 */
export function confidence(value: number): string {
  if (value >= 0.9) {
    return shouldUseColors() ? colorize('✓', 'brightGreen') : '✓';
  }
  if (value >= 0.7) {
    return shouldUseColors() ? colorize('~', 'brightYellow') : '~';
  }
  return shouldUseColors() ? colorize('?', 'yellow') : '?';
}

/**
 * Create indented text
 */
export function indent(text: string, level = 1, size = 2): string {
  const spaces = ' '.repeat(level * size);
  return text.split('\n').map(line => spaces + line).join('\n');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}
