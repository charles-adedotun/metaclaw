---
name: example-skill
description: |
  An annotated example skill showing the structure and conventions.
  Skills are mounted read-only into agent containers at /home/node/.claude/skills/.
  Claude Code auto-discovers them by reading the SKILL.md file.
triggers:
  - example
  - demo
---

# Example Skill

This is an example skill that demonstrates the MetaClaw skill format.

## When to Use

Use this skill when the user asks for a demo or example of how skills work.

## What It Does

1. Reads relevant context from the workspace
2. Performs some processing
3. Returns results to the user

## Instructions

When invoked:

1. Greet the user and explain what this skill does
2. Show a brief demo of reading workspace files
3. Explain how to create their own skills

## Key Points for Skill Authors

- Skills live in `skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`
- Container skills (`skills/`) are mounted read-only into every agent container
- Host skills (`.claude/skills/`) run in the host Claude Code session
- The YAML frontmatter defines name, description, and trigger words
- Keep instructions clear — Claude Code follows them literally
- Reference other files with relative paths from the skill directory
- Test your skill on a fresh clone before contributing
