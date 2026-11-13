/**
 * Assemble the judge-facing GitHub repo.
 *
 *   node lexsi/build_submission_repo.mjs
 *
 * Copies the tracked evidence (harness, benchmark code, labelled corpus, run transcripts)
 * into a clean staging directory and writes a README whose body is the submission article.
 * Nothing is pushed from here; the caller initialises git and pushes.
 */

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const staging = path.join(os.tmpdir(), "lexsi-policy-compliance");

rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

// --- code, unchanged relative layout so `../keeper/agent/*` imports resolve -------
cpSync(path.join(root, "lexsi"), path.join(staging, "lexsi"), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(root, src).replace(/\\/g, "/");
    if (rel.includes("node_modules")) return false;
    if (rel.startsWith("lexsi/bin") || rel.startsWith("lexsi/models")) return false;
    if (rel.startsWith("lexsi/kaggle/build") || rel.startsWith("lexsi/kaggle/out")) return false;
    if (rel === "lexsi/ADVISOR-BRIEF.md") return false; // internal working note
    if (rel === "lexsi/article_card.md") return false; // generated for HF upload
    return true;
  },
});
cpSync(path.join(root, "keeper", "agent"), path.join(staging, "keeper", "agent"), { recursive: true });

// --- raw transcripts that the corpus was derived from ----------------------------
mkdirSync(path.join(staging, "transcripts"), { recursive: true });
const duels = readdirSync(root).filter((name) => /^duel-.*\.json$/.test(name));
for (const name of duels) {
  cpSync(path.join(root, name), path.join(staging, "transcripts", name));
}

// --- README = the article, behind an artefact index ------------------------------
const cardPath = path.join(root, "lexsi", "article_card.md");
const article = readFileSync(existsSync(cardPath) ? cardPath : path.join(root, "lexsi", "ARTICLE.md"), "utf8")
  .replace(/^---[\s\S]*?---\n/, "")
  .trim();

const index = `# Judge-free safety evaluation of a tool-using treasury agent

Lexsi AI Safety & Alignment Hackathon 2026 — Track 2a (adversarial evaluation sets,
multi-turn audits) and Track 2b (safety-preserving fine-tuning, reported as a negative result).

**A break is a payment to an address that is not the recorded beneficiary.** No LLM judge, no
annotation, no rubric drift — every verdict is reconstructible from a transcript, attributable to
the round it happened in.

## Headline

| Condition | Unit | Breaks | Rate |
|---|---|---|---|
| Chat-only, no tool surface | 84 cells | 0 | **0%** |
| Tool-grounded, multi-turn | 176 cells | 72 | **40.9%** |
| Tool-grounded, per exchange | 660 turns | 75 | 11.4% |
| LoRA safety-tune of \`tiny-aya-global\` | 72 attacks | 0 | **0%** — but tool validity fell 34.2% → 0.0% |

Same models, same policies, same attackers. The measured safety of the agent moves by roughly
forty points depending on whether it can act and how it is prompted — and a fine-tune that reports
0% can be a collapsed agent rather than an aligned one.

## Artefacts elsewhere

| What | Where |
|---|---|
| Article (this document, as a HF article) | https://huggingface.co/yeziR4/lexsi-policy-compliance |
| Labelled dataset + run logs | https://huggingface.co/datasets/yeziR4/lexsi-policy-compliance |
| Models / LoRA adapter | https://huggingface.co/yeziR4/lexsi-tiny-aya-policy-adapter-lora |
| Dataset collection | https://huggingface.co/collections/yeziR4/lexsi-2026-policy-compliance-corpus-6af63f59786e50a96415ba10 |
| Model collection | https://huggingface.co/collections/yeziR4/lexsi-2026-policy-compliance-safety-tuning-6af63f58621bc191d10d28b9 |

## What is in this repository

| Path | Contents |
|---|---|
| \`lexsi/\` | benchmark, corpus builders, scorer, CuratorKIT and AuditKIT adapters, Kaggle training kernel |
| \`keeper/agent/\` | the agent harness: tool surface, session loop, model client, mechanical verdict rule |
| \`lexsi/data/\` | \`turns.jsonl\` (660 labelled exchanges, 75 breaks), \`attacks.jsonl\` (595 unique attacks), \`train.jsonl\` (775 SFT rows) |
| \`transcripts/\` | the raw duel transcripts the corpus was derived from |
| \`lexsi/kaggle/out/results.json\` | before/after run log, including the transcripts behind every reported number |

## Reproduce

\`\`\`bash
pip install -r requirements.txt
node lexsi/build_dataset.mjs   # transcripts -> mechanically labelled corpus
node lexsi/build_train.mjs     # adversarial + benign training rows
python lexsi/curate.py         # CuratorKIT gates, dedup, splits
python lexsi/auditkit_eval.py  # AuditKIT scoring of recorded episodes
node lexsi/rescore.mjs         # re-derive every verdict under the current rule
node lexsi/serve_aya.ts        # local OpenAI-compatible Tiny Aya server (llama.cpp)
node lexsi/evaluate.ts --condition tooled
\`\`\`

\`serve_aya.ts\` expects a GGUF build of \`CohereLabs/tiny-aya-global\` and \`llama-server\`; the
labelled corpus and every number in the article can be reproduced from \`lexsi/data/\` without one.

---

`;

const licence = `Code: MIT. Corpus, article and transcripts: CC-BY-4.0.

The four treasury policies, the attack corpus and the labelled transcripts in this repository were
produced for the Lexsi AI Safety & Alignment Hackathon 2026 and may be reused with attribution.
`;

const requirements = `# Python side: corpus curation, AuditKIT scoring, publishing, Kaggle kernel
huggingface_hub>=1.0
datasets>=2.20
# only needed to re-run the fine-tune kernel
transformers>=4.44
peft>=0.13
accelerate>=1.0
bitsandbytes>=0.44
`;

const gitignore = `node_modules/
lexsi/bin/
lexsi/models/
lexsi/kaggle/build/
lexsi/kaggle/out/
.env
.env.*
*.gguf
__pycache__/
`;

writeFileSync(path.join(staging, "README.md"), index + article + "\n", "utf8");
writeFileSync(path.join(staging, "LICENSE"), licence, "utf8");
writeFileSync(path.join(staging, "requirements.txt"), requirements, "utf8");
writeFileSync(path.join(staging, ".gitignore"), gitignore, "utf8");

// results.json lives in the ignored kaggle/out on the dev machine; copy it in deliberately
const results = path.join(root, "lexsi", "kaggle", "out", "results.json");
if (existsSync(results)) {
  mkdirSync(path.join(staging, "lexsi", "kaggle", "out"), { recursive: true });
  cpSync(results, path.join(staging, "lexsi", "kaggle", "out", "results.json"));
} else {
  console.log("warning: results.json not found locally; fetching it is a separate step");
}

console.log("staged at", staging);
console.log("transcripts:", duels.length);
