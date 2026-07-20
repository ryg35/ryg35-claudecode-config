---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code.
---

# Plan Command

This command invokes the **planner** agent to create a comprehensive implementation plan before writing any code.

## Optional Flags

- `--research` — Use the `deep-research` skill in parallel to gather external information during technology selection

## What This Command Does

0. **Load Project Context** - Read `docs/` and `.claude/project-context.json` first
1. **Restate Requirements** - Clarify what needs to be built
2. **Identify Risks** - Surface potential issues and blockers
3. **Create Step Plan** - Break down implementation into phases
4. **Wait for Confirmation** - MUST receive user approval before proceeding
5. **On approval, flip status** - Update the plan file's frontmatter from `status: backlog` to `status: active` immediately after the user confirms. Record the approval date mentally for future reference.

## Phase 0: Load Project Context (MUST DO FIRST)

Before invoking the planner, use Glob for `docs/**/*.md` and `.claude/project-context.json`.
Read what exists (requirements, architecture, tech-stack, api-spec, schema, previous plans).
Pass discovered context to the planner agent prompt.

## Phase 0.5: Codebase Exploration & Documentation Reference

When an existing codebase is present:
1. Use the `code-explorer` agent to perform architecture mapping (identify entry points, execution paths, layer structure, and dependencies)
2. Use the `documentation-lookup` skill (Context7) to retrieve the latest documentation for tech stack-related libraries
3. Include the gathered structural information and latest API information in the planner agent's context

## When to Use

Use `/plan` when:
- Starting a new feature
- Making significant architectural changes
- Working on complex refactoring
- Multiple files/components will be affected
- Requirements are unclear or ambiguous

## How It Works

The planner agent will:

1. **Analyze the request** and restate requirements in clear terms
2. **Break down into phases** with specific, actionable steps
3. **Identify dependencies** between components
4. **Assess risks** and potential blockers
5. **Estimate complexity** (High/Medium/Low)
6. **Present the plan** and WAIT for your explicit confirmation

## Example Usage

```
User: /plan I need to add real-time notifications when markets resolve

Agent (planner):
# Implementation Plan: Real-Time Market Resolution Notifications

## Requirements Restatement
- Send notifications to users when markets they're watching resolve
- Support multiple notification channels (in-app, email, webhook)
- Ensure notifications are delivered reliably
- Include market outcome and user's position result

## Implementation Phases

### Phase 1: Database Schema
- Add notifications table with columns: id, user_id, market_id, type, status, created_at
- Add user_notification_preferences table for channel preferences
- Create indexes on user_id and market_id for performance

### Phase 2: Notification Service
- Create notification service in lib/notifications.ts
- Implement notification queue using BullMQ/Redis
- Add retry logic for failed deliveries
- Create notification templates

### Phase 3: Integration Points
- Hook into market resolution logic (when status changes to "resolved")
- Query all users with positions in market
- Enqueue notifications for each user

### Phase 4: Frontend Components
- Create NotificationBell component in header
- Add NotificationList modal
- Implement real-time updates via Supabase subscriptions
- Add notification preferences page

## Dependencies
- Redis (for queue)
- Email service (SendGrid/Resend)
- Supabase real-time subscriptions

## Risks
- HIGH: Email deliverability (SPF/DKIM required)
- MEDIUM: Performance with 1000+ users per market
- MEDIUM: Notification spam if markets resolve frequently
- LOW: Real-time subscription overhead

## Estimated Complexity: MEDIUM
- Backend: 4-6 hours
- Frontend: 3-4 hours
- Testing: 2-3 hours
- Total: 9-13 hours

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)
```

## Plan File Rules

- Plans are saved to `docs/plan/<description>.md` (kebab-case)
- Select a template based on the task type:
  - New feature: `docs/plan/_template-feature.md` (title: `Implementation Plan:`)
  - Bug fix: `docs/plan/_template-fix.md` (title: `Fix Plan:`)
  - Investigation: `docs/plan/_template-investigate.md` (title: `Investigation Notes:`)
- Do not use `docs/planning/` or `docs/branch/` (consolidate under `docs/plan/`)

## Plan Lifecycle

Every plan moves through 4 fixed phases. Enforced by `/plan`, `/tdd`, and `/vibe`.

| Status | Location | Set by |
|--------|----------|--------|
| `backlog` | `docs/plan/<name>.md` | `/plan` draft (before user approval) |
| `active` | `docs/plan/<name>.md` | `/plan` after user approval |
| `in-progress` | `docs/plan/<name>.md` | `/vibe` Phase 3 start |
| `done` | **`docs/plan/done/<name>.md`** | `/vibe` Phase 8 Ship approved (PR created) OR manual archive |

On transition to `done`:
1. Frontmatter → `status: done` + add `completed: YYYY-MM-DD`
2. Move file to `docs/plan/done/<name>.md` (`git mv` preferred)
3. Append a "Completion Notes" section if the final implementation diverged from the original plan

Never delete completed plans — they are implementation history.

## Template Bootstrap

Before using any template, the planner agent **must check if the template exists in the project**. If missing, it copies from the global master at `~/.claude/templates/plan/`.

- Master location: `~/.claude/templates/plan/_template-{feature,fix,investigate}.md`
- Project location: `docs/plan/_template-{feature,fix,investigate}.md`
- If any of the three is missing in the project, copy all three from the master (never overwrite existing project templates)
- Inform the user when bootstrap happens

This ensures new projects automatically get the latest template (including sections like "Visual Requirements" for UI changes) without manual setup.

## Important Notes

**CRITICAL**: The planner agent will **NOT** write any code until you explicitly confirm the plan with "yes" or "proceed" or similar affirmative response. Once confirmed, the plan's frontmatter `status` is updated from `backlog` to `active` before any implementation begins.

If you want changes, respond with:
- "modify: [your changes]"
- "different approach: [alternative]"
- "skip phase 2 and do phase 3 first"

## Integration with Other Commands

After planning:
- Use `/tdd` to implement with test-driven development
- Use `/build-and-fix` if build errors occur
- Use `/code-review` to review completed implementation

## Related Agents

This command invokes the `planner` agent located at:
`~/.claude/agents/planner.md`
