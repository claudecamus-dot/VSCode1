
<action>Calculate next epic number: {{next_epic_num}} = {{epic_number}} + 1</action>

<output>
Amelia (Developer): "Before we dive into the discussion, let me take a quick look at Epic {{next_epic_num}} to understand what's coming."

Alice (Product Owner): "Good thinking - helps us connect what we learned to what we're about to do."
</output>

<action>Attempt to load next epic using selective loading strategy:</action>

**Try sharded first (more specific):**
<action>Check if file exists: {planning_artifacts}/epic*/epic-{{next_epic_num}}.md</action>

<check if="sharded epic file found">
  <action>Load {planning_artifacts}/*epic*/epic-{{next_epic_num}}.md</action>
  <action>Set {{next_epic_source}} = "sharded"</action>
</check>

**Fallback to whole document:**
<check if="sharded epic not found">
<action>Check if file exists: {planning_artifacts}/epic*.md</action>

  <check if="whole epic file found">
    <action>Load entire epics document</action>
    <action>Extract Epic {{next_epic_num}} section</action>
    <action>Set {{next_epic_source}} = "whole"</action>
  </check>
</check>

<check if="next epic found">
  <action>Analyze next epic for:</action>
  - Epic title and objectives
  - Planned stories and complexity estimates
  - Dependencies on Epic {{epic_number}} work
  - New technical requirements or capabilities needed
  - Potential risks or unknowns
  - Business goals and success criteria

<action>Identify dependencies on completed work:</action>

- What components from Epic {{epic_number}} does Epic {{next_epic_num}} rely on?
- Are all prerequisites complete and stable?
- Any incomplete work that creates blocking dependencies?

<action>Note potential gaps or preparation needed:</action>

- Technical setup required (infrastructure, tools, libraries)
- Knowledge gaps to fill (research, training, spikes)
- Refactoring needed before starting next epic
- Documentation or specifications to create

<action>Check for technical prerequisites:</action>

- APIs or integrations that must be ready
- Data migrations or schema changes needed
- Testing infrastructure requirements
- Deployment or environment setup

  <output>
Amelia (Developer): "Alright, I've reviewed Epic {{next_epic_num}}: '{{next_epic_title}}'"

Alice (Product Owner): "What are we looking at?"

Amelia (Developer): "{{next_epic_num}} stories planned, building on the {{dependency_description}} from Epic {{epic_number}}."

Charlie (Senior Dev): "Dependencies concern me. Did we finish everything we need for that?"

Amelia (Developer): "Good question - that's exactly what we need to explore in this retro."
</output>

<action>Set {{next_epic_exists}} = true</action>
</check>

<check if="next epic NOT found">
  <output>
Amelia (Developer): "Hmm, I don't see Epic {{next_epic_num}} defined yet."

Alice (Product Owner): "We might be at the end of the roadmap, or we haven't planned that far ahead yet."

Amelia (Developer): "No problem. We'll still do a thorough retro on Epic {{epic_number}}. The lessons will be valuable whenever we plan the next work."
</output>

<action>Set {{next_epic_exists}} = false</action>
</check>

