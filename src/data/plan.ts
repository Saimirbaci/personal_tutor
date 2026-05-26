import { Pillar, PillarData } from './types';

export const PILLARS: Pillar[] = [
  {
    id: 'llm',
    name: 'LLM Architectures & RLHF',
    emoji: '🧠',
    color: '#2E5FA3',
    colorMuted: '#1e3d6b',
    description: 'Deep understanding of transformer architectures, pre-training, fine-tuning, and alignment techniques including RLHF, DPO, and Constitutional AI.',
  },
  {
    id: 'hardware',
    name: 'Inference Hardware',
    emoji: '⚡',
    color: '#0E7C86',
    colorMuted: '#095259',
    description: 'GPU architecture, parallel computing, custom silicon (TPU/Trainium), and hardware optimization for AI inference and training.',
  },
  {
    id: 'sales',
    name: 'Technical Sales (Robotics)',
    emoji: '🤝',
    color: '#C9762A',
    colorMuted: '#854e1c',
    description: 'Technical sales methodology for the robotics industry — from ICP to close, with ROI modeling and executive communication.',
  },
  {
    id: 'communication',
    name: 'Communication Skills',
    emoji: '🗣️',
    color: '#7B3F8E',
    colorMuted: '#522a5f',
    description: 'Structured communication, executive presence, technical storytelling, and written communication excellence.',
  },
  {
    id: 'voice',
    name: 'Voice & Command',
    emoji: '🎙️',
    color: '#B54A00',
    colorMuted: '#783100',
    description: 'Vocal technique, resonance, authority projection, and commanding presence in high-stakes speaking situations.',
  },
  // ── CTO Leadership Pillars ──────────────────────────────────────────────────
  {
    id: 'fundraising',
    name: 'Fundraising & Investors',
    emoji: '💰',
    color: '#16A34A',
    colorMuted: '#14532D',
    description: 'Venture mechanics, investor communication, pitch craft, cap table management, and navigating pre-seed to Series A.',
  },
  {
    id: 'roadmap',
    name: 'Roadmap & Strategy',
    emoji: '🗺️',
    color: '#7C3AED',
    colorMuted: '#4C1D95',
    description: 'Technical strategy, prioritization frameworks, platform vs. feature thinking, OKRs, and build-vs-buy decisions.',
  },
  {
    id: 'security',
    name: 'Security & Compliance',
    emoji: '🔐',
    color: '#DC2626',
    colorMuted: '#991B1B',
    description: 'Enterprise security for robotics, SOC 2, ROS 2 security, OT/IT convergence, and safety standards (ISO 13849, IEC 62443).',
  },
  {
    id: 'hiring',
    name: 'Hiring & Engineering Culture',
    emoji: '👥',
    color: '#0891B2',
    colorMuted: '#155E75',
    description: 'Recruiting and retaining robotics/AI engineers, technical interview design, equity compensation, and engineering culture.',
  },
  {
    id: 'mlops',
    name: 'MLOps & Production AI',
    emoji: '🚀',
    color: '#EA580C',
    colorMuted: '#9A3412',
    description: 'ML system design, model monitoring, CI/CD for ML, LLMOps, edge deployment, and building ML platforms at startup scale.',
  },
  {
    id: 'ip',
    name: 'IP Strategy & Technical Moat',
    emoji: '⚖️',
    color: '#CA8A04',
    colorMuted: '#713F12',
    description: 'Patents, trade secrets, open-source strategy, freedom to operate, employee IP agreements, and building defensible technical moats.',
  },
  {
    id: 'finance',
    name: 'Financial Literacy for CTOs',
    emoji: '📊',
    color: '#BE185D',
    colorMuted: '#881337',
    description: 'Reading financials, startup metrics (ARR/CAC/LTV), engineering budgeting, FinOps for AI, and unit economics for Physical AI companies.',
  },
];

