# Beauty

## Purpose

This file defines what "beautiful" means in the Amafit backend.

It is not a temporary cleanup note.
It is a standing standard for how backend code should feel, read, and evolve over time.

Beauty here does not mean cleverness.
Beauty means clarity, honesty, calmness, and inevitability.

When a file is beautiful:

- a new engineer can understand it quickly
- the names explain the system without comments doing the heavy lifting
- the types tell the truth
- the happy path is easy to follow
- the code feels smaller than the problem it solves

## The Standard

### 1. Truth over appearance

Code must not pretend to be safer, simpler, or more general than it really is.

Examples of ugliness:

- types that imply validation that never happened
- abstractions that suggest reuse where no real pattern exists
- helper names that sound clear but hide confusion
- "generic" utilities that only serve one awkward call site

If the code only validates part of a shape, the type should say so.
If the code is specific, let it be specific.

### 2. The happy path should dominate the file

A reader should be able to scan a function and understand the main path immediately.

Guard clauses are good.
Branch explosions are not.

The best functions read like:

- validate input
- reject invalid cases early
- do the main thing
- return the result

The core story of the function should not be buried under plumbing.

### 3. Names should carry the explanation

Names are the primary documentation.

Good names:

- explain what the thing is
- reveal why a branch exists
- make comments less necessary

Bad names:

- `data`
- `result`
- `helper`
- `handleThing`
- `process`

A beautiful file can often be understood just by reading the exported names and the local function names.

### 4. Indirection must earn its place

Every extra layer costs attention.

Add a helper only when it makes the code easier to understand.
Add an abstraction only when it reveals a real pattern.
Add a wrapper only when it removes a real burden.

Do not extract code just because it is repeated twice.
Do not introduce a framework to avoid writing obvious code.

If deleting a helper makes the file clearer, the helper should not exist.

### 5. Specific code is better than premature generality

Beautiful backend code is usually more concrete than people expect.

It uses domain names.
It solves the actual case.
It avoids "future-proofing" that makes the present harder to read.

We prefer:

- one clear implementation today

over:

- a reusable pattern we might need later

Generality is only beautiful after the common pattern is real and stable.

### 6. Validation should be honest and visible

The edge of the system should make truth obvious.

A reader should be able to answer:

- what did we validate?
- what did we not validate?
- what shape enters the service layer?
- what errors can come back from the edge?

Beautiful validation is explicit and unsurprising.
Ugly validation creates false confidence.

### 7. Business rules should read like business rules

When a service makes decisions, the reader should be able to point to each branch and say what rule it represents.

If a branch exists only because the code was assembled awkwardly, simplify it.

If a rule matters, name it.
If a rule is subtle, isolate it.
If a rule is central, let it appear in the main flow.

### 8. Tests should read like behavior, not ceremony

Beautiful tests are small, direct, and obvious.

A good test name should let the reader predict:

- the setup
- the action
- the expected outcome

A good test file feels like a list of truths about the system.

## What We Avoid

These are recurring signs that beauty is slipping:

- a function that needs comments to explain its control flow
- route code that mixes parsing, policy, orchestration, and domain logic in one block
- types that overstate certainty
- repeated scaffolding that nobody wants to touch
- helpers with vague names
- abstractions whose only benefit is fewer lines
- wrappers around wrappers around wrappers
- code that is technically correct but emotionally noisy

## The Review Questions

Before considering any backend code "done," ask:

1. Can a new engineer understand this file in 20 seconds?
2. Do the names explain the system?
3. Do the types tell the truth?
4. Is the happy path visually obvious?
5. Is any helper only hiding awkwardness?
6. Did we add indirection without a real pattern?
7. Would deleting 20 percent of this file make it clearer?

If the answer to the last question is yes, keep simplifying.

## The Rewrite Rule

When cleaning up an ugly file, do it in this order:

1. Make the types honest.
2. Rename things until the code reads like prose.
3. Pull guard clauses up.
4. Shrink or delete helpers that do not clarify.
5. Collapse fake abstractions.
6. Keep only the branches that represent real rules.
7. Rewrite tests so they describe behavior clearly.

Do not start by extracting utilities.
Do not start by inventing patterns.
Start by making the existing code tell the truth.

## The Long-Term Goal

Over time, the backend should feel:

- smaller
- calmer
- more explicit
- less ceremonial
- easier to change without fear

That is beauty.
