
<output>
Amelia (Developer): "Before we close, I want to do a final readiness check."

Amelia (Developer): "Epic {{epic_number}} is marked complete in sprint-status, but is it REALLY done?"

Alice (Product Owner): "What do you mean, Amelia?"

Amelia (Developer): "I mean truly production-ready, stakeholders happy, no loose ends that'll bite us later."

Amelia (Developer): "{user_name}, let's walk through this together."
</output>

<action>Explore testing and quality state through natural conversation</action>

<output>
Amelia (Developer): "{user_name}, tell me about the testing for Epic {{epic_number}}. What verification has been done?"
</output>

<action>WAIT for {user_name} to describe testing status</action>

<output>
Dana (QA Engineer): [Responds to what {user_name} shared] "I can add to that - {{additional_testing_context}}."

Dana (QA Engineer): "But honestly, {{testing_concern_if_any}}."

Amelia (Developer): "{user_name}, are you confident Epic {{epic_number}} is production-ready from a quality perspective?"
</output>

<action>WAIT for {user_name} to assess quality readiness</action>

<check if="{user_name} expresses concerns">
  <output>
Amelia (Developer): "Okay, let's capture that. What specific testing is still needed?"

Dana (QA Engineer): "I can handle {{testing_work_needed}}, estimated {{testing_hours}} hours."

Amelia (Developer): "Adding to critical path: Complete {{testing_work_needed}} before Epic {{next_epic_num}}."
</output>
<action>Add testing completion to critical path</action>
</check>

<action>Explore deployment and release status</action>

<output>
Amelia (Developer): "{user_name}, what's the deployment status for Epic {{epic_number}}? Is it live in production, scheduled for deployment, or still pending?"
</output>

<action>WAIT for {user_name} to provide deployment status</action>

<check if="not yet deployed">
  <output>
Charlie (Senior Dev): "If it's not deployed yet, we need to factor that into Epic {{next_epic_num}} timing."

Amelia (Developer): "{user_name}, when is deployment planned? Does that timing work for starting Epic {{next_epic_num}}?"
</output>

<action>WAIT for {user_name} to clarify deployment timeline</action>

<action>Add deployment milestone to critical path with agreed timeline</action>
</check>

<action>Explore stakeholder acceptance</action>

<output>
Amelia (Developer): "{user_name}, have stakeholders seen and accepted the Epic {{epic_number}} deliverables?"

Alice (Product Owner): "This is important - I've seen 'done' epics get rejected by stakeholders and force rework."

Amelia (Developer): "{user_name}, any feedback from stakeholders still pending?"
</output>

<action>WAIT for {user_name} to describe stakeholder acceptance status</action>

<check if="acceptance incomplete or feedback pending">
  <output>
Alice (Product Owner): "We should get formal acceptance before moving on. Otherwise Epic {{next_epic_num}} might get interrupted by rework."

Amelia (Developer): "{user_name}, how do you want to handle stakeholder acceptance? Should we make it a critical path item?"
</output>

<action>WAIT for {user_name} decision</action>

<action>Add stakeholder acceptance to critical path if user agrees</action>
</check>

<action>Explore technical health and stability</action>

<output>
Amelia (Developer): "{user_name}, this is a gut-check question: How does the codebase feel after Epic {{epic_number}}?"

Amelia (Developer): "Stable and maintainable? Or are there concerns lurking?"

Charlie (Senior Dev): "Be honest, {user_name}. We've all shipped epics that felt... fragile."
</output>

<action>WAIT for {user_name} to assess codebase health</action>

<check if="{user_name} expresses stability concerns">
  <output>
Charlie (Senior Dev): "Okay, let's dig into that. What's causing those concerns?"

Charlie (Senior Dev): [Helps {user_name} articulate technical concerns]

Amelia (Developer): "What would it take to address these concerns and feel confident about stability?"

Charlie (Senior Dev): "I'd say we need {{stability_work_needed}}, roughly {{stability_hours}} hours."

Amelia (Developer): "{user_name}, is addressing this stability work worth doing before Epic {{next_epic_num}}?"
</output>

<action>WAIT for {user_name} decision</action>

<action>Add stability work to preparation sprint if user agrees</action>
</check>

<action>Explore unresolved blockers</action>

<output>
Amelia (Developer): "{user_name}, are there any unresolved blockers or technical issues from Epic {{epic_number}} that we're carrying forward?"

Dana (QA Engineer): "Things that might create problems for Epic {{next_epic_num}} if we don't deal with them?"

Amelia (Developer): "Nothing is off limits here. If there's a problem, we need to know."
</output>

<action>WAIT for {user_name} to surface any blockers</action>

<check if="blockers identified">
  <output>
Amelia (Developer): "Let's capture those blockers and figure out how they affect Epic {{next_epic_num}}."

Charlie (Senior Dev): "For {{blocker_1}}, if we leave it unresolved, it'll {{impact_description_1}}."

Alice (Product Owner): "That sounds critical. We need to address that before moving forward."

Amelia (Developer): "Agreed. Adding to critical path: Resolve {{blocker_1}} before Epic {{next_epic_num}} kickoff."

Amelia (Developer): "Who owns that work?"
</output>

<action>Assign blocker resolution to appropriate agent</action>
<action>Add to critical path with priority and deadline</action>
</check>

<action>Synthesize the readiness assessment</action>

<output>
Amelia (Developer): "Okay {user_name}, let me synthesize what we just uncovered..."

**EPIC {{epic_number}} READINESS ASSESSMENT:**

Testing & Quality: {{quality_status}}
{{#if quality_concerns}}⚠️ Action needed: {{quality_action_needed}}{{/if}}

Deployment: {{deployment_status}}
{{#if deployment_pending}}⚠️ Scheduled for: {{deployment_date}}{{/if}}

Stakeholder Acceptance: {{acceptance_status}}
{{#if acceptance_incomplete}}⚠️ Action needed: {{acceptance_action_needed}}{{/if}}

Technical Health: {{stability_status}}
{{#if stability_concerns}}⚠️ Action needed: {{stability_action_needed}}{{/if}}

Unresolved Blockers: {{blocker_status}}
{{#if blockers_exist}}⚠️ Must resolve: {{blocker_list}}{{/if}}

Amelia (Developer): "{user_name}, does this assessment match your understanding?"
</output>

<action>WAIT for {user_name} to confirm or correct the assessment</action>

<output>
Amelia (Developer): "Based on this assessment, Epic {{epic_number}} is {{#if all_clear}}fully complete and we're clear to proceed{{else}}complete from a story perspective, but we have {{critical_work_count}} critical items before Epic {{next_epic_num}}{{/if}}."

Alice (Product Owner): "This level of thoroughness is why retrospectives are valuable."

Charlie (Senior Dev): "Better to catch this now than three stories into the next epic."
</output>

