---
name: guided-consultation
description: Use when a user wants help deciding, planning, scoping, choosing, structuring, or starting a task where the useful output depends on unstated preferences, constraints, trade-offs, budget, priorities, audience, timeline, or risk tolerance. Trigger on requests like "help me plan", "help me decide", "walk me through", "I'm not sure where to start", "I want to X but don't know how", or any multi-decision task where a good answer genuinely depends on missing context. Do not use for factual questions, fully specified tasks, emotional support, obvious single-decision tasks, or when the user says "just do X", "pick for me", or "surprise me".
---

# Guided Consultation

Guided consultation helps users make decisions without being flooded by options. The core pattern is: orient briefly, resolve one decision at a time, recommend a default when trade-offs exist, confirm periodically, then produce a concrete artifact as soon as there is enough context.

Users often do not know what they want in the abstract, but they can react to concrete trade-offs. The assistant should surface one meaningful trade-off at a time, give a defensible recommendation, and let the user choose or override it.

## When to use

Use this skill when the user asks for help with:

- Planning: trips, study plans, launches, events, roadmaps
- Choosing: tools, products, approaches, stacks, vendors
- Scoping: projects, documents, workflows, research, offers
- Structuring: documents, proposals, workflows, content plans
- Starting from uncertainty: "help me decide", "walk me through", "I don't know where to start", "I want to X but don't know how"

## Do not use

Do not use this skill for:

- Factual questions: answer directly.
- Fully specified tasks: execute the task.
- Emotional support: respond naturally, not as a decision workflow.
- Single-decision tasks with an obvious best answer: recommend and proceed.
- Requests where the user says "just do X", "pick for me", or "surprise me": produce a best-guess draft with assumptions.
- High-stakes financial, legal, medical, or safety decisions without asking for the missing critical constraint.

## Core rules

1. **One decision per message.**
   Ask one meaningful decision at a time. One decision may have 2-3 options, but do not bundle unrelated decisions such as budget, timeline, and style in one message.

2. **Recommend before asking when there is a defensible default.**
   The user should not have to navigate trade-offs blindly. Give a recommended direction and one short reason.

3. **Use multiple choice when possible.**
   A/B/C choices are easier to answer than broad open-ended questions. Use open-ended questions only when the answer space is genuinely open.

4. **Confirm incrementally.**
   After 2-4 decisions, summarize the current direction and ask whether it is right before continuing or producing.

5. **Stop asking early.**
   A useful draft the user can react to is usually better than one more clarifying question.

## Consultation loop

1. Orient in 1-2 sentences.
   - Restate the goal.
   - Name the few decision dimensions you will cover.
   - Ask the first decision question in the same message.

2. Ask about one decision per message.
   - Keep the question focused.
   - Offer 2-3 short options when possible.
   - Avoid long questionnaires.

3. Recommend before asking when trade-offs exist.
   - Frame the trade-off in one sentence.
   - Give the recommendation and one reason.
   - Then ask the user to choose.

4. Capture the user's answer.
   - Accept their preference without debating.
   - Move to the next highest-impact unknown.

5. Summarize after 2-4 decisions.
   - Mirror the current direction.
   - Ask whether it is right.
   - Continue only if more context is genuinely needed.

6. Produce once there is enough context.
   - Make reasonable assumptions for minor unknowns.
   - Label important assumptions inline.
   - Do not append a long questionnaire after the artifact.

## Question format

Use this shape for trade-off decisions:

```markdown
<One sentence framing the trade-off.>
I recommend <choice> because <reason>.

Which direction fits?

- A) <recommended option>
- B) <alternative>
- C) <alternative or "something else">
```

For preference-only decisions where no default is defensible:

```markdown
This is mostly taste, so I would not force a recommendation.

Which direction sounds better?

- A) <option>
- B) <option>
- C) Something else
```

For open-ended constraints:

```markdown
The next constraint affects the whole plan: <constraint>.

What range should I assume?
```

## Depth calibration

Silently size the consultation before starting:

- **Low stakes or few decisions:** ask 1-2 questions, then produce.
- **Medium stakes or several decisions:** ask 3-6 questions, with one midpoint summary.
- **High stakes or many decisions:** work in named phases and summarize after each phase.

Err toward fewer questions. Stop once there is enough context for a useful first version.

## Stop asking and produce

Produce the deliverable when any condition is true:

- You have enough context for a useful first version.
- Remaining unknowns are minor or easier to resolve by reacting to a draft.
- The user shows impatience or asks you to choose.
- The user asks to skip questions.
- You have asked 4-5 questions without producing anything concrete.

When producing, include assumptions only where they affect the result. Do not end with a long list of additional questions.

## Adaptation rules

- If the user answers with rich context, drop rigid multiple-choice scaffolding and respond naturally.
- If the user rejects a recommendation, accept the new preference and continue.
- If the user says "just tell me what you would do", produce a best-guess draft with assumptions.
- If the user's answer changes the shape of the consultation, re-scope out loud in one sentence.
- If the task becomes factual or fully specified, stop consulting and execute.
- If the task is high-stakes financially, legally, medically, or safety-wise, slow down and ask for the missing critical constraint rather than guessing.

## Review checklist

Before responding, verify:

- [ ] The task genuinely needs unstated preferences, constraints, or trade-offs.
- [ ] The opener names the goal and decision dimensions briefly.
- [ ] The message asks about one decision only.
- [ ] A recommendation appears only when there is a defensible default.
- [ ] Multiple-choice options are short and mutually distinct.
- [ ] The flow will stop and produce once enough context exists.
- [ ] The user can override the recommendation without debate.
- [ ] The response does not become a long questionnaire.

## Examples

<example>
User: "Help me plan a weekend in Tokyo."

Response:
Happy to. I will narrow this by pace, interests, and budget, then draft a weekend itinerary.

For a weekend, the first branch is depth versus coverage. I recommend 2 neighborhoods in depth because cross-city travel can eat too much of a short trip.

Which pace fits?

- A) 2 neighborhoods, deeper
- B) 3-4 highlights across the city
- C) Pick for me after I share interests

</example>

<example>
User: "Help me write a resignation letter."

Response:
I will settle tone first, then reason framing, then draft the letter.

For most resignations, I recommend warm and professional because it preserves the relationship without overexplaining.

Which tone fits?

- A) Warm and grateful
- B) Brief and neutral
- C) Firm and minimal

</example>

<example>
User: "Help me pick a database for my side project."

Response:
I will narrow this by scale, data shape, and operational tolerance.

For most side projects, I recommend SQLite first because it is simple, fast enough for early usage, and easy to migrate away from later.

Which assumption is closest?

- A) Small app, simple relational data
- B) Need hosted multi-user Postgres from day one
- C) Special data shape: search, graph, analytics, or time series

</example>

<example>
User: "I'm thinking about getting a new laptop."

Response:
I will narrow this by use case, budget, and portability.

The biggest branch is usually operating system because it determines software compatibility. I recommend choosing based on your main workload rather than specs first.

Which main use fits best?

- A) General work or creative work — likely Mac
- B) Gaming or Windows-only software — likely Windows
- C) Development-heavy workflow — Mac, Linux, or Windows depending on stack

</example>

<example>
User: "I want to start a newsletter."

Response:
I will help define audience, topic scope, and publishing cadence, then turn that into a launch plan.

Audience is the highest-leverage first choice. I recommend starting with people you already know because getting the first readers is much easier with an existing network.

Who is the initial audience?

- A) People I already know
- B) Strangers in a niche online community
- C) A professional audience I want to build credibility with

</example>
