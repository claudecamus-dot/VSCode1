
<output>
Amelia (Developer): "Let's capture concrete action items from everything we've discussed."

Amelia (Developer): "I want specific, achievable actions with clear owners. Not vague aspirations."
</output>

<action>Synthesize themes from Epic {{epic_number}} review discussion into actionable improvements</action>

<action>Create specific action items with:</action>

- Clear description of the action
- Assigned owner (specific agent or role)
- Timeline or deadline
- Success criteria (how we'll know it's done)
- Category (process, technical, documentation, team, etc.)

<action>Ensure action items are SMART:</action>

- Specific: Clear and unambiguous
- Measurable: Can verify completion
- Achievable: Realistic given constraints
- Relevant: Addresses real issues from retro
- Time-bound: Has clear deadline

<output>
Amelia (Developer): "Based on our discussion, here are the action items I'm proposing..."

═══════════════════════════════════════════════════════════
📝 EPIC {{epic_number}} ACTION ITEMS:
═══════════════════════════════════════════════════════════

**Process Improvements:**

1. {{action_item_1}}
   Owner: {{agent_1}}
   Deadline: {{timeline_1}}
   Success criteria: {{criteria_1}}

2. {{action_item_2}}
   Owner: {{agent_2}}
   Deadline: {{timeline_2}}
   Success criteria: {{criteria_2}}

Charlie (Senior Dev): "I can own action item 1, but {{timeline_1}} is tight. Can we push it to {{alternative_timeline}}?"

Amelia (Developer): "What do others think? Does that timing still work?"

Alice (Product Owner): "{{alternative_timeline}} works for me, as long as it's done before Epic {{next_epic_num}} starts."

Amelia (Developer): "Agreed. Updated to {{alternative_timeline}}."

**Technical Debt:**

1. {{debt_item_1}}
   Owner: {{agent_3}}
   Priority: {{priority_1}}
   Estimated effort: {{effort_1}}

2. {{debt_item_2}}
   Owner: {{agent_4}}
   Priority: {{priority_2}}
   Estimated effort: {{effort_2}}

Dana (QA Engineer): "For debt item 1, can we prioritize that as high? It caused testing issues in three different stories."

Charlie (Senior Dev): "I marked it medium because {{reasoning}}, but I hear your point."

Amelia (Developer): "{user_name}, this is a priority call. Testing impact vs. {{reasoning}} - how do you want to prioritize it?"
</output>

<action>WAIT for {user_name} to help resolve priority discussions</action>

<output>
**Documentation:**
1. {{doc_need_1}}
   Owner: {{agent_5}}
   Deadline: {{timeline_3}}

2. {{doc_need_2}}
   Owner: {{agent_6}}
   Deadline: {{timeline_4}}

**Team Agreements:**

- {{agreement_1}}
- {{agreement_2}}
- {{agreement_3}}

Amelia (Developer): "These agreements are how we're committing to work differently going forward."

Elena (Junior Dev): "I like agreement 2 - that would've saved me on Story {{difficult_story_num}}."

═══════════════════════════════════════════════════════════
🚀 EPIC {{next_epic_num}} PREPARATION TASKS:
═══════════════════════════════════════════════════════════

**Technical Setup:**
[ ] {{setup_task_1}}
Owner: {{owner_1}}
Estimated: {{est_1}}

[ ] {{setup_task_2}}
Owner: {{owner_2}}
Estimated: {{est_2}}

**Knowledge Development:**
[ ] {{research_task_1}}
Owner: {{owner_3}}
Estimated: {{est_3}}

**Cleanup/Refactoring:**
[ ] {{refactor_task_1}}
Owner: {{owner_4}}
Estimated: {{est_4}}

**Total Estimated Effort:** {{total_hours}} hours ({{total_days}} days)

═══════════════════════════════════════════════════════════
⚠️ CRITICAL PATH:
═══════════════════════════════════════════════════════════

**Blockers to Resolve Before Epic {{next_epic_num}}:**

1. {{critical_item_1}}
   Owner: {{critical_owner_1}}
   Must complete by: {{critical_deadline_1}}