export const PLAN: PillarData[] = [
  {
    pillar: PILLARS[0],
    goal: 'Become fluent in LLM internals — able to explain any architecture decision and RLHF variant to engineers and executives alike.',
    curriculum: [
      {
        month: 1,
        label: 'Foundations',
        items: [
          { week: 'Week 1', topic: 'Transformer architecture & attention mechanisms', resource: 'Attention Is All You Need + Karpathy\'s makemore series', status: 'todo' },
          { week: 'Week 2', topic: 'Tokenization, embeddings & positional encoding', resource: 'BPE paper + RoPE paper + GPT-2 code walkthrough', status: 'todo' },
          { week: 'Week 3', topic: 'Pre-training: objectives, data, compute', resource: 'Chinchilla scaling laws paper + The Pile dataset paper', status: 'todo' },
          { week: 'Week 4', topic: 'Fine-tuning: SFT & instruction tuning', resource: 'InstructGPT paper + FLAN-T5 paper + Alpaca repo', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Alignment & Optimization',
        items: [
          { week: 'Week 5', topic: 'RLHF: reward modeling & PPO', resource: 'InstructGPT full paper + Anthropic\'s RLHF blog + TRL library', status: 'todo' },
          { week: 'Week 6', topic: 'DPO, RLAIF & Constitutional AI', resource: 'DPO paper + Constitutional AI paper + RLAIF paper', status: 'todo' },
          { week: 'Week 7', topic: 'Scaling laws & emergent capabilities', resource: 'Chinchilla, GPT-4 technical report, Emergent Abilities paper', status: 'todo' },
          { week: 'Week 8', topic: 'Inference optimization: KV cache, batching', resource: 'PagedAttention/vLLM paper + continuous batching blog', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Advanced Topics',
        items: [
          { week: 'Week 9', topic: 'Quantization & model compression', resource: 'GPTQ paper + AWQ paper + llama.cpp repo', status: 'todo' },
          { week: 'Week 10', topic: 'Mixture of Experts & sparse models', resource: 'Switch Transformer + Mixtral paper + MoE survey', status: 'todo' },
          { week: 'Week 11', topic: 'Multimodal LLMs & vision-language models', resource: 'LLaVA paper + GPT-4V tech report + CLIP paper', status: 'todo' },
          { week: 'Week 12', topic: 'LLM evaluation, benchmarks & red-teaming', resource: 'HELM paper + BIG-Bench + Anthropic red-teaming paper', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Attention Is All You Need', type: 'Paper', why: 'The foundational transformer paper — understand every equation', url: 'https://arxiv.org/abs/1706.03762' },
      { title: 'The Illustrated Transformer', type: 'Blog', why: 'Jay Alammar\'s visual walkthrough makes attention intuitive', url: 'https://jalammar.github.io/illustrated-transformer/' },
      { title: 'Andrej Karpathy\'s Neural Networks: Zero to Hero', type: 'Video', why: 'Build GPT from scratch — the best way to internalize transformers', url: 'https://karpathy.ai/zero-to-hero.html' },
      { title: 'InstructGPT Paper', type: 'Paper', why: 'The RLHF paper that launched the ChatGPT era — essential reading', url: 'https://arxiv.org/abs/2203.02155' },
      { title: 'Constitutional AI: Harmlessness from AI Feedback', type: 'Paper', why: 'Anthropic\'s approach to AI alignment without human labelers', url: 'https://arxiv.org/abs/2212.08073' },
      { title: 'Direct Preference Optimization (DPO)', type: 'Paper', why: 'Simpler RLHF alternative — widely adopted in open models', url: 'https://arxiv.org/abs/2305.18290' },
      { title: 'Chinchilla Scaling Laws', type: 'Paper', why: 'Compute-optimal training — every LLM team cites this', url: 'https://arxiv.org/abs/2203.15556' },
      { title: 'vLLM: PagedAttention', type: 'Paper', why: 'Core inference optimization — KV cache paging for throughput', url: 'https://arxiv.org/abs/2309.06180' },
      { title: 'Hugging Face TRL Library', type: 'Tool', why: 'Hands-on RLHF — train reward models and run PPO yourself', url: 'https://github.com/huggingface/trl' },
      { title: 'LLM Visualization', type: 'Tool', why: 'Interactive step-through of attention — great for teaching', url: 'https://bbycroft.net/llm' },
    ],
    milestones: [
      { month: 1, description: 'Explain transformer architecture end-to-end without notes', indicator: 'Can whiteboard attention, positional encoding, and pre-training in 15 min', status: 'pending' },
      { month: 2, description: 'Articulate RLHF vs DPO trade-offs to a technical executive', indicator: 'Deliver a 5-minute verbal explanation with pros/cons of each approach', status: 'pending' },
      { month: 3, description: 'Conduct a technical LLM deep-dive for an enterprise prospect', indicator: 'Lead a 30-min technical session on inference optimization & alignment', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS[1],
    goal: 'Understand hardware constraints well enough to size deployments, explain GPU costs, and have credible conversations with ML infrastructure engineers.',
    curriculum: [
      {
        month: 1,
        label: 'GPU Fundamentals',
        items: [
          { week: 'Week 1', topic: 'GPU architecture: SMs, CUDA cores, memory hierarchy', resource: 'NVIDIA GPU Architecture whitepaper + Tim Dettmers GPU blog', status: 'todo' },
          { week: 'Week 2', topic: 'FLOP counting & roofline model', resource: 'Roofline model paper + Eleuther FLOPs calculator', status: 'todo' },
          { week: 'Week 3', topic: 'Tensor parallelism & pipeline parallelism', resource: 'Megatron-LM paper + ZeRO paper + Deepspeed docs', status: 'todo' },
          { week: 'Week 4', topic: 'NVLink, InfiniBand & interconnects', resource: 'NVIDIA NVLink docs + Semianalysis GPU cluster writeups', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Custom Silicon & Optimization',
        items: [
          { week: 'Week 5', topic: 'Custom silicon: TPU, Trainium, Gaudi', resource: 'TPU v4 paper + AWS Trainium docs + Intel Gaudi docs', status: 'todo' },
          { week: 'Week 6', topic: 'Memory bandwidth optimization', resource: 'FlashAttention-2 paper + Tri Dao\'s blog', status: 'todo' },
          { week: 'Week 7', topic: 'FlashAttention & kernel fusion', resource: 'Flash Attention papers 1, 2, 3 + Triton tutorial', status: 'todo' },
          { week: 'Week 8', topic: 'Inference chips: trade-offs vs training chips', resource: 'Cerebras, Groq, SambaNova whitepapers + Semianalysis', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Systems & Roadmaps',
        items: [
          { week: 'Week 9', topic: 'Power efficiency & thermal design', resource: 'Datacenter GPU thermal docs + power delivery analysis', status: 'todo' },
          { week: 'Week 10', topic: 'Data center networking for AI clusters', resource: 'Google Jupiter network paper + RDMA for ML', status: 'todo' },
          { week: 'Week 11', topic: 'Edge AI hardware & deployment', resource: 'Jetson Orin specs + Qualcomm AI 100 + Apple ANE', status: 'todo' },
          { week: 'Week 12', topic: 'Hardware roadmaps: NVIDIA, AMD, Intel, startups', resource: 'Hot Chips proceedings + NVIDIA GTC keynotes + Semianalysis', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Tim Dettmers: GPU for Deep Learning', type: 'Blog', why: 'Most practical GPU selection guide — quantifies memory and bandwidth trade-offs', url: 'https://timdettmers.com/2023/01/30/which-gpu-for-deep-learning/' },
      { title: 'Roofline Model Paper', type: 'Paper', why: 'Essential mental model for understanding compute vs memory bound workloads' },
      { title: 'FlashAttention-2 Paper', type: 'Paper', why: 'Shows how algorithmic thinking on hardware constraints enables 3× speedup', url: 'https://arxiv.org/abs/2307.08691' },
      { title: 'Semianalysis', type: 'Blog', why: 'Best independent analysis of AI chip economics and data center strategy', url: 'https://www.semianalysis.com/' },
      { title: 'NVIDIA H100 Architecture Whitepaper', type: 'Blog', why: 'Understand Hopper: Transformer Engine, HBM3, NVLink 4.0' },
      { title: 'Megatron-LM Paper', type: 'Paper', why: 'Tensor + pipeline parallelism — how large models actually train', url: 'https://arxiv.org/abs/2104.04473' },
      { title: 'Triton Language Tutorial', type: 'Tool', why: 'Write GPU kernels in Python — hands-on understanding of CUDA programming model', url: 'https://triton-lang.org/main/getting-started/tutorials/' },
      { title: 'ZeRO: Memory Optimizations for Training', type: 'Paper', why: 'DeepSpeed\'s distributed training optimization — industry standard', url: 'https://arxiv.org/abs/1910.02054' },
    ],
    milestones: [
      { month: 1, description: 'Size a GPU cluster for a given model and throughput requirement', indicator: 'Given model params and token/s target, calculate GPU count and cost within 20%', status: 'pending' },
      { month: 2, description: 'Explain FlashAttention to an ML engineer without reading notes', indicator: 'Whiteboard the IO-bound problem and tiling solution in under 10 minutes', status: 'pending' },
      { month: 3, description: 'Run a hardware comparison for a robotics inference workload', indicator: 'Produce a written comparison of 3 hardware options with cost/latency/power', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS[2],
    goal: 'Develop a repeatable technical sales motion for robotics — from cold outreach through technical close, with deep discovery and ROI quantification.',
    curriculum: [
      {
        month: 1,
        label: 'Sales Foundation',
        items: [
          { week: 'Week 1', topic: 'Robotics industry landscape & buyer map', resource: 'CTRL+F Podcast + A16Z Robotics Market Map + competitor teardowns', status: 'todo' },
          { week: 'Week 2', topic: 'ICP definition & outbound prospecting', resource: 'Apollo.io + Clay for enrichment + cold email templates', status: 'todo' },
          { week: 'Week 3', topic: 'Technical discovery: robot failure modes', resource: 'MEDDICC framework + robot downtime case studies', status: 'todo' },
          { week: 'Week 4', topic: 'ROI modeling for robot downtime', resource: 'Build ROI calculator in spreadsheet + downtime cost research', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Selling Motions',
        items: [
          { week: 'Week 5', topic: 'Demo scripting for technical audiences', resource: 'Presales Collective resources + demo recording & review', status: 'todo' },
          { week: 'Week 6', topic: 'Handling objections from CTO buyers', resource: 'SPIN Selling + Gap Selling + objection scripts', status: 'todo' },
          { week: 'Week 7', topic: 'Competitive positioning vs alternatives', resource: 'Battle cards for each competitor + win/loss analysis framework', status: 'todo' },
          { week: 'Week 8', topic: 'Multi-threading enterprise deals', resource: 'Challenger Sale + champion coaching techniques', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Closing & Growth',
        items: [
          { week: 'Week 9', topic: 'Closing & negotiation techniques', resource: 'Never Split the Difference (Voss) + mutual action plans', status: 'todo' },
          { week: 'Week 10', topic: 'Customer success & expansion plays', resource: 'CSQL framework + QBR templates + expansion playbook', status: 'todo' },
          { week: 'Week 11', topic: 'Partner & channel strategies', resource: 'Partner ecosystem map + co-sell motion examples', status: 'todo' },
          { week: 'Week 12', topic: 'Building repeatable sales playbook', resource: 'Sales Playbook template + enablement best practices', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'SPIN Selling', type: 'Book', why: 'Foundation of technical discovery — Situation, Problem, Implication, Need-Payoff', url: 'https://www.amazon.com/SPIN-Selling-Neil-Rackham/dp/0070511136' },
      { title: 'Gap Selling', type: 'Book', why: 'Problem-centric selling — maps perfectly to complex technical deals', url: 'https://www.amazon.com/Gap-Selling-Keenan/dp/0578390442' },
      { title: 'The Challenger Sale', type: 'Book', why: 'Teach-tailor-take control motion for enterprise complex sales', url: 'https://www.amazon.com/Challenger-Sale-Control-Customer-Conversation/dp/1591844355' },
      { title: 'Never Split the Difference', type: 'Book', why: 'Tactical negotiation from FBI hostage negotiator — immediately applicable', url: 'https://www.amazon.com/Never-Split-Difference-Negotiating/dp/0062407805' },
      { title: 'Presales Collective', type: 'Course', why: 'Demo and technical selling best practices from practitioners', url: 'https://www.presalescollective.com/' },
      { title: 'MEDDICC Framework', type: 'Tool', why: 'Qualification framework for complex B2B enterprise deals', url: 'https://www.meddicc.com/' },
      { title: 'Clay (Enrichment Tool)', type: 'Tool', why: 'AI-powered prospect research and enrichment for outbound', url: 'https://www.clay.com/' },
      { title: 'A16Z Robotics Market Map', type: 'Blog', why: 'Landscape view of robotics ecosystem — know your buyers\' ecosystem', url: 'https://a16z.com/2024/01/robotics-market-map/' },
    ],
    milestones: [
      { month: 1, description: 'Complete 10 discovery calls with robotics buyers', indicator: 'Log 10 calls, identify top 3 pain themes across AMR/cobot/logistics segments', status: 'pending' },
      { month: 2, description: 'Deliver a compelling technical demo that converts', indicator: 'Run 5 demos using scripted flow, get at least 2 to next stage', status: 'pending' },
      { month: 3, description: 'Close first pilot deal or LOI', indicator: 'Signed pilot agreement or letter of intent from one target account', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS[3],
    goal: 'Elevate communication to executive level — clear, structured, confident in written and spoken form across technical and business audiences.',
    curriculum: [
      {
        month: 1,
        label: 'Structure & Clarity',
        items: [
          { week: 'Week 1', topic: 'Pyramid Principle: SCQA & top-down logic', resource: 'The Pyramid Principle (Minto) + McKinsey communication frameworks', status: 'todo' },
          { week: 'Week 2', topic: 'Executive presence: voice, stance, eye contact', resource: 'Executive Presence (Hewlett) + TED Talk coaching analysis', status: 'todo' },
          { week: 'Week 3', topic: 'Technical storytelling for non-technical audience', resource: 'Made to Stick + Feynman Technique practice sessions', status: 'todo' },
          { week: 'Week 4', topic: 'Written communication: emails & docs', resource: 'On Writing Well (Zinsser) + Stripe\'s writing culture doc', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Presentation & Influence',
        items: [
          { week: 'Week 5', topic: 'Presentation design & slide craft', resource: 'Slide:ology (Duarte) + Garr Reynolds\' Presentation Zen', status: 'todo' },
          { week: 'Week 6', topic: 'Handling tough questions & objections live', resource: 'Impromptu (Humes) + mock Q&A practice recordings', status: 'todo' },
          { week: 'Week 7', topic: 'Negotiation communication patterns', resource: 'Influence (Cialdini) + Harvard negotiation principles', status: 'todo' },
          { week: 'Week 8', topic: 'Cross-cultural communication', resource: 'The Culture Map (Meyer) + international meeting practices', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Leadership Communication',
        items: [
          { week: 'Week 9', topic: 'Async communication for remote teams', resource: 'GitLab handbook on async + Loom best practices', status: 'todo' },
          { week: 'Week 10', topic: 'Crisis communication & difficult conversations', resource: 'Crucial Conversations + HBR crisis communication cases', status: 'todo' },
          { week: 'Week 11', topic: 'Public speaking & conference talks', resource: 'TED Masterclass + practice at local meetup', status: 'todo' },
          { week: 'Week 12', topic: 'Personal brand & thought leadership', resource: 'LinkedIn strategy, technical blog posts, Twitter/X presence', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'The Pyramid Principle', type: 'Book', why: 'Barbara Minto\'s framework for top-down structured communication — used at McKinsey worldwide', url: 'https://www.amazon.com/Pyramid-Principle-Logic-Writing-Thinking/dp/0273659030' },
      { title: 'Made to Stick', type: 'Book', why: 'Why some ideas survive and others die — the SUCCESs framework for memorable messages', url: 'https://www.amazon.com/Made-Stick-Ideas-Survive-Others/dp/1400064287' },
      { title: 'On Writing Well', type: 'Book', why: 'Zinsser\'s guide to clear, precise non-fiction writing — eliminates clutter', url: 'https://www.amazon.com/Writing-Well-Classic-Guide-Nonfiction/dp/0060891548' },
      { title: 'Crucial Conversations', type: 'Book', why: 'Tools for talking when stakes are high — essential for technical leadership', url: 'https://www.amazon.com/Crucial-Conversations-Talking-Stakes-Second/dp/1469266822' },
      { title: 'The Culture Map', type: 'Book', why: 'Erin Meyer on cross-cultural communication — critical for global enterprise sales', url: 'https://www.amazon.com/Culture-Map-Breaking-Invisible-Boundaries/dp/1610392507' },
      { title: 'Slide:ology', type: 'Book', why: 'Nancy Duarte on visual storytelling and slide design — transforms decks from text dumps to narratives', url: 'https://www.amazon.com/slide-ology-Science-Creating-Presentations/dp/0596522347' },
      { title: 'TED Masterclass', type: 'Course', why: 'Learn from the best speakers — analyze structure, pacing, and delivery', url: 'https://www.ted.com/masterclass' },
    ],
    milestones: [
      { month: 1, description: 'Apply Pyramid Principle to all written communication', indicator: 'Every email and doc starts with conclusion first — no exceptions', status: 'pending' },
      { month: 2, description: 'Record and review 5 presentations with self-critique', indicator: 'Score each on clarity, pacing, handling of Q&A — track improvement', status: 'pending' },
      { month: 3, description: 'Speak at a meetup or record a technical talk', indicator: 'Published video or meetup presentation on an LLM/robotics topic', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS[4],
    goal: 'Develop a commanding, resonant voice with clear articulation and natural authority — projecting confidence in all speaking contexts.',
    curriculum: [
      {
        month: 1,
        label: 'Foundation Techniques',
        items: [
          { week: 'Week 1', topic: 'Diaphragmatic breathing & breath support', resource: 'Roger Love\'s voice training + breathing exercises (15 min/day)', status: 'todo' },
          { week: 'Week 2', topic: 'Resonance & vocal placement', resource: 'Patsy Rodenburg\'s voice work + chest vs head resonance drills', status: 'todo' },
          { week: 'Week 3', topic: 'Pacing, pausing & silence as power tool', resource: 'Julian Treasure\'s TED talk + pause practice recordings', status: 'todo' },
          { week: 'Week 4', topic: 'Articulation & clarity drills', resource: 'Tongue twisters, minimal pairs, recording feedback loop', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Expression & Authority',
        items: [
          { week: 'Week 5', topic: 'Vocal variety: pitch & tone modulation', resource: 'Voice coach exercises + analyze speeches of great speakers', status: 'todo' },
          { week: 'Week 6', topic: 'Recording & self-assessment practice', resource: 'Record all calls this month, weekly review with scoring rubric', status: 'todo' },
          { week: 'Week 7', topic: 'Authority & command projection techniques', resource: 'Presence (Cuddy) + power pose research + voice exercises', status: 'todo' },
          { week: 'Week 8', topic: 'Storytelling with voice: narrative arc', resource: 'Story (McKee) applied to technical talks + podcast analysis', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'High-Stakes Performance',
        items: [
          { week: 'Week 9', topic: 'Interview & podcast voice presence', resource: 'Mock podcast recordings + feedback from trusted peers', status: 'todo' },
          { week: 'Week 10', topic: 'High-stakes speaking: board & investor pitches', resource: 'Pitch practice recordings + investor presentation frameworks', status: 'todo' },
          { week: 'Week 11', topic: 'Improv & spontaneity exercises', resource: 'Improv comedy techniques applied to business + Yes And exercises', status: 'todo' },
          { week: 'Week 12', topic: 'Integration: full performance synthesis', resource: 'Full mock presentation with video review + external coach session', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Set Your Voice Free (Roger Love)', type: 'Book', why: 'Hollywood voice coach — practical exercises for richness, resonance, and range', url: 'https://www.amazon.com/Set-Your-Voice-Free-Communicate/dp/0316545074' },
      { title: 'Julian Treasure: How to Speak so People Want to Listen', type: 'Video', why: 'The most-watched TED talk on speaking — HAIL framework (Honesty, Authenticity, Integrity, Love)', url: 'https://www.ted.com/talks/julian_treasure_how_to_speak_so_that_people_want_to_listen' },
      { title: 'Presence (Amy Cuddy)', type: 'Book', why: 'Science-backed approach to projecting confidence — body-mind feedback loop', url: 'https://www.amazon.com/Presence-Bringing-Boldest-Biggest-Challenges/dp/1478930152' },
      { title: 'The Voice Book (Kate DeVore)', type: 'Book', why: 'Comprehensive voice technique — used by professional voice actors and speakers' },
      { title: 'Patsy Rodenburg: Why I Do Theatre', type: 'Video', why: 'RSC voice coach on presence and authentic communication', url: 'https://www.youtube.com/watch?v=ZA1TEJvPPl4' },
      { title: 'Orai Speaking App', type: 'Tool', why: 'AI-powered speech analysis — filler words, pace, energy scoring', url: 'https://www.orai.com/' },
      { title: 'Speeko App', type: 'Tool', why: 'Structured public speaking exercises with daily practice modules', url: 'https://speeko.co/' },
    ],
    milestones: [
      { month: 1, description: 'Eliminate filler words (um, uh, like) from recorded speech', indicator: 'Review 10 recorded sessions — filler rate drops below 3 per minute', status: 'pending' },
      { month: 2, description: 'Project authority and warmth simultaneously in mock presentations', indicator: 'Blind rating from 3 peers scores ≥ 8/10 on "would trust this person"', status: 'pending' },
      { month: 3, description: 'Record a 10-minute technical talk with professional quality', indicator: 'Published recording with clear structure, engaging delivery, zero filler', status: 'pending' },
    ],
  },
  // ── CTO Leadership Pillars ─────────────────────────────────────────────────
  {
    pillar: PILLARS.find((p) => p.id === 'fundraising')!,
    goal: 'Master venture mechanics, investor communication, and the technical narrative required to raise pre-seed through Series A with confidence.',
    curriculum: [
      {
        month: 1,
        label: 'Venture Fundamentals',
        items: [
          { week: 'Week 1', topic: 'How VCs work: fund structure, LP/GP, carried interest', resource: 'Secrets of Sand Hill Road (Kupor) Ch. 1–5 + a16z podcast on VC economics', status: 'todo' },
          { week: 'Week 2', topic: 'Pre-seed instruments: SAFEs, convertible notes, YC terms', resource: 'YC SAFE explainer + Clerky SAFE guide + cap table simulation in Excel', status: 'todo' },
          { week: 'Week 3', topic: 'Cap table management and dilution modeling', resource: 'Carta cap table 101 + AngelList dilution calculator + model own cap table', status: 'todo' },
          { week: 'Week 4', topic: 'What deeptech investors care about: team, tech, timing', resource: 'Lux Capital thesis + a16z Bio Fund criteria + CDL program playbook', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Pitching & Due Diligence',
        items: [
          { week: 'Week 5', topic: 'Pitch deck structure for pre-seed AI/robotics', resource: 'Sequoia pitch template + Docsend data on what investors read + 5 deeptech decks', status: 'todo' },
          { week: 'Week 6', topic: 'Technical due diligence: what investors examine', resource: 'OpenVC DD checklist + Notion VC technical DD framework + prepare Augmentifai DD pack', status: 'todo' },
          { week: 'Week 7', topic: 'Investor Q&A and objection handling for deeptech', resource: 'YC How to Talk to Investors + mock pitch recording + 30 common investor questions', status: 'todo' },
          { week: 'Week 8', topic: 'CDL milestone-based funding and cohort dynamics', resource: 'CDL process documentation + founder alumni interviews + CDL pitch rehearsal', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Closing & Beyond',
        items: [
          { week: 'Week 9', topic: 'Term sheet negotiation: valuation, pro-rata, board seats', resource: 'Venture Deals (Feld & Mendelson) + NVCA model term sheet + negotiation practice', status: 'todo' },
          { week: 'Week 10', topic: 'Strategic vs. financial investors — timing and trade-offs', resource: 'Corporate VC strategies + strategic round case studies (Waymo, Cruise) + own analysis', status: 'todo' },
          { week: 'Week 11', topic: 'Series A readiness: metrics, ARR milestones, narratives', resource: 'Bessemer Atlas SaaS metrics + First Round Series A checklist + Augmentifai model', status: 'todo' },
          { week: 'Week 12', topic: 'Building investor relationships before you need money', resource: 'Investor update templates + building VC CRM + monthly update writing practice', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Secrets of Sand Hill Road', type: 'Book', why: 'Best plain-English explainer of VC mechanics by a16z partner Scott Kupor', url: 'https://www.amazon.com/Secrets-Sand-Hill-Road-Venture/dp/059308358X' },
      { title: 'Venture Deals (Feld & Mendelson)', type: 'Book', why: 'The definitive guide to term sheets — read before any negotiation', url: 'https://www.amazon.com/Venture-Deals-Smarter-Lawyer-Capitalist/dp/1119594820' },
      { title: 'YC Startup School: Fundraising', type: 'Course', why: 'Free, practical, and current — covers SAFEs, valuation, and pitch strategy', url: 'https://www.startupschool.org/' },
      { title: 'Docsend Pitch Deck Teardowns', type: 'Blog', why: 'Data-driven analysis of what investors actually read in decks', url: 'https://docsend.com/blog/pitch-deck/' },
      { title: 'OpenVC Investor Database', type: 'Tool', why: 'Free database of 7,000+ VCs with thesis, check size, and contact info', url: 'https://openvc.app/' },
      { title: 'Carta Cap Table Education', type: 'Course', why: 'Clear explanations of dilution, option pools, and waterfall analysis', url: 'https://carta.com/learn/' },
      { title: 'Bessemer Venture Compass', type: 'Blog', why: 'Deep SaaS metrics benchmarks — know where you stand before Series A', url: 'https://www.bvp.com/atlas' },
    ],
    milestones: [
      { month: 1, description: 'Model Augmentifai\'s full cap table through Series A', indicator: 'Built working cap table with dilution scenarios for 3 funding rounds', status: 'pending' },
      { month: 2, description: 'Deliver a crisp 10-minute investor pitch without notes', indicator: 'Record and review pitch — score ≥ 8/10 on problem clarity and tech defensibility', status: 'pending' },
      { month: 3, description: 'Send first investor update to 5 target VCs', indicator: 'Written update sent, at least 2 responses engaging with content', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS.find((p) => p.id === 'roadmap')!,
    goal: 'Build the judgment to make clear build-vs-buy, platform-vs-feature, and prioritization decisions — and communicate them persuasively to engineers, investors, and customers.',
    curriculum: [
      {
        month: 1,
        label: 'Strategy Frameworks',
        items: [
          { week: 'Week 1', topic: 'Technical strategy vs. product strategy — the CTO\'s domain', resource: 'Will Larson\'s Staff Engineer + Camille Fournier on CTO roles + Reforge technical strategy', status: 'todo' },
          { week: 'Week 2', topic: 'Prioritization: RICE, ICE, Now/Next/Later', resource: 'Productboard RICE guide + Intercom on prioritization + build own Augmentifai RICE model', status: 'todo' },
          { week: 'Week 3', topic: 'Technical debt accounting and payoff modeling', resource: 'Martin Fowler technical debt quadrant + "A Philosophy of Software Design" Ch. 1–5', status: 'todo' },
          { week: 'Week 4', topic: 'Build vs. buy vs. partner decision framework', resource: 'Andreessen on software + ThoughtWorks build-vs-buy template + 5 real Augmentifai decisions', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Communication & Execution',
        items: [
          { week: 'Week 5', topic: 'Roadmap communication: investors, engineers, customers', resource: 'Janna Bastow\'s roadmap talk + roadmap templates for 3 audiences (build all 3)', status: 'todo' },
          { week: 'Week 6', topic: 'OKRs for engineering: setting, cascading, reviewing', resource: 'Measure What Matters (Doerr) + Google OKR guide + Augmentifai Q3 OKR draft', status: 'todo' },
          { week: 'Week 7', topic: 'Dependency mapping and critical path analysis', resource: 'PERT/CPM methods + Linear dependency tracking + Augmentifai critical path exercise', status: 'todo' },
          { week: 'Week 8', topic: 'Feature flags, staged rollouts, and risk management', resource: 'LaunchDarkly feature flag guide + progressive delivery patterns + incident post-mortems', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Platform Thinking',
        items: [
          { week: 'Week 9', topic: 'Platform vs. feature products — when to go wide', resource: 'Platform Revolution (Parker et al.) Ch. 1–4 + a16z platform thesis + Augmentifai platform analysis', status: 'todo' },
          { week: 'Week 10', topic: 'API-first design and developer ecosystems', resource: 'Stripe API design principles + Twilio developer experience + design Augmentifai public API', status: 'todo' },
          { week: 'Week 11', topic: 'Infrastructure decisions at startup scale: right-sizing', resource: 'Increment on infrastructure + "Choose Boring Technology" (McKinley) + Augmentifai infra audit', status: 'todo' },
          { week: 'Week 12', topic: 'Technical moat vs. execution moat — building defensibility', resource: 'Hamilton Helmer\'s 7 Powers + deeptech moat analysis + Augmentifai moat map', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'An Elegant Puzzle (Will Larson)', type: 'Book', why: 'Most practical engineering leadership book — systems and processes that scale', url: 'https://www.amazon.com/Elegant-Puzzle-Systems-Engineering-Management/dp/1732265186' },
      { title: '7 Powers (Hamilton Helmer)', type: 'Book', why: 'Framework for durable competitive advantage — essential for ASRO category strategy', url: 'https://www.amazon.com/7-Powers-Foundations-Business-Strategy/dp/0998116319' },
      { title: 'Measure What Matters (Doerr)', type: 'Book', why: 'OKRs done right — the Google/Intel playbook for goal-setting', url: 'https://www.amazon.com/Measure-What-Matters-Google-Foundation/dp/0525536221' },
      { title: 'A Philosophy of Software Design (Ousterhout)', type: 'Book', why: 'Deep thinking on modularity, complexity, and technical debt — shapes architectural judgment', url: 'https://www.amazon.com/Philosophy-Software-Design-John-Ousterhout/dp/1732102201' },
      { title: 'Reforge Engineering Strategy', type: 'Course', why: 'How top engineering leaders make technical strategy decisions', url: 'https://www.reforge.com/' },
      { title: 'Martin Fowler on Technical Debt', type: 'Blog', why: 'The definitive framework for understanding and managing debt in a codebase', url: 'https://martinfowler.com/bliki/TechnicalDebt.html' },
    ],
    milestones: [
      { month: 1, description: 'Write Augmentifai\'s first explicit technical strategy document', indicator: 'One-page doc covering platform thesis, build-vs-buy decisions, and 3-month technical bets', status: 'pending' },
      { month: 2, description: 'Set and communicate engineering OKRs for the quarter', indicator: 'OKRs written, reviewed with co-founder, and communicated to any contractors/advisors', status: 'pending' },
      { month: 3, description: 'Present a 6-month technical roadmap to investors', indicator: 'Roadmap delivered in a pitch setting — investors can explain it back clearly', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS.find((p) => p.id === 'security')!,
    goal: 'Achieve working security knowledge for enterprise robotics deployments — unblocking enterprise sales and building security as a trust differentiator for Augmentifai.',
    curriculum: [
      {
        month: 1,
        label: 'Threat Modeling & ROS Security',
        items: [
          { week: 'Week 1', topic: 'Threat modeling frameworks: STRIDE and PASTA for robotics', resource: 'Microsoft STRIDE guide + PASTA methodology + threat model Augmentifai\'s Synapse Debugger', status: 'todo' },
          { week: 'Week 2', topic: 'ROS 2 security: DDS, SROS2, authentication, encryption', resource: 'ROS 2 security design docs + SROS2 tutorial + robot security case studies', status: 'todo' },
          { week: 'Week 3', topic: 'OT/IT convergence: the robotics security landscape', resource: 'Claroty OT security report + ICS-CERT advisories for robotics + fleet security architecture', status: 'todo' },
          { week: 'Week 4', topic: 'OWASP IoT Top 10 applied to autonomous systems', resource: 'OWASP IoT 2023 + embedded CVE database review + Augmentifai attack surface analysis', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Compliance Frameworks',
        items: [
          { week: 'Week 5', topic: 'SOC 2 Type II: scope, controls, and startup approach', resource: 'Vanta SOC 2 guide + Drata implementation checklist + Augmentifai SOC 2 readiness plan', status: 'todo' },
          { week: 'Week 6', topic: 'ISO 27001 basics for software companies', resource: 'BSI ISO 27001 overview + Lacework implementation guide + gap analysis template', status: 'todo' },
          { week: 'Week 7', topic: 'Functional safety standards: ISO 13849, IEC 62443, IEC 61508', resource: 'TÜV standards overview + IEC 62443 zone/conduit model + safety case template', status: 'todo' },
          { week: 'Week 8', topic: 'Data privacy for robot fleet telemetry: GDPR, CCPA, PIPEDA', resource: 'IAPP data privacy guides + fleet telemetry anonymization techniques + DPA template', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Implementation & Sales Enablement',
        items: [
          { week: 'Week 9', topic: 'Secure development lifecycle (SDL) for embedded systems', resource: 'Microsoft SDL guide + NIST SP 800-218 + Augmentifai SDL implementation plan', status: 'todo' },
          { week: 'Week 10', topic: 'Penetration testing: how to commission and use results', resource: 'OWASP testing guide + pen test RFP template + interpret a sample pen test report', status: 'todo' },
          { week: 'Week 11', topic: 'Incident response for physical AI systems', resource: 'NIST IR framework + robot incident response playbook + tabletop exercise design', status: 'todo' },
          { week: 'Week 12', topic: 'Security as a sales enabler: enterprise procurement requirements', resource: 'Enterprise InfoSec questionnaire bank + SIG lite template + security one-pager for sales', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Vanta SOC 2 Guide', type: 'Blog', why: 'The clearest startup-friendly breakdown of SOC 2 Type II — start here', url: 'https://www.vanta.com/resources/soc-2-compliance-guide' },
      { title: 'SROS2 ROS 2 Security Tutorial', type: 'Blog', why: 'Hands-on implementation of ROS 2 security — keystore, permissions, encryption', url: 'https://docs.ros.org/en/rolling/Tutorials/Advanced/Security/Introducing-ros2-security.html' },
      { title: 'IEC 62443 Industrial Cybersecurity', type: 'Course', why: 'The dominant standard for OT/ICS security — your enterprise customers will ask about this', url: 'https://www.iec.ch/iec62443' },
      { title: 'OWASP IoT Security Top 10', type: 'Blog', why: 'The 10 most critical security failures in connected devices — directly applicable to robots', url: 'https://owasp.org/www-project-internet-of-things/' },
      { title: 'Microsoft Threat Modeling Tool', type: 'Tool', why: 'Free tool for drawing system diagrams and auto-generating STRIDE threats', url: 'https://www.microsoft.com/en-us/securityengineering/sdl/threatmodeling' },
      { title: 'NIST Cybersecurity Framework', type: 'Blog', why: 'The baseline framework enterprise security teams use — know it to speak their language', url: 'https://www.nist.gov/cyberframework' },
      { title: 'Claroty State of OT/IoT Security Report', type: 'Blog', why: 'Annual report on industrial and robotics security — arm yourself with current data', url: 'https://claroty.com/resources' },
    ],
    milestones: [
      { month: 1, description: 'Complete a threat model for Augmentifai\'s Synapse Debugger', indicator: 'Documented STRIDE analysis with mitigations for the top 5 identified threats', status: 'pending' },
      { month: 2, description: 'Produce a SOC 2 readiness gap analysis for Augmentifai', indicator: 'Written gap report identifying the 10 priority controls to implement first', status: 'pending' },
      { month: 3, description: 'Complete and pass an enterprise security questionnaire', indicator: 'SIG Lite or equivalent questionnaire completed — shared with at least one pilot customer', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS.find((p) => p.id === 'hiring')!,
    goal: 'Build the judgment to hire, evaluate, onboard, and retain exceptional robotics and AI engineers — and to build an engineering culture that compounds over time.',
    curriculum: [
      {
        month: 1,
        label: 'Recruiting Foundations',
        items: [
          { week: 'Week 1', topic: 'The CTO\'s role in hiring: what to own vs. delegate', resource: 'Hiring Engineers (Michael Lopp) + First Round on founder hiring + Augmentifai hiring roadmap', status: 'todo' },
          { week: 'Week 2', topic: 'Writing job descriptions that attract top robotics/AI engineers', resource: 'Levels.fyi engineering JD analysis + Stripe/Figma JD teardowns + write 3 Augmentifai JDs', status: 'todo' },
          { week: 'Week 3', topic: 'Technical interview design beyond whiteboard coding', resource: 'Triplebyte on better interviews + take-home project design + Augmentifai interview rubric', status: 'todo' },
          { week: 'Week 4', topic: 'Evaluating robotics/ML engineers: domain-specific signals', resource: 'ROS engineer evaluation rubric + ML systems design interview guide + red flag patterns', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Compensation & Culture',
        items: [
          { week: 'Week 5', topic: 'Engineering culture in early-stage startups: principles first', resource: 'Netflix Culture Deck + Basecamp "Shape Up" + write Augmentifai engineering principles doc', status: 'todo' },
          { week: 'Week 6', topic: 'Equity compensation: ISOs, NSOs, 409A, cliff and vesting', resource: 'Holloway Guide to Equity Compensation + Carta equity education + model own option grant', status: 'todo' },
          { week: 'Week 7', topic: 'Onboarding for technical roles: 30/60/90-day frameworks', resource: 'First Round onboarding templates + GitLab onboarding handbook + design Augmentifai onboarding', status: 'todo' },
          { week: 'Week 8', topic: 'Managing senior engineers: ICs vs. managers at startup stage', resource: 'An Elegant Puzzle Ch. 4–6 + Staff Engineer (Larson) + managing senior IC patterns', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Retention & Performance',
        items: [
          { week: 'Week 9', topic: 'Performance frameworks for early-stage engineering', resource: 'Notion engineering ladders + Spotify model analysis + Augmentifai first engineering ladder', status: 'todo' },
          { week: 'Week 10', topic: 'Difficult conversations: underperformance and role changes', resource: 'Crucial Conversations (Patterson) + HBR on firing with dignity + practice scenarios', status: 'todo' },
          { week: 'Week 11', topic: 'Compensation benchmarking: pre-seed to seed stage', resource: 'Levels.fyi data + Radford survey benchmarks + Option Impact + build Augmentifai comp bands', status: 'todo' },
          { week: 'Week 12', topic: 'Building a hiring brand in the robotics/AI community', resource: 'Employer brand strategy + conference speaking for hiring + Augmentifai GitHub and blog strategy', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'An Elegant Puzzle (Will Larson)', type: 'Book', why: 'Concrete systems for engineering management — organization design, hiring, and growth', url: 'https://www.amazon.com/Elegant-Puzzle-Systems-Engineering-Management/dp/1732265186' },
      { title: 'The Holloway Guide to Equity Compensation', type: 'Book', why: 'The most comprehensive guide to startup equity — required reading before first offer letters', url: 'https://www.holloway.com/g/equity-compensation' },
      { title: 'Crucual Conversations (Patterson)', type: 'Book', why: 'How to have hard conversations at high stakes — essential for managing underperformance', url: 'https://www.amazon.com/Crucial-Conversations-Talking-Stakes-Second/dp/1469266822' },
      { title: 'Levels.fyi Compensation Data', type: 'Tool', why: 'Real compensation data for ML/robotics engineers — know the market before making offers', url: 'https://www.levels.fyi/' },
      { title: 'First Round Capital: Hiring Resources', type: 'Blog', why: 'Tactical hiring advice specifically for early-stage startups from a top VC', url: 'https://review.firstround.com/hiring' },
      { title: 'Carta Equity Education', type: 'Course', why: 'Clear explanations of 409A, option pools, and waterfall — builds financial literacy around comp', url: 'https://carta.com/learn/' },
      { title: 'GitLab Team Handbook', type: 'Blog', why: 'The most thorough engineering team handbook ever published — a template for building your own', url: 'https://handbook.gitlab.com/' },
    ],
    milestones: [
      { month: 1, description: 'Design a complete technical interview process for Augmentifai', indicator: 'Written rubric, take-home project, and debrief scorecard ready to use for first hire', status: 'pending' },
      { month: 2, description: 'Write Augmentifai\'s engineering principles document', indicator: 'One-page doc on how you build, review code, handle incidents, and make technical decisions', status: 'pending' },
      { month: 3, description: 'Complete first engineering hire with structured process', indicator: 'Hired using the designed process — conduct a retrospective on what worked', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS.find((p) => p.id === 'mlops')!,
    goal: 'Build production ML systems that are observable, reliable, and continuously improving — with specific fluency in LLMOps and edge AI deployment relevant to Augmentifai.',
    curriculum: [
      {
        month: 1,
        label: 'ML System Design',
        items: [
          { week: 'Week 1', topic: 'ML system design patterns: batch vs. real-time, offline vs. online', resource: 'Designing ML Systems (Huyen) Ch. 1–3 + Stanford CS329S slides + architecture of 3 production ML systems', status: 'todo' },
          { week: 'Week 2', topic: 'Experiment tracking and model versioning: MLflow, W&B', resource: 'MLflow docs + Weights & Biases quickstart + instrument Augmentifai\'s training runs', status: 'todo' },
          { week: 'Week 3', topic: 'CI/CD for ML: testing models, not just software', resource: 'Made With ML CI/CD guide + Evidently on ML testing + build Augmentifai ML test suite', status: 'todo' },
          { week: 'Week 4', topic: 'Feature stores: what they are and when you need one', resource: 'Feast feature store docs + Tecton vs. Feast comparison + evaluate need for Augmentifai', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Production Operations',
        items: [
          { week: 'Week 5', topic: 'Model monitoring: data drift, concept drift, model decay', resource: 'Evidently AI documentation + Arize AI drift detection guide + design Augmentifai monitoring plan', status: 'todo' },
          { week: 'Week 6', topic: 'Inference serving at scale: batching, caching, hardware selection', resource: 'vLLM docs + NVIDIA Triton serving guide + BentoML + benchmark Augmentifai\'s models', status: 'todo' },
          { week: 'Week 7', topic: 'A/B testing and shadow deployment for ML models', resource: 'Netflix A/B testing infrastructure + LinkedIn experimentation platform paper + design own shadow system', status: 'todo' },
          { week: 'Week 8', topic: 'Debugging production ML failures: systematic approach', resource: 'Chip Huyen on debugging ML + failure mode taxonomy + Augmentifai production incident retrospective', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'LLMOps & Edge AI',
        items: [
          { week: 'Week 9', topic: 'LLMOps: prompt versioning, eval, guardrails, cost management', resource: 'LangSmith LLMOps guide + Helicone cost tracking + Braintrust evals + Augmentifai LLM layer audit', status: 'todo' },
          { week: 'Week 10', topic: 'LLM evaluation pipelines: automated quality gates', resource: 'RAGAS framework + Databricks RAG evaluation + build eval pipeline for Augmentifai\'s Synapse', status: 'todo' },
          { week: 'Week 11', topic: 'Edge ML deployment: OTA updates, versioning, rollback', resource: 'AWS IoT Greengrass + NVIDIA Jetson OTA + robot fleet update strategies', status: 'todo' },
          { week: 'Week 12', topic: 'Building ML platform as an internal product', resource: 'Netflix ML platform evolution + Uber Michelangelo paper + Augmentifai internal platform roadmap', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Designing ML Systems (Chip Huyen)', type: 'Book', why: 'The definitive book on production ML — covers data, training, deployment, and monitoring end-to-end', url: 'https://www.oreilly.com/library/view/designing-machine-learning/9781098107963/' },
      { title: 'Weights & Biases (W&B)', type: 'Tool', why: 'Industry-standard experiment tracking and model registry — start using it for every training run', url: 'https://wandb.ai/' },
      { title: 'Evidently AI', type: 'Tool', why: 'Open-source ML monitoring — data drift, model quality, and bias detection', url: 'https://www.evidentlyai.com/' },
      { title: 'Made With ML (Goku Mohandas)', type: 'Course', why: 'Free end-to-end MLOps course: design, training, CI/CD, deployment, monitoring', url: 'https://madewithml.com/' },
      { title: 'LangSmith LLMOps Platform', type: 'Tool', why: 'Tracing, evaluation, and debugging for LLM applications — directly relevant to Synapse', url: 'https://www.langchain.com/langsmith' },
      { title: 'RAGAS: RAG Evaluation Framework', type: 'Tool', why: 'Automated evaluation of RAG pipelines — measure faithfulness, relevance, and correctness', url: 'https://docs.ragas.io/' },
      { title: 'Uber Michelangelo Paper', type: 'Paper', why: 'How Uber built their internal ML platform — seminal architecture reference for MLOps at scale', url: 'https://www.uber.com/blog/michelangelo-machine-learning-platform/' },
    ],
    milestones: [
      { month: 1, description: 'Instrument Augmentifai\'s model training with experiment tracking', indicator: 'All training runs logged in W&B — reproducible experiments with artifact versioning', status: 'pending' },
      { month: 2, description: 'Design and implement a model monitoring plan for production', indicator: 'Monitoring dashboard live tracking model quality, latency, and drift for at least one model', status: 'pending' },
      { month: 3, description: 'Build an automated LLM evaluation pipeline for Synapse', indicator: 'Eval pipeline runs on every code push — quality gate with pass/fail based on defined metrics', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS.find((p) => p.id === 'ip')!,
    goal: 'Understand IP strategy well enough to protect Augmentifai\'s core innovations, make defensible open-source decisions, and pass VC technical due diligence with confidence.',
    curriculum: [
      {
        month: 1,
        label: 'IP Fundamentals',
        items: [
          { week: 'Week 1', topic: 'Types of IP protection: patents, trade secrets, copyrights, trademarks', resource: 'USPTO Patent Basics + Wipo IP for Business guide + map Augmentifai\'s IP assets', status: 'todo' },
          { week: 'Week 2', topic: 'What\'s patentable in AI/ML/robotics: method vs. system claims', resource: 'Alice/Mayo framework for software patents + USPTO AI guidance + 3 robotics patent case studies', status: 'todo' },
          { week: 'Week 3', topic: 'Trade secrets as an alternative to patents: pros and cons', resource: 'UTSA trade secret law overview + Waymo v. Uber case study + Augmentifai trade secret log', status: 'todo' },
          { week: 'Week 4', topic: 'Provisional patents: cost, timing, and when to file', resource: 'USPTO provisional application guide + IP lawyer 1-hour consultation + draft Augmentifai provisional', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'IP Strategy',
        items: [
          { week: 'Week 5', topic: 'IP due diligence: what deeptech investors check', resource: 'NVCA IP DD checklist + Fenwick & West startup IP guide + prepare Augmentifai IP summary', status: 'todo' },
          { week: 'Week 6', topic: 'Freedom to operate (FTO) analysis for Augmentifai', resource: 'Google Patents search + FTO methodology + analyze top 5 competitor patent portfolios', status: 'todo' },
          { week: 'Week 7', topic: 'Open-source licensing: GPL contamination, MIT/Apache strategy', resource: 'TLDR Legal on OSS licenses + FOSSA dependency analysis + Augmentifai OSS policy doc', status: 'todo' },
          { week: 'Week 8', topic: 'Employee IP agreements: NDAs, PIIAs, prior invention carve-outs', resource: 'PIIA template analysis + Y Combinator employee agreements + Augmentifai contractor IP policy', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Building the Moat',
        items: [
          { week: 'Week 9', topic: 'Building a defensible IP portfolio on a startup budget', resource: 'Patent portfolio strategy guide + patent prosecution timeline + Augmentifai 3-year IP roadmap', status: 'todo' },
          { week: 'Week 10', topic: 'Competitive patent landscape analysis for ASRO', resource: 'Patent landscape analysis methodology + analyze Applied Intuition, Foxglove, and robotics debugging patents', status: 'todo' },
          { week: 'Week 11', topic: 'IP licensing as a potential revenue stream', resource: 'Stanford OTL licensing models + NPE landscape awareness + Augmentifai licensing opportunity analysis', status: 'todo' },
          { week: 'Week 12', topic: 'Working with IP lawyers: cost-effective approaches', resource: 'IP counsel selection criteria + fixed-fee patent structures + build IP legal budget for Augmentifai', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'USPTO Patent Basics', type: 'Blog', why: 'Official guide to the patent process — free and authoritative, start here', url: 'https://www.uspto.gov/patents/basics' },
      { title: 'WIPO IP for Business', type: 'Course', why: 'Free IP training modules specifically for startups and entrepreneurs', url: 'https://www.wipo.int/academy/en/courses/ip_business/' },
      { title: 'FOSSA Open Source License Management', type: 'Tool', why: 'Automated scanning of your codebase for license conflicts and GPL contamination', url: 'https://fossa.com/' },
      { title: 'Fenwick & West Startup IP Guide', type: 'Blog', why: 'IP guidance from a top startup law firm — practical and plain language', url: 'https://www.fenwick.com/insights/publications' },
      { title: 'Google Patents', type: 'Tool', why: 'Free patent search with semantic search — use to map the competitive landscape', url: 'https://patents.google.com/' },
      { title: 'Waymo v. Uber: Case Study', type: 'Blog', why: 'The most instructive trade secret case in AI/robotics — learn what not to do and why it matters', url: 'https://www.theverge.com/2018/2/9/16989690/waymo-uber-trial-settled' },
      { title: 'Y Combinator PIIA Template', type: 'Tool', why: 'Standard PIIA used by thousands of YC companies — the baseline employee IP agreement', url: 'https://www.ycombinator.com/documents' },
    ],
    milestones: [
      { month: 1, description: 'Complete an IP audit of Augmentifai\'s core innovations', indicator: 'Documented inventory of all potentially protectable innovations with recommended protection strategy', status: 'pending' },
      { month: 2, description: 'File or prepare a provisional patent for the RLS inference approach', indicator: 'Provisional application drafted with IP counsel — claims covering core inverse inference method', status: 'pending' },
      { month: 3, description: 'Produce an IP summary for VC due diligence', indicator: 'One-page IP summary ready: patents, trade secrets, OSS policy, employee agreements in place', status: 'pending' },
    ],
  },
  {
    pillar: PILLARS.find((p) => p.id === 'finance')!,
    goal: 'Develop financial fluency sufficient to build credible models, manage engineering budgets, engage intelligently with investors and board members, and understand the unit economics of Augmentifai\'s business.',
    curriculum: [
      {
        month: 1,
        label: 'Financial Literacy Foundations',
        items: [
          { week: 'Week 1', topic: 'Reading financial statements: P&L, balance sheet, cash flow', resource: 'Financial Intelligence for Non-Financial Managers + Khan Academy accounting + Augmentifai P&L setup', status: 'todo' },
          { week: 'Week 2', topic: 'Startup metrics: ARR, MRR, NRR, CAC, LTV, payback period', resource: 'Andreessen Horowitz SaaS metrics guide + Bessemer cloud benchmarks + build Augmentifai metrics dashboard', status: 'todo' },
          { week: 'Week 3', topic: 'Burn rate, runway, and financial modeling for pre-seed startups', resource: 'YC financial model template + Notion CFO resources + build 18-month Augmentifai financial model', status: 'todo' },
          { week: 'Week 4', topic: 'Unit economics for SaaS + professional services hybrid companies', resource: 'a16z unit economics primer + Augmentifai services vs. software margin analysis + cohort model', status: 'todo' },
        ],
      },
      {
        month: 2,
        label: 'Engineering Finance',
        items: [
          { week: 'Week 5', topic: 'Engineering budgeting: headcount planning and cost modeling', resource: 'Headcount planning templates + Lattice engineering budget guide + Augmentifai 12-month hiring plan', status: 'todo' },
          { week: 'Week 6', topic: 'Cloud cost optimization: FinOps for AI/ML workloads', resource: 'FinOps Foundation principles + AWS/GCP ML cost optimization guides + Augmentifai cloud cost audit', status: 'todo' },
          { week: 'Week 7', topic: 'Build vs. buy financial modeling: NPV and total cost of ownership', resource: 'TCO modeling framework + NPV calculation guide + model 3 Augmentifai build-vs-buy decisions', status: 'todo' },
          { week: 'Week 8', topic: 'ROI frameworks for engineering investments', resource: 'HBR on measuring tech ROI + DORA metrics for engineering value + Augmentifai tech ROI deck', status: 'todo' },
        ],
      },
      {
        month: 3,
        label: 'Strategic Finance',
        items: [
          { week: 'Week 9', topic: 'Fundraising financial models: pre-seed to seed bridge', resource: 'Seed-stage financial model template + Augmentifai investor model + sensitivity analysis', status: 'todo' },
          { week: 'Week 10', topic: 'Option pool mechanics, dilution, and waterfall analysis', resource: 'Carta waterfall analysis tool + liquidation preference modeling + Augmentifai exit scenarios', status: 'todo' },
          { week: 'Week 11', topic: 'Investor reporting: monthly updates and board materials', resource: 'First Round investor update templates + board deck structure + write Augmentifai first investor update', status: 'todo' },
          { week: 'Week 12', topic: 'Path to profitability for Physical AI companies', resource: 'Robotics SaaS gross margin benchmarks + path to profitability models + Augmentifai 3-year P&L projection', status: 'todo' },
        ],
      },
    ],
    resources: [
      { title: 'Financial Intelligence for Non-Financial Managers', type: 'Book', why: 'The best book for technical leaders learning to read financials — written for people who hate accounting', url: 'https://www.amazon.com/Financial-Intelligence-Revised-Managers-Knowing/dp/1422144119' },
      { title: 'a16z SaaS Metrics Guide', type: 'Blog', why: 'The definitive reference for startup KPIs — every metric investors will ask about is here', url: 'https://a16z.com/2015/08/21/16-metrics/' },
      { title: 'Bessemer Cloud Benchmarks (Atlas)', type: 'Blog', why: 'Annual benchmarks for cloud/SaaS companies — know how Augmentifai compares before any investor meeting', url: 'https://www.bvp.com/atlas' },
      { title: 'FinOps Foundation', type: 'Course', why: 'Framework for managing cloud costs — increasingly important as AI training and inference costs grow', url: 'https://www.finops.org/introduction/what-is-finops/' },
      { title: 'Carta Waterfall Analysis', type: 'Tool', why: 'Models exit scenarios, dilution, and option payouts — essential for understanding equity value', url: 'https://carta.com/blog/waterfall-analysis/' },
      { title: 'YC Financial Model Template', type: 'Tool', why: 'The baseline 18-month startup financial model — used by thousands of early-stage companies', url: 'https://www.ycombinator.com/resources/financial-model-template' },
      { title: 'First Round Investor Update Templates', type: 'Blog', why: 'Concrete templates for monthly investor updates — builds trust and surfaces issues early', url: 'https://review.firstround.com/investor-updates' },
    ],
    milestones: [
      { month: 1, description: 'Build Augmentifai\'s 18-month financial model', indicator: 'Model with hiring plan, cloud costs, revenue assumptions, and runway calculation complete and reviewed', status: 'pending' },
      { month: 2, description: 'Complete a cloud cost optimization audit', indicator: 'Identified and implemented at least 20% cost reduction in Augmentifai\'s cloud/AI infrastructure spend', status: 'pending' },
      { month: 3, description: 'Send first formal investor update with financial section', indicator: 'Update sent to investors/advisors with ARR, burn, runway, and key metric commentary', status: 'pending' },
    ],
  },
];
