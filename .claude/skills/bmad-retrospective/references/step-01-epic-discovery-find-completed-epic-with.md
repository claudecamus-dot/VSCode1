
<action>Explain to {user_name} the epic discovery process using natural dialogue</action>

<output>
Amelia (Developer): "Welcome to the retrospective, {user_name}. Let me help you identify which epic we just completed. I'll check sprint-status first, but you're the ultimate authority on what we're reviewing today."
</output>

<action>PRIORITY 1: Check {sprint_status_file} first</action>

<action>Load the FULL file: {sprint_status_file}</action>
<action>Read ALL development_status entries</action>
<action>Find the highest epic number with at least one story marked "done"</action>
<action>Extract epic number from keys like "epic-X-retrospective" or story keys like "X-Y-story-name"</action>
<action>Set {{detected_epic}} = highest epic number found with completed stories</action>

<check if="{{detected_epic}} found">
  <action>Present finding to user with context</action>

  <output>
Amelia (Developer): "Based on {sprint_status_file}, it looks like Epic {{detected_epic}} was recently completed. Is that the epic you want to review today, {user_name}?"
  </output>

<action>WAIT for {user_name} to confirm or correct</action>

  <check if="{user_name} confirms">
    <action>Set {{epic_number}} = {{detected_epic}}</action>
  </check>

  <check if="{user_name} provides different epic number">
    <action>Set {{epic_number}} = user-provided number</action>
    <output>
Amelia (Developer): "Got it, we're reviewing Epic {{epic_number}}. Let me gather that information."
    </output>
  </check>
</check>

<check if="{{detected_epic}} NOT found in sprint-status">
  <action>PRIORITY 2: Ask user directly</action>

  <output>
Amelia (Developer): "I'm having trouble detecting the completed epic from {sprint_status_file}. {user_name}, which epic number did you just complete?"
  </output>

<action>WAIT for {user_name} to provide epic number</action>
<action>Set {{epic_number}} = user-provided number</action>
</check>

<check if="{{epic_number}} still not determined">
  <action>PRIORITY 3: Fallback to stories folder</action>

<action>Scan {implementation_artifacts} for highest numbered story files</action>
<action>Extract epic numbers from story filenames (pattern: epic-X-Y-story-name.md)</action>
<action>Set {{detected_epic}} = highest epic number found</action>

  <output>
Amelia (Developer): "I found stories for Epic {{detected_epic}} in the stories folder. Is that the epic we're reviewing, {user_name}?"
  </output>

<action>WAIT for {user_name} to confirm or correct</action>
<action>Set {{epic_number}} = confirmed number</action>
</check>

<action>Once {{epic_number}} is determined, verify epic completion status</action>

<action>Find all stories for epic {{epic_number}} in {sprint_status_file}:

- Look for keys starting with "{{epic_number}}-" (e.g., "1-1-", "1-2-", etc.)
- Exclude epic key itself ("epic-{{epic_number}}")
- Exclude retrospective key ("epic-{{epic_number}}-retrospective")
  </action>

<action>Count total stories found for this epic</action>
<action>Count stories with status = "done"</action>
<action>Collect list of pending story keys (status != "done")</action>
<action>Determine if complete: true if all stories are done, false otherwise</action>

<check if="epic is not complete">
  <output>
Alice (Product Owner): "Wait, Amelia - I'm seeing that Epic {{epic_number}} isn't actually complete yet."

Amelia (Developer): "Let me check... you're right, Alice."

**Epic Status:**

- Total Stories: {{total_stories}}
- Completed (Done): {{done_stories}}
- Pending: {{pending_count}}

**Pending Stories:**
{{pending_story_list}}

Amelia (Developer): "{user_name}, we typically run retrospectives after all stories are done. What would you like to do?"

**Options:**

1. Complete remaining stories before running retrospective (recommended)
2. Continue with partial retrospective (not ideal, but possible)
3. Run sprint-planning to refresh story tracking
   </output>

<ask if="{{non_interactive}} == false">Continue with incomplete epic? (yes/no)</ask>

  <check if="user says no">
    <output>
Amelia (Developer): "Smart call, {user_name}. Let's finish those stories first and then have a proper retrospective."
    </output>
    <action>HALT</action>
  </check>

<action if="user says yes">Set {{partial_retrospective}} = true</action>
<output>
Charlie (Senior Dev): "Just so everyone knows, this partial retro might miss some important lessons from those pending stories."

Amelia (Developer): "Good point, Charlie. {user_name}, we'll document what we can now, but we may want to revisit after everything's done."
</output>
</check>

<check if="epic is complete">
  <output>
Alice (Product Owner): "Excellent! All {{done_stories}} stories are marked done."

Amelia (Developer): "Perfect. Epic {{epic_number}} is complete and ready for retrospective, {user_name}."
</output>
</check>

