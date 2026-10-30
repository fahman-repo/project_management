# Project Workspace Rules (`AGENTS.md`)

## 1. Automatic Implementation Plan Persistence (`/plan`)

Whenever the user invokes `/plan` or requests an implementation plan:

1. **Create the UI Artifact (if supported by the agent)**: Write the implementation plan artifact to `<Artifact Directory>/<plan_name>.md` with `ArtifactMetadata` (`RequestFeedback: true`, `UserFacing: true`) so the interactive Proceed/Feedback UI works as expected.
2. **Persist in Project Repository (`docs/plans/`)**: Automatically write the exact same plan content to the workspace root under:
   `docs/plans/<timestamp_ddmmyy>_<metadata_title>_plan.md`
   - `<timestamp_ddmmyy>`: 6-digit current local date in `DDMMYY` format (e.g., `301026` for 30 October 2026).
   - `<metadata_title>`: Lowercase `snake_case` slug summarizing the feature/plan title (e.g., `resource_capacity_workload_heatmap`).
   - Example filename: `docs/plans/301026_resource_capacity_workload_heatmap_plan.md`.
3. **Keep in Sync**: If the implementation plan is revised before or during execution, update both the artifact file and the corresponding `docs/plans/<timestamp_ddmmyy>_<metadata_title>_plan.md` file so the repository copy always reflects the latest approved plan.
4. **Never Overwrite Other Plans**: Each new `/plan` topic must generate its own `<timestamp_ddmmyy>_<metadata_title>_plan.md` file in `docs/plans/` so historical plans are preserved.

---

## 2. Automatic Walkthrough & Execution Summary Persistence (`docs/walkthrough/`)

Whenever an agent finishes executing a feature implementation, bug fix, refactoring, or code change task:

1. **Create the UI Walkthrough Artifact (if supported by the agent)**: Write the walkthrough summary to `<Artifact Directory>/walkthrough.md`.
2. **Persist in Project Repository (`docs/walkthrough/`)**: Automatically record and save the summary of all changes made, files modified, and verification results to the workspace root under:
   `docs/walkthrough/<timestamp_ddmmyy>_<metadata_title>_walkthrough.md`
   - `<timestamp_ddmmyy>`: 6-digit current local date in `DDMMYY` format (e.g., `301026` for 30 October 2026).
   - `<metadata_title>`: Lowercase `snake_case` slug summarizing the completed task/feature title (matching the corresponding plan's `<metadata_title>` when applicable, e.g., `resource_capacity_workload_heatmap`).
   - Example filename: `docs/walkthrough/301026_resource_capacity_workload_heatmap_walkthrough.md`.
3. **Keep in Sync**: If follow-up changes are made to the same task within the session, update the corresponding `docs/walkthrough/<timestamp_ddmmyy>_<metadata_title>_walkthrough.md` file.
4. **Never Overwrite Other Walkthroughs**: Each distinct task or feature execution must generate its own `<timestamp_ddmmyy>_<metadata_title>_walkthrough.md` file in `docs/walkthrough/` so the project execution history is preserved.

