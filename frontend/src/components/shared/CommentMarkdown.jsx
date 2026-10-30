import React from 'react';
import { AtSign, CheckSquare, Square } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Safely parse inline Markdown and @mentions into React elements.
 * Avoids dangerouslySetInnerHTML to prevent XSS.
 *
 * @param {string} text
 * @returns {React.ReactNode[]}
 */
function renderInline(text) {
  if (!text) return [];

  // Tokenize regex matches for:
  // 1. Mentions with brackets: @[Full Name]
  // 2. Mentions without brackets: @username
  // 3. Inline code: `code`
  // 4. Bold: **text**
  // 5. Italic: *text*
  // 6. Strike: ~~text~~
  // 7. Markdown links: [title](url)
  // 8. Plain URLs: https://...
  const pattern = /(@\[[^\]]+\]|(?<!\w)@[a-zA-Z0-9._-]+|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+)/g;

  const parts = text.split(pattern);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bracketed mention: @[Full Name]
    if (part.startsWith('@[') && part.endsWith(']')) {
      const name = part.slice(2, -1);
      return (
        <span
          key={index}
          className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
        >
          <AtSign className="h-3 w-3 shrink-0" />
          {name}
        </span>
      );
    }

    // Bare mention: @username
    if (part.startsWith('@') && part.length > 1 && !part.includes(' ')) {
      const name = part.slice(1);
      return (
        <span
          key={index}
          className="mx-0.5 inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
        >
          <AtSign className="h-3 w-3 shrink-0" />
          {name}
        </span>
      );
    }

    // Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-rose-600 dark:bg-slate-800 dark:text-rose-400"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="italic text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Strikethrough: ~~text~~
    if (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) {
      return (
        <del key={index} className="line-through text-slate-400">
          {part.slice(2, -2)}
        </del>
      );
    }

    // Link: [title](url)
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const mid = part.indexOf('](');
      const title = part.slice(1, mid);
      const url = part.slice(mid + 2, -1);
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 underline hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {title}
        </a>
      );
    }

    // Plain URL
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 underline hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {part}
        </a>
      );
    }

    return part;
  });
}

/**
 * Lightweight and secure Markdown renderer for task comments.
 * Supports paragraphs, bullet lists, code blocks, bold, italic, and @mentions.
 *
 * @param {object} props
 * @param {string} props.content
 * @param {string} [props.className]
 */
export function CommentMarkdown({ content, className }) {
  if (!content) return null;

  // Normalize CRLF to LF and split into lines to distinguish blocks
  const lines = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeBuffer = [];
  let listBuffer = [];
  let orderedListBuffer = [];

  const flushUnorderedList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 list-disc space-y-1 pl-5">
          {listBuffer.map((item, i) => {
            if (item.isChecklist) {
              return (
                <li key={i} className="flex items-start gap-2 list-none -ml-5 py-0.5">
                  {item.checked ? (
                    <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  ) : (
                    <Square className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className={cn('leading-relaxed', item.checked && 'line-through text-slate-400 dark:text-slate-500')}>
                    {renderInline(item.text)}
                  </span>
                </li>
              );
            }
            return <li key={i}>{renderInline(item.text)}</li>;
          })}
        </ul>
      );
      listBuffer = [];
    }
  };

  const flushOrderedList = () => {
    if (orderedListBuffer.length > 0) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="my-2 list-decimal space-y-1 pl-5">
          {orderedListBuffer.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      orderedListBuffer = [];
    }
  };

  const flushAllLists = () => {
    flushUnorderedList();
    flushOrderedList();
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];

    // Code block toggle: ```
    if (line.trim().startsWith('```')) {
      flushAllLists();
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${idx}`}
            className="my-2.5 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100 dark:bg-slate-950"
          >
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Horizontal Rule: --- or *** or ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line.trim())) {
      flushAllLists();
      elements.push(<hr key={`hr-${idx}`} className="my-4 border-slate-200 dark:border-slate-800" />);
      continue;
    }

    // Headings: # H1, ## H2, ### H3, #### H4
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      flushAllLists();
      elements.push(
        <h1 key={`h1-${idx}`} className="mt-4 mb-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white first:mt-0">
          {renderInline(h1Match[1])}
        </h1>
      );
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushAllLists();
      elements.push(
        <h2 key={`h2-${idx}`} className="mt-3.5 mb-1.5 border-b border-slate-100 pb-1 text-lg font-bold tracking-tight text-slate-900 dark:border-slate-800 dark:text-white first:mt-0">
          {renderInline(h2Match[1])}
        </h2>
      );
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      flushAllLists();
      elements.push(
        <h3 key={`h3-${idx}`} className="mt-3 mb-1 text-base font-semibold text-slate-900 dark:text-white first:mt-0">
          {renderInline(h3Match[1])}
        </h3>
      );
      continue;
    }

    const h4Match = line.match(/^####\s+(.+)$/);
    if (h4Match) {
      flushAllLists();
      elements.push(
        <h4 key={`h4-${idx}`} className="mt-2.5 mb-1 text-sm font-semibold text-slate-900 dark:text-white first:mt-0">
          {renderInline(h4Match[1])}
        </h4>
      );
      continue;
    }

    // Blockquote: > quote
    const quoteMatch = line.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      flushAllLists();
      elements.push(
        <blockquote
          key={`quote-${idx}`}
          className="my-2 rounded-r border-l-4 border-brand-500 bg-slate-50/80 px-3 py-1.5 text-xs italic text-slate-700 dark:border-brand-400 dark:bg-slate-800/40 dark:text-slate-300"
        >
          {renderInline(quoteMatch[1])}
        </blockquote>
      );
      continue;
    }

    // Checklist: - [ ] or - [x]
    const checklistMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checklistMatch) {
      flushOrderedList();
      listBuffer.push({
        isChecklist: true,
        checked: checklistMatch[2].toLowerCase() === 'x',
        text: checklistMatch[3],
      });
      continue;
    }

    // Unordered Bullet point: - or *
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushOrderedList();
      listBuffer.push({
        isChecklist: false,
        text: bulletMatch[2],
      });
      continue;
    }

    // Ordered List: 1. Item
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushUnorderedList();
      orderedListBuffer.push(orderedMatch[2]);
      continue;
    }

    flushAllLists();

    // Empty line -> spacing
    if (!line.trim()) {
      elements.push(<div key={`sp-${idx}`} className="h-2" />);
      continue;
    }

    // Normal paragraph line
    elements.push(
      <p key={`p-${idx}`} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  flushAllLists();

  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre
        key="unclosed-code"
        className="my-2.5 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100 dark:bg-slate-950"
      >
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return (
    <div className={cn('text-sm text-slate-700 dark:text-slate-300', className)}>
      {elements}
    </div>
  );
}

export default CommentMarkdown;

