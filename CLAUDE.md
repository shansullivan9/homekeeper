# HomeKeeper — Working notes for Claude

## Workflow

- The deploy ships from `main`. Branches don't go live until merged.
- After every `git push` to a feature branch, **tell the user how to
  merge it to `main`** (link to the GitHub compare URL + the click
  path: Create PR → Merge → Confirm). Don't wait to be asked.
