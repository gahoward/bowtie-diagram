# Fixtures

Checked-in documents as they were actually exported at a given schema
version, for `test_migrations.py` (proposals/12).

`schema-v10.json` is the quantitative demo as v10 exported it. These
files are **frozen**: never regenerate one from a later build. The whole
point is to test each migration against what an old export really looked
like, rather than against what today's code assumes it looked like. A
schema bump adds `schema-v<new>.json` alongside, it does not rewrite the
older ones.
