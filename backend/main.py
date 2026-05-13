from typing import Optional, Any
from contextlib import asynccontextmanager
import time
import sqlite3

from fastapi import FastAPI, status, HTTPException, Query
from pydantic import BaseModel

DB_FILE = "/app/data/database.db"
DEVICE_STALE_TIMEOUT_SECONDS = 5.0
MAX_MEASUREMENTS_RAM = 180
MAX_MEASUREMENTS_DB = 5000
CLEAR_DB_ON_START = False


class TodoCreate(BaseModel):
    title: str


class MeasurementCreate(BaseModel):
    device_id: str
    ts_ms: int
    adc: int
    mv: int
    signal_type: Optional[str] = "Unknown"
    frequency_hz: Optional[int] = 0
    duty_percent: Optional[int] = 0
    amplitude_mv: Optional[int] = 0
    dc_offset_mv: Optional[int] = 0


class MeasurementPoint(BaseModel):
    id: str
    device_id: str
    ts_ms: int
    adc: int
    mv: int
    signal_type: str = "Unknown"
    frequency_hz: int = 0
    duty_percent: int = 0
    amplitude_mv: int = 0
    dc_offset_mv: int = 0


measurements_ram: list[MeasurementPoint] = []

latest_state: dict[str, Any] = {
    "connected": False,
    "device_id": None,
    "last_seen_unix": None,
    "adc": 0,
    "mv": 0,
    "measurement_count": 0,
    "signal_type": "N/A",
    "frequency_hz": 0,
    "duty_percent": 0,
    "amplitude_mv": 0,
    "dc_offset_mv": 0,
}


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def clear_db() -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS todos")
    cursor.execute("DROP TABLE IF EXISTS measurements_log")
    conn.commit()
    conn.close()


def init_db() -> None:
    if CLEAR_DB_ON_START:
        clear_db()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL
        )
        '''
    )

    cursor.execute(
        '''
        CREATE TABLE IF NOT EXISTS measurements_log (
            row_id INTEGER PRIMARY KEY AUTOINCREMENT,
            public_id TEXT NOT NULL UNIQUE,
            created_unix INTEGER NOT NULL,
            device_id TEXT NOT NULL,
            ts_ms INTEGER NOT NULL,
            adc INTEGER NOT NULL,
            mv INTEGER NOT NULL,
            signal_type TEXT,
            frequency_hz INTEGER,
            duty_percent INTEGER,
            amplitude_mv INTEGER,
            dc_offset_mv INTEGER
        )
        '''
    )

    cursor.execute(
        '''
        CREATE INDEX IF NOT EXISTS idx_measurements_log_ts_ms
        ON measurements_log(ts_ms DESC)
        '''
    )

    conn.commit()
    conn.close()


def format_measurement_public_id(row_id: int) -> str:
    return f"{row_id:05d}"


def db_trim_measurements(max_rows: int = MAX_MEASUREMENTS_DB) -> None:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS count FROM measurements_log")
    row = cursor.fetchone()
    total_rows = row["count"] if row else 0

    if total_rows > max_rows:
        cursor.execute(
            '''
            DELETE FROM measurements_log
            WHERE row_id NOT IN (
                SELECT row_id
                FROM measurements_log
                ORDER BY row_id DESC
                LIMIT ?
            )
            ''',
            (max_rows,),
        )
        conn.commit()

    conn.close()


def db_get_todos() -> list[dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM todos ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": row["id"], "title": row["title"]} for row in rows]


def db_get_todo(todo_id: int) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM todos WHERE id = ?", (todo_id,))
    row = cursor.fetchone()
    conn.close()
    if row is None:
        return None
    return {"id": row["id"], "title": row["title"]}


def db_create_todo(title: str) -> dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO todos (title) VALUES (?)", (title,))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, "title": title}


def db_delete_todo(todo_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    conn.commit()
    deleted_rows = cursor.rowcount
    conn.close()
    return deleted_rows > 0


def measurement_row_to_public(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["public_id"],
        "device_id": row["device_id"],
        "ts_ms": row["ts_ms"],
        "created_unix": row["created_unix"],
        "adc": row["adc"],
        "mv": row["mv"],
        "signal_type": row["signal_type"] or "Unknown",
        "frequency_hz": row["frequency_hz"] or 0,
        "duty_percent": row["duty_percent"] or 0,
        "amplitude_mv": row["amplitude_mv"] or 0,
        "dc_offset_mv": row["dc_offset_mv"] or 0,
    }


def db_create_measurement(point: MeasurementCreate) -> str:
    conn = get_db_connection()
    cursor = conn.cursor()

    created_unix = int(time.time())

    cursor.execute(
        '''
        INSERT INTO measurements_log (
            public_id,
            created_unix,
            device_id,
            ts_ms,
            adc,
            mv,
            signal_type,
            frequency_hz,
            duty_percent,
            amplitude_mv,
            dc_offset_mv
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        (
            "",
            created_unix,
            point.device_id,
            point.ts_ms,
            point.adc,
            point.mv,
            point.signal_type or "Unknown",
            int(point.frequency_hz or 0),
            int(point.duty_percent or 0),
            int(point.amplitude_mv or 0),
            int(point.dc_offset_mv or 0),
        ),
    )

    row_id = cursor.lastrowid
    public_id = format_measurement_public_id(row_id)

    cursor.execute(
        "UPDATE measurements_log SET public_id = ? WHERE row_id = ?",
        (public_id, row_id),
    )

    conn.commit()
    conn.close()
    return public_id


