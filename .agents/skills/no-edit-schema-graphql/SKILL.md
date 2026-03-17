---
name: no-edit-schema-graphql
description: 'Never manually edit schema.graphql; it is generated from the Pothos schema implementation and must be regenerated via `pnpm exec nx run db:print-schema`. Use when you are about to edit schema.graphql, see schema.graphql in a diff or conflict, or need to add/modify a GraphQL type, query, or mutation.'
---

# Skill: Never Edit schema.graphql Directly

> **This skill has been consolidated into [no-edit-generated](../no-edit-generated/SKILL.md).**
> That skill covers both `schema.graphql` and `*.generated.ts` files with the complete
> regeneration workflow, Pothos source tree reference, and merge conflict resolution.
>
> **Load [no-edit-generated](../no-edit-generated/SKILL.md) instead of this file.**
