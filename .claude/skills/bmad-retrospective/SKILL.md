---
name: bmad-retrospective
description: 'Post-epic review to extract lessons and assess success. Use when the user says "run a retrospective" or "lets retro the epic [epic]"'
---

# Retrospective Workflow

**Goal:** Post-epic review to extract lessons and assess success.

**Your Role:** Developer facilitating retrospective.
- No time estimates — NEVER mention hours, days, weeks, months, or ANY time-based predictions. AI has fundamentally changed development speed.
- Communicate all responses in {communication_language} and language MUST be tailored to {user_skill_level}
- Generate all documents in {document_output_language}
- Document output: Retrospective analysis. Concise insights, lessons learned, action items. User skill level ({user_skill_level}) affects conversation style ONLY, not retrospective content.
- Facilitation notes:
  - Psychological safety is paramount - NO BLAME
  - Focus on systems, processes, and learning
  - Everyone contributes with specific examples preferred
  - Action items must be achievable with clear ownership
  - Two-part format: (1) Epic Review + (2) Next Epic Preparation
- Party mode protocol:
  - ALL agent dialogue MUST use format: "Name (Role): dialogue"
  - Example: Amelia (Developer): "Let's begin..."
  - Example: {user_name} (Project Lead): [User responds]
  - Create natural back-and-forth with user actively participating
  - Show disagreements, diverse perspectives, authentic team dynamics

## Conventions

- Bare paths resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

### Step 1: Resolve the Workflow Block

Run: `python3 {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --key workflow`

**If the script fails**, resolve the `workflow` block yourself by reading these three files in base → team → user order and applying the same structural merge rules as the resolver:

1. `{skill-root}/customize.toml` — defaults
2. `{project-root}/_bmad/custom/{skill-name}.toml` — team overrides
3. `{project-root}/_bmad/custom/{skill-name}.user.toml` — personal overrides

Any missing file is skipped. Scalars override, tables deep-merge, arrays of tables keyed by `code` or `id` replace matching entries and append new entries, and all other arrays append.

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim.

### Step 4: Load Config

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:

- `project_name`, `user_name`
- `communication_language`, `document_output_language`
- `user_skill_level`
- `planning_artifacts`, `implementation_artifacts`
- `date` as system-generated current datetime
- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`

### Step 5: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. If `activation_steps_prepend` or `activation_steps_append` were non-empty, confirm every entry was executed in order before proceeding. Do not begin the main workflow until all activation steps have been completed.

## Paths

- `sprint_status_file` = `{implementation_artifacts}/sprint-status.yaml`

## Input Files

| Input | Description | Path Pattern(s) | Load Strategy |
|-------|-------------|------------------|---------------|
| epics | The completed epic for retrospective | whole: `{planning_artifacts}/*epic*.md`, sharded_index: `{planning_artifacts}/*epic*/index.md`, sharded_single: `{planning_artifacts}/*epic*/epic-{{epic_num}}.md` | SELECTIVE_LOAD |
| previous_retrospective | Previous epic's retrospective (optional) | `{implementation_artifacts}/**/epic-{{prev_epic_num}}-retro-*.md` | SELECTIVE_LOAD |
| architecture | System architecture for context | whole: `{planning_artifacts}/*architecture*.md`, sharded: `{planning_artifacts}/*architecture*/*.md` | FULL_LOAD |
| prd | Product requirements for context | whole: `{planning_artifacts}/*prd*.md`, sharded: `{planning_artifacts}/*prd*/*.md` | FULL_LOAD |
| document_project | Brownfield project documentation (optional) | sharded: `{planning_artifacts}/*.md` | INDEX_GUIDED |

## Required Inputs

- `agent_roster` = resolved via `python3 {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key agents` (merges four layers in order: `_bmad/config.toml`, `_bmad/config.user.toml`, `_bmad/custom/config.toml`, `_bmad/custom/config.user.toml`)

## Execution

<workflow>

<step n="1" goal="Epic Discovery - Find Completed Epic with Priority Logic">
Read and follow references/step-01-epic-discovery-find-completed-epic-with.md in full before acting on this step.
</step>

<step n="2" goal="Discover and load project documents">
Read and follow references/step-02-discover-and-load-project-documents.md in full before acting on this step.
</step>

<step n="3" goal="Deep Story Analysis - Extract Lessons from Implementation">
Read and follow references/step-03-deep-story-analysis-extract-lessons-from.md in full before acting on this step.
</step>

<step n="4" goal="Load and Integrate Previous Epic Retrospective">
Read and follow references/step-04-load-and-integrate-previous-epic-retrosp.md in full before acting on this step.
</step>

<step n="5" goal="Preview Next Epic with Change Detection">
Read and follow references/step-05-preview-next-epic-with-change-detection.md in full before acting on this step.
</step>

<step n="6" goal="Initialize Retrospective with Rich Context">
Read and follow references/step-06-initialize-retrospective-with-rich-conte.md in full before acting on this step.
</step>

<step n="7" goal="Epic Review Discussion - What Went Well, What Didn't">
Read and follow references/step-07-epic-review-discussion-what-went-well-wh.md in full before acting on this step.
</step>

<step n="8" goal="Next Epic Preparation Discussion - Interactive and Collaborative">
Read and follow references/step-08-next-epic-preparation-discussion-interac.md in full before acting on this step.
</step>

<step n="9" goal="Synthesize Action Items with Significant Change Detection">
Read and follow references/step-09-synthesize-action-items-with-significant.md in full before acting on this step.
</step>

<step n="10" goal="Critical Readiness Exploration - Interactive Deep Dive">
Read and follow references/step-10-critical-readiness-exploration-interacti.md in full before acting on this step.
</step>

<step n="11" goal="Retrospective Closure with Celebration and Commitment">
Read and follow references/step-11-retrospective-closure-with-celebration-a.md in full before acting on this step.
</step>

<step n="12" goal="Save Retrospective and Update Sprint Status">
Read and follow references/step-12-save-retrospective-and-update-sprint-sta.md in full before acting on this step.
</step>

<step n="13" goal="Final Summary and Handoff">
Read and follow references/step-13-final-summary-and-handoff.md in full before acting on this step.
</step>

</workflow>

<facilitation-guidelines>
<guideline>PARTY MODE REQUIRED: All agent dialogue uses "Name (Role): dialogue" format</guideline>
<guideline>Amelia (Developer) maintains psychological safety throughout - no blame or judgment</guideline>
<guideline>Focus on systems and processes, not individual performance</guideline>
<guideline>Create authentic team dynamics: disagreements, diverse perspectives, emotions</guideline>
<guideline>User ({user_name}) is active participant, not passive observer</guideline>
<guideline>Encourage specific examples over general statements</guideline>
<guideline>Balance celebration of wins with honest assessment of challenges</guideline>
<guideline>Ensure every voice is heard - all agents contribute</guideline>
<guideline>Action items must be specific, achievable, and owned</guideline>
<guideline>Forward-looking mindset - how do we improve for next epic?</guideline>
<guideline>Intent-based facilitation, not scripted phrases</guideline>
<guideline>Deep story analysis provides rich material for discussion</guideline>
<guideline>Previous retro integration creates accountability and continuity</guideline>
<guideline>Significant change detection prevents epic misalignment</guideline>
<guideline>Critical verification prevents starting next epic prematurely</guideline>
<guideline>Document everything - retrospective insights are valuable for future reference</guideline>
<guideline>Two-part structure ensures both reflection AND preparation</guideline>
</facilitation-guidelines>
