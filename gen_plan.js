const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
        ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
        ExternalHyperlink, TableOfContents } = require('/tmp/npm-global/lib/node_modules/docx');
const fs = require('fs');

// ── Color palette ──────────────────────────────────────────────
const C = {
  navy:   "1F3864",
  blue:   "2E5FA3",
  steel:  "4A90D9",
  teal:   "0E7C86",
  gold:   "C9A84C",
  light:  "EBF3FB",
  stripe: "D6E4F5",
  white:  "FFFFFF",
  grey:   "F2F4F7",
  text:   "1A1A2E",
  mid:    "555577",
};

const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDER_THIN = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const BORDER_MED  = { style: BorderStyle.SINGLE, size: 4, color: C.blue };
const NO_BORDERS  = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE };
const THIN_BORDERS = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

// ── Helpers ────────────────────────────────────────────────────
function sp(before = 0, after = 0) { return { spacing: { before, after } }; }
function hpara(text, level, color = C.navy, before = 240, after = 80) {
  return new Paragraph({
    heading: level,
    spacing: { before, after },
    children: [new TextRun({ text, color, bold: true })]
  });
}
function body(text, color = C.text, bold = false, before = 80, after = 80) {
  return new Paragraph({
    spacing: { before, after },
    children: [new TextRun({ text, color, bold, font: "Arial", size: 22 })]
  });
}
function bodyRuns(runs, before = 80, after = 80) {
  return new Paragraph({
    spacing: { before, after },
    children: runs
  });
}
function bold(text, color = C.navy) {
  return new TextRun({ text, bold: true, color, font: "Arial", size: 22 });
}
function reg(text, color = C.text) {
  return new TextRun({ text, color, font: "Arial", size: 22 });
}
function bullet(text, color = C.text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, color, font: "Arial", size: 22 })]
  });
}
function subbullet(text, color = C.mid) {
  return new Paragraph({
    numbering: { reference: "subbullets", level: 0 },
    spacing: { before: 20, after: 20 },
    children: [new TextRun({ text, color, font: "Arial", size: 20 })]
  });
}
function divider(color = C.blue) {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } },
    children: []
  });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}
function gap(before = 120) {
  return new Paragraph({ spacing: { before, after: 0 }, children: [new TextRun("")] });
}

// ── Banner paragraph (colored block) ──────────────────────────
function bannerPara(text, bgColor = C.navy, textColor = C.white, size = 28) {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    shading: { fill: bgColor, type: ShadingType.CLEAR },
    children: [new TextRun({ text, color: textColor, bold: true, font: "Arial", size })]
  });
}

// ── Simple 2-col table row ─────────────────────────────────────
function twoColRow(label, value, labelBg = C.light, labelColor = C.navy) {
  const cellOpts = (text, bg, color, w) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: THIN_BORDERS,
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 160, right: 160 },
    children: [new Paragraph({ children: [new TextRun({ text, color, font: "Arial", size: 20, bold: bg !== C.white })] })]
  });
  return new TableRow({ children: [cellOpts(label, labelBg, labelColor, 2520), cellOpts(value, C.white, C.text, 6840)] });
}

// ── Pillar header bar ──────────────────────────────────────────
function pillarHeader(emoji, title, tagline, color) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({ children: [new TableCell({
        width: { size: 9360, type: WidthType.DXA },
        borders: NO_BORDERS,
        shading: { fill: color, type: ShadingType.CLEAR },
        margins: { top: 160, bottom: 160, left: 240, right: 240 },
        children: [
          new Paragraph({ children: [new TextRun({ text: `${emoji}  ${title}`, color: C.white, bold: true, font: "Arial", size: 32 })] }),
          new Paragraph({ children: [new TextRun({ text: tagline, color: "E8E8E8", font: "Arial", size: 20 })] }),
        ]
      })] })
    ]
  });
}

// ── Month card table ───────────────────────────────────────────
function monthCard(month, theme, weeks) {
  const headerRow = new TableRow({ children: [
    new TableCell({
      width: { size: 9360, type: WidthType.DXA },
      borders: NO_BORDERS,
      shading: { fill: C.blue, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 200, right: 200 },
      children: [new Paragraph({ children: [new TextRun({ text: `${month} — "${theme}"`, color: C.white, bold: true, font: "Arial", size: 24 })] })]
    })
  ]});
  const weekRows = weeks.map(([wk, focus], i) => new TableRow({
    children: [new TableCell({
      width: { size: 9360, type: WidthType.DXA },
      borders: THIN_BORDERS,
      shading: { fill: i % 2 === 0 ? C.white : C.grey, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 200, right: 200 },
      children: [new Paragraph({ children: [
        new TextRun({ text: `${wk}: `, bold: true, color: C.navy, font: "Arial", size: 22 }),
        new TextRun({ text: focus, color: C.text, font: "Arial", size: 22 })
      ] })]
    })]
  }));
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360], rows: [headerRow, ...weekRows] });
}

