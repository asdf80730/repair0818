# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations（本機 ＝ `/usr/local/bin/gh`，v2.102.0；鑒定用 `GH_TOKEN`＝origin URL 內嵌的 token）。

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## 無 `gh` 時的等價 curl（omp 沙箱）

沙箱只有 `bun`、`python3`：`gh` 不存在（`read issue://<n>` 亦因此報 `GitHub CLI (gh) is not installed`）。token 取 `git remote -v` 的 origin URL 內嵌值（或 `GITHUB_TOKEN_REPAIR0818`）；每支調用帶 `-H "Authorization: token $T" -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json'`，base = `https://api.github.com/repos/asdf80730/repair0818`。

- **讀票**：`GET <base>/issues/<n>` → `.body`／`.labels[].name`／`.issue_dependencies_summary.blocked_by`
- **列票**：`GET <base>/issues?state=open&labels=<label>`
- **開票**：`POST <base>/issues`，body `{"title","body","labels"}`
- **留言**：`POST <base>/issues/<n>/comments`，body `{"body"}`
- **閉票／認領**：`PATCH <base>/issues/<n>`，body `{"state":"closed"}` ／ `{"assignees":["<dev>"]}`
- **掛 sub-issue**：`POST <base>/issues/<map>/sub_issues`，body `{"sub_issue_id":<db id>}`（db id＝`GET <base>/issues/<n>` 的 `.id`，非 `#number`／`node_id`）
- **阻斷邊**：`POST <base>/issues/<child>/dependencies/blocked_by`，body `{"issue_id":<blocker 的 .id>}`

JSON body 先寫進 `/tmp/*.json`，再以 `--data-binary '@-'` ＋ `< file` 送（避開 shell 引號轉義）。
