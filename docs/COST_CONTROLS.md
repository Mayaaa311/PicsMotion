# Cost Controls

Paid providers are only reachable in `AI_PROVIDER_MODE=live`. When enabled, spend
is bounded by design (spec §17.18):

- **Mock-first development.** Default mode is `mock`; no calls, no cost.
- **Daily cap.** `MAX_DAILY_AI_COST_USD` (default 5). Requests stop when exceeded.
- **Candidate cap.** `MAX_CANDIDATES_PER_REGION` (default 1); more only for
  low-confidence or user-requested regions.
- **Input resolution limits & crop-based completion** — reconstruct only the local
  hidden region, not the full photo.
- **Result cache** keyed by (image hash, mask hash, endpoint, model version,
  parameters). Unchanged inputs never re-call a provider.
- **Cost estimate before processing** and per-request usage logging (provider,
  endpoint, model, request id, cost metadata).

Verify current spend/estimates via the ai-service provider request records and
pipeline reports (Milestone 7).