def db_get_measurements(limit: Optional[int] = None) -> list[dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()

    if limit is None:
        cursor.execute(
            '''
            SELECT *
            FROM measurements_log
            ORDER BY row_id ASC
            '''
        )
    else:
        cursor.execute(
            '''
            SELECT *
            FROM measurements_log
            ORDER BY row_id DESC
            LIMIT ?
            ''',
            (limit,),
        )

    rows = cursor.fetchall()
    conn.close()

    result = [measurement_row_to_public(row) for row in rows]
    if limit is not None:
        result.reverse()
    return result


def db_get_measurement(measurement_id: str) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT *
        FROM measurements_log
        WHERE public_id = ?
        ''',
        (measurement_id,),
    )
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None
    return measurement_row_to_public(row)


def db_delete_all_measurements() -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM measurements_log")
    conn.commit()
    deleted_rows = cursor.rowcount
    conn.close()
    return deleted_rows


def db_get_measurement_stats() -> dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS count FROM measurements_log")
    count = cursor.fetchone()["count"]

    cursor.execute(
        '''
        SELECT *
        FROM measurements_log
        ORDER BY row_id DESC
        LIMIT 1
        '''
    )
    latest = cursor.fetchone()
    conn.close()

    payload: dict[str, Any] = {
        "count": count,
        "table": "measurements_log",
        "max_rows": MAX_MEASUREMENTS_DB,
        "latest": None,
    }

    if latest is not None:
        payload["latest"] = measurement_row_to_public(latest)

    return payload


def trim_ram_buffers() -> None:
    measurements_ram[:] = measurements_ram[-MAX_MEASUREMENTS_RAM:]


def refresh_connection_state() -> None:
    last_seen = latest_state.get("last_seen_unix")
    if not last_seen:
        latest_state["connected"] = False
        return

    latest_state["connected"] = (
        time.time() - float(last_seen)
    ) <= DEVICE_STALE_TIMEOUT_SECONDS


@asynccontextmanager
async def lifespan(_: "FastAPI"):
    init_db()
    yield


app = FastAPI(docs_url="/swagger", lifespan=lifespan)


@app.get("/todos")
def get_todos_full():
    return db_get_todos()


@app.get("/todos/list")
def get_todos_list_compact():
    return db_get_todos()


@app.get("/todos/{todo_id}")
def get_todo(todo_id: int):
    todo = db_get_todo(todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Todo not found.")
    return todo


@app.post("/todos", status_code=status.HTTP_201_CREATED)
async def create_todo(new_todo: TodoCreate):
    todo = db_create_todo(new_todo.title)
    return {"message": "Todo added!", "todo": todo}


@app.delete("/todos/{todo_id}")
def delete_todo(todo_id: int):
    success = db_delete_todo(todo_id)
    if not success:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"message": f"todo {todo_id} deleted"}


@app.post("/measurements", status_code=status.HTTP_201_CREATED)
async def create_measurement(point: MeasurementCreate):
    public_id = db_create_measurement(point)
    db_trim_measurements(MAX_MEASUREMENTS_DB)

    measurement = MeasurementPoint(
        id=public_id,
        device_id=point.device_id,
        ts_ms=point.ts_ms,
        adc=point.adc,
        mv=point.mv,
        signal_type=point.signal_type or "Unknown",
        frequency_hz=int(point.frequency_hz or 0),
        duty_percent=int(point.duty_percent or 0),
        amplitude_mv=int(point.amplitude_mv or 0),
        dc_offset_mv=int(point.dc_offset_mv or 0),
    )

    measurements_ram.append(measurement)
    trim_ram_buffers()

    latest_state["connected"] = True
    latest_state["device_id"] = measurement.device_id
    latest_state["last_seen_unix"] = int(time.time())
    latest_state["adc"] = measurement.adc
    latest_state["mv"] = measurement.mv
    latest_state["measurement_count"] = len(measurements_ram)
    latest_state["signal_type"] = measurement.signal_type
    latest_state["frequency_hz"] = measurement.frequency_hz
    latest_state["duty_percent"] = measurement.duty_percent
    latest_state["amplitude_mv"] = measurement.amplitude_mv
    latest_state["dc_offset_mv"] = measurement.dc_offset_mv

    return {
        "message": "Measurement received",
        "point": measurement.model_dump(),
        "stored_in_table": "measurements_log",
    }


@app.get("/measurements")
def get_measurements(limit: Optional[int] = Query(default=None, ge=1, le=500)):
    return db_get_measurements(limit)


@app.get("/measurements/list")
def get_measurements_list(limit: int = Query(default=20, ge=1, le=200)):
    data = db_get_measurements(limit)
    return [
        {
            "id": m["id"],
            "mv": m["mv"],
            "adc": m["adc"],
            "type": m["signal_type"],
            "freq": m["frequency_hz"],
            "duty": m["duty_percent"],
            "ts_ms": m["ts_ms"],
        }
        for m in data
    ]


@app.get("/measurements/stats")
def get_measurement_stats():
    return db_get_measurement_stats()


@app.get("/measurements/latest")
def get_latest_measurement():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''
        SELECT *
        FROM measurements_log
        ORDER BY row_id DESC
        LIMIT 1
        '''
    )
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    return measurement_row_to_public(row)