// ── Resource table ─────────────────────────────────────────────
function resourceTable(items) {
  const header = new TableRow({ children: [
    new TableCell({ width: { size: 3000, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: C.navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Resource", color: C.white, bold: true, font: "Arial", size: 20 })] })] }),
    new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: C.navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Type", color: C.white, bold: true, font: "Arial", size: 20 })] })] }),
    new TableCell({ width: { size: 4360, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: C.navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Why It Matters", color: C.white, bold: true, font: "Arial", size: 20 })] })] }),
  ]});
  const rows = items.map(([name, type, why], i) => new TableRow({ children: [
    new TableCell({ width: { size: 3000, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: i % 2 === 0 ? C.white : C.stripe, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: name, color: C.navy, bold: true, font: "Arial", size: 20 })] })] }),
    new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: i % 2 === 0 ? C.white : C.stripe, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: type, color: C.mid, font: "Arial", size: 20 })] })] }),
    new TableCell({ width: { size: 4360, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: i % 2 === 0 ? C.white : C.stripe, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: why, color: C.text, font: "Arial", size: 20 })] })] }),
  ]}));
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3000, 2000, 4360], rows: [header, ...rows] });
}

// ── Weekly schedule table ──────────────────────────────────────
function scheduleTable() {
  const days = [
    ["Monday",    "LLM / RLHF (45 min)",        "Technical Sales (45 min)",     "Communication drills (15 min)", "Voice practice (15 min)"],
    ["Tuesday",   "Hardware Architecture (45 min)","Technical Sales (45 min)",   "Communication drills (15 min)", "Voice practice (15 min)"],
    ["Wednesday", "LLM / RLHF (45 min)",        "Communication deep-work (45 min)", "Sales review (15 min)",    "Voice practice (15 min)"],
    ["Thursday",  "Hardware Architecture (45 min)","Technical Sales (45 min)",   "Communication drills (15 min)", "Voice practice (15 min)"],
    ["Friday",    "LLM / RLHF (45 min)",        "Technical Sales (45 min)",     "Communication drills (15 min)", "Voice practice (15 min)"],
    ["Saturday",  "Hardware Architecture (45 min)","Free / Catch-up (45 min)",  "Reading / Reflection (15 min)", "Voice practice (15 min)"],
    ["Sunday",    "Weekly review & plan (30 min)","Reflection journal (20 min)", "—",                            "Rest"],
  ];
  const cols = [1400, 2000, 2000, 1880, 2080];
  const colSum = cols.reduce((a, b) => a + b, 0);
  const header = new TableRow({ children: ["Day", "Block 1", "Block 2", "Block 3", "Block 4 (Daily)"].map((h, i) =>
      new TableCell({ width: { size: cols[i], type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: C.navy, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: h, color: C.white, bold: true, font: "Arial", size: 18 })] })] })
  )});
  const rows = days.map(([day, b1, b2, b3, b4], ri) => new TableRow({ children: [day, b1, b2, b3, b4].map((cell, ci) => new TableCell({
      width: { size: cols[ci], type: WidthType.DXA },
      borders: THIN_BORDERS,
      shading: { fill: ri % 2 === 0 ? C.white : C.grey, type: ShadingType.CLEAR },
      margins: { top: 70, bottom: 70, left: 100, right: 100 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, color: ci === 0 ? C.navy : C.text, bold: ci === 0, font: "Arial", size: 18 })] })]
    }))
  }));
  return new Table({ width: { size: colSum, type: WidthType.DXA }, columnWidths: cols, rows: [header, ...rows] });
}

// ── Milestone table ────────────────────────────────────────────
function milestoneTable(rows) {
  const colWidths = [1200, 4360, 3800];
  const header = new TableRow({ children: ["Month", "Milestone", "Success Indicator"].map((h, i) =>
      new TableCell({ width: { size: colWidths[i], type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: h, color: C.white, bold: true, font: "Arial", size: 20 })] })] })
  )});
  const dataRows = rows.map(([m, milestone, indicator], ri) => new TableRow({ children: [m, milestone, indicator].map((cell, ci) => new TableCell({
      width: { size: colWidths[ci], type: WidthType.DXA },
      borders: THIN_BORDERS,
      shading: { fill: ri % 2 === 0 ? C.white : C.grey, type: ShadingType.CLEAR },
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, color: ci === 0 ? C.teal : C.text, bold: ci === 0, font: "Arial", size: 20 })] })]
    }))
  }));
  return new Table({ width: { size: colWidths.reduce((a,b)=>a+b,0), type: WidthType.DXA }, columnWidths: colWidths, rows: [header, ...dataRows] });
}

// ══════════════════════════════════════════════════════════════
//  BUILD DOCUMENT
// ══════════════════════════════════════════════════════════════

const children = [];

