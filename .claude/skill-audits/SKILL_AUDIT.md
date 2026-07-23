# Skill Audit Report

Audit date: 2026-07-22
Auditor: main Claude orchestrator (Phase −1 bootstrap)
Method: shallow clone into `.vendor/agent-skills/` → danger-pattern scan → read
selected files → copy required skill dirs into `.claude/skills/`.

Danger-pattern scans run against each source with:
`curl|wget|sudo|rm -rf|eval(|.env|AWS_|GITHUB_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|private key|browser profile|disregard|exfiltrat`.

**Summary: 16 skills installed. 0 rejected. 0 quarantined. All PASS.**

The only executable scripts in the entire installed set are 4 Python files in
`webapp-testing` (Playwright helpers); all four were read line-by-line and are benign.
No skill contains hooks, network egress, credential access, obfuscation, or
instructions to ignore/override the user.

---

## UX skills — source: tommyjepsen/awesome-ux-skills @ daf4981

### general-design-review
- Skill name: general-design-review
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/general-design-review/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: overlaps with ux-heuristics-review / cognitive-load-conversion (it is an intentional combined lens); resolved by precedence rules
- Audit decision: PASS
- Reviewer notes: "token"/"credits" mentions are UX cost-transparency vocabulary, not credential access.

### ux-heuristics-review
- Skill name: ux-heuristics-review
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/ux-heuristics-review/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none beyond the intended review-lens overlap
- Audit decision: PASS
- Reviewer notes: Nielsen 10-heuristics review guidance. Clean.

### cognitive-load-conversion
- Skill name: cognitive-load-conversion
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/cognitive-load-conversion/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: overlaps with review lenses; precedence-governed
- Audit decision: PASS
- Reviewer notes: Clean.

### ai-governors
- Skill name: ai-governors
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/ai-governors/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Human-in-the-loop / cost-transparency design patterns. "token/credits/money" are UX cost concepts.

### ai-wayfinders
- Skill name: ai-wayfinders
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/ai-wayfinders/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Onboarding/discoverability patterns. Clean.

### ai-tuners
- Skill name: ai-tuners
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/ai-tuners/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Filter/connector "token" references are prompt-token & OAuth-connector UX concepts described abstractly, not live credential reads.