@app.delete("/measurements")
def delete_all_measurements():
    deleted_rows = db_delete_all_measurements()
    measurements_ram.clear()

    latest_state["measurement_count"] = 0
    latest_state["adc"] = 0
    latest_state["mv"] = 0
    latest_state["signal_type"] = "N/A"
    latest_state["frequency_hz"] = 0
    latest_state["duty_percent"] = 0
    latest_state["amplitude_mv"] = 0
    latest_state["dc_offset_mv"] = 0

    return {
        "message": "All measurements deleted",
        "deleted_rows": deleted_rows,
        "table": "measurements_log",
    }


@app.get("/measurements/{measurement_id}")
def get_measurement(measurement_id: str):
    measurement = db_get_measurement(measurement_id)
    if measurement is None:
        raise HTTPException(status_code=404, detail="Measurement not found.")
    return measurement


@app.get("/state")
def get_state():
    latest_state["measurement_count"] = len(measurements_ram)
    refresh_connection_state()
    return latest_state


@app.post("/admin/clear-db")
def admin_clear_db():
    clear_db()
    init_db()
    measurements_ram.clear()

    latest_state["connected"] = False
    latest_state["device_id"] = None
    latest_state["last_seen_unix"] = None
    latest_state["adc"] = 0
    latest_state["mv"] = 0
    latest_state["measurement_count"] = 0
    latest_state["signal_type"] = "N/A"
    latest_state["frequency_hz"] = 0
    latest_state["duty_percent"] = 0
    latest_state["amplitude_mv"] = 0
    latest_state["dc_offset_mv"] = 0

    return {
        "message": "Database cleared and RAM buffers reset.",
        "tables": ["todos", "measurements_log"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
