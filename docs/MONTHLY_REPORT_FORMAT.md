# Monthly report format

Produced by **Progress → Monthly report** (`src/monthlyReport.ts`). Two files can be downloaded for any month and year up to the current month:

- `gym-ledger-report-YYYY-MM.md` — a readable report.
- `gym-ledger-report-YYYY-MM.json` — the same content as structured data.

The report is built in the browser from the signed-in user's records, read fresh from the database (paginated, so more than 1,000 rows per table are not silently cut off). Row Level Security means only that user's rows can be returned; the builder additionally drops any row that carries a different `user_id`. It is assembled from an explicit allow-list of fields: no user id, email, token, password, or key is ever written, and the profile contributes only the calorie goals.

## Conventions

| Convention | Meaning |
| --- | --- |
| `recorded` | Entered by the user or captured by the app (timer, manual entry, food log, weigh-in). |
| `estimate` | Calculated from recorded values with the stated assumptions. Not a measurement. |
| `null` / “—” | Not recorded or cannot be calculated. **Never a zero.** A day with no food entries has `intake_kcal: null`; an explicit 0 kcal day has `0`. |
| Dates | `Asia/Kolkata` calendar dates (`YYYY-MM-DD`). Timestamps are UTC ISO strings. |
| Units | kg, minutes, kcal, km; strength volume = load × reps over completed sets that have a recorded load. |
| Balance sign | Balance = estimated expenditure − calories consumed. Positive = deficit, negative = surplus. |

A workout is counted on the date it **started**, even if it finished after midnight. Discarded and unfinished workouts are excluded everywhere.

## JSON structure (`schema_version` 1)

```
schema, schema_version, generated_at
reporting_period   month, start_date, end_date, timezone, days_in_month, days_covered,
                   last_day_included, is_partial, note
units, provenance_legend
overview           recorded{ training_days, completed_strength_sessions, cardio_sessions,
                             cardio_active_minutes, completed_sets, weigh_ins,
                             days_with_calorie_intake_recorded, strength_sessions_previous_month }
                   estimate{ exercise_kcal, exercise_records_without_estimate }
consistency        training_days, days_covered, training_day_share_percent, longest_streak_days,
                   streak_at_end_of_period_days, training_days_per_week[], note
strength           sessions[ date, title, started_at, completed_at,
                             recorded{ duration_minutes, completed_sets, total_reps, volume_kg, exercises[] },
                             estimate{ active_kcal, method, confidence } ]
                   by_exercise[], total_volume_kg, personal_records[], sessions_with_unknown_duration
cardio             sessions[ date, activity_type, recorded{ active_minutes, paused_minutes, distance_km,
                             average_speed_kmh, incline_percent, heart_rate_bpm, machine_calories_kcal },
                             estimate{ active_kcal, method, confidence } ]
                   totals{ recorded{...}, estimate{ active_kcal, sessions_without_estimate } }
nutrition          daily[ date, recorded, intake_kcal, food_log_kcal, quick_add_kcal ]
                   monthly{ recorded{ total_intake_kcal_on_recorded_days, days_recorded, days_not_recorded,
                            average_intake_kcal_per_recorded_day, food_log_macros_g{...} }, note }
body_weight        recorded{ entries[], first_kg, last_kg, lowest_kg, highest_kg, change_first_to_last_kg }
                   estimate{ trend_kg_per_week, trend_method }
calorie_balance    daily[ date, intake_*, estimated_exercise_kcal, estimated_expenditure_kcal,
                          estimated_balance_kcal, estimated_balance_kind ]
                   monthly{ estimate{ days_with_balance, total_balance_kcal, average_balance_kcal_per_day,
                            deficit_days, surplus_days }, convention, goals_in_effect{...} }
data_quality       days_without_intake[], days_without_balance[], has_weigh_in_this_month,
                   maintenance_estimate_configured, exercise_records_without_estimate,
                   strength_sessions_with_unknown_duration, assumptions[]
```

`estimate.confidence` is one of `speed_based`, `machine_reported`, `assumed_intensity` or `unavailable` (then `active_kcal` is `null`).

## Edge cases

- **Empty month:** every section is present; counts are 0, but amounts that need data (`intake_kcal`, averages, totals, weight change, trend, balance) are `null`, and every day appears in `days_without_intake`.
- **Month in progress:** only days up to today are covered (`days_covered`, `last_day_included`, `is_partial: true`); future days are not reported as gaps. A streak is not broken just because today has no workout yet.
- **Future month:** `days_covered: 0` and a note saying the month has not started.
- **Personal records:** the heaviest completed load per exercise this month, compared with the best of all earlier completed history (`is_new_personal_record`; `first_recorded_load` when there is no earlier record).
- **Weight trend:** a least-squares slope per week; only with at least 3 weigh-ins spanning at least 6 days, otherwise `null`.
- **Manual calorie entries** are included only if the calorie migration has been applied; if not, the download says they were left out.

## Limits

Exercise calories and balance rest on the assumptions printed in `data_quality.assumptions` (the full formula list is in `PROJECT_CONTEXT.md`). They are estimates for tracking trends, not physiological measurements.
