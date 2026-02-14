"""
Mini-Core Banking API Server

Serves both the REST API (backed by PostgreSQL) and the built React frontend.
Reads DB connection from .env (same variables Liquibase uses).

Usage:
    pip install -r requirements.txt
    python server.py              # API + static files on :5001
"""

import json
import os
from datetime import date, datetime
from decimal import Decimal
from functools import wraps

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = Flask(__name__, static_folder="../web/dist", static_url_path="")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "banking_system"),
    "user": os.getenv("DB_USERNAME", "admin"),
    "password": os.getenv("DB_PASSWORD", "mysecretpassword"),
    "options": f"-c search_path={os.getenv('DB_SCHEMA', 'minicore')}",
}


def get_db():
    if "db" not in g:
        g.db = psycopg2.connect(**DB_CONFIG)
        g.db.autocommit = False
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# JSON serialisation for Decimal / datetime / date
# ---------------------------------------------------------------------------

class CustomEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, date):
            return obj.isoformat()
        return super().default(obj)


app.json_provider_class = None  # use our custom approach below


def json_response(data, status=200):
    return app.response_class(
        json.dumps(data, cls=CustomEncoder),
        status=status,
        mimetype="application/json",
    )


# ---------------------------------------------------------------------------
# CORS (for dev mode: React on :3000, API on :5001)
# ---------------------------------------------------------------------------

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
    return response


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def handle_db_error(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except psycopg2.errors.RaiseException as e:
            # Triggers that RAISE (lifecycle validation, immutability, etc.)
            db = g.pop("db", None)
            if db:
                db.rollback()
                db.close()
            msg = str(e).split("\n")[0]  # first line is the message
            return json_response({"error": msg}, 422)
        except psycopg2.errors.UniqueViolation as e:
            db = g.pop("db", None)
            if db:
                db.rollback()
                db.close()
            return json_response({"error": "Duplicate record: " + str(e).split("\n")[0]}, 409)
        except psycopg2.errors.ForeignKeyViolation as e:
            db = g.pop("db", None)
            if db:
                db.rollback()
                db.close()
            return json_response({"error": "Invalid reference: " + str(e).split("\n")[0]}, 422)
        except psycopg2.errors.CheckViolation as e:
            db = g.pop("db", None)
            if db:
                db.rollback()
                db.close()
            return json_response({"error": "Validation failed: " + str(e).split("\n")[0]}, 422)
        except psycopg2.Error as e:
            db = g.pop("db", None)
            if db:
                db.rollback()
                db.close()
            return json_response({"error": str(e).split("\n")[0]}, 500)
    return wrapper


# ---------------------------------------------------------------------------
# Helper: row dict from cursor
# ---------------------------------------------------------------------------

def fetch_all(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def fetch_one(cur):
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    return dict(zip(cols, row)) if row else None


# ===================================================================
# API ENDPOINTS
# ===================================================================

# ---------------------------------------------------------------------------
# GET /api/accounts  (optional ?search= filter)
# ---------------------------------------------------------------------------
@app.route("/api/accounts")
@handle_db_error
def list_accounts():
    db = get_db()
    cur = db.cursor()
    search = request.args.get("search", "").strip()
    if search:
        cur.execute(
            """SELECT account_id, account_number, product_type, status,
                      available_balance, collected_balance, currency_code,
                      created_by, created_at, updated_at
                 FROM accounts
                WHERE account_number ILIKE %s
                   OR CAST(account_id AS TEXT) ILIKE %s
                ORDER BY account_id""",
            (f"%{search}%", f"%{search}%"),
        )
    else:
        cur.execute(
            """SELECT account_id, account_number, product_type, status,
                      available_balance, collected_balance, currency_code,
                      created_by, created_at, updated_at
                 FROM accounts
                ORDER BY account_id"""
        )
    return json_response(fetch_all(cur))


# ---------------------------------------------------------------------------
# GET /api/accounts/<id>
# ---------------------------------------------------------------------------
@app.route("/api/accounts/<int:account_id>")
@handle_db_error
def get_account(account_id):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """SELECT account_id, account_number, product_type, status,
                  available_balance, collected_balance, currency_code,
                  created_by, created_at, updated_at
             FROM accounts
            WHERE account_id = %s""",
        (account_id,),
    )
    row = fetch_one(cur)
    if not row:
        return json_response({"error": "Account not found"}, 404)
    return json_response(row)


# ---------------------------------------------------------------------------
# POST /api/accounts
# ---------------------------------------------------------------------------
@app.route("/api/accounts", methods=["POST"])
@handle_db_error
def create_account():
    data = request.get_json(force=True)
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """INSERT INTO accounts (account_number, product_type, status,
                  available_balance, collected_balance, currency_code, created_by)
             VALUES (%s, %s, %s, %s, %s, %s, %s)
          RETURNING account_id, account_number, product_type, status,
                    available_balance, collected_balance, currency_code,
                    created_by, created_at, updated_at""",
        (
            data["account_number"],
            data.get("product_type", "DDA"),
            data.get("status", "ACTIVE"),
            data.get("available_balance", 0),
            data.get("collected_balance", 0),
            data.get("currency_code", "USD"),
            data.get("created_by"),
        ),
    )
    row = fetch_one(cur)
    db.commit()
    return json_response(row, 201)