2. {{critical_item_2}}
   Owner: {{critical_owner_2}}
   Must complete by: {{critical_deadline_2}}
   </output>

<action>CRITICAL ANALYSIS - Detect if discoveries require epic updates</action>

<action>Check if any of the following are true based on retrospective discussion:</action>

- Architectural assumptions from planning proven wrong during Epic {{epic_number}}
- Major scope changes or descoping occurred that affects next epic
- Technical approach needs fundamental change for Epic {{next_epic_num}}
- Dependencies discovered that Epic {{next_epic_num}} doesn't account for
- User needs significantly different than originally understood
- Performance/scalability concerns that affect Epic {{next_epic_num}} design
- Security or compliance issues discovered that change approach
- Integration assumptions proven incorrect
- Team capacity or skill gaps more severe than planned
- Technical debt level unsustainable without intervention

<check if="significant discoveries detected">
  <output>

═══════════════════════════════════════════════════════════
🚨 SIGNIFICANT DISCOVERY ALERT 🚨
═══════════════════════════════════════════════════════════

Amelia (Developer): "{user_name}, we need to flag something important."

Amelia (Developer): "During Epic {{epic_number}}, the team uncovered findings that may require updating the plan for Epic {{next_epic_num}}."

**Significant Changes Identified:**

1. {{significant_change_1}}
   Impact: {{impact_description_1}}

2. {{significant_change_2}}
   Impact: {{impact_description_2}}

{{#if significant_change_3}} 3. {{significant_change_3}}
Impact: {{impact_description_3}}
{{/if}}

Charlie (Senior Dev): "Yeah, when we discovered {{technical_discovery}}, it fundamentally changed our understanding of {{affected_area}}."

Alice (Product Owner): "And from a product perspective, {{product_discovery}} means Epic {{next_epic_num}}'s stories are based on wrong assumptions."

Dana (QA Engineer): "If we start Epic {{next_epic_num}} as-is, we're going to hit walls fast."

**Impact on Epic {{next_epic_num}}:**

The current plan for Epic {{next_epic_num}} assumes:

- {{wrong_assumption_1}}
- {{wrong_assumption_2}}

But Epic {{epic_number}} revealed:

- {{actual_reality_1}}
- {{actual_reality_2}}

This means Epic {{next_epic_num}} likely needs:
{{list_likely_changes_needed}}

**RECOMMENDED ACTIONS:**

1. Review and update Epic {{next_epic_num}} definition based on new learnings
2. Update affected stories in Epic {{next_epic_num}} to reflect reality
3. Consider updating architecture or technical specifications if applicable
4. Hold alignment session with Product Owner before starting Epic {{next_epic_num}}
   {{#if prd_update_needed}}5. Update PRD sections affected by new understanding{{/if}}

Amelia (Developer): "**Epic Update Required**: YES - Schedule epic planning review session"

Amelia (Developer): "{user_name}, this is significant. We need to address this before committing to Epic {{next_epic_num}}'s current plan. How do you want to handle it?"
</output>

<action>WAIT for {user_name} to decide on how to handle the significant changes</action>

<action>Add epic review session to critical path if user agrees</action>

  <output>
Alice (Product Owner): "I agree with {user_name}'s approach. Better to adjust the plan now than fail mid-epic."

Charlie (Senior Dev): "This is why retrospectives matter. We caught this before it became a disaster."

Amelia (Developer): "Adding to critical path: Epic {{next_epic_num}} planning review session before epic kickoff."
</output>
</check>

<check if="no significant discoveries">
  <output>
Amelia (Developer): "Good news - nothing from Epic {{epic_number}} fundamentally changes our plan for Epic {{next_epic_num}}. The plan is still sound."

Alice (Product Owner): "We learned a lot, but the direction is right."
</output>
</check>

<output>
Amelia (Developer): "Let me show you the complete action plan..."

Amelia (Developer): "That's {{total_action_count}} action items, {{prep_task_count}} preparation tasks, and {{critical_count}} critical path items."

Amelia (Developer): "Everyone clear on what they own?"
</output>

<action>Give each agent with assignments a moment to acknowledge their ownership</action>

<action>Ensure {user_name} approves the complete action plan</action>

