import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PillarId } from '@/data/types';
import { pillarColor } from '@/lib/utils';

interface Node {
  id: string;
  label: string;
  color?: string;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
}

interface ConceptMapProps {
  data: { nodes: Node[]; edges: Edge[] };
  pillar?: PillarId | null;
}

// Simple layout: place nodes in a circle
function layoutNodes(nodes: Node[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  return nodes.map((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

export default function ConceptMap({ data, pillar }: ConceptMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ label: string; x: number; y: number } | null>(null);
  const defaultColor = pillar ? pillarColor(pillar) : '#2E5FA3';

  const width = 500;
  const height = 320;
  const nodeRadius = 28;

  const laidOutNodes = layoutNodes(data.nodes, width, height);
  const nodeMap = Object.fromEntries(laidOutNodes.map((n) => [n.id, n]));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-4 relative"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: defaultColor }}>
        Concept Map
      </p>
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="max-w-full"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#4a5568" />
            </marker>
          </defs>

          {/* Edges */}
          {data.edges.map((edge, i) => {
            const from = nodeMap[edge.from];
            const to = nodeMap[edge.to];
            if (!from || !to) return null;

            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = dx / len;
            const ny = dy / len;

            const x1 = from.x + nx * nodeRadius;
            const y1 = from.y + ny * nodeRadius;
            const x2 = to.x - nx * (nodeRadius + 6);
            const y2 = to.y - ny * (nodeRadius + 6);

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;

            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#4a5568"
                  strokeWidth="1.5"
                  markerEnd="url(#arrowhead)"
                />
                {edge.label && (
                  <text
                    x={mx}
                    y={my - 5}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#4a5568"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {laidOutNodes.map((node) => {
            const nodeColor = node.color ?? defaultColor;
            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                onMouseEnter={() => setTooltip({ label: node.label, x: node.x, y: node.y - nodeRadius - 8 })}
                onMouseLeave={() => setTooltip(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={nodeRadius}
                  fill={nodeColor + '20'}
                  stroke={nodeColor}
                  strokeWidth="1.5"
                />
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fill="#e2e8f0"
                  fontFamily="Inter, sans-serif"
                  fontWeight="500"
                >
                  {node.label.length > 14 ? node.label.slice(0, 13) + '…' : node.label}
                </text>
              </motion.g>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <g>
              <rect
                x={tooltip.x - 60}
                y={tooltip.y - 14}
                width={120}
                height={20}
                rx={4}
                fill="#080d1a"
                stroke="#1a2540"
              />
              <text
                x={tooltip.x}
                y={tooltip.y - 2}
                textAnchor="middle"
                fontSize="10"
                fill="#e2e8f0"
                fontFamily="Inter, sans-serif"
              >
                {tooltip.label}
              </text>
            </g>
          )}
        </svg>
      </div>
    </motion.div>
  );
}
