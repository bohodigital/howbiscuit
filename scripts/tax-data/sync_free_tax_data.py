#!/usr/bin/env python3
"""Build a versioned, D1-compatible tax snapshot from free public sources."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
import uuid
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "drizzle" / "0000_free_tax_data.sql"
RATE_INDEX = "https://www.streamlinedsalestax.org/ratesandboundry/Rates/"
BOUNDARY_INDEX = "https://www.streamlinedsalestax.org/ratesandboundry/Boundary/"
CDC_CIGARETTES = "https://data.cdc.gov/resource/ebcc-3d5i.json"
CDC_VAPING = "https://data.cdc.gov/resource/kwbr-syv2.json"
FAR_FUTURE = "2999-12-31"
USER_AGENT = "HowBiscuitTaxData/0.1 (+https://howbiscuit.com/)"

FIPS_TO_STATE = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
}
SST_STATES = {
    "AR", "GA", "IN", "IA", "KS", "KY", "MI", "MN", "NE", "NV", "NJ", "NC",
    "ND", "OH", "OK", "RI", "SD", "TN", "UT", "VT", "WA", "WV", "WI", "WY",
}

SOURCE_ROWS = [
    ("sst-rates", "Streamlined Sales Tax rate files", RATE_INDEX, "state-published", "quarterly-plus-corrections"),
    ("sst-boundaries", "Streamlined Sales Tax boundary files", BOUNDARY_INDEX, "state-published", "quarterly-plus-corrections"),
    ("sst-taxability", "Streamlined Sales Tax state taxability matrices", "https://www.streamlinedsalestax.org/Shared-Pages/State-taxability-matrix", "state-certified", "annual-plus-change-notices"),
    ("census-geocoder", "U.S. Census Geocoding Services", "https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html", "federal", "current-benchmark"),
    ("cloudflare-visitor-location", "Cloudflare request location metadata", "https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties", "platform-derived", "per-request"),
    ("zippopotam-postal", "Zippopotam U.S. postal locations", "https://api.zippopotam.us/", "public-open-data", "live-api"),
    ("cdc-cigarettes", "CDC STATE combustible tobacco tax data", CDC_CIGARETTES, "federal", "quarterly"),
    ("cdc-vaping", "CDC STATE e-cigarette tax data", CDC_VAPING, "federal", "quarterly"),
    ("fta-special-taxes", "Federation of Tax Administrators special-tax tables", "https://taxadmin.org/tax-rates-new/", "state-tax-administrator-compiled", "source-specific"),
    ("state-tax-agencies", "Official state rate and lookup directory", "https://www.streamlinedsalestax.org/contacts/state-contact-information", "state", "source-specific"),
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def request_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def request_json(url: str, app_token: str | None = None) -> list[dict]:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if app_token:
        headers["X-App-Token"] = app_token
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        value = json.load(response)
    if not isinstance(value, list):
        raise ValueError(f"Expected a list from {url}")
    return value


def checksum(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def parse_yyyymmdd(value: str, fallback: str) -> str:
    value = value.strip()
    if re.fullmatch(r"\d{8}", value):
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return fallback


def parse_public_date(value: str | None, fallback: str) -> str:
    if not value:
        return fallback
    for pattern in ("%m/%d/%Y", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            continue
    return fallback


def csv_rows(payload: bytes, filename: str) -> list[list[str]]:
    if filename.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            candidates = [name for name in archive.namelist() if name.lower().endswith((".csv", ".txt"))]
            if not candidates:
                raise ValueError(f"No CSV in {filename}")
            payload = archive.read(candidates[0])
    text = payload.decode("utf-8-sig", errors="replace")
    return [row for row in csv.reader(io.StringIO(text)) if row]


def discover_files(index_url: str, marker: str, states: set[str] | None) -> dict[str, str]:
    html = request_bytes(index_url).decode("utf-8", errors="replace")
    names = re.findall(r'href="([^"]+\.(?:csv|zip))"', html, flags=re.IGNORECASE)
    selected: dict[str, tuple[str, str]] = {}
    for raw_name in names:
        filename = urllib.parse.unquote(raw_name.rsplit("/", 1)[-1])
        match = re.match(rf"([A-Z]{{2}}){marker}", filename, flags=re.IGNORECASE)
        if not match:
            continue
        state = match.group(1).upper()
        if states and state not in states:
            continue
        candidate = (filename.upper(), urllib.parse.urljoin(index_url, raw_name))
        if state not in selected or selected[state][0] < candidate[0]:
            selected[state] = candidate
    return {state: candidate[1] for state, candidate in selected.items()}


def seed_sources(db: sqlite3.Connection) -> None:
    db.executemany(
        """
        INSERT INTO tax_sources(source_id, title, url, authority, cadence, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
        ON CONFLICT(source_id) DO UPDATE SET
          title=excluded.title, url=excluded.url, authority=excluded.authority, cadence=excluded.cadence
        """,
        SOURCE_ROWS,
    )
    for product in ("alcohol", "cannabis"):
        review_id = hashlib.sha256(f"fta-special-taxes:{product}".encode()).hexdigest()[:24]
        db.execute(
            """
            INSERT OR IGNORE INTO tax_review_queue(
              review_id, source_id, product_code, reason, source_url, detected_at, status
            ) VALUES (?, 'fta-special-taxes', ?, ?, 'https://taxadmin.org/tax-rates-new/', ?, 'open')
            """,
            (review_id, product, "Document tables require a reviewed state adapter before automatic calculation.", utc_now()),
        )
    for state in sorted(set(FIPS_TO_STATE.values()) - SST_STATES):
        for product in ("general", "groceries"):
            review_id = hashlib.sha256(f"state-tax-agencies:{state}:{product}".encode()).hexdigest()[:24]
            db.execute(
                """
                INSERT OR IGNORE INTO tax_review_queue(
                  review_id, source_id, state_code, product_code, reason, source_url, detected_at, status
                ) VALUES (?, 'state-tax-agencies', ?, ?, ?,
                          'https://www.streamlinedsalestax.org/contacts/state-contact-information', ?, 'open')
                """,
                (
                    review_id,
                    state,
                    product,
                    "Non-SST state needs an official rate-and-boundary adapter before local rates are automatic.",
                    utc_now(),
                ),
            )


def active_rate_rows(rows: list[list[str]], as_of: str) -> dict[tuple[str, str], dict]:
    selected: dict[tuple[str, str], dict] = {}
    for row in rows:
        if len(row) < 9:
            continue
        begin = parse_yyyymmdd(row[7], "1900-01-01")
        end = parse_yyyymmdd(row[8], FAR_FUTURE)
        if not (begin <= as_of <= end):
            continue
        record = {
            "state_fips": row[0].zfill(2),
            "type": row[1].zfill(2),
            "code": row[2],
            "general": float(row[3] or 0) * 100,
            "food": float(row[5] or 0) * 100,
            "begin": begin,
            "end": end,
        }
        key = (record["type"], record["code"])
        if key not in selected or selected[key]["begin"] < begin:
            selected[key] = record
    return selected


def boundary_jurisdictions(row: list[str], rates: dict[tuple[str, str], dict]) -> list[tuple[str, dict]]:
    references: list[tuple[str, str, str]] = []
    state_indicator = row[23] if len(row) > 23 else ""
    county = row[24] if len(row) > 24 else ""
    place = row[25] if len(row) > 25 else ""
    if state_indicator and state_indicator != "00":
        references.append(("state", "45", state_indicator))
    if county:
        references.append(("county", "00", county))
    if place:
        for (kind, code), rate in rates.items():
            if code == place and kind not in {"00", "45"}:
                references.append(("city", kind, code))
    for index in range(29, len(row) - 2, 3):
        district_code = row[index + 1].strip()
        authority_type = row[index + 2].strip()
        if district_code and authority_type:
            references.append(("district", authority_type.zfill(2), district_code))
    unique: list[tuple[str, dict]] = []
    seen: set[tuple[str, str]] = set()
    for label, kind, code in references:
        key = (kind, code)
        if key in seen or key not in rates:
            continue
        seen.add(key)
        unique.append((label, rates[key]))
    return unique


def ingest_sst_state(
    db: sqlite3.Connection,
    state: str,
    rate_url: str,
    boundary_url: str,
    as_of: str,
) -> int:
    rate_payload = request_bytes(rate_url)
    boundary_payload = request_bytes(boundary_url)
    rate_name = rate_url.rsplit("/", 1)[-1]
    boundary_name = boundary_url.rsplit("/", 1)[-1]
    rates = active_rate_rows(csv_rows(rate_payload, rate_name), as_of)
    boundaries = csv_rows(boundary_payload, boundary_name)
    revision = f"{rate_name}+{boundary_name}"
    revision_id = hashlib.sha256(revision.encode()).hexdigest()[:32]
    combined_checksum = checksum(rate_payload + boundary_payload)
    records = 0
    for row in boundaries:
        if len(row) < 26 or row[0] != "Z":
            continue
        begin = parse_yyyymmdd(row[1], "1900-01-01")
        end = parse_yyyymmdd(row[2], FAR_FUTURE)
        if not (begin <= as_of <= end):
            continue
        postal_low = row[17].zfill(5)
        postal_high = row[19].zfill(5)
        if not (postal_low.isdigit() and postal_high.isdigit()):
            continue
        state_fips = row[22].zfill(2)
        state_code = FIPS_TO_STATE.get(state_fips, state)
        identity = "|".join([revision, *row[:26]])
        location_id = hashlib.sha256(identity.encode()).hexdigest()[:32]
        db.execute(
            """
            INSERT OR REPLACE INTO tax_locations(
              location_id, state_code, postal_low, postal_high, plus4_low, plus4_high,
              record_type, city_name, county_name, state_fips, county_fips, place_fips,
              confidence, effective_from, effective_to, source_id, source_revision
            ) VALUES (?, ?, ?, ?, NULL, NULL, 'Z', NULL, NULL, ?, ?, ?,
                      'official-zip5', ?, ?, 'sst-boundaries', ?)
            """,
            (location_id, state_code, postal_low, postal_high, state_fips, row[24], row[25], begin, end, revision),
        )
        jurisdictions = boundary_jurisdictions(row, rates)
        for product, field in (("general", "general"), ("groceries", "food")):
            for jurisdiction_type, rate in jurisdictions:
                percent = round(rate[field], 6)
                component_key = f"{location_id}:{product}:{rate['type']}:{rate['code']}"
                component_id = hashlib.sha256(component_key.encode()).hexdigest()[:32]
                label = {
                    "state": f"{state_code} state",
                    "county": "County",
                    "city": "City / municipal",
                    "district": "Special district",
                }[jurisdiction_type]
                db.execute(
                    """
                    INSERT OR REPLACE INTO tax_components(
                      component_id, location_id, state_code, product_code, jurisdiction_type,
                      jurisdiction_code, jurisdiction_name, rate_percent, unit_amount, unit_basis,
                      included_in_price, effective_from, effective_to, source_id, source_revision, citation
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, 'sst-rates', ?, NULL)
                    """,
                    (
                        component_id, location_id, state_code, product, jurisdiction_type,
                        rate["code"], label, percent, max(begin, rate["begin"]), min(end, rate["end"]), revision,
                    ),
                )
                records += 1
    db.execute(
        """
        INSERT OR REPLACE INTO tax_source_revisions(
          revision_id, source_id, published_at, effective_from, effective_to, checksum,
          archive_key, imported_at, record_count
        ) VALUES (?, 'sst-rates', NULL, ?, ?, ?, NULL, ?, ?)
        """,
        (revision_id, as_of, FAR_FUTURE, combined_checksum, utc_now(), records),
    )
    return records


def effective_rows(rows: list[dict], as_of: str, key_fields: tuple[str, ...]) -> dict[tuple[str, ...], dict]:
    selected: dict[tuple[str, ...], dict] = {}
    for row in rows:
        effective = parse_public_date(row.get("effective_date"), "1900-01-01")
        if effective > as_of:
            continue
        key = tuple(str(row.get(field, "")) for field in key_fields)
        if key not in selected or parse_public_date(selected[key].get("effective_date"), "1900-01-01") < effective:
            selected[key] = row
    return selected


def ingest_cdc(db: sqlite3.Connection, as_of: str, app_token: str | None) -> int:
    cigarette_query = urllib.parse.urlencode({
        "$limit": "5000",
        "$where": "measuredesc='Cigarette' AND provisiondesc='Cigarette Tax ($ per pack)'",
    })
    cigarette_rows = request_json(f"{CDC_CIGARETTES}?{cigarette_query}", app_token)
    current_cigarettes = effective_rows(cigarette_rows, as_of, ("locationabbr", "provisiondesc"))
    records = 0
    for (state, _), row in current_cigarettes.items():
        if state not in FIPS_TO_STATE.values():
            continue
        try:
            amount = float(row.get("provisionvalue", ""))
        except ValueError:
            continue
        effective = parse_public_date(row.get("effective_date"), "1900-01-01")
        identity = f"cdc-cigarettes:{state}:{effective}:{amount}"
        db.execute(
            """
            INSERT OR REPLACE INTO tax_components(
              component_id, location_id, state_code, product_code, jurisdiction_type,
              jurisdiction_code, jurisdiction_name, rate_percent, unit_amount, unit_basis,
              included_in_price, effective_from, effective_to, source_id, source_revision, citation
            ) VALUES (?, NULL, ?, 'cigarettes', 'state', NULL, ?, NULL, ?, 'packs of 20',
                      1, ?, ?, 'cdc-cigarettes', ?, ?)
            """,
            (
                hashlib.sha256(identity.encode()).hexdigest()[:32], state, f"{state} cigarette excise",
                amount, effective, FAR_FUTURE, f"cdc-{as_of}", row.get("citation"),
            ),
        )
        records += 1

    vaping_query = urllib.parse.urlencode({"$limit": "50000", "$where": "measuredesc='E-Cigarette'"})
    vaping_rows = request_json(f"{CDC_VAPING}?{vaping_query}", app_token)
    current_vaping = effective_rows(vaping_rows, as_of, ("locationabbr", "provisiondesc"))
    for (state, provision), row in current_vaping.items():
        if state not in FIPS_TO_STATE.values() or row.get("provisionvalue") in {None, "No", "No Provision"}:
            continue
        effective = parse_public_date(row.get("effective_date"), "1900-01-01")
        identity = f"cdc-vaping:{state}:{provision}:{effective}:{row.get('provisionvalue')}"
        db.execute(
            """
            INSERT OR REPLACE INTO tax_product_rules(
              rule_id, state_code, product_code, rule_label, rule_value, rule_basis,
              effective_from, effective_to, source_id, source_revision, citation
            ) VALUES (?, ?, 'nicotine', ?, ?, ?, ?, ?, 'cdc-vaping', ?, ?)
            """,
            (
                hashlib.sha256(identity.encode()).hexdigest()[:32], state, provision,
                str(row.get("provisionvalue")), row.get("datatype"), effective, FAR_FUTURE,
                f"cdc-{as_of}", row.get("citation"),
            ),
        )
        records += 1
    return records


def set_source_status(db: sqlite3.Connection, source_id: str, status: str, count: int, note: str | None = None) -> None:
    now = utc_now()
    db.execute(
        """
        UPDATE tax_sources
           SET status=?, last_checked_at=?, last_success_at=CASE WHEN ?='ready' THEN ? ELSE last_success_at END,
               record_count=?, notes=?
         WHERE source_id=?
        """,
        (status, now, status, now, count, note, source_id),
    )


def export_sql(db: sqlite3.Connection, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(db.iterdump()) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=ROOT / ".tax-data" / "free-tax.sqlite3")
    parser.add_argument("--export-sql", type=Path)
    parser.add_argument("--states", help="Comma-separated SST state codes; default is every published state")
    parser.add_argument("--as-of", default=date.today().isoformat())
    parser.add_argument("--cdc-app-token", default=None)
    parser.add_argument("--skip-sst", action="store_true")
    parser.add_argument("--skip-cdc", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    states = {value.strip().upper() for value in args.states.split(",")} if args.states else None
    args.db.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.db)
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(MIGRATION.read_text(encoding="utf-8"))
    seed_sources(db)
    run_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO tax_ingestion_runs(run_id, started_at, status) VALUES (?, ?, 'running')",
        (run_id, utc_now()),
    )
    total = 0
    errors: list[str] = []
    try:
        if not args.skip_sst:
            rates = discover_files(RATE_INDEX, "R", states)
            boundaries = discover_files(BOUNDARY_INDEX, "B", states)
            common = sorted(set(rates) & set(boundaries))
            for state in common:
                try:
                    total += ingest_sst_state(db, state, rates[state], boundaries[state], args.as_of)
                except Exception as error:  # continue other independent states
                    errors.append(f"{state}: {error}")
            sst_status = "partial" if errors else ("ready" if common else "failed")
            set_source_status(db, "sst-rates", sst_status, total, "; ".join(errors[:8]) or None)
            set_source_status(db, "sst-boundaries", sst_status, max(0, len(common) - len(errors)), None)
        if not args.skip_cdc:
            try:
                cdc_count = ingest_cdc(db, args.as_of, args.cdc_app_token)
                total += cdc_count
                set_source_status(db, "cdc-cigarettes", "ready", cdc_count)
                set_source_status(db, "cdc-vaping", "ready", cdc_count)
            except Exception as error:
                errors.append(f"CDC: {error}")
                set_source_status(db, "cdc-cigarettes", "failed", 0, str(error))
                set_source_status(db, "cdc-vaping", "failed", 0, str(error))
        set_source_status(db, "fta-special-taxes", "review-required", 0, "Alcohol and cannabis tables need reviewed document adapters.")
        set_source_status(db, "sst-taxability", "review-required", 0, "Taxability-matrix changes need reviewed product-rule adapters.")
        db.execute(
            """
            UPDATE tax_ingestion_runs
               SET finished_at=?, status=?, source_count=?, record_count=?, error_count=?, notes=?
             WHERE run_id=?
            """,
            (utc_now(), "partial" if errors else "ready", len(SOURCE_ROWS), total, len(errors), "; ".join(errors[:12]), run_id),
        )
        db.commit()
        if args.export_sql:
            export_sql(db, args.export_sql)
        print(json.dumps({
            "status": "partial" if errors else "ready",
            "database": str(args.db),
            "records": total,
            "errors": errors,
        }, indent=2))
        return 1 if errors else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
