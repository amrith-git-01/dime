-- The predictive engine (0010_engine, 0011_engine_usage) was reverted: drop its tables. IF EXISTS so fresh databases,
-- which never ran those migrations, apply this cleanly.
DROP TABLE IF EXISTS forecast_snapshots;
DROP TABLE IF EXISTS prediction_feedback;
DROP TABLE IF EXISTS txn_labels;
DROP TABLE IF EXISTS payee_patterns;
DROP TABLE IF EXISTS engine_patterns;
DROP TABLE IF EXISTS engine_usage;
