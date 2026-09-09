import { parseBlocks, type Block, type BulletNode } from "@/lib/format";

interface Props {
  /** Raw editor text — parsed here, so callers pass what they stored. */
  text: string;
  className?: string;
}

/** Read-only rendering of bullet text: sub-headers, points, and nested sub-points. */
export default function BulletView({ text, className = "" }: Props) {
  const blocks = parseBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      <Blocks blocks={blocks} />
    </div>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  const out: React.ReactNode[] = [];
  let run: BulletNode[] = [];

  const flush = (key: string) => {
    if (!run.length) return;
    out.push(<Nodes key={key} nodes={run} depth={0} />);
    run = [];
  };

  blocks.forEach((block, i) => {
    if (block.kind === "header") {
      flush(`ul-${i}`);
      out.push(
        <p key={`h-${i}`} className="mt-1.5 text-[12px] font-semibold text-foreground">
          {block.text}
        </p>,
      );
    } else {
      run.push(block.node);
    }
  });
  flush("ul-end");

  return <>{out}</>;
}

function Nodes({ nodes, depth }: { nodes: BulletNode[]; depth: number }) {
  return (
    <ul className={depth === 0 ? "mt-0.5 space-y-0.5 pl-3.5" : "mt-0.5 space-y-0.5 pl-3"}>
      {nodes.map((node, i) => (
        <li
          key={i}
          className="list-disc text-[12px] leading-[1.45] text-muted marker:text-line-strong"
        >
          <span className="whitespace-pre-wrap">{node.text}</span>
          {node.children.length ? <Nodes nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}
