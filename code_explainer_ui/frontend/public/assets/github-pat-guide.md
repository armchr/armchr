# Setting Up a GitHub Personal Access Token

Armchair uses a GitHub Personal Access Token (PAT) to access pull requests, post comments, and interact with repositories on your behalf. This guide walks you through creating one with the right permissions.

---

## Step 1: Go to GitHub Token Settings

1. Sign in to [github.com](https://github.com)
2. Click your **profile picture** (top-right) and select **Settings**
3. In the left sidebar, scroll down and click **Developer settings**
4. Click **Personal access tokens**, then choose between:
   - **Fine-grained tokens** (recommended) -- scoped to specific repositories
   - **Tokens (classic)** -- broader access, simpler setup

---

## Step 2a: Create a Fine-Grained Token (Recommended)

Fine-grained tokens let you limit access to specific repositories, which is more secure.

1. Click **Generate new token**
2. Fill in:
   - **Token name**: `Armchair` (or any name you like)
   - **Expiration**: Choose a duration (e.g., 90 days)
   - **Resource owner**: Select the organization or your personal account
   - **Repository access**: Choose **Only select repositories** and pick the repos you want Armchair to work with
3. Under **Permissions**, expand **Repository permissions** and set:
   - **Contents**: `Read-only` -- needed to fetch PR diffs
   - **Pull requests**: `Read and write` -- needed to list PRs and post comments
   - **Metadata**: `Read-only` -- automatically granted
4. Click **Generate token**
5. **Copy the token immediately** -- you won't be able to see it again

### Optional permissions for Restack (force-push)

If you plan to use the **Restack PR** feature (which replaces PR commits with split patches), you also need:

- **Contents**: `Read and write` (instead of Read-only)

---

## Step 2b: Create a Classic Token (Alternative)

Classic tokens are simpler but grant broader access.

1. Click **Generate new token (classic)**
2. Fill in:
   - **Note**: `Armchair`
   - **Expiration**: Choose a duration
3. Select scopes:
   - **`repo`** -- full control of private repositories (includes reading PRs, posting comments, and pushing)

   If you only work with public repositories, you can use:
   - **`public_repo`** -- access to public repositories only
4. Click **Generate token**
5. **Copy the token immediately**

---

## Step 3: Add the Token to Armchair

1. Open the Armchair dashboard
2. Click the **menu icon** (top-right) and select **Settings**
3. Expand the **GitHub Integration** section
4. Paste your token into the **GitHub Personal Access Token** field
5. Click **Verify** to confirm the token works
6. Add the repositories you want to connect (e.g., `myorg/myrepo`)
7. Click **Save**

Your token is stored locally in your `.armchair.json` configuration file and is never sent anywhere except to the GitHub API.

---

## Permissions Summary

| Feature | Fine-Grained Permissions | Classic Scope |
|---|---|---|
| List & view PRs | Contents: Read, Pull requests: Read | `repo` or `public_repo` |
| Post PR comments | Pull requests: Read and write | `repo` or `public_repo` |
| Restack PR (force-push) | Contents: Read and write, Pull requests: Read and write | `repo` |

---

## Troubleshooting

### "Bad credentials" error
- Your token may have expired. Generate a new one and update it in Settings.

### "Not Found" error on a private repo
- Make sure the token has access to that specific repository (for fine-grained tokens, the repo must be selected during creation).

### "Resource not accessible by integration"
- The token doesn't have the required permissions. Regenerate with the correct scopes listed above.

### Token works but no PRs appear
- Make sure you've added the repository in the **Connected Repositories** section of GitHub settings (e.g., `owner/repo`).
- Verify the repository has open pull requests.

---

## Security Tips

- Use **fine-grained tokens** scoped to only the repositories you need
- Set an **expiration date** and rotate tokens regularly
- Never share your token or commit it to version control
- Armchair stores the token locally and only sends it to `api.github.com`
