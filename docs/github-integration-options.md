# GitHub Integration Options

This document explores options for integrating Armchair's splitter and code explainer with GitHub, covering standalone desktop usage and PR pipeline automation.

---

## Current Architecture (Baseline)

Before exploring options, here's what exists today:

- **Splitter CLI**: `python -m code_splitter.main split --patch <file>` takes a unified diff and produces split patches, metadata JSON, mental model, and annotations
- **Backend API**: Express.js server at port 8787 with `POST /api/split` and `POST /api/review` endpoints that spawn the splitter as a subprocess
- **Frontend**: React dashboard at port 8686 for browsing results
- **Output**: Structured directory per analysis — `.patch` files, `metadata.json` (with mental model, annotations, dependencies), `summary.md`, and `apply_patches.sh`
- **Input flexibility**: The splitter accepts a patch file (`--patch`), a commit hash (`--commit`), or a branch comparison (`--target-branch` / `--base-branch`)

The key insight: the splitter already works on any unified diff. GitHub PRs produce unified diffs. The integration challenge is plumbing — getting the diff in, posting the results back.

---

## Part 1: Standalone Desktop Utility

### Option A: CLI Tool — `armchair pr <number>`

**What it does**: A CLI command that fetches a GitHub PR diff, runs the splitter, and either opens the dashboard or prints a summary to the terminal.

**How it works**:
```
armchair pr 42                      # Analyze PR #42 in current repo
armchair pr 42 --repo owner/repo    # Analyze PR #42 in a specific repo
armchair pr 42 --summary            # Print mental model + patch list to terminal
armchair pr 42 --open               # Run splitter and open dashboard in browser
```

**Implementation**:
1. A shell script or Python wrapper that:
   - Uses `gh pr diff 42` (GitHub CLI) to fetch the unified diff
   - Pipes it to the splitter: `python -m code_splitter.main split --patch /tmp/pr_42.patch`
   - Optionally starts the backend+frontend and opens the browser
2. No Docker required — runs directly if Python + Node are installed
3. Docker mode: same flow but runs inside the container

**Pros**:
- Minimal new code — glues existing `gh` CLI + splitter
- Works offline after fetching the diff
- No GitHub tokens needed beyond what `gh` already has
- Fastest path to a working integration

**Cons**:
- Requires `gh` CLI installed and authenticated
- Terminal-only unless dashboard is started separately
- No posting results back to GitHub

**Effort**: Small. ~100 lines of shell/Python.

---

### Option B: Desktop Dashboard with GitHub PR Browser

**What it does**: Extends the existing dashboard to browse and analyze GitHub PRs directly from the UI, alongside local repositories.

**How it works**:
1. User adds a GitHub remote (e.g., `owner/repo`) in Settings, providing a GitHub token
2. Dashboard shows a "Pull Requests" tab listing open PRs
3. Clicking a PR fetches its diff, runs the splitter, and displays the results in the existing patch/annotation viewer
4. User reviews the split patches and mental model in the same UI they use for local commits

**Implementation**:
1. **Backend additions**:
   - `GET /api/github/repos/:owner/:repo/pulls` — list PRs (proxies GitHub API)
   - `GET /api/github/repos/:owner/:repo/pulls/:number/diff` — fetch PR diff
   - `POST /api/github/split` — fetch PR diff + run splitter (combines the above)
   - GitHub token stored in `.armchair.json` alongside LLM config
2. **Frontend additions**:
   - New "GitHub PRs" tab or section in the repository panel
   - PR list component with status, author, title, branch info
   - Reuse existing `PatchDetailView` and `DiffViewer` for results
3. **Auth**: Personal Access Token (PAT) entered in Settings UI, stored locally

**Pros**:
- Unified experience — local repos and GitHub PRs in one dashboard
- Reuses all existing UI components
- No external service dependencies
- Token stays local

**Cons**:
- Requires GitHub PAT setup
- Backend becomes a GitHub API proxy (rate limits, pagination)
- PR comments/status not pushed back to GitHub

**Effort**: Medium. ~500-800 lines across backend + frontend.

---