// ── COVER ──────────────────────────────────────────────────────
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [9360],
  rows: [new TableRow({ children: [new TableCell({
    width: { size: 9360, type: WidthType.DXA },
    borders: NO_BORDERS,
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 400, bottom: 400, left: 400, right: 400 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PERSONAL GROWTH SPRINT", color: C.gold, bold: true, font: "Arial", size: 52 })] }),
      new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "3-Month Intensive Improvement Plan", color: "D0D8E8", font: "Arial", size: 28 })] }),
      new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Saimir Baci  ·  June – August 2026", color: "A8BAD0", font: "Arial", size: 24 })] }),
    ]
  })] })]
}));

children.push(gap(240));

// Cover pillars summary
const pillars = [
  ["🧠", "LLM Architectures & RLHF", C.blue],
  ["⚡", "Inference Hardware", C.teal],
  ["🤝", "Technical Sales (Robotics)", C.gold],
  ["🗣️", "Communication Skills", "7B3F8E"],
  ["🎙️", "Voice & Command", "B54A00"],
];
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: Array(5).fill(1872),
  rows: [new TableRow({ children: pillars.map(([icon, title, color]) =>
    new TableCell({
      width: { size: 1872, type: WidthType.DXA },
      borders: NO_BORDERS,
      shading: { fill: color, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 80, right: 80 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: icon, font: "Arial", size: 32 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, color: C.white, bold: true, font: "Arial", size: 16 })] }),
      ]
    })
  )})]
}));

children.push(pageBreak());

// ── SECTION 1: OVERVIEW ────────────────────────────────────────
children.push(hpara("1. OVERVIEW & PHILOSOPHY", HeadingLevel.HEADING_1, C.navy, 0, 120));
children.push(divider());
children.push(body("This 90-day plan is a structured, disciplined sprint across five high-leverage skill pillars. The commitment is 2–3 focused hours per day, six days a week, with Sundays reserved for review and reflection. Each pillar has dedicated time blocks, curated resources, weekly milestones, and a monthly theme to maintain momentum and direction."));
children.push(gap(80));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2520, 6840],
  rows: [
    twoColRow("Duration", "12 weeks · June 1 – August 31, 2026"),
    twoColRow("Daily Commitment", "2–3 hours (120–180 min), 6 days/week"),
    twoColRow("Weekly Review", "Every Sunday — 30-min reflection + plan next week"),
    twoColRow("Tracking", "Companion Excel tracker (daily log, checklists, metrics)"),
    twoColRow("Monthly Reviews", "End of each month: score progress, adjust next month"),
  ]
}));
children.push(gap(120));

