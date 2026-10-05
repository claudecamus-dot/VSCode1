
<action>Load agent roster from {agent_roster}</action>
<action>Identify which agents participated in Epic {{epic_number}} based on story records</action>
<action>Ensure key roles present: Product Owner, Developer (facilitating), Testing/QA, Architect</action>

<output>
Amelia (Developer): "Alright team, everyone's here. Let me set the stage for our retrospective."

═══════════════════════════════════════════════════════════
🔄 TEAM RETROSPECTIVE - Epic {{epic_number}}: {{epic_title}}
═══════════════════════════════════════════════════════════

Amelia (Developer): "Here's what we accomplished together."

**EPIC {{epic_number}} SUMMARY:**

Delivery Metrics:

- Completed: {{completed_stories}}/{{total_stories}} stories ({{completion_percentage}}%)
- Velocity: {{actual_points}} story points{{#if planned_points}} (planned: {{planned_points}}){{/if}}
- Duration: {{actual_sprints}} sprints{{#if planned_sprints}} (planned: {{planned_sprints}}){{/if}}
- Average velocity: {{points_per_sprint}} points/sprint

Quality and Technical:

- Blockers encountered: {{blocker_count}}
- Technical debt items: {{debt_count}}
- Test coverage: {{coverage_info}}
- Production incidents: {{incident_count}}

Business Outcomes:

- Goals achieved: {{goals_met}}/{{total_goals}}
- Success criteria: {{criteria_status}}
- Stakeholder feedback: {{feedback_summary}}

Alice (Product Owner): "Those numbers tell a good story. {{completion_percentage}}% completion is {{#if completion_percentage >= 90}}excellent{{else}}something we should discuss{{/if}}."

Charlie (Senior Dev): "I'm more interested in that technical debt number - {{debt_count}} items is {{#if debt_count > 10}}concerning{{else}}manageable{{/if}}."

Dana (QA Engineer): "{{incident_count}} production incidents - {{#if incident_count == 0}}clean epic!{{else}}we should talk about those{{/if}}."

{{#if next_epic_exists}}
═══════════════════════════════════════════════════════════
**NEXT EPIC PREVIEW:** Epic {{next_epic_num}}: {{next_epic_title}}
═══════════════════════════════════════════════════════════

Dependencies on Epic {{epic_number}}:
{{list_dependencies}}

Preparation Needed:
{{list_preparation_gaps}}

Technical Prerequisites:
{{list_technical_prereqs}}

Amelia (Developer): "And here's what's coming next. Epic {{next_epic_num}} builds on what we just finished."

Elena (Junior Dev): "Wow, that's a lot of dependencies on our work."

Charlie (Senior Dev): "Which means we better make sure Epic {{epic_number}} is actually solid before moving on."
{{/if}}

═══════════════════════════════════════════════════════════

Amelia (Developer): "Team assembled for this retrospective:"

{{list_participating_agents}}

Amelia (Developer): "{user_name}, you're joining us as Project Lead. Your perspective is crucial here."

{user_name} (Project Lead): [Participating in the retrospective]

Amelia (Developer): "Our focus today:"

1. Learning from Epic {{epic_number}} execution
   {{#if next_epic_exists}}2. Preparing for Epic {{next_epic_num}} success{{/if}}

Amelia (Developer): "Ground rules: psychological safety first. No blame, no judgment. We focus on systems and processes, not individuals. Everyone's voice matters. Specific examples are better than generalizations."

Alice (Product Owner): "And everything shared here stays in this room - unless we decide together to escalate something."

Amelia (Developer): "Exactly. {user_name}, any questions before we dive in?"
</output>

<action>WAIT for {user_name} to respond or indicate readiness</action>

