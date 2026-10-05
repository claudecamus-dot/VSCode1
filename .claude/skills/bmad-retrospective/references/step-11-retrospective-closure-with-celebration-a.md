
<output>
Amelia (Developer): "We've covered a lot of ground today. Let me bring this retrospective to a close."

═══════════════════════════════════════════════════════════
✅ RETROSPECTIVE COMPLETE
═══════════════════════════════════════════════════════════

Amelia (Developer): "Epic {{epic_number}}: {{epic_title}} - REVIEWED"

**Key Takeaways:**

1. {{key_lesson_1}}
2. {{key_lesson_2}}
3. {{key_lesson_3}}
   {{#if key_lesson_4}}4. {{key_lesson_4}}{{/if}}

Alice (Product Owner): "That first takeaway is huge - {{impact_of_lesson_1}}."

Charlie (Senior Dev): "And lesson 2 is something we can apply immediately."

Amelia (Developer): "Commitments made today:"

- Action Items: {{action_count}}
- Preparation Tasks: {{prep_task_count}}
- Critical Path Items: {{critical_count}}

Dana (QA Engineer): "That's a lot of commitments. We need to actually follow through this time."

Amelia (Developer): "Agreed. Which is why we'll review these action items in our next standup."

═══════════════════════════════════════════════════════════
🎯 NEXT STEPS:
═══════════════════════════════════════════════════════════

1. Execute Preparation Sprint (Est: {{prep_days}} days)
2. Complete Critical Path items before Epic {{next_epic_num}}
3. Review action items in next standup
   {{#if epic_update_needed}}4. Hold Epic {{next_epic_num}} planning review session{{else}}4. Begin Epic {{next_epic_num}} planning when preparation complete{{/if}}

Elena (Junior Dev): "{{prep_days}} days of prep work is significant, but necessary."

Alice (Product Owner): "I'll communicate the timeline to stakeholders. They'll understand if we frame it as 'ensuring Epic {{next_epic_num}} success.'"

═══════════════════════════════════════════════════════════

Amelia (Developer): "Before we wrap, I want to take a moment to acknowledge the team."

Amelia (Developer): "Epic {{epic_number}} delivered {{completed_stories}} stories with {{velocity_description}} velocity. We overcame {{blocker_count}} blockers. We learned a lot. That's real work by real people."

Charlie (Senior Dev): "Hear, hear."

Alice (Product Owner): "I'm proud of what we shipped."

Dana (QA Engineer): "And I'm excited about Epic {{next_epic_num}} - especially now that we're prepared for it."

Amelia (Developer): "{user_name}, any final thoughts before we close?"
</output>

<action>WAIT for {user_name} to share final reflections</action>

<output>
Amelia (Developer): [Acknowledges what {user_name} shared] "Thank you for that, {user_name}."

Amelia (Developer): "Alright team - great work today. We learned a lot from Epic {{epic_number}}. Let's use these insights to make Epic {{next_epic_num}} even better."

Amelia (Developer): "See you all when prep work is done. Meeting adjourned!"

═══════════════════════════════════════════════════════════
</output>

<action>Prepare to save retrospective summary document</action>