children.push(hpara("Core Principles", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(bullet("Deliberate practice over passive consumption — every session has a clear output or exercise."));
children.push(bullet("Spaced repetition — topics cycle through the week, not once and done."));
children.push(bullet("Measure what matters — track time, not just intention; log completion, not just effort."));
children.push(bullet("Prototype and apply — each pillar has applied exercises, not just theory."));
children.push(bullet("Compound consistency — two hours daily for 90 days beats weekend marathons."));

children.push(pageBreak());

// ── SECTION 2: DAILY SCHEDULE ──────────────────────────────────
children.push(hpara("2. WEEKLY SCHEDULE TEMPLATE", HeadingLevel.HEADING_1, C.navy, 0, 120));
children.push(divider());
children.push(body("Time blocks are designed to pair complementary skills and maintain cognitive variety. Technical deep-work (LLM + Hardware) anchors Blocks 1; applied skill-building (Sales + Communication) fills Block 2; Voice practice is a short daily non-negotiable."));
children.push(gap(120));
children.push(scheduleTable());
children.push(gap(80));
children.push(body("Note: Block lengths are targets. If energy is low, do 20 minutes of the highest-priority item rather than skipping entirely. Consistency beats perfection.", C.mid, false, 80, 0));

children.push(pageBreak());

// ── SECTION 3: PILLAR 1 — LLM ─────────────────────────────────
children.push(pillarHeader("🧠", "PILLAR 1: LLM Architectures & RLHF", "Deep technical understanding of modern language model internals and alignment training", C.blue));
children.push(gap(120));

children.push(hpara("Goal", HeadingLevel.HEADING_2, C.blue, 0, 60));
children.push(body("Build a solid, first-principles understanding of how large language models are designed, trained, aligned, and deployed — from Transformer mechanics to RLHF, DPO, and emerging architectures — so you can reason fluently about AI systems in technical and business contexts."));
children.push(gap(80));

children.push(hpara("3-Month Curriculum", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(monthCard("Month 1 (June)", "Foundations — How LLMs Actually Work", [
  ["Week 1", "Transformer architecture: attention mechanism, multi-head attention, positional encoding, feed-forward layers"],
  ["Week 2", "Pre-training: tokenization (BPE, SentencePiece), scaling laws, dataset construction, causal language modelling"],
  ["Week 3", "Fine-tuning paradigms: SFT, instruction tuning, parameter-efficient methods (LoRA, QLoRA, prefix tuning)"],
  ["Week 4", "RLHF deep dive: reward modelling, PPO algorithm, KL penalty, comparison to SFT-only models (InstructGPT paper)"],
]));
children.push(gap(80));
children.push(monthCard("Month 2 (July)", "Advanced Alignment & Architecture Variants", [
  ["Week 5", "Beyond PPO: DPO (Direct Preference Optimization), RLAIF, Constitutional AI (Anthropic), process reward models"],
  ["Week 6", "Architecture variants: Mixture of Experts (MoE), sparse attention, state-space models (Mamba/S4)"],
  ["Week 7", "Evaluation: MMLU, HellaSwag, benchmarking pitfalls, red-teaming, safety evaluation"],
  ["Week 8", "Retrieval-Augmented Generation (RAG): architecture, chunking strategies, reranking, hybrid search"],
]));
children.push(gap(80));
children.push(monthCard("Month 3 (August)", "Applied & Frontier", [
  ["Week 9",  "Multi-modal models: vision encoders (ViT), LLaVA, Flamingo, image-text alignment"],
  ["Week 10", "Agents & tool use: ReAct, function calling, agentic loops, memory architectures"],
  ["Week 11", "Production LLMs: quantisation (GPTQ, GGUF), speculative decoding, batching strategies"],
  ["Week 12", "Personal synthesis: write a 2-page technical brief on one frontier topic of your choice"],
]));
children.push(gap(120));

children.push(hpara("Key Resources", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(resourceTable([
  ["Andrej Karpathy — 'Neural Networks: Zero to Hero'", "YouTube series", "Best hands-on intro to backprop, GPT, tokenisation"],
  ["Attention Is All You Need (Vaswani et al., 2017)", "Paper", "The original Transformer — read with the Annotated Transformer"],
  ["InstructGPT Paper (Ouyang et al., 2022)", "Paper", "Canonical RLHF reference; read alongside the code"],
  ["Lilian Weng's Blog (lilianweng.github.io)", "Blog", "Gold-standard explanations of RLHF, RL, diffusion, etc."],
  ["DPO Paper (Rafailov et al., 2023)", "Paper", "The paper that changed alignment training — concise, important"],
  ["Sebastian Raschka — 'Build an LLM from Scratch'", "Book/Repo", "Practical coding companion through the full pipeline"],
  ["Hugging Face Course (huggingface.co/learn)", "Course", "Transformers, fine-tuning, and deployment in code"],
]));
children.push(gap(120));

children.push(hpara("Milestones", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(milestoneTable([
  ["M1", "Implement a minimal GPT (decoder-only) from scratch in PyTorch", "Can train on a small text corpus and generate coherent samples"],
  ["M2", "Implement a toy RLHF loop: SFT → reward model → PPO fine-tune", "Loss curves logged; can explain every hyper-parameter's role"],
  ["M3", "Write a 2-page technical brief comparing RLHF vs DPO vs Constitutional AI", "Could present it clearly to a technical audience in 10 min"],
]));

children.push(pageBreak());

// ── SECTION 4: PILLAR 2 — HARDWARE ────────────────────────────
children.push(pillarHeader("⚡", "PILLAR 2: Inference Hardware Architecture", "GPU, Metal/macOS, AMD, and custom silicon — understanding the iron under the LLM", C.teal));
children.push(gap(120));

children.push(hpara("Goal", HeadingLevel.HEADING_2, C.teal, 0, 60));
children.push(body("Develop a working mental model of how AI inference is executed at the hardware level — memory bandwidth, parallelism, kernel fusion — across NVIDIA GPUs, Apple Silicon (Metal/MLX), AMD ROCm, and purpose-built inference chips (Groq, Cerebras, Qualcomm)."));
children.push(gap(80));

children.push(hpara("3-Month Curriculum", HeadingLevel.HEADING_2, C.teal, 160, 80));
children.push(monthCard("Month 1 (June)", "GPU Fundamentals", [
  ["Week 1", "GPU architecture: SIMD, warps/wavefronts, SM hierarchy, shared vs global memory, memory coalescing"],
  ["Week 2", "CUDA programming model: kernels, thread blocks, grids; profile a simple matrix multiply with Nsight"],
  ["Week 3", "LLM inference bottlenecks: memory-bound vs compute-bound, KV cache, arithmetic intensity, roofline model"],
  ["Week 4", "FlashAttention (1 & 2): IO-aware algorithm, tiling, why it matters for long contexts"],
]));
children.push(gap(80));
children.push(monthCard("Month 2 (July)", "macOS Metal & AMD ROCm", [
  ["Week 5", "Apple Silicon architecture: Unified Memory, Neural Engine, GPU compute in the M-series chip"],
  ["Week 6", "Metal Performance Shaders & MLX framework: run and profile an LLM on Mac using MLX"],
  ["Week 7", "AMD ROCm: architecture differences vs CUDA, HIP programming, MI300X for inference"],
  ["Week 8", "Kernel optimisation patterns: operator fusion, quantised kernels (INT8/INT4), tiling strategies"],
]));
children.push(gap(80));
children.push(monthCard("Month 3 (August)", "Custom Silicon & Full-Stack View", [
  ["Week 9",  "Groq LPU architecture: deterministic execution, streaming, compiler-driven scheduling"],
  ["Week 10", "Cerebras & other wafer-scale / dataflow chips; Qualcomm AI 100 for edge inference"],
  ["Week 11", "Inference serving: vLLM, TensorRT-LLM, TGI — what each does at the kernel level"],
  ["Week 12", "Personal synthesis: 1-page 'hardware selection guide' for a given inference workload"],
]));
children.push(gap(120));

children.push(hpara("Key Resources", HeadingLevel.HEADING_2, C.teal, 160, 80));
children.push(resourceTable([
  ["Tim Dettmers — 'Which GPU for Deep Learning?'", "Blog series", "Practical, regularly updated GPU analysis"],
  ["GPU Mode Discord / Lecture Series", "Community", "Real engineers optimising CUDA kernels — watch the recordings"],
  ["Apple MLX Documentation & Examples", "Docs/Repo", "Official Apple framework for ML on Apple Silicon"],
  ["FlashAttention Paper (Dao et al., 2022)", "Paper", "Essential reading for understanding attention efficiency"],
  ["Roofline Model (Williams et al.)", "Paper", "Framework for reasoning about hardware-bound vs memory-bound ops"],
  ["NVIDIA CUDA Programming Guide", "Docs", "The canonical reference; read Chapters 1–5 first"],
  ["vLLM Paper & Codebase", "Paper/Code", "PagedAttention and continuous batching — state of the art serving"],
]));
children.push(gap(120));

children.push(hpara("Milestones", HeadingLevel.HEADING_2, C.teal, 160, 80));
children.push(milestoneTable([
  ["M1", "Profile a transformer forward pass on GPU; identify the top memory-bound operation", "Annotated roofline plot with explanation in plain English"],
  ["M2", "Run an LLM (e.g. Mistral 7B) locally via MLX on macOS; measure tokens/sec vs CPU baseline", "Written comparison of throughput, power, and memory use"],
  ["M3", "Produce a 1-page hardware selection guide for a robotics edge inference scenario", "Could advise a customer on chip choice with concrete trade-offs"],
]));

children.push(pageBreak());

// ── SECTION 5: PILLAR 3 — SALES ───────────────────────────────
children.push(pillarHeader("🤝", "PILLAR 3: Technical Sales (Robotics)", "Win the room, earn the deal — sell complex AI products to technical buyers", "C9762A"));
children.push(gap(120));

children.push(hpara("Goal", HeadingLevel.HEADING_2, "C9762A", 0, 60));
children.push(body("Build a repeatable, consultative sales methodology for technical AI/robotics products — from ICP definition and discovery through demo storytelling, objection handling, and pipeline management — grounded in the Augmentifai GTM context."));
children.push(gap(80));

children.push(hpara("3-Month Curriculum", HeadingLevel.HEADING_2, "C9762A", 160, 80));
children.push(monthCard("Month 1 (June)", "Sales Foundations & Methodology", [
  ["Week 1", "Sales frameworks: MEDDIC qualification, Challenger Sale model, SPIN Selling — read and summarise core concepts"],
  ["Week 2", "ICP definition: map your ideal customer (logistics AMRs, agriculture, manufacturing cobots) — pain, budget, timeline"],
  ["Week 3", "Discovery call mastery: high-value questions, active listening techniques, identifying the 'Economic Buyer'"],
  ["Week 4", "Value proposition: craft a 30-second, 2-minute, and 10-minute version for Augmentifai/Synapse Debugger"],
]));
children.push(gap(80));
children.push(monthCard("Month 2 (July)", "Robotics Domain & Demo Craft", [
  ["Week 5", "Robotics technical landscape: ROS2, fleet management systems, perception stacks, common failure modes — build your knowledge base"],
  ["Week 6", "Competitor mapping: build a battle card for top 3 competitors; practice objection responses aloud"],
  ["Week 7", "Demo storytelling: structure a 20-minute technical demo; record yourself, watch it back, iterate"],
  ["Week 8", "Proof-of-value design: structure a mini-POV — success criteria, timeline, owner, success metrics"],
]));
children.push(gap(80));
children.push(monthCard("Month 3 (August)", "Pipeline & Applied Selling", [
  ["Week 9",  "Email and outreach: write 10 personalised cold emails, 5 LinkedIn messages; critique with a partner"],
  ["Week 10", "Negotiation basics: BATNA, anchoring, concession strategy — role play 2 closing scenarios"],
  ["Week 11", "CRM discipline: build a mock pipeline in Friday PM; practice weekly deal reviews"],
  ["Week 12", "Full mock sales cycle: discovery → demo → objection → close — record the full call and review"],
]));
children.push(gap(120));

children.push(hpara("Key Resources", HeadingLevel.HEADING_2, "C9762A", 160, 80));
children.push(resourceTable([
  ["The Challenger Sale — Dixon & Adamson", "Book", "Teaches you to teach the customer; essential for complex B2B"],
  ["SPIN Selling — Neil Rackham", "Book", "Research-backed questioning framework for large deals"],
  ["MEDDIC Academy (meddic.com)", "Online course", "Qualification framework used by enterprise tech companies"],
  ["30 Minutes to President's Club (podcast)", "Podcast", "Tactical, field-tested sales techniques — 20-min episodes"],
  ["Augmentifai Sales GTM Skill", "Internal skill", "Your ICP, personas, pricing, objection playbook — use it"],
  ["ROS2 Documentation (docs.ros.org)", "Docs", "Essential robotics context to speak credibly with engineers"],
  ["Gong Revenue Intelligence Blog", "Blog", "Data-driven insights into what top reps actually do on calls"],
]));
children.push(gap(120));

children.push(hpara("Milestones", HeadingLevel.HEADING_2, "C9762A", 160, 80));
children.push(milestoneTable([
  ["M1", "Record a 5-minute 'value pitch' for Synapse Debugger — no notes", "Comfortable delivery; clearly articulates the Context Gap problem"],
  ["M2", "Run a 20-minute mock discovery call with a friendly technical person", "Uses SPIN questions; identifies pain without pitching early"],
  ["M3", "Complete a full mock sales cycle end-to-end (recorded)", "Can handle the top 5 objections with composure and evidence"],
]));

children.push(pageBreak());

// ── SECTION 6: PILLAR 4 — COMMUNICATION ───────────────────────
children.push(pillarHeader("🗣️", "PILLAR 4: Communication Skills", "Clear, concise, and compelling — in writing and in conversation", "7B3F8E"));
children.push(gap(120));

children.push(hpara("Goal", HeadingLevel.HEADING_2, "7B3F8E", 0, 60));
children.push(body("Develop the discipline to communicate complex ideas with precision and brevity. Cut filler, strengthen structure, and build the habit of leading with the conclusion — in emails, presentations, Slack messages, and live conversations."));
children.push(gap(80));

children.push(hpara("3-Month Curriculum", HeadingLevel.HEADING_2, "7B3F8E", 160, 80));
children.push(monthCard("Month 1 (June)", "Structure & Clarity", [
  ["Week 1", "The Pyramid Principle (Minto): SCQA framework — read the core chapters and apply to 3 real emails"],
  ["Week 2", "Writing audit: review your last 10 emails/messages — identify vague words, buried leads, and padding"],
  ["Week 3", "One-idea-per-sentence practice: rewrite 5 paragraphs from your own writing to be sharper"],
  ["Week 4", "Summary discipline: practice the '1-sentence summary' for every meeting, document, and idea you encounter"],
]));
children.push(gap(80));
children.push(monthCard("Month 2 (July)", "Conciseness & Precision", [
  ["Week 5", "Cut filler words: identify your personal filler list (basically, literally, sort of, just, etc.) — audit and eliminate"],
  ["Week 6", "Active voice practice: rewrite passive sentences; keep subject-verb-object order in every important statement"],
  ["Week 7", "Structured verbal communication: practice giving 3-point answers in conversation — position, reason, example"],
  ["Week 8", "Async writing excellence: master the 'smart brief' — a 5-line update that replaces a 30-minute meeting"],
]));
children.push(gap(80));
children.push(monthCard("Month 3 (August)", "Executive Communication & Feedback Loops", [
  ["Week 9",  "Executive communication: the 'BLUF' (Bottom Line Up Front) format for leadership updates"],
  ["Week 10", "Presentation structure: opening hook, 3 key points, strong close — apply to any 10-min talk"],
  ["Week 11", "Feedback loop: ask a trusted colleague to review 3 of your messages/emails each week"],
  ["Week 12", "Personal style guide: document your 10 communication rules — your own reference for clarity and impact"],
]));
children.push(gap(120));

children.push(hpara("Key Resources", HeadingLevel.HEADING_2, "7B3F8E", 160, 80));
children.push(resourceTable([
  ["The Pyramid Principle — Barbara Minto", "Book", "The definitive framework for structured thinking and writing"],
  ["On Writing Well — William Zinsser", "Book", "Timeless guide to clear non-fiction; read one chapter per week"],
  ["The Elements of Style — Strunk & White", "Book", "Short, sharp rules — read once, then keep on your desk"],
  ["'Smart Brevity' — Axios", "Book", "Modern framework for clear communication in fast-paced environments"],
  ["Hemingway App (hemingwayapp.com)", "Tool", "Paste your writing — flags passive voice, filler, complexity"],
  ["Grammarly / Claude", "Tool", "Use to audit your drafts before sending; note patterns over time"],
]));
children.push(gap(120));

children.push(hpara("Milestones", HeadingLevel.HEADING_2, "7B3F8E", 160, 80));
children.push(milestoneTable([
  ["M1", "Rewrite 5 real emails using the Pyramid Principle; compare before/after", "Each email makes the main point in the first sentence"],
  ["M2", "Receive feedback from a colleague that your messages are clearer and faster to read", "At least one unsolicited positive comment on communication quality"],
  ["M3", "Produce a 1-page 'personal communication style guide' with your own 10 rules", "Applied consistently in written and verbal communication"],
]));

children.push(pageBreak());

// ── SECTION 7: PILLAR 5 — VOICE ───────────────────────────────
children.push(pillarHeader("🎙️", "PILLAR 5: Voice & Command", "How you sound is how you're heard — build presence, power, and clarity in your voice", "B54A00"));
children.push(gap(120));

children.push(hpara("Goal", HeadingLevel.HEADING_2, "B54A00", 0, 60));
children.push(body("Develop vocal presence through daily micro-practices: control breath, articulate clearly, pace deliberately, and project confidence. This is physical training — consistency matters far more than intensity."));
children.push(gap(80));

children.push(body("Important: Voice training is a physical discipline, like fitness. 15 focused minutes daily is more effective than 2 hours once a week. Record yourself weekly — your ear calibrates to your own voice over time, and recordings reveal what you cannot hear in the moment.", C.mid, false, 0, 80));
children.push(gap(80));

children.push(hpara("Daily Practice Structure (15–20 min)", HeadingLevel.HEADING_2, "B54A00", 160, 80));
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [1440, 2800, 5120],
  rows: [
    new TableRow({ children: [
      new TableCell({ width: { size: 1440, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: "B54A00", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Time", color: C.white, bold: true, font: "Arial", size: 20 })] })] }),
      new TableCell({ width: { size: 2800, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: "B54A00", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Exercise", color: C.white, bold: true, font: "Arial", size: 20 })] })] }),
      new TableCell({ width: { size: 5120, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: "B54A00", type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Instructions", color: C.white, bold: true, font: "Arial", size: 20 })] })] }),
    ]}),
    ...[
      ["3 min", "Diaphragmatic Breathing", "Lie or sit tall. Inhale 4 counts (belly rises, not chest), hold 2, exhale 6. Feel the support."],
      ["3 min", "Lip Trills / Humming", "Hum on a comfortable note, slide pitch up and down. Warms up resonance without strain."],
      ["3 min", "Articulation Drills", "Slowly then fast: 'Red leather, yellow leather' / 'Unique New York' / 'She sells seashells'. Focus on consonant crispness."],
      ["4 min", "Paced Reading Aloud", "Read any text at 80% of your natural speed. Place deliberate pauses. Record on your phone."],
      ["3 min", "Review & Note", "Listen to yesterday's recording. Note one thing to improve. Set intention for tomorrow."],
    ].map(([time, ex, instr], ri) => new TableRow({ children: [
      new TableCell({ width: { size: 1440, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: ri % 2 === 0 ? C.white : C.grey, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: time, color: "B54A00", bold: true, font: "Arial", size: 20 })] })] }),
      new TableCell({ width: { size: 2800, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: ri % 2 === 0 ? C.white : C.grey, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: ex, color: C.navy, bold: true, font: "Arial", size: 20 })] })] }),
      new TableCell({ width: { size: 5120, type: WidthType.DXA }, borders: THIN_BORDERS, shading: { fill: ri % 2 === 0 ? C.white : C.grey, type: ShadingType.CLEAR }, margins: { top: 70, bottom: 70, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: instr, color: C.text, font: "Arial", size: 20 })] })] }),
    ]}))
  ]
}));
children.push(gap(120));

