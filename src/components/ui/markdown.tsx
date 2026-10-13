import { Fragment, type ReactNode } from "react";

/**
 * Tiny, safe Markdown renderer for legal pages (headings, paragraphs, bullet
 * lists, **bold**, [links](https://...)). Produces React elements only, never raw HTML.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={`${keyBase}-${i++}`}>{m[2]}</strong>);
    else if (m[4]) {
      const href = m[5];
      const safe = /^(https?:\/\/|\/|mailto:)/.test(href) ? href : "#";
      out.push(
        <a key={`${keyBase}-${i++}`} href={safe} className="link">
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose-legal">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;
        const key = `b${bi}`;
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={key}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*] /, ""), `${key}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        const h = /^(#{1,3}) (.*)$/.exec(lines[0]);
        if (h && lines.length === 1) {
          const level = h[1].length;
          const content = inline(h[2], key);
          if (level === 1) return <h1 key={key}>{content}</h1>;
          if (level === 2) return <h2 key={key}>{content}</h2>;
          return <h3 key={key}>{content}</h3>;
        }
        return (
          <p key={key}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${key}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
