import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

// The public developer guide, rendered from docs/DEVELOPER_GUIDE.md, the single source.
export default async function Guide() {
  const md = await readFile(path.join(process.cwd(), "docs", "DEVELOPER_GUIDE.md"), "utf8");
  const html = await marked.parse(md, { gfm: true });
  return <article className="p-guide" dangerouslySetInnerHTML={{ __html: html }} />;
}