children.push(hpara("3-Month Progression", HeadingLevel.HEADING_2, "B54A00", 160, 80));
children.push(monthCard("Month 1 (June)", "Control — Breath & Resonance", [
  ["Focus", "Diaphragmatic breathing as the foundation of voice; humming and resonance placement"],
  ["Weekly goal", "Complete the daily 16-min routine every day; record once per week"],
  ["Advanced add-on", "Add 5 min of tongue-twisters at increasing speed every Friday"],
]));
children.push(gap(80));
children.push(monthCard("Month 2 (July)", "Clarity — Articulation & Pace", [
  ["Focus", "Crisp consonants, open vowels, deliberate pacing — slow down to speed up clarity"],
  ["Weekly goal", "Record a 3-min monologue on any topic, listen back, note filler words and rushing"],
  ["Advanced add-on", "Present a 5-min technical topic to yourself or a friend; ask for feedback on pace"],
]));
children.push(gap(80));
children.push(monthCard("Month 3 (August)", "Command — Projection & Tonality", [
  ["Focus", "Vocal variety (tone, pace, volume), pausing for emphasis, confident word endings"],
  ["Weekly goal", "Record the Synapse Debugger pitch — compare to Month 1 recording"],
  ["Advanced add-on", "Present in at least 2 real settings (meeting, call, event); request specific voice feedback"],
]));
children.push(gap(120));

