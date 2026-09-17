import { PillarConnection, PillarId } from './types';

/**
 * Hand-curated, undirected semantic links between the 12 Growth Pillars.
 *
 * Each entry is a pre-mapped pair — when the learner studies one pillar, the
 * connection surfacing engine can highlight the related pillar and *why* they
 * connect. Pairs are undirected: `a`/`b` order is irrelevant and
 * {@link connectionsForPillar} returns matches regardless of position.
 *
 * Invariants (enforced by the Rust mirror's unit tests too):
 * - `a !== b` (no self-loops)
 * - every id is a valid PillarId
 * - `weight` normalized to 0–1
 * - no duplicate unordered pairs
 */
export const PILLAR_CONNECTIONS: PillarConnection[] = [
  {
    a: 'llm',
    b: 'mlops',
    label: 'Deploying & serving models',
    rationale:
      'Understanding LLM internals directly informs how you monitor, serve, and optimize them in production.',
    weight: 0.9,
  },
  {
    a: 'llm',
    b: 'hardware',
    label: 'Compute for training & inference',
    rationale:
      'Architecture choices (attention, parameter count, quantization) are bounded by the GPU/accelerator hardware that runs them.',
    weight: 0.85,
  },
  {
    a: 'hardware',
    b: 'mlops',
    label: 'Inference cost & deployment targets',
    rationale:
      'Hardware selection and MLOps pipelines jointly decide latency, throughput, and the unit economics of serving.',
    weight: 0.75,
  },
  {
    a: 'mlops',
    b: 'finance',
    label: 'FinOps & unit economics of AI',
    rationale:
      'Production ML spend (GPU hours, serving cost) is a core driver of gross margin and burn for an AI company.',
    weight: 0.7,
  },
  {
    a: 'hardware',
    b: 'finance',
    label: 'Capex vs. cloud trade-offs',
    rationale:
      'Buy-vs-rent decisions on compute hardware are financial decisions about capex, depreciation, and runway.',
    weight: 0.6,
  },
  {
    a: 'fundraising',
    b: 'communication',
    label: 'Pitch craft & narrative',
    rationale:
      'Raising capital is a communication problem — structured storytelling and executive presence move investors.',
    weight: 0.85,
  },
  {
    a: 'fundraising',
    b: 'finance',
    label: 'Metrics investors underwrite',
    rationale:
      'Term sheets, cap tables, and the metrics (ARR, burn, runway) you raise on are financial literacy in action.',
    weight: 0.8,
  },
  {
    a: 'fundraising',
    b: 'roadmap',
    label: 'Story the roadmap sells',
    rationale:
      'The technical roadmap is the growth story you pitch — milestones and prioritization underwrite the raise.',
    weight: 0.65,
  },
  {
    a: 'communication',
    b: 'voice',
    label: 'Delivery & authority projection',
    rationale:
      'Structured messaging lands only when delivered well — vocal technique and presence are the delivery layer.',
    weight: 0.8,
  },
  {
    a: 'communication',
    b: 'roadmap',
    label: 'Communicating strategy',
    rationale:
      'A roadmap only aligns the company if it is communicated with clarity, structure, and a compelling why.',
    weight: 0.7,
  },
  {
    a: 'sales',
    b: 'communication',
    label: 'Persuasion & executive messaging',
    rationale:
      'Technical sales is structured persuasion — discovery, ROI framing, and executive communication win deals.',
    weight: 0.8,
  },
  {
    a: 'sales',
    b: 'finance',
    label: 'ROI modeling & deal economics',
    rationale:
      'Closing enterprise deals means modeling buyer ROI and pricing against your own unit economics.',
    weight: 0.65,
  },
  {
    a: 'security',
    b: 'ip',
    label: 'Protecting the technical moat',
    rationale:
      'Security posture and IP strategy both defend the company’s assets — one guards data, the other guards inventions.',
    weight: 0.75,
  },
  {
    a: 'security',
    b: 'mlops',
    label: 'Securing the ML pipeline',
    rationale:
      'Production ML systems are an attack surface — securing data, models, and deployment is part of MLOps maturity.',
    weight: 0.7,
  },
  {
    a: 'security',
    b: 'roadmap',
    label: 'Compliance gates on the plan',
    rationale:
      'SOC 2 and safety standards are roadmap items — compliance timelines shape what ships and when.',
    weight: 0.55,
  },
  {
    a: 'ip',
    b: 'roadmap',
    label: 'Defensibility shapes strategy',
    rationale:
      'What you patent or keep as a trade secret is a strategic roadmap choice about where to build a moat.',
    weight: 0.6,
  },
  {
    a: 'ip',
    b: 'fundraising',
    label: 'IP as an investment thesis',
    rationale:
      'A defensible IP position is a core part of the diligence story investors underwrite a deep-tech raise on.',
    weight: 0.6,
  },
  {
    a: 'hiring',
    b: 'roadmap',
    label: 'Staffing the plan',
    rationale:
      'The roadmap is only as real as the team that can execute it — hiring sequence follows strategic priorities.',
    weight: 0.7,
  },
  {
    a: 'hiring',
    b: 'finance',
    label: 'Comp, equity & burn',
    rationale:
      'Engineering comp and equity grants are the largest line item — hiring decisions are financial decisions.',
    weight: 0.65,
  },
  {
    a: 'hiring',
    b: 'ip',
    label: 'Employee IP & assignment',
    rationale:
      'Onboarding engineers means invention-assignment and confidentiality agreements that protect company IP.',
    weight: 0.5,
  },
  {
    a: 'roadmap',
    b: 'finance',
    label: 'Budgeting the build',
    rationale:
      'Prioritization is a budgeting exercise — every roadmap bet is an allocation of finite capital and runway.',
    weight: 0.65,
  },
];

/**
 * Returns every connection touching `pillar`, de-duplicated by unordered pair.
 * The matched pillar is always returned as the *other* end (never `pillar`
 * itself), so callers can render "from `pillar` → neighbor" directly.
 */
export function connectionsForPillar(
  pillar: PillarId
): { other: PillarId; label: string; rationale: string; weight: number }[] {
  const seen = new Set<string>();
  const out: { other: PillarId; label: string; rationale: string; weight: number }[] = [];

  for (const c of PILLAR_CONNECTIONS) {
    let other: PillarId | null = null;
    if (c.a === pillar) other = c.b;
    else if (c.b === pillar) other = c.a;
    if (!other) continue;

    // De-dupe by unordered pair so a duplicated entry surfaces once.
    const key = [pillar, other].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ other, label: c.label, rationale: c.rationale, weight: c.weight });
  }

  return out.sort((x, y) => y.weight - x.weight);
}