### Option C: Electron/Tauri Desktop App

**What it does**: Wraps the dashboard in a native desktop application with GitHub OAuth integration, system tray, and file system access without Docker.

**Implementation**: Wrap the existing frontend in Electron or Tauri, bundle the backend + splitter, and add native OS integration (notifications, tray icon, OAuth flow).

**Pros**:
- Native app experience
- GitHub OAuth (no manual PAT management)
- No Docker or terminal needed

**Cons**:
- Large effort to build and maintain
- Cross-platform packaging complexity
- Bundles Python + Node runtime (~200MB+)

**Effort**: Large. Not recommended as a first step.

---

### Recommendation for Desktop

**Start with Option A** (CLI tool) — it can be built in a day and immediately provides value. Then evolve to **Option B** (dashboard PR browser) for a richer experience. Option C is premature.

---

## Part 2: PR Pipeline Integration

### Option D: GitHub Actions Workflow

**What it does**: A GitHub Action that runs the splitter on every PR and posts the results as a PR comment — mental model, patch breakdown, and annotations.

**How it works**:
```yaml
# .github/workflows/armchair.yml
name: Armchair Code Analysis
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get PR diff
        run: |
          git diff origin/${{ github.base_ref }}...HEAD > /tmp/pr.patch

      - name: Run Armchair Splitter
        uses: docker://armchr/explainer:latest
        with:
          entrypoint: python
          args: >
            -m code_splitter.main split
            --patch /tmp/pr.patch
            --output-dir /tmp/armchair-output
            --no-llm
        # Or with LLM:
        # env:
        #   OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Post PR Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const glob = require('glob');

            // Find the metadata file
            const metadataFiles = glob.sync('/tmp/armchair-output/**/metadata_*.json');
            if (metadataFiles.length === 0) return;

            const metadata = JSON.parse(fs.readFileSync(metadataFiles[0]));
            const mentalModel = metadata.mental_model || {};

            let body = `## Armchair Analysis\n\n`;

            if (mentalModel.summary) {
              body += `### Mental Model\n${mentalModel.summary}\n\n`;
              if (mentalModel.progression) {
                body += `**Patch Progression:**\n`;
                mentalModel.progression.forEach(p => body += `- ${p}\n`);
                body += '\n';
              }
              if (mentalModel.key_concepts) {
                body += `**Key Concepts:** ${mentalModel.key_concepts.join(', ')}\n\n`;
              }
              if (mentalModel.review_tips) {
                body += `**Review Tips:** ${mentalModel.review_tips}\n\n`;
              }
            }

            body += `### Patches (${metadata.total_patches})\n\n`;
            body += `| # | Name | Category | Files | Lines |\n`;
            body += `|---|------|----------|-------|-------|\n`;
            metadata.patches.forEach(p => {
              body += `| ${p.id} | ${p.name} | ${p.category} | ${p.files.length} | ${p.size_lines || '-'} |\n`;
            });

            // Find existing comment to update
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c =>
              c.body.includes('## Armchair Analysis') && c.user.type === 'Bot'
            );

            const params = {
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            };

            if (existing) {
              await github.rest.issues.updateComment({ ...params, comment_id: existing.id });
            } else {
              await github.rest.issues.createComment({ ...params, issue_number: context.issue.number });
            }
```

**Output in PR comment**:
```
## Armchair Analysis

### Mental Model
This PR adds user authentication with JWT tokens and session management.

**Patch Progression:**
- Patch 0 introduces the User model and database schema
- Patch 1 adds JWT token generation and validation
- Patch 2 implements login/logout API endpoints
- Patch 3 adds auth middleware to protected routes

**Key Concepts:** JWT, bcrypt hashing, middleware chain
**Review Tips:** Focus on token expiration handling and password hashing rounds.

