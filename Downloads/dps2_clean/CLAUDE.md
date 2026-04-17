# DPS (Digital Plumbing Software)

Full-stack field service management SaaS. Stack: React frontend (`frontend/src/App.jsx`), Node/Express backend (`backend/src/`), PostgreSQL in Docker. Run via `docker-compose` from this directory.

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

### Setup

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

### Available skills

| Skill | Purpose |
|---|---|
| `/browse` | Web browsing |
| `/connect-chrome` | Connect to Chrome browser |
| `/setup-browser-cookies` | Set up browser authentication cookies |
| `/setup-deploy` | Configure deployment settings |
| `/plan-ceo-review` | CEO-level plan review |
| `/plan-eng-review` | Engineering plan review |
| `/plan-design-review` | Design plan review |
| `/plan-devex-review` | Developer experience plan review |
| `/design-consultation` | Design consultation |
| `/design-shotgun` | Rapid design generation |
| `/design-html` | HTML design output |
| `/design-review` | Design review |
| `/review` | Code/PR review |
| `/ship` | Ship a change |
| `/land-and-deploy` | Land and deploy |
| `/canary` | Canary deployment |
| `/qa` | Full QA pass |
| `/qa-only` | QA without code changes |
| `/benchmark` | Performance benchmarking |
| `/investigate` | Investigate an issue |
| `/retro` | Retrospective |
| `/document-release` | Document a release |
| `/codex` | Codex agent |
| `/cso` | CSO review |
| `/autoplan` | Automated planning |
| `/devex-review` | Developer experience review |
| `/office-hours` | Office hours session |
| `/careful` | Extra-careful mode for risky changes |
| `/freeze` | Freeze a branch/deployment |
| `/guard` | Guard mode |
| `/unfreeze` | Unfreeze a branch/deployment |
| `/gstack-upgrade` | Upgrade gstack |
| `/learn` | Learning/onboarding session |

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
