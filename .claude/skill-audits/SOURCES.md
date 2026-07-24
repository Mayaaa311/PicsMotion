# Skill Sources

All skills are installed **project-locally** under `.claude/skills/`. No skill was
installed globally, and no global installer (`install.sh`, `npx skills add`) was run.

Each source repository was cloned shallow (`--depth 1`) into `.vendor/agent-skills/`
(git-ignored), audited, and only the required skill directories were copied into
`.claude/skills/`.

| Source repository | Commit (pinned) | Skills taken |
|---|---|---|
| https://github.com/tommyjepsen/awesome-ux-skills | `daf4981acfd4514ee396b04d7eb4d1f9e56231bd` | general-design-review, ux-heuristics-review, cognitive-load-conversion, ai-governors, ai-wayfinders, ai-tuners, ai-trust-builders |
| https://github.com/anthropics/skills | `1f630fdf9259cec4a14913127dfd7c3b69ef72eb` | frontend-design, webapp-testing |
| https://github.com/vercel-labs/agent-skills | `4559f18a20c1691c744b4395194290db6a0df5e9` | vercel-react-best-practices (repo dir `react-best-practices`), vercel-composition-patterns (repo dir `composition-patterns`) |
| https://github.com/mrgoonie/claudekit-skills | `80113d86bc4407f105af40a2c4ea58194f7c370a` | threejs |
| https://github.com/addyosmani/web-quality-skills | `95d6e255afe1596b557d7a8498517884438f5b3a` | performance, core-web-vitals, accessibility, best-practices |

Per-repo commit hashes are also stored individually in:

- `.claude/skill-audits/awesome-ux-skills.commit`
- `.claude/skill-audits/skills.commit`
- `.claude/skill-audits/agent-skills.commit`
- `.claude/skill-audits/claudekit-skills.commit`
- `.claude/skill-audits/web-quality-skills.commit`

File-level checksums for every installed skill file: `.claude/skill-audits/skills.sha256`.

## Notes on naming

- The two Vercel skills are stored in the repo under directories `react-best-practices`
  and `composition-patterns`, but their `SKILL.md` frontmatter already declares the names
  `vercel-react-best-practices` and `vercel-composition-patterns`. They were installed under
  those declared names (dir name == skill name) with **no content modification**. The
  subagent `skills:` references resolve against these declared names.
- Skills present in a source repo but **not** installed (e.g. anthropics `docx`/`pdf`/`pptx`,
  claudekit's own `frontend-design`/`accessibility`, web-quality `seo`, vercel `deploy-to-vercel`)
  were deliberately excluded to avoid name collisions and scope creep.

## Deviation from spec (§4): manual vendoring instead of `npx skills add`

The spec's §4 prescribes `npx -y skills add ...` for the technical skills. This bootstrap
instead used the same **clone → audit → copy** method §3 prescribes for the UX skills, for
**all** skills. Rationale (governed by the §1 safety rules, which take precedence):

- `npx skills add` performs network + filesystem writes that cannot be previewed or audited
  before they run, and its install scope/target is ambiguous.
- Manual vendoring keeps every step auditable, keeps all output strictly project-local, and
  produces identical artifacts (`SKILL.md` + bundled files under `.claude/skills/<name>/`).
- No bundled script was executed; the only executables shipped (webapp-testing Python
  helpers) were read in full before the skill was trusted.
