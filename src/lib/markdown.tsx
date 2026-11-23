import type { ReactNode } from 'react';

/**
 * Renders inline Markdown tokens (bold, italic, inline code, links) safely as React nodes.
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[0.9em] font-mono text-slate-800 dark:text-slate-200"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(
        <strong key={key++} className="font-semibold text-slate-900 dark:text-white">
          {renderInline(token.slice(2, -2))}
        </strong>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(
        <em key={key++} className="italic">
          {renderInline(token.slice(1, -1))}
        </em>
      );
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 dark:text-sky-400 underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <a
          key={key++}
          href={match[4]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-600 dark:text-sky-400 underline underline-offset-2 break-all hover:text-sky-700 dark:hover:text-sky-300"
        >
          {match[4]}
        </a>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/**
 * Lightweight, XSS-safe Markdown preview renderer tailored for Day One `.doentry` journal text.
 */
export function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm italic text-slate-400">Empty entry — switch to Edit to start writing.</p>;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push(
        <pre
          key={key++}
          className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto text-xs sm:text-sm font-mono text-slate-800 dark:text-slate-200 leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key++} className="border-slate-200 dark:border-slate-800 my-4" />);
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (level === 1) {
        blocks.push(
          <h1 key={key++} className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
            {renderInline(text)}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={key++} className="text-xl font-bold tracking-tight text-slate-900 dark:text-white mt-2">
            {renderInline(text)}
          </h2>
        );
      } else {
        blocks.push(
          <h3 key={key++} className="text-lg font-semibold text-slate-900 dark:text-white mt-2">
            {renderInline(text)}
          </h3>
        );
      }
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-4 border-sky-400/80 pl-4 py-1 text-slate-600 dark:text-slate-300 italic space-y-1"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx}>{renderInline(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-6 space-y-1.5 text-base sm:text-[17px] leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-6 space-y-1.5 text-base sm:text-[17px] leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push(
      <p key={key++} className="text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-100 whitespace-pre-line">
        {renderInline(paraLines.join('\n'))}
      </p>
    );
  }

  return <div className="space-y-4">{blocks}</div>;
}