children.push(hpara("Key Resources", HeadingLevel.HEADING_2, "B54A00", 160, 80));
children.push(resourceTable([
  ["Roger Love — 'Set Your Voice Free'", "Book / Audio", "Practical vocal training by one of Hollywood's top coaches"],
  ["Toastmasters International", "Community", "Join a local club for real-world speaking practice with feedback"],
  ["Julian Treasure — TED Talk on speaking", "Video", "7-min watch; excellent framework for HAIL (Honest, Authentic, Integrity, Love)"],
  ["Voice Memos app (daily recordings)", "Tool", "Record every session; track your own progress over 12 weeks"],
  ["Otter.ai (transcription)", "Tool", "Transcribe your recordings to spot filler words ('um', 'like', 'basically')"],
]));
children.push(gap(120));

children.push(hpara("Milestones", HeadingLevel.HEADING_2, "B54A00", 160, 80));
children.push(milestoneTable([
  ["M1", "Complete daily voice practice 5+ days/week for all of June; build the habit", "Streak documented in tracker; observable breath control improvement"],
  ["M2", "Record a 3-min pitch at end of July; compare to a baseline recording from Week 1", "Clear improvement in pace, pause, and articulation in side-by-side listen"],
  ["M3", "Deliver a live 5-min presentation and receive at least one piece of vocal feedback", "Feedback specifically mentions clarity, pace, or presence — not just content"],
]));