### Patches (4)
| # | Name              | Category    | Files | Lines |
|---|-------------------|-------------|-------|-------|
| 0 | User Model        | feature     | 2     | 85    |
| 1 | JWT Utils         | feature     | 1     | 120   |
| 2 | Auth Endpoints    | feature     | 3     | 200   |
| 3 | Auth Middleware    | feature     | 4     | 95    |
```

**Pros**:
- Zero infrastructure — runs in GitHub's CI
- Works on any repo by adding a workflow file
- Can run with or without LLM (structural analysis still works without)
- Updates comment on each push (no spam)
- Distributable as a reusable GitHub Action (`uses: armchr/armchair-action@v1`)

**Cons**:
- CI minutes cost (splitter takes 30-60s without LLM, 2-5min with LLM)
- LLM API key must be stored as a GitHub secret
- Comment-only — no interactive dashboard experience
- Rate limits on very active repos

**Effort**: Medium. The workflow YAML + comment formatting script is ~200 lines. Packaging as a reusable action adds ~100 more.

---

### Option E: GitHub Actions + Hosted Dashboard Link

**What it does**: Extends Option D by uploading the full splitter output as a GitHub Actions artifact and optionally deploying a static version of the dashboard for each PR.

**How it works**:
1. Run the splitter in CI (same as Option D)
2. Upload the output directory as a GitHub Actions artifact
3. Optionally deploy the frontend as a static site (GitHub Pages, Cloudflare Pages, or Netlify) with the analysis results baked in
4. Post a PR comment with the mental model summary + a link to the full dashboard

**PR comment includes**:
```
## Armchair Analysis

[summary and table as in Option D]

