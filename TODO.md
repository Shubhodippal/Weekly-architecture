# Remove Penalty Feature - TODO

- [x] 1. Edit `src/handlers/challenges/expireChallenge.js` — Remove penalty insertion block
- [x] 2. Edit `public/assets/js/dashboard.js` — Remove `not_attempted` from grade labels/classes and admin submissions view
- [x] 3. Edit `src/handlers/submissions/listSubmissions.js` — Remove `not_attempted` sort logic
- [x] 4. Edit `public/assets/css/style.css` — Remove `.grade-badge--not_attempted` style (already removed)
- [x] 5. Create `migrations/014_remove_penalties.sql` — Delete existing penalty records
- [x] 6. Execute migration on remote DB — 0 penalty records remain
- [x] 7. Deploy to production — 2 modified assets uploaded successfully

## Testing Results (All Passed ✅)
- [x] Test 1: `expireChallenge.js` has no penalty logic (0 matches for not_attempted/penalty/-10)
- [x] Test 2: No penalty references in any backend `src/` files (only unrelated OTP `-10 minutes`)
- [x] Test 3: Frontend `dashboard.js` only has defensive guards to skip legacy records
- [x] Test 4: No `not_attempted` CSS styling exists
- [x] Test 5: Leaderboard and user profile handlers have no penalty references
- [x] Test 6: `gradeSubmission.js` does not allow `not_attempted` as a valid grade
- [x] Test 7: Remote DB has 0 `not_attempted` records, no negative points
- [x] Test 8: Dev server serves modified `dashboard.js` with 200 OK