children.push(pageBreak());

// ── SECTION 8: SUCCESS METRICS ─────────────────────────────────
children.push(hpara("6. SUCCESS METRICS & TRACKING SYSTEM", HeadingLevel.HEADING_1, C.navy, 0, 120));
children.push(divider());
children.push(body("The companion Excel tracker is your operating system for this plan. Fill it daily — it takes 2 minutes. Weekly reviews take 20 minutes and are the single most important habit after the sessions themselves."));
children.push(gap(80));

children.push(hpara("What to Track (Daily — 2 min)", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(bullet("Hours logged per pillar (record actuals, not targets)"));
children.push(bullet("One-line note on what you learned or practised"));
children.push(bullet("Energy/focus rating for the session (1–5)"));
children.push(bullet("Voice practice completed? (Y/N)"));
children.push(gap(80));

children.push(hpara("What to Review (Weekly — 20 min)", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(bullet("Hours totalled per pillar vs target — which ran long or short and why?"));
children.push(bullet("One win from each pillar this week"));
children.push(bullet("One thing to change or improve next week"));
children.push(bullet("Curriculum checklist progress — on track for the monthly milestone?"));
children.push(gap(80));

children.push(hpara("Monthly Review (End of Month — 60 min)", HeadingLevel.HEADING_2, C.blue, 160, 80));
children.push(bullet("Score each pillar's milestone: Not Started / In Progress / Complete"));
children.push(bullet("Adjust the next month's curriculum if needed based on what landed vs what didn't"));
children.push(bullet("Record your 3 biggest insights of the month"));
children.push(bullet("Celebrate progress — note something you can do in August that you couldn't do in June"));

children.push(gap(120));
children.push(divider(C.gold));
children.push(gap(80));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '"The secret of getting ahead is getting started. The secret of getting started is breaking your complex overwhelming tasks into small manageable tasks, and then starting on the first one."', color: C.mid, font: "Arial", size: 20, italics: true })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 80 },
  children: [new TextRun({ text: "— Mark Twain", color: C.navy, font: "Arial", size: 20, bold: true })]
}));

// ══════════════════════════════════════════════════════════════
//  ASSEMBLE DOCUMENT
// ══════════════════════════════════════════════════════════════
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "subbullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: C.text } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: C.navy },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: C.blue },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.blue, space: 1 } },
        children: [
          new TextRun({ text: "Personal Growth Sprint 2026", color: C.navy, bold: true, font: "Arial", size: 18 }),
          new TextRun({ text: "   ·   Saimir Baci   ·   June – August 2026", color: C.mid, font: "Arial", size: 18 }),
        ]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.blue, space: 1 } },
        children: [
          new TextRun({ text: "Confidential | Personal Use Only", color: C.mid, font: "Arial", size: 16 }),
          new TextRun({ text: "   |   Page ", color: C.mid, font: "Arial", size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], color: C.mid, font: "Arial", size: 16 }),
        ]
      })] })
    },
    children
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/sessions/charming-confident-ride/mnt/outputs/Personal_Growth_Sprint_2026.docx", buf);
  console.log("Done: Personal_Growth_Sprint_2026.docx");
}).catch(e => { console.error(e); process.exit(1); });
