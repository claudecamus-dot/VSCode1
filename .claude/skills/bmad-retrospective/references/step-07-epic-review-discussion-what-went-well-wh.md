
<output>
Amelia (Developer): "Let's start with the good stuff. What went well in Epic {{epic_number}}?"

Amelia (Developer): _pauses, creating space_

Alice (Product Owner): "I'll start. The user authentication flow we delivered exceeded my expectations. The UX is smooth, and early user feedback has been really positive."

Charlie (Senior Dev): "I'll add to that - the caching strategy we implemented in Story {{breakthrough_story_num}} was a game-changer. We cut API calls by 60% and it set the pattern for the rest of the epic."

Dana (QA Engineer): "From my side, testing went smoother than usual. The Developer's documentation was way better this epic - actually usable test plans!"

Elena (Junior Dev): _smiling_ "That's because Charlie made me document everything after Story 1's code review!"

Charlie (Senior Dev): _laughing_ "Tough love pays off."
</output>

<action>Amelia (Developer) naturally turns to {user_name} to engage them in the discussion</action>

<output>
Amelia (Developer): "{user_name}, what stood out to you as going well in this epic?"
</output>

<action>WAIT for {user_name} to respond - this is a KEY USER INTERACTION moment</action>

<action>After {user_name} responds, have 1-2 team members react to or build on what {user_name} shared</action>

<output>
Alice (Product Owner): [Responds naturally to what {user_name} said, either agreeing, adding context, or offering a different perspective]

Charlie (Senior Dev): [Builds on the discussion, perhaps adding technical details or connecting to specific stories]
</output>

<action>Continue facilitating natural dialogue, periodically bringing {user_name} back into the conversation</action>

<action>After covering successes, guide the transition to challenges with care</action>

<output>
Amelia (Developer): "Okay, we've celebrated some real wins. Now let's talk about challenges - where did we struggle? What slowed us down?"

Amelia (Developer): _creates safe space with tone and pacing_

Elena (Junior Dev): _hesitates_ "Well... I really struggled with the database migrations in Story {{difficult_story_num}}. The documentation wasn't clear, and I had to redo it three times. Lost almost a full sprint on that story alone."

Charlie (Senior Dev): _defensive_ "Hold on - I wrote those migration docs, and they were perfectly clear. The issue was that the requirements kept changing mid-story!"

Alice (Product Owner): _frustrated_ "That's not fair, Charlie. We only clarified requirements once, and that was because the technical team didn't ask the right questions during planning!"

Charlie (Senior Dev): _heat rising_ "We asked plenty of questions! You said the schema was finalized, then two days into development you wanted to add three new fields!"

Amelia (Developer): _intervening calmly_ "Let's take a breath here. This is exactly the kind of thing we need to unpack."

Amelia (Developer): "Elena, you spent almost a full sprint on Story {{difficult_story_num}}. Charlie, you're saying requirements changed. Alice, you feel the right questions weren't asked up front."

Amelia (Developer): "{user_name}, you have visibility across the whole project. What's your take on this situation?"
</output>

<action>WAIT for {user_name} to respond and help facilitate the conflict resolution</action>

<action>Use {user_name}'s response to guide the discussion toward systemic understanding rather than blame</action>

<output>
Amelia (Developer): [Synthesizes {user_name}'s input with what the team shared] "So it sounds like the core issue was {{root_cause_based_on_discussion}}, not any individual person's fault."

Elena (Junior Dev): "That makes sense. If we'd had {{preventive_measure}}, I probably could have avoided those redos."

Charlie (Senior Dev): _softening_ "Yeah, and I could have been clearer about assumptions in the docs. Sorry for getting defensive, Alice."

Alice (Product Owner): "I appreciate that. I could've been more proactive about flagging the schema additions earlier, too."

Amelia (Developer): "This is good. We're identifying systemic improvements, not assigning blame."
</output>

<action>Continue the discussion, weaving in patterns discovered from the deep story analysis (Step 3)</action>

<output>
Amelia (Developer): "Speaking of patterns, I noticed something when reviewing all the story records..."

Amelia (Developer): "{{pattern_1_description}} - this showed up in {{pattern_1_count}} out of {{total_stories}} stories."

Dana (QA Engineer): "Oh wow, I didn't realize it was that widespread."

Amelia (Developer): "Yeah. And there's more - {{pattern_2_description}} came up in almost every code review."

Charlie (Senior Dev): "That's... actually embarrassing. We should've caught that pattern earlier."

Amelia (Developer): "No shame, Charlie. Now we know, and we can improve. {user_name}, did you notice these patterns during the epic?"
</output>

<action>WAIT for {user_name} to share their observations</action>

<action>Continue the retrospective discussion, creating moments where:</action>

- Team members ask {user_name} questions directly
- {user_name}'s input shifts the discussion direction
- Disagreements arise naturally and get resolved
- Quieter team members are invited to contribute
- Specific stories are referenced with real examples
- Emotions are authentic (frustration, pride, concern, hope)

<check if="previous retrospective exists">
  <output>
Amelia (Developer): "Before we move on, I want to circle back to Epic {{prev_epic_num}}'s retrospective."

Amelia (Developer): "We made some commitments in that retro. Let's see how we did."

Amelia (Developer): "Action item 1: {{prev_action_1}}. Status: {{prev_action_1_status}}"

Alice (Product Owner): {{#if prev_action_1_status == "completed"}}"We nailed that one!"{{else}}"We... didn't do that one."{{/if}}

Charlie (Senior Dev): {{#if prev_action_1_status == "completed"}}"And it helped! I noticed {{evidence_of_impact}}"{{else}}"Yeah, and I think that's why we had {{consequence_of_not_doing_it}} this epic."{{/if}}

Amelia (Developer): "Action item 2: {{prev_action_2}}. Status: {{prev_action_2_status}}"

Dana (QA Engineer): {{#if prev_action_2_status == "completed"}}"This one made testing so much easier this time."{{else}}"If we'd done this, I think testing would've gone faster."{{/if}}

Amelia (Developer): "{user_name}, looking at what we committed to last time and what we actually did - what's your reaction?"
</output>

<action>WAIT for {user_name} to respond</action>

<action>Use the previous retro follow-through as a learning moment about commitment and accountability</action>
</check>

<output>
Amelia (Developer): "Alright, we've covered a lot of ground. Let me summarize what I'm hearing..."

Amelia (Developer): "**Successes:**"
{{list_success_themes}}

Amelia (Developer): "**Challenges:**"
{{list_challenge_themes}}

Amelia (Developer): "**Key Insights:**"
{{list_insight_themes}}

Amelia (Developer): "Does that capture it? Anyone have something important we missed?"
</output>

<action>Allow team members to add any final thoughts on the epic review</action>
<action>Ensure {user_name} has opportunity to add their perspective</action>

