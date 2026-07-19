Task 5: Wire emitter → push after insert

Status: Completed

- Added NotificationEmitter tests covering device_notifications_enabled gating, successful insert push, and deduped skip behavior.
- Implemented NotificationEmitter._maybe_push with safe Expo push sending, including token lookup, payload construction, and exception swallowing.
- Updated all emit methods to call _maybe_push only after successful insert_deduped.
- Wired PushTokensRepository into TransactionService and uploads workers so emitters constructed in product paths can send pushes.
- Ran `uv run python -m pytest tests/features/notifications -q` in `backend` with all 22 tests passing.

