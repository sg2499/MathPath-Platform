# Decisions

Last updated: 2026-06-16

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