[View full analysis in dashboard](https://armchair-previews.pages.dev/pr-42/)
[Download analysis artifact](link-to-actions-artifact)
```

**Implementation**:
1. Frontend needs a "static mode" — load results from a bundled JSON file instead of calling the backend API
2. CI step to copy `metadata.json` + patch files into the frontend's `dist/` directory
3. Deploy step using existing static hosting

**Pros**:
- Full interactive dashboard experience per PR
- No running server needed — fully static
- Artifact download allows offline review
- Best of both worlds: quick summary in comment, deep dive via link

**Cons**:
- Requires static hosting setup
- Frontend needs a "static/embedded data" mode (new code)
- Storage costs for artifacts/deployments

**Effort**: Medium-Large. The static mode for the frontend is the main new work (~300-400 lines). CI and hosting config is straightforward.

---

### Option F: GitHub App

**What it does**: A proper GitHub App that installs on repositories, receives PR webhooks, runs analysis, and posts results using GitHub's Checks API (with inline annotations on the diff).

**How it works**:
1. Install the Armchair GitHub App on a repository
2. On PR open/update, a webhook fires to a hosted backend
3. Backend fetches the PR diff, runs the splitter, and posts results via:
   - **Check Run**: Status on the PR with a summary
   - **Check Run Annotations**: Inline comments on specific lines of the diff (maps to splitter annotations)
   - **PR Comment**: Mental model and patch breakdown
4. Annotations appear directly in GitHub's "Files changed" tab

**GitHub Checks API annotations example**:
```json
{
  "title": "Armchair: Patch 2 — Auth Endpoints",
  "message": "This hunk adds the login handler. It validates credentials against the User model (Patch 0) and generates a JWT (Patch 1).",
  "annotation_level": "notice",
  "path": "src/routes/auth.js",
  "start_line": 15,
  "end_line": 42
}
```

**Architecture**:
```
GitHub webhook → Hosted backend (Node.js/Express)
                      ↓
              Fetch PR diff via GitHub API
                      ↓
              Run splitter (subprocess or container)
                      ↓
              Post results via GitHub Checks API
              Post mental model as PR comment
```

**Pros**:
- Best native GitHub experience — annotations appear inline on the diff
- No PAT management — GitHub App tokens are scoped and auto-managed
- Works for all repos that install the app
- Can add a "Re-analyze" button via Check Run rerequested events
- Marketplace distribution potential

**Cons**:
- Requires hosted infrastructure (server to receive webhooks, run splitter)
- GitHub App registration and key management
- Must handle concurrent webhook events, queuing, timeouts
- LLM costs per PR analysis

**Effort**: Large. Backend webhook handler + Checks API integration + hosting + app registration. ~1000-1500 lines of new code plus infrastructure.

---

### Option G: Self-Hosted GitHub App (Docker Compose)

**What it does**: Same as Option F, but packaged as a Docker Compose setup that teams self-host alongside their own infrastructure.

**How it works**:
```yaml
# docker-compose.github-app.yml
services:
  armchair-github:
    image: armchr/explainer:latest
    environment:
      - GITHUB_APP_ID=12345
      - GITHUB_PRIVATE_KEY_PATH=/app/config/private-key.pem
      - GITHUB_WEBHOOK_SECRET=...
      - ARMCHAIR_MODEL_API_KEY=...
    ports:
      - "9090:9090"  # Webhook endpoint
    volumes:
      - ./config:/app/config
      - ./output:/app/output
```

Teams point their GitHub App's webhook URL to their self-hosted instance. All analysis runs on their own hardware, LLM keys stay internal.

**Pros**:
- Data stays on-premise
- Teams control LLM costs and model choice
- No SaaS dependency

**Cons**:
- Teams must manage infrastructure
- Needs a publicly reachable endpoint (or use smee.io / ngrok for tunneling)

**Effort**: Medium (on top of Option F). Docker Compose config + setup docs.

---

## Comparison Matrix

| Option | GitHub Integration | Interactive UI | Infra Required | LLM Required | Effort |
|--------|-------------------|----------------|----------------|--------------|--------|
| **A: CLI tool** | Fetch PR diff only | Terminal output | None (local) | Optional | Small |
| **B: Dashboard PR browser** | Fetch + display | Full dashboard | Local Docker/Node | Optional | Medium |
| **C: Desktop app** | Full OAuth | Native app | Bundled | Optional | Large |
| **D: GitHub Action (comment)** | PR comment | No | GitHub CI | Optional | Medium |
| **E: Action + dashboard** | Comment + link | Static dashboard | CI + static host | Optional | Medium-Large |
| **F: GitHub App** | Inline annotations | No | Hosted server | Optional | Large |
| **G: Self-hosted App** | Inline annotations | No | Self-hosted Docker | Optional | Large (on F) |

---

## Recommended Roadmap

### Phase 1: CLI + GitHub Action (weeks 1-2)

Build **Option A** (CLI) and **Option D** (GitHub Action) in parallel — they share the same core: "get a diff, run the splitter, format the output."

Deliverables:
- `armchair pr <number>` CLI command
- `armchr/armchair-action@v1` reusable GitHub Action
- PR comments with mental model + patch table

### Phase 2: Dashboard PR Browser (weeks 3-4)

Build **Option B** — add GitHub PR browsing to the existing dashboard. This gives the full interactive experience for developers who want to deeply review a PR's structure locally.

### Phase 3: GitHub Action + Static Dashboard (weeks 5-6)

Build **Option E** — add a static mode to the frontend and deploy per-PR dashboards from CI. This bridges the gap between the quick PR comment and the full local dashboard.

### Phase 4: GitHub App (future)

Build **Option F/G** when there's demand for inline annotations and a zero-config installation experience. This is the most polished integration but requires the most infrastructure.

---

## Technical Notes

### Diff Compatibility
The splitter already accepts unified diffs via `--patch`. GitHub's PR diffs (`gh pr diff`, API `/pulls/:number`) produce unified diffs. No format conversion needed.

### LLM-Free Mode
All options work without an LLM. The splitter performs structural analysis (dependency graph, symbol extraction, semantic grouping by pattern) without LLM calls. The mental model and annotation enrichment are LLM-only features — they gracefully degrade to empty when no LLM is configured.

### Annotation Mapping
The splitter produces annotations with `file_path`, `start_line`, `end_line`, and `description`. These map directly to:
- GitHub Checks API `annotations` (Option F)
- PR review comments via `pulls/:number/comments` with `path`, `line`, `body` (Option D/E)
- Dashboard inline annotations (Options A/B, already implemented)

### Rate Limits
- GitHub API: 5,000 requests/hour with PAT, 15,000 with GitHub App installation token
- Single PR analysis: ~3-5 API calls (fetch diff, post comment, optional status)
- Well within limits for any reasonable PR volume