# ---------------------------------------------------------------------------
# PATCH /api/accounts/<id>  (update status)
# ---------------------------------------------------------------------------
@app.route("/api/accounts/<int:account_id>", methods=["PATCH"])
@handle_db_error
def update_account(account_id):
    data = request.get_json(force=True)
    db = get_db()
    cur = db.cursor()
    fields = []
    values = []
    for col in ("status",):
        if col in data:
            fields.append(f"{col} = %s")
            values.append(data[col])
    if not fields:
        return json_response({"error": "No fields to update"}, 400)
    values.append(account_id)
    cur.execute(
        f"""UPDATE accounts SET {', '.join(fields)}
             WHERE account_id = %s
         RETURNING account_id, account_number, product_type, status,
                   available_balance, collected_balance, currency_code,
                   created_by, created_at, updated_at""",
        values,
    )
    row = fetch_one(cur)
    if not row:
        return json_response({"error": "Account not found"}, 404)
    db.commit()
    return json_response(row)


# ---------------------------------------------------------------------------
# GET /api/accounts/<id>/transactions
# ---------------------------------------------------------------------------
@app.route("/api/accounts/<int:account_id>/transactions")
@handle_db_error
def list_account_transactions(account_id):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """SELECT t.transaction_id, t.account_id, t.original_transaction_id,
                  t.transaction_code, tc.description AS transaction_description,
                  t.amount, t.direction, t.status,
                  t.json_payload, t.effective_date,
                  t.created_by, t.created_at,
                  tb.available_balance AS post_available_balance,
                  tb.collected_balance AS post_collected_balance
             FROM transactions t
             JOIN transaction_codes tc ON tc.transaction_code = t.transaction_code
        LEFT JOIN transaction_balances tb ON tb.transaction_id = t.transaction_id
            WHERE t.account_id = %s
            ORDER BY t.transaction_id DESC""",
        (account_id,),
    )
    return json_response(fetch_all(cur))


# ---------------------------------------------------------------------------
# POST /api/transactions
# ---------------------------------------------------------------------------
@app.route("/api/transactions", methods=["POST"])
@handle_db_error
def create_transaction():
    data = request.get_json(force=True)
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """INSERT INTO transactions
                  (account_id, original_transaction_id, transaction_code,
                   amount, direction, status, json_payload, effective_date, created_by)
             VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
          RETURNING transaction_id, account_id, original_transaction_id,
                    transaction_code, amount, direction, status,
                    json_payload, effective_date, created_by, created_at""",
        (
            data["account_id"],
            data.get("original_transaction_id"),
            data["transaction_code"],
            data["amount"],
            data["direction"],
            data.get("status", "POSTED"),
            json.dumps(data["json_payload"]) if data.get("json_payload") else None,
            data.get("effective_date", date.today().isoformat()),
            data.get("created_by"),
        ),
    )
    row = fetch_one(cur)
    db.commit()
    return json_response(row, 201)


