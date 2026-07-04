"""
Standalone polling unit seeder — run from the project root:

    # Windows
    set DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
    python run_seed.py

    # macOS / Linux
    DATABASE_URL="postgresql://..." python run_seed.py
"""
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")

DB = os.environ.get("DATABASE_URL")
if not DB:
    print("ERROR: DATABASE_URL environment variable is not set.")
    print("  Set it to your Supabase session pooler URI before running.")
    sys.exit(1)

os.environ["DATABASE_URL"] = DB

sys.path.insert(0, os.path.dirname(__file__))
from backend.scripts.seed_polling_units import seed

result = seed()
print(f"\nDone — {result['inserted']} inserted, {result['skipped']} skipped.")
