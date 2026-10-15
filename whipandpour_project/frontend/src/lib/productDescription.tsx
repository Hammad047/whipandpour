import { Fragment, type ReactNode } from 'react';

const BULLET = /^\s*[-*•]\s+(.*)$/;
const BOLD = /(\*\*[^*\n]+\*\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(BOLD).map((part, i) => {
    const isBold = part.length > 4 && part.startsWith('**') && part.endsWith('**');
    return isBold ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-[#2C2C2C]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    );
  });
}

function isHeading(lines: string[], index: number): boolean {
  const line = lines[index].trim();
  const next = lines[index + 1];
  return Boolean(next && BULLET.test(next) && line && line.length <= 80 && !BULLET.test(line) && !/[.!?:]$/.test(line));
}

/**
 * Renders the admin-written description: paragraphs, "Heading" lines followed by
 * bullets, "- item" lists, and **bold**. Output is React nodes, never HTML, so
 * anything typed into the description is shown as text.
 */
export function ProductDescription({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nodes: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    const start = i;

    if (BULLET.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(lines[i].match(BULLET)![1].trim());
        i++;
      }
      nodes.push(
        <ul key={`ul-${start}`} className="list-disc pl-5 space-y-2">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `li-${start}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (isHeading(lines, i)) {
      nodes.push(
        <h3 key={`h-${start}`} className="text-lg font-bold text-[#2C2C2C] pt-2">
          {renderInline(line, `h-${start}`)}
        </h3>
      );
      i++;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !isHeading(lines, i)) {
      paragraph.push(lines[i].trim());
      i++;
    }
    nodes.push(<p key={`p-${start}`}>{renderInline(paragraph.join(' '), `p-${start}`)}</p>);
  }

  return <div className="space-y-4">{nodes}</div>;
}

/** Plain-text version for meta descriptions and structured data. */
export function plainDescription(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
