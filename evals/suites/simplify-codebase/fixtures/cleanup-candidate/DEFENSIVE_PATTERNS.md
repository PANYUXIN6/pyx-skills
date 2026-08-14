# Defensive Patterns

- `app.py` calling `format_name` is the active runtime path and must remain.
- `legacy_format_name` has no compatibility, persistence, dynamic-loading, or external-consumer commitment in this fixture; historical tests and documentation alone do not protect it.
- This fixture has no generated files or repository-specific aggregate gate.
