
<action>Ensure retrospectives folder exists: {implementation_artifacts}</action>
<action>Create folder if it doesn't exist</action>

<action>Generate comprehensive retrospective summary document including:</action>

- Epic summary and metrics
- Team participants
- Successes and strengths identified
- Challenges and growth areas
- Key insights and learnings
- Previous retro follow-through analysis (if applicable)
- Next epic preview and dependencies
- Action items with owners and timelines
- Preparation tasks for next epic
- Critical path items
- Significant discoveries and epic update recommendations (if any)
- Readiness assessment
- Commitments and next steps

<action>Format retrospective document as readable markdown with clear sections</action>
<action>Set filename: {implementation_artifacts}/epic-{{epic_number}}-retro-{date}.md</action>
<action>Save retrospective document</action>

<output>
✅ Retrospective document saved: {implementation_artifacts}/epic-{{epic_number}}-retro-{date}.md
</output>

<action>Update {sprint_status_file} to mark retrospective as completed</action>

<action>Load the FULL file: {sprint_status_file}</action>
<action>Find development_status key "epic-{{epic_number}}-retrospective"</action>
<action>Verify current status (typically "optional" or "pending")</action>
<action>Update development_status["epic-{{epic_number}}-retrospective"] = "done"</action>
<action>Append each Epic {{epic_number}} action item to the action_items section, creating the section after development_status if missing. One entry per item:</action>

```yaml
action_items:
  - epic: {{epic_number}}
    action: "{{action_description}}"
    owner: "{{owner}}"
    status: open
```

<action>Quote action and owner values so punctuation (e.g., "#") cannot break YAML parsing</action>

<action>Update Epic {{prev_epic_num}} action_items entries based on Step 4 follow-through: ✅ Completed → done, ⏳ In Progress → in-progress, ❌ Not Addressed → keep existing status (do not modify)</action>
<action>Update last_updated field to current date</action>
<action>Save file, preserving ALL comments and structure including STATUS DEFINITIONS</action>

<check if="update successful">
  <output>
✅ Retrospective marked as completed in {sprint_status_file}

Retrospective key: epic-{{epic_number}}-retrospective
Status: {{previous_status}} → done
Action items recorded: {{action_count}}
</output>
</check>

<check if="retrospective key not found">
  <output>
⚠️ Could not update retrospective status: epic-{{epic_number}}-retrospective not found in {sprint_status_file}

Retrospective document was saved successfully, but {sprint_status_file} may need manual update.
</output>
</check>

