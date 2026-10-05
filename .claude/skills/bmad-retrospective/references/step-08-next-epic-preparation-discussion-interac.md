
<check if="{{next_epic_exists}} == false">
  <output>
Amelia (Developer): "Normally we'd discuss preparing for the next epic, but since Epic {{next_epic_num}} isn't defined yet, let's skip to action items."
  </output>
  <action>Skip to Step 9</action>
</check>

<output>
Amelia (Developer): "Now let's shift gears. Epic {{next_epic_num}} is coming up: '{{next_epic_title}}'"

Amelia (Developer): "The question is: are we ready? What do we need to prepare?"

Alice (Product Owner): "From my perspective, we need to make sure {{dependency_concern_1}} from Epic {{epic_number}} is solid before we start building on it."

Charlie (Senior Dev): _concerned_ "I'm worried about {{technical_concern_1}}. We have {{technical_debt_item}} from this epic that'll blow up if we don't address it before Epic {{next_epic_num}}."

Dana (QA Engineer): "And I need {{testing_infrastructure_need}} in place, or we're going to have the same testing bottleneck we had in Story {{bottleneck_story_num}}."

Elena (Junior Dev): "I'm less worried about infrastructure and more about knowledge. I don't understand {{knowledge_gap}} well enough to work on Epic {{next_epic_num}}'s stories."

Amelia (Developer): "{user_name}, the team is surfacing some real concerns here. What's your sense of our readiness?"
</output>

<action>WAIT for {user_name} to share their assessment</action>

<action>Use {user_name}'s input to guide deeper exploration of preparation needs</action>

<output>
Alice (Product Owner): [Reacts to what {user_name} said] "I agree with {user_name} about {{point_of_agreement}}, but I'm still worried about {{lingering_concern}}."

Charlie (Senior Dev): "Here's what I think we need technically before Epic {{next_epic_num}} can start..."

Charlie (Senior Dev): "1. {{tech_prep_item_1}} - estimated {{hours_1}} hours"
Charlie (Senior Dev): "2. {{tech_prep_item_2}} - estimated {{hours_2}} hours"
Charlie (Senior Dev): "3. {{tech_prep_item_3}} - estimated {{hours_3}} hours"

Elena (Junior Dev): "That's like {{total_hours}} hours! That's a full sprint of prep work!"

Charlie (Senior Dev): "Exactly. We can't just jump into Epic {{next_epic_num}} on Monday."

Alice (Product Owner): _frustrated_ "But we have stakeholder pressure to keep shipping features. They're not going to be happy about a 'prep sprint.'"

Amelia (Developer): "Let's think about this differently. What happens if we DON'T do this prep work?"

Dana (QA Engineer): "We'll hit blockers in the middle of Epic {{next_epic_num}}, velocity will tank, and we'll ship late anyway."

Charlie (Senior Dev): "Worse - we'll ship something built on top of {{technical_concern_1}}, and it'll be fragile."

Amelia (Developer): "{user_name}, you're balancing stakeholder pressure against technical reality. How do you want to handle this?"
</output>

<action>WAIT for {user_name} to provide direction on preparation approach</action>

<action>Create space for debate and disagreement about priorities</action>

<output>
Alice (Product Owner): [Potentially disagrees with {user_name}'s approach] "I hear what you're saying, {user_name}, but from a business perspective, {{business_concern}}."

Charlie (Senior Dev): [Potentially supports or challenges Alice's point] "The business perspective is valid, but {{technical_counter_argument}}."

Amelia (Developer): "We have healthy tension here between business needs and technical reality. That's good - it means we're being honest."

Amelia (Developer): "Let's explore a middle ground. Charlie, which of your prep items are absolutely critical vs. nice-to-have?"

Charlie (Senior Dev): "{{critical_prep_item_1}} and {{critical_prep_item_2}} are non-negotiable. {{nice_to_have_prep_item}} can wait."

Alice (Product Owner): "And can any of the critical prep happen in parallel with starting Epic {{next_epic_num}}?"

Charlie (Senior Dev): _thinking_ "Maybe. If we tackle {{first_critical_item}} before the epic starts, we could do {{second_critical_item}} during the first sprint."

Dana (QA Engineer): "But that means Story 1 of Epic {{next_epic_num}} can't depend on {{second_critical_item}}."

Alice (Product Owner): _looking at epic plan_ "Actually, Stories 1 and 2 are about {{independent_work}}, so they don't depend on it. We could make that work."

Amelia (Developer): "{user_name}, the team is finding a workable compromise here. Does this approach make sense to you?"
</output>

<action>WAIT for {user_name} to validate or adjust the preparation strategy</action>

<action>Continue working through preparation needs across all dimensions:</action>

- Dependencies on Epic {{epic_number}} work
- Technical setup and infrastructure
- Knowledge gaps and research needs
- Documentation or specification work
- Testing infrastructure
- Refactoring or debt reduction
- External dependencies (APIs, integrations, etc.)

<action>For each preparation area, facilitate team discussion that:</action>

- Identifies specific needs with concrete examples
- Estimates effort realistically based on Epic {{epic_number}} experience
- Assigns ownership to specific agents
- Determines criticality and timing
- Surfaces risks of NOT doing the preparation
- Explores parallel work opportunities
- Brings {user_name} in for key decisions

<output>
Amelia (Developer): "I'm hearing a clear picture of what we need before Epic {{next_epic_num}}. Let me summarize..."

**CRITICAL PREPARATION (Must complete before epic starts):**
{{list_critical_prep_items_with_owners_and_estimates}}

**PARALLEL PREPARATION (Can happen during early stories):**
{{list_parallel_prep_items_with_owners_and_estimates}}

**NICE-TO-HAVE PREPARATION (Would help but not blocking):**
{{list_nice_to_have_prep_items}}

Amelia (Developer): "Total critical prep effort: {{critical_hours}} hours ({{critical_days}} days)"

Alice (Product Owner): "That's manageable. We can communicate that to stakeholders."

Amelia (Developer): "{user_name}, does this preparation plan work for you?"
</output>

<action>WAIT for {user_name} final validation of preparation plan</action>

