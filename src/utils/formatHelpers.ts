/**
 * Shared formatting utilities for MCP tool responses.
 * Extracted from WorkItemTools.ts and GitTools.ts for reuse across all tool files.
 */

import { marked } from 'marked';

// ── Date Formatting ──────────────────────────────────────────────

export function formatRelativeDate(dateString: string): string {
  if (!dateString) return 'Unknown';
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 4) return `${diffWeeks}w ago`;
    return `${diffMonths}mo ago`;
  } catch {
    return 'Unknown';
  }
}

export function formatFullDate(dateString: string): string {
  if (!dateString) return 'Not set';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export function formatDateWithAge(dateString: string): string {
  if (!dateString) return 'Not set';
  return `${formatFullDate(dateString)} (${formatRelativeDate(dateString)})`;
}

// ── Text Helpers ─────────────────────────────────────────────────

export function truncateText(text: string, maxLen: number = 50): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')              // <br> → newline
    .replace(/<\/p>/gi, '\n\n')                  // </p> → paragraph break
    .replace(/<\/div>/gi, '\n')                  // </div> → newline
    .replace(/<\/li>/gi, '\n')                   // </li> → newline
    .replace(/<li[^>]*>/gi, '- ')                // <li> → markdown list item
    .replace(/<\/h[1-6]>/gi, '\n\n')             // closing heading → paragraph break
    .replace(/<h([1-6])[^>]*>/gi, (_, level) => '#'.repeat(Number(level)) + ' ') // <h1> → #
    .replace(/<[^>]*>/g, '')                     // strip remaining tags
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')                     // collapse horizontal whitespace only
    .replace(/\n /g, '\n')                        // trim leading space after newlines
    .replace(/\n{3,}/g, '\n\n')                  // collapse 3+ newlines to 2
    .trim();
}

// ── Markdown → HTML Conversion ──────────────────────────────────

/**
 * Convert markdown text to HTML for Azure DevOps rich-text fields
 * (System.Description, System.History, etc.) which expect HTML content.
 */
export function markdownToHtml(text: string): string {
  if (!text) return '';
  // Skip conversion if text already looks like HTML
  if (text.trimStart().startsWith('<') && /<\/(p|div|h[1-6]|ul|ol|table|span)>/i.test(text)) {
    return text;
  }
  return marked.parse(text, { async: false }) as string;
}

// ── Effort Formatting ────────────────────────────────────────────

export function formatEffort(hours: number | null | undefined): string {
  if (!hours || hours === 0) return '0h';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours}h`;
}

// ── Emoji Maps ───────────────────────────────────────────────────

const WORK_ITEM_TYPE_MAP: Record<string, string> = {
  'Epic': '🎯',
  'Feature': '🚀',
  'User Story': '📖',
  'Task': '✅',
  'Bug': '🐛',
  'Test Case': '🧪',
  'Issue': '⚠️',
};

export function getWorkItemTypeEmoji(type: string): string {
  return WORK_ITEM_TYPE_MAP[type] || '📋';
}

const STATE_MAP: Record<string, string> = {
  'New': '🆕',
  'Active': '🔄',
  'In Progress': '⚡',
  'Resolved': '✅',
  'Closed': '✅',
  'Done': '✅',
  'Removed': '❌',
  'To Do': '📋',
  'Doing': '⚡',
  'Testing': '🧪',
};

export function getStateEmoji(state: string): string {
  return STATE_MAP[state] || '📌';
}

export function getPriorityEmoji(priority: number): string {
  if (priority === 1) return '🔴';
  if (priority === 2) return '🟡';
  if (priority === 3) return '🟢';
  if (priority === 4) return '🔵';
  return '⚪';
}

const CHANGE_TYPE_MAP: Record<number, string> = {
  1: '🟢 Added',
  2: '🟡 Modified',
  3: '🔴 Deleted',
};

export function getChangeTypeString(changeType: number): string {
  return CHANGE_TYPE_MAP[changeType] || '❓ Unknown';
}

const PR_STATUS_MAP: Record<number, string> = {
  1: '🔄 Active',
  2: '✅ Completed',
  3: '🔀 Abandoned',
  4: '❓ Not Set',
};

export function getPrStatusString(status: number): string {
  return PR_STATUS_MAP[status] || 'Unknown';
}

// ── Sprint Helpers ───────────────────────────────────────────────

export function getSprintTimeframeEmoji(timeFrame: string | number | undefined): string {
  if (timeFrame == null) return '📅';
  const tf = String(timeFrame).toLowerCase();
  if (tf === 'current' || tf === '1') return '🏃';
  if (tf === 'past' || tf === '0') return '✅';
  if (tf === 'future' || tf === '2') return '📅';
  return '📅';
}

export function getSprintTimeframeLabel(timeFrame: string | number | undefined): string {
  if (timeFrame == null) return 'N/A';
  const tf = String(timeFrame).toLowerCase();
  if (tf === 'current' || tf === '1') return 'Current';
  if (tf === 'past' || tf === '0') return 'Past';
  if (tf === 'future' || tf === '2') return 'Future';
  return String(timeFrame);
}

// ── Table Builder Helper ─────────────────────────────────────────

export function markdownTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `|${headers.map(() => '---').join('|')}|`;
  const dataRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
  return `${headerRow}\n${separator}\n${dataRows}`;
}
