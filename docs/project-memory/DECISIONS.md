# Decisions

Last updated: 2026-06-18

## Project Continuity

Decision: Use repo-based project memory plus Codex automation.

Reason:

- Chat history alone is not reliable enough for a long-running client product.
- Git history shows what changed, but not enough of the product intent.
- Repo-based memory travels with the project and can be read by any future conversation.

## MM Mock Defaults

Decision: MM mocks default to 100 questions and 60 minutes.

Reason:

- This matches the expected full Master Module mock convention.
- The default section allocation becomes 10 questions across each of the 10 MM sections.

## MM Mock Structure

Decision: MM competition mocks are section-locked and concept-sequential.

Reason:

- The mock must train and test section-wise mastery, not random concept mixing.
- Section labels must match generated sums.
- Concept sequence is part of the learning and assessment process.

## Existing Mock Preview Cleanup

Decision: Fix duplicated prompts and scroll behavior at the frontend renderer layer.

Reason:

- Existing saved mocks should benefit without regeneration.
- The issue is display convention, not data correctness.

## Student Mock Attempt Workspace

Decision: Competition mock attempts should use one coherent exam workspace with timer/status surfaced inside the metrics area rather than relying on separated sticky timer blocks.

Reason:

- Students need persistent timing and progress context without losing horizontal room for the active question.
- The structured workspace reduces awkward scroll behavior and leaves more room for long questions and answer options.

## MM Visual Add/Less Constraints

Decision: MM visual add/less generation should enforce explicit row-count and digit-shape rules for fast visualisation and decimal visual questions.

Reason:

- Generic add/less ranges were allowing malformed or overly easy visual questions.
- Competition mocks need consistent visual difficulty and valid operand patterns across saved and live-generated mocks.
