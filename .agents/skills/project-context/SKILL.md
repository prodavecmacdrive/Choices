---
name: project-context
description: Understand and maintain the project's persistent technical context. Use when starting work in an unfamiliar project, when project architecture needs to be understood, or when a task reveals durable information that future work should remember.
---

# Project Context

The purpose of this skill is to maintain a concise and reliable
technical context for the project.

## When starting work

Before making non-trivial changes:

1. Read `docs/project-context.md`.
2. Read only the relevant documentation referenced from it.
3. Inspect the actual source code related to the task.
4. Do not assume undocumented architecture.

## Understanding the project

When information is missing from the context:

1. inspect the repository;
2. find how the existing system actually works;
3. record only durable and useful knowledge.

Do not document every class, function, or file.

## Updating context

Update documentation only when a task reveals information that
will likely be useful in future tasks.

Examples:

- a new architectural system;
- an important relationship between systems;
- a non-obvious framework convention;
- a project-specific workaround;
- an important technical decision.

Do NOT update context for:

- temporary implementation details;
- ordinary functions;
- local variables;
- one-off fixes;
- information already obvious from the code.

## Source of truth

The actual implementation is the primary source of truth.

If documentation and implementation disagree:

1. inspect the implementation;
2. determine whether the documentation is outdated;
3. update the documentation when the current behavior is clear.

Never turn assumptions into project facts.

## Context economy

Keep persistent context concise.

Do not duplicate source code in documentation.

Do not create documentation merely because a file or class exists.

Prefer one concise explanation of a system over a detailed inventory of its implementation.

The goal is to make future sessions understand the project faster,
not to create a complete documentation mirror of the repository.