# ---------------------------------------------------------------------------
# GET /api/transaction-codes
# ---------------------------------------------------------------------------
@app.route("/api/transaction-codes")
@handle_db_error
def list_transaction_codes():
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """SELECT tc.transaction_code, tc.description,
                  COALESCE(
                      json_agg(
                          json_build_object('balance_name', e.balance_name, 'effect', e.effect)
                      ) FILTER (WHERE e.balance_name IS NOT NULL),
                      '[]'::json
                  ) AS effects
             FROM transaction_codes tc
        LEFT JOIN transaction_code_balance_effects e
               ON e.transaction_code = tc.transaction_code
            GROUP BY tc.transaction_code, tc.description
            ORDER BY tc.transaction_code"""
    )
    return json_response(fetch_all(cur))


# ---------------------------------------------------------------------------
# GET /api/outbox/accounts
# ---------------------------------------------------------------------------
@app.route("/api/outbox/accounts")
@handle_db_error
def list_outbox_accounts():
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """SELECT oa.event_id, oa.operation_type, oa.snapshot_type,
                  oa.account_id, oa.account_number, oa.product_type,
                  oa.status, oa.available_balance, oa.collected_balance,
                  oa.currency_code, oa.created_by,
                  oa.created_at, oa.updated_at,
                  oa.event_created_at,
                  CASE
                      WHEN c.event_id IS NOT NULL THEN 'CONFIRMED'
                      WHEN w.event_id IS NOT NULL THEN 'WAITING'
                      ELSE 'PENDING'
                  END AS sync_status
             FROM outbox_accounts oa
        LEFT JOIN outbox_accounts_confirmations c ON c.event_id = oa.event_id
        LEFT JOIN outbox_accounts_sync_wait_confirmation w ON w.event_id = oa.event_id
            ORDER BY oa.event_id DESC"""
    )
    return json_response(fetch_all(cur))


# ---------------------------------------------------------------------------
# GET /api/outbox/transactions
# ---------------------------------------------------------------------------
@app.route("/api/outbox/transactions")
@handle_db_error
def list_outbox_transactions():
    db = get_db()
    cur = db.cursor()
    cur.execute(
        """SELECT ot.event_id, ot.operation_type,
                  ot.transaction_id, ot.account_id,
                  ot.original_transaction_id,
                  ot.transaction_code, ot.amount, ot.direction, ot.status,
                  ot.json_payload, ot.effective_date,
                  ot.created_by, ot.created_at,
                  ot.event_created_at,
                  CASE
                      WHEN c.event_id IS NOT NULL THEN 'CONFIRMED'
                      WHEN w.event_id IS NOT NULL THEN 'WAITING'
                      ELSE 'PENDING'
                  END AS sync_status
             FROM outbox_transactions ot
        LEFT JOIN outbox_transactions_confirmations c ON c.event_id = ot.event_id
        LEFT JOIN outbox_transactions_sync_wait_confirmation w ON w.event_id = ot.event_id
            ORDER BY ot.event_id DESC"""
    )
    return json_response(fetch_all(cur))


# ===================================================================
# STATIC FILE SERVING (SPA catch-all)
# ===================================================================

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    # Serve actual static files if they exist
    if path and os.path.isfile(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # SPA fallback
    index_path = os.path.join(app.static_folder, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(app.static_folder, "index.html")
    return json_response({"message": "API is running. Build the frontend with: cd web && npm run build"})


# ===================================================================
# MAIN
# ===================================================================

if __name__ == "__main__":
    port = int(os.getenv("SERVER_PORT", "5001"))
    print(f"Mini-Core server starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
