
<action>Calculate previous epic number: {{prev_epic_num}} = {{epic_number}} - 1</action>

<check if="{{prev_epic_num}} >= 1">
  <action>Search for previous retrospectives using pattern: {implementation_artifacts}/epic-{{prev_epic_num}}-retro-*.md</action>

  <check if="previous retrospectives found">
    <output>
Amelia (Developer): "I found our retrospectives from Epic {{prev_epic_num}}. Let me see what we committed to back then..."
    </output>

    <action>Read the previous retrospectives</action>

    <action>Extract key elements:</action>
    - **Action items committed**: What did the team agree to improve?
    - **Lessons learned**: What insights were captured?
    - **Process improvements**: What changes were agreed upon?
    - **Technical debt flagged**: What debt was documented?
    - **Team agreements**: What commitments were made?
    - **Preparation tasks**: What was needed for this epic?

    <action>Cross-reference with current epic execution:</action>

    **Action Item Follow-Through:**
    - For each action item from Epic {{prev_epic_num}} retro, check if it was completed
    - Cross-check the action_items section in {sprint_status_file} (if present) for Epic {{prev_epic_num}} entries and their current status
    - Look for evidence in current epic's story records
    - Mark each action item: ✅ Completed, ⏳ In Progress, ❌ Not Addressed

    **Lessons Applied:**
    - For each lesson from Epic {{prev_epic_num}}, check if team applied it in Epic {{epic_number}}
    - Look for evidence in dev notes, review feedback, or outcomes
    - Document successes and missed opportunities

    **Process Improvements Effectiveness:**
    - For each process change agreed to in Epic {{prev_epic_num}}, assess if it helped
    - Did the change improve velocity, quality, or team satisfaction?
    - Should we keep, modify, or abandon the change?

    **Technical Debt Status:**
    - For each debt item from Epic {{prev_epic_num}}, check if it was addressed
    - Did unaddressed debt cause problems in Epic {{epic_number}}?
    - Did the debt grow or shrink?

    <action>Prepare "continuity insights" for the retrospective discussion</action>

    <action>Identify wins where previous lessons were applied successfully:</action>
    - Document specific examples of applied learnings
    - Note positive impact on Epic {{epic_number}} outcomes
    - Celebrate team growth and improvement

    <action>Identify missed opportunities where previous lessons were ignored:</action>
    - Document where team repeated previous mistakes
    - Note impact of not applying lessons (without blame)
    - Explore barriers that prevented application

    <output>

Amelia (Developer): "Interesting... in Epic {{prev_epic_num}}'s retro, we committed to {{action_count}} action items."

Alice (Product Owner): "How'd we do on those, Amelia?"

Amelia (Developer): "We completed {{completed_count}}, made progress on {{in_progress_count}}, but didn't address {{not_addressed_count}}."

Charlie (Senior Dev): _looking concerned_ "Which ones didn't we address?"

Amelia (Developer): "We'll discuss that in the retro. Some of them might explain challenges we had this epic."

Elena (Junior Dev): "That's... actually pretty insightful."

Amelia (Developer): "That's why we track this stuff. Pattern recognition helps us improve."
</output>

  </check>

  <check if="no previous retro found">
    <output>
Amelia (Developer): "I don't see a retrospective for Epic {{prev_epic_num}}. Either we skipped it, or this is your first retro."

Alice (Product Owner): "Probably our first one. Good time to start the habit!"
</output>
<action>Set {{first_retrospective}} = true</action>
</check>
</check>

<check if="{{prev_epic_num}} < 1">
  <output>
Amelia (Developer): "This is Epic 1, so naturally there's no previous retro to reference. We're starting fresh!"

Charlie (Senior Dev): "First epic, first retro. Let's make it count."
</output>
<action>Set {{first_retrospective}} = true</action>
</check>

