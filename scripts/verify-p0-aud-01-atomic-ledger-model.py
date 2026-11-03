"""Local concurrency model for the proposed atomic audit ledger. NOT production/Base44 QA."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import sqlite3
import threading

SCHEMA = """
CREATE TABLE audit (
  ledger_id INTEGER PRIMARY KEY,
  organization_id TEXT NOT NULL,
  audit_operation_id TEXT NOT NULL,
  immutable_sha256 TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE(organization_id, audit_operation_id)
);
"""
H1, H2 = "a" * 64, "b" * 64

def writer(db, org, key, digest):
    with sqlite3.connect(db, timeout=20) as conn:
        conn.execute("PRAGMA busy_timeout=20000")
        cursor = conn.execute(
            """INSERT INTO audit(organization_id,audit_operation_id,immutable_sha256,payload)
               VALUES (?,?,?,?)
               ON CONFLICT(organization_id,audit_operation_id) DO NOTHING""",
            (org, key, digest, "{}"))
        created = cursor.rowcount == 1
        row = conn.execute(
            "SELECT immutable_sha256 FROM audit WHERE organization_id=? AND audit_operation_id=?",
            (org, key)).fetchone()
        if not row or row[0] != digest:
            raise ValueError("AUDIT_OPERATION_ID_COLLISION")
        return created

with TemporaryDirectory(prefix="trp-audit-concurrency-") as directory:
    db = str(Path(directory) / "audit.sqlite")
    with sqlite3.connect(db) as conn:
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA journal_mode=WAL")
    start = threading.Barrier(8)
    def simultaneous(_):
        start.wait(timeout=15)
        return writer(db, "org-a", "same-operation", H1)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(simultaneous, range(8)))
    assert sum(results) == 1, results
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM audit WHERE organization_id='org-a'").fetchone()[0] == 1
    print("PASS SQLite-model 8 concurrent writers -> exactly 1 durable row")
    assert not writer(db, "org-a", "same-operation", H1)
    print("PASS idempotent retry does not create another row")
    assert writer(db, "org-b", "same-operation", H1)
    print("PASS same operation ID is independent across organizations")
    try:
        writer(db, "org-a", "same-operation", H2)
    except ValueError as exc:
        assert str(exc) == "AUDIT_OPERATION_ID_COLLISION"
    else:
        raise AssertionError("different semantics must be rejected")
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM audit").fetchone()[0] == 2
    print("PASS incompatible semantics rejected; total remains 2 (one per organization)")
print("MODEL-ONLY PASS — not proof that Base44 or PostgreSQL is deployed or transactionally tested")