### ai-trust-builders
- Skill name: ai-trust-builders
- Source repository: https://github.com/tommyjepsen/awesome-ux-skills
- Source commit: daf4981acfd4514ee396b04d7eb4d1f9e56231bd
- Installation scope: project-local (`.claude/skills/ai-trust-builders/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Consent/disclosure/watermark/data-ownership patterns. Clean.

---

## Technical skills

### frontend-design — source: anthropics/skills @ 1f630fd
- Skill name: frontend-design
- Source repository: https://github.com/anthropics/skills
- Source commit: 1f630fdf9259cec4a14913127dfd7c3b69ef72eb
- Installation scope: project-local (`.claude/skills/frontend-design/`)
- Files included: SKILL.md, LICENSE.txt
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: claudekit-skills also ships a `frontend-design`; NOT installed (only this one). No shadowing.
- Audit decision: PASS
- Reviewer notes: First-party Anthropic skill. Governs app shell/editor, not the WebGL scene (see precedence).

### webapp-testing — source: anthropics/skills @ 1f630fd
- Skill name: webapp-testing
- Source repository: https://github.com/anthropics/skills
- Source commit: 1f630fdf9259cec4a14913127dfd7c3b69ef72eb
- Installation scope: project-local (`.claude/skills/webapp-testing/`)
- Files included: SKILL.md, LICENSE.txt, scripts/with_server.py, examples/console_logging.py, examples/element_discovery.py, examples/static_html_automation.py
- Contains executable scripts: yes — 4 Python files (Playwright). ALL READ before trust.
- Contains hooks: no
- Uses network access: only navigates to local dev servers / file:// URLs (no egress)
- Reads environment variables: no (an example references `process.env.NODE_ENV` only in prose; N/A)
- Writes outside project: example scripts write screenshots/logs to `/tmp` and `/mnt/user-data/outputs` (sandbox example paths only; not executed during bootstrap)
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: `with_server.py` starts local servers, polls ports, runs a command, cleans up (`shell=True` on human-supplied server commands — standard). Examples are headless-chromium navigation/screenshot/console-capture snippets. No exfiltration, no credentials, no remote calls.

### vercel-react-best-practices — source: vercel-labs/agent-skills @ 4559f18
- Skill name: vercel-react-best-practices (declared in frontmatter; repo dir `react-best-practices`)
- Source repository: https://github.com/vercel-labs/agent-skills
- Source commit: 4559f18a20c1691c744b4395194290db6a0df5e9
- Installation scope: project-local (`.claude/skills/vercel-react-best-practices/`)
- Files included: SKILL.md, README.md, AGENTS.md, metadata.json, rules/*.md (72 rule files)
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: React/Next.js perf rule library. Installed under declared name, unmodified.

### vercel-composition-patterns — source: vercel-labs/agent-skills @ 4559f18
- Skill name: vercel-composition-patterns (declared in frontmatter; repo dir `composition-patterns`)
- Source repository: https://github.com/vercel-labs/agent-skills
- Source commit: 4559f18a20c1691c744b4395194290db6a0df5e9
- Installation scope: project-local (`.claude/skills/vercel-composition-patterns/`)
- Files included: SKILL.md, README.md, AGENTS.md, metadata.json, rules/*.md (9 rule files)
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Component-composition rule library. Installed under declared name, unmodified.

### threejs — source: mrgoonie/claudekit-skills @ 80113d8
- Skill name: threejs
- Source repository: https://github.com/mrgoonie/claudekit-skills
- Source commit: 80113d86bc4407f105af40a2c4ea58194f7c370a
- Installation scope: project-local (`.claude/skills/threejs/`)
- Files included: SKILL.md, references/*.md (19 reference docs)
- Contains executable scripts: no (community skill — full directory audited; pure reference docs, no scripts/hooks)
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Community-maintained; extra scrutiny applied per spec §4.5. Directory contains only markdown reference docs (fundamentals, loaders, textures, cameras, shaders, postprocessing, physics, WebGPU, etc.). No bundled executables.

### performance — source: addyosmani/web-quality-skills @ 95d6e25
- Skill name: performance
- Source repository: https://github.com/addyosmani/web-quality-skills
- Source commit: 95d6e255afe1596b557d7a8498517884438f5b3a
- Installation scope: project-local (`.claude/skills/performance/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Clean.

### core-web-vitals — source: addyosmani/web-quality-skills @ 95d6e25
- Skill name: core-web-vitals
- Source repository: https://github.com/addyosmani/web-quality-skills
- Source commit: 95d6e255afe1596b557d7a8498517884438f5b3a
- Installation scope: project-local (`.claude/skills/core-web-vitals/`)
- Files included: SKILL.md, references/LCP.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Clean.

### accessibility — source: addyosmani/web-quality-skills @ 95d6e25
- Skill name: accessibility
- Source repository: https://github.com/addyosmani/web-quality-skills
- Source commit: 95d6e255afe1596b557d7a8498517884438f5b3a
- Installation scope: project-local (`.claude/skills/accessibility/`)
- Files included: SKILL.md, references/A11Y-PATTERNS.md, references/WCAG.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: awesome-ux-skills also ships an `accessibility.md`; it was NOT installed. This web-quality `accessibility` is the sole one. No shadowing.
- Audit decision: PASS
- Reviewer notes: WCAG 2.2 audit guidance. Clean.

### best-practices — source: addyosmani/web-quality-skills @ 95d6e25
- Skill name: best-practices
- Source repository: https://github.com/addyosmani/web-quality-skills
- Source commit: 95d6e255afe1596b557d7a8498517884438f5b3a
- Installation scope: project-local (`.claude/skills/best-practices/`)
- Files included: SKILL.md
- Contains executable scripts: no
- Contains hooks: no
- Uses network access: no
- Reads environment variables: no
- Writes outside project: no
- Potential conflicts: none
- Audit decision: PASS
- Reviewer notes: Only danger-scan hit in the technical set was `process.env.NODE_ENV` inside a webpack config example (line ~425) — legitimate illustrative code, not a credential read.

---

## Rejections / quarantine

None.

## Deliberately excluded (not installed)

- UX: craft, persuasive-ux, ai-identifiers, ux-personas, empathy-mapping, journey-mapping, ux-storyboard
  (`craft` permanently excluded: its prohibitions on glow/gradients conflict with the product's intended visual language).
- Obsolete Next.js skills (`next-best-practices`, `next-upgrade`) — not installed per spec §5.
- Any duplicate `frontend-design` / `accessibility` from other repos — excluded to prevent shadowing.
