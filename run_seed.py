"""
Standalone polling unit seeder — run from the project root:
    python run_seed.py

Set GITHUB_TOKEN env var to avoid API rate limits (5000/hr vs 60/hr).
"""
import logging
import os
import sys

# Show DEBUG so we can see the actual JSON structure
logging.basicConfig(level=logging.DEBUG, format="%(levelname)-8s %(message)s")

DB = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:REMOVED@db.uewukxlxygscobkniunk.supabase.co:5432/postgres",
)
os.environ["DATABASE_URL"] = DB

sys.path.insert(0, os.path.dirname(__file__))
from backend.scripts.seed_polling_units import seed

result = seed()
print(f"\nDone — {result['inserted']} inserted, {result['skipped']} skipped.")
