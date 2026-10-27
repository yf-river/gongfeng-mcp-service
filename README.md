# gongfeng-mcp-server

Local stdio MCP server for Tencent Gongfeng. It wraps Gongfeng `/api/v3`, local Git over SSH, and a constrained workspace into AI-friendly tools.

## Install

```bash
npm install
npm run build
```

## Configuration

Sensitive values are read only from environment variables.

```bash
export GONGFENG_API_BASE=https://git.code.tencent.com
export GONGFENG_PRIVATE_TOKEN=...
export GONGFENG_SSH_KEY_PATH=$HOME/.ssh/id_rsa
export GONGFENG_KNOWN_HOSTS_PATH=$HOME/.ssh/known_hosts
export GONGFENG_WORKDIR=$HOME/work/gongfeng
```

`GONGFENG_API_URL` and `GONGFENG_ACCESS_TOKEN` are also accepted for compatibility with existing Gongfeng MCP configs.

MCP config example:

```json
{
  "mcpServers": {
    "gongfeng": {
      "command": "node",
      "args": ["/data/ida/gongfeng-mcp-server/dist/index.js"],
      "env": {
        "GONGFENG_API_BASE": "https://git.code.tencent.com",
        "GONGFENG_PRIVATE_TOKEN": "<token>",
        "GONGFENG_SSH_KEY_PATH": "/home/user/.ssh/id_rsa",
        "GONGFENG_KNOWN_HOSTS_PATH": "/home/user/.ssh/known_hosts",
        "GONGFENG_WORKDIR": "/home/user/work/gongfeng"
      },
      "transportType": "stdio",
      "disabled": false
    }
  }
}
```

## Tools

File and local Git:

- `gongfeng_get_file`
- `gongfeng_create_file`
- `gongfeng_update_file`
- `gongfeng_delete_file`
- `gongfeng_clone_repo`
- `gongfeng_git_status`
- `gongfeng_git_commit_changes`

Branches:

- `gongfeng_list_branches`
- `gongfeng_get_branch`
- `gongfeng_create_branch`
- `gongfeng_delete_branch`

Tags:

- `gongfeng_list_tags`
- `gongfeng_get_tag`
- `gongfeng_create_tag`
- `gongfeng_delete_tag`

Merge requests:

- `gongfeng_create_merge_request`
- `gongfeng_list_merge_requests`
- `gongfeng_get_merge_request`
- `gongfeng_update_merge_request`
- `gongfeng_get_merge_request_changes`
- `gongfeng_invite_mr_reviewers`
- `gongfeng_remove_mr_reviewers`

Reviews:

- `gongfeng_get_mr_review`
- `gongfeng_set_mr_reviewer_summary`
- `gongfeng_reopen_mr_review`
- `gongfeng_create_review`
- `gongfeng_list_reviews`
- `gongfeng_get_review`
- `gongfeng_invite_reviewers`
- `gongfeng_remove_reviewers`
- `gongfeng_update_review`
- `gongfeng_get_review_changed_files`

List tools support `page`, `per_page`, and `response_format=json|markdown`.

## Safety

Destructive tools require `confirm_target` to exactly match the target:

- Delete file: `confirm_target` equals `file_path`
- Delete branch: `confirm_target` equals `branch`
- Delete tag: `confirm_target` equals `tag_name`
- Remove reviewers: `confirm_target` equals `<resource_id>:<reviewer_id,reviewer_id>`

Local filesystem access is constrained to `GONGFENG_WORKDIR`.

## Test

```bash
npm test
npm run build
```

Integration tests against a real project should only be added/run when `GONGFENG_TEST_PROJECT` is explicitly set. This package does not run real delete operations by default.
