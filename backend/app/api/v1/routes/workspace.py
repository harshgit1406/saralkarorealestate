import json
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_current_user, get_db_pool
from app.api.v1.crud import ensure_permission
from app.api.v1.routes.hrms import assign_all_permissions_to_system_admins, seed_permissions

router = APIRouter()


def money(value: Decimal | int | float | None) -> float:
    return float(value or 0)


async def fetch_metrics(connection: asyncpg.Connection, organization_id: int) -> dict:
    row = await connection.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM projects WHERE organization_id = $1) AS projects,
            (SELECT COUNT(*) FROM inventory_entities WHERE organization_id = $1
                AND entity_type IN ('flat', 'plot', 'villa', 'shop', 'office')) AS inventory,
            (SELECT COUNT(*) FROM leads WHERE organization_id = $1
                AND status NOT IN ('won', 'lost', 'junk')) AS active_leads,
            (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE organization_id = $1
                AND payment_status = 'completed') AS revenue
        """,
        organization_id,
    )
    return {
        "projects": row["projects"],
        "inventory": row["inventory"],
        "active_leads": row["active_leads"],
        "revenue": money(row["revenue"]),
    }


async def fetch_inventory(
    connection: asyncpg.Connection,
    organization_id: int,
    requested_project_id: int | None = None,
) -> dict:
    projects = await connection.fetch(
        """
        SELECT id, name, project_code, project_type, location, status
        FROM projects
        WHERE organization_id = $1
        ORDER BY created_at DESC
        """,
        organization_id,
    )
    project_ids = {row["id"] for row in projects}
    selected_project_id = requested_project_id if requested_project_id in project_ids else None
    selected_project_id = selected_project_id or (projects[0]["id"] if projects else None)
    project_map = None
    map_elements = []
    floors = []
    if selected_project_id is not None:
        project_map = await connection.fetchrow(
            """
            SELECT id, project_id, map_name, map_engine, version_no, is_published, map_data
            FROM project_maps
            WHERE organization_id = $1
              AND project_id = $2
              AND is_published = TRUE
            ORDER BY version_no DESC, id DESC
            LIMIT 1
            """,
            organization_id,
            selected_project_id,
        )
        map_elements = await connection.fetch(
            """
            SELECT
                me.id,
                me.project_map_id,
                me.inventory_entity_id,
                me.element_id,
                me.element_type,
                me.is_interactive,
                me.metadata,
                ie.entity_code,
                ie.name AS inventory_name,
                ie.inventory_status
            FROM map_elements me
            LEFT JOIN inventory_entities ie ON ie.id = me.inventory_entity_id
            WHERE me.organization_id = $1
              AND ($2::int IS NULL OR me.project_map_id = $2)
            ORDER BY me.element_id
            """,
            organization_id,
            project_map["id"] if project_map else None,
        )
        floors = await connection.fetch(
            """
            SELECT
                child.id,
                child.parent_id,
                child.entity_code AS code,
                child.name,
                child.entity_type AS type,
                child.inventory_status AS status,
                child.path,
                parent.entity_code AS parent_code,
                dim.saleable_area AS area,
                pr.final_price AS price,
                det.facing,
                det.display_note,
                det.notes
                ,
                (
                    SELECT row_to_json(bdata)
                    FROM (
                        SELECT
                            b.id,
                            b.booking_code,
                            b.booking_status,
                            b.booking_amount,
                            c.id AS customer_id,
                            c.full_name AS customer_name,
                            c.phone AS customer_phone
                        FROM bookings b
                        LEFT JOIN booking_applicants ba ON ba.booking_id = b.id AND ba.is_primary = TRUE
                        LEFT JOIN customers c ON c.id = ba.customer_id
                        WHERE b.inventory_entity_id = child.id
                          AND b.booking_status IN ('reserved', 'confirmed')
                        ORDER BY b.created_at DESC
                        LIMIT 1
                    ) bdata
                ) AS active_booking
            FROM inventory_entities child
            JOIN inventory_entities parent ON parent.id = child.parent_id
            LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = child.id
            LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = child.id
            LEFT JOIN inventory_details det ON det.inventory_entity_id = child.id
            WHERE child.organization_id = $1
              AND child.project_id = $2
              AND child.entity_type = 'floor'
            ORDER BY parent.sort_order, child.sort_order
            """,
            organization_id,
            selected_project_id,
        )
    status_rows = await connection.fetch(
        """
        SELECT inventory_status, COUNT(*) AS total
        FROM inventory_entities
        WHERE organization_id = $1
          AND entity_type IN ('flat', 'plot', 'villa', 'shop', 'office')
          AND ($2::int IS NULL OR project_id = $2)
        GROUP BY inventory_status
        """,
        organization_id,
        selected_project_id,
    )
    units = await connection.fetch(
        """
        SELECT
            ie.id,
            ie.entity_code,
            ie.name,
                ie.entity_type,
                ie.inventory_status,
                ie.parent_id,
                ie.path,
                ie.lifecycle_stage,
                p.name AS project_name,
                dim.saleable_area,
            d.bhk_type,
            d.facing,
            d.display_note,
            d.notes,
            pr.final_price,
                pr.price_per_sqft
                ,
                (
                    SELECT row_to_json(bdata)
                    FROM (
                        SELECT
                            b.id,
                            b.booking_code,
                            b.booking_status,
                            b.booking_amount,
                            c.id AS customer_id,
                            c.full_name AS customer_name,
                            c.phone AS customer_phone
                        FROM bookings b
                        LEFT JOIN booking_applicants ba ON ba.booking_id = b.id AND ba.is_primary = TRUE
                        LEFT JOIN customers c ON c.id = ba.customer_id
                        WHERE b.inventory_entity_id = ie.id
                          AND b.booking_status IN ('reserved', 'confirmed')
                        ORDER BY b.created_at DESC
                        LIMIT 1
                    ) bdata
                ) AS active_booking
        FROM inventory_entities ie
        JOIN projects p ON p.id = ie.project_id
        LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = ie.id
        LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = ie.id
        LEFT JOIN inventory_details d ON d.inventory_entity_id = ie.id
        WHERE ie.organization_id = $1
          AND ($2::int IS NULL OR ie.project_id = $2)
          AND ie.entity_type IN ('flat', 'plot', 'villa', 'shop', 'office')
        ORDER BY p.created_at DESC, p.name, ie.sort_order, ie.entity_code
        LIMIT 200
        """,
        organization_id,
        selected_project_id,
    )
    payment_plans = await connection.fetch(
        """
        SELECT id, name, plan_type
        FROM payment_plans
        WHERE organization_id = $1
        ORDER BY name
        """,
        organization_id,
    )
    customers = await connection.fetch(
        """
        SELECT id, customer_code, full_name, phone, email, kyc_status
        FROM customers
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 100
        """,
        organization_id,
    )
    brokers = await connection.fetch(
        """
        SELECT id, broker_code, full_name, company_name, phone, email, kyc_status
        FROM brokers
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 100
        """,
        organization_id,
    )
    return {
        "counts": {row["inventory_status"]: row["total"] for row in status_rows},
        "selectedProjectId": selected_project_id,
        "projects": [dict(row) for row in projects],
        "map": {
            **dict(project_map),
            "map_data": json.loads(project_map["map_data"])
            if project_map and isinstance(project_map["map_data"], str)
            else project_map["map_data"],
        }
        if project_map
        else None,
        "mapElements": [dict(row) for row in map_elements],
        "floors": [
            {
                "id": row["id"],
                "parentId": row["parent_id"],
                "parentCode": row["parent_code"],
                "code": row["code"],
                "name": row["name"],
                "type": row["type"],
                "status": row["status"],
                "path": row["path"],
                "area": money(row["area"]),
                "price": money(row["price"]),
                "facing": row["facing"],
                "displayNote": row["display_note"],
                "notes": row["notes"],
                "activeBooking": json.loads(row["active_booking"])
                if isinstance(row["active_booking"], str)
                else row["active_booking"],
            }
            for row in floors
        ],
        "units": [
            {
                "id": row["id"],
                "parentId": row["parent_id"],
                "code": row["entity_code"],
                "name": row["name"],
                "type": row["entity_type"],
                "status": row["inventory_status"],
                "path": row["path"],
                "lifecycleStage": row["lifecycle_stage"],
                "project": row["project_name"],
                "area": money(row["saleable_area"]),
                "bhk": row["bhk_type"],
                "price": money(row["final_price"]),
                "pricePerSqft": money(row["price_per_sqft"]),
                "facing": row["facing"],
                "displayNote": row["display_note"],
                "notes": row["notes"],
                "activeBooking": json.loads(row["active_booking"])
                if isinstance(row["active_booking"], str)
                else row["active_booking"],
            }
            for row in units
        ],
        "paymentPlans": [dict(row) for row in payment_plans],
        "customers": [dict(row) for row in customers],
        "brokers": [dict(row) for row in brokers],
    }


async def fetch_leads(connection: asyncpg.Connection, organization_id: int) -> dict:
    lead_sources = await connection.fetch(
        """
        SELECT id, source_name, source_key, source_type, is_active, config
        FROM lead_sources
        WHERE organization_id = $1
        ORDER BY source_name
        """,
        organization_id,
    )
    users = await connection.fetch(
        """
        SELECT id, full_name, username, email
        FROM users
        WHERE organization_id = $1 AND is_active = TRUE
        ORDER BY full_name
        """,
        organization_id,
    )
    projects = await connection.fetch(
        """
        SELECT id, name, project_code
        FROM projects
        WHERE organization_id = $1
        ORDER BY name
        """,
        organization_id,
    )
    rows = await connection.fetch(
        """
        SELECT
            l.id,
            l.lead_code,
            l.name,
            l.phone,
            l.alternate_phone,
            l.email,
            l.source,
            l.status,
            l.priority,
            l.budget_min,
            l.budget_max,
            l.requirements,
            p.name AS project_name,
            p.id AS project_id,
            ls.source_name,
            ls.source_key,
            ls.source_type,
            u.full_name AS assigned_to,
            u.id AS assigned_to_id,
            l.last_contacted_at,
            l.created_at,
            l.next_follow_up_at
        FROM leads l
        LEFT JOIN projects p ON p.id = l.project_id
        LEFT JOIN lead_sources ls ON ls.id = l.lead_source_id
        LEFT JOIN users u ON u.id = l.assigned_to
        WHERE l.organization_id = $1
        ORDER BY l.created_at DESC
        LIMIT 100
        """,
        organization_id,
    )
    status_counts = await connection.fetch(
        """
        SELECT status, COUNT(*) AS total
        FROM leads
        WHERE organization_id = $1
        GROUP BY status
        """,
        organization_id,
    )
    priority_counts = await connection.fetch(
        """
        SELECT priority, COUNT(*) AS total
        FROM leads
        WHERE organization_id = $1
        GROUP BY priority
        """,
        organization_id,
    )
    source_performance = await connection.fetch(
        """
        SELECT
            COALESCE(ls.source_name, l.source, 'Manual') AS source_name,
            COALESCE(ls.source_key, 'manual') AS source_key,
            COALESCE(ls.source_type, 'manual') AS source_type,
            COUNT(l.id) AS total,
            COUNT(l.id) FILTER (WHERE l.status = 'won') AS won,
            COUNT(l.id) FILTER (WHERE l.status = 'lost') AS lost,
            COUNT(l.id) FILTER (WHERE l.status NOT IN ('won', 'lost', 'junk')) AS active,
            COUNT(l.id) FILTER (
                WHERE l.next_follow_up_at IS NOT NULL
                  AND l.next_follow_up_at < CURRENT_TIMESTAMP
                  AND l.status NOT IN ('won', 'lost', 'junk')
            ) AS overdue,
            COALESCE(AVG(l.budget_max), 0) AS avg_budget
        FROM leads l
        LEFT JOIN lead_sources ls ON ls.id = l.lead_source_id
        WHERE l.organization_id = $1
        GROUP BY COALESCE(ls.source_name, l.source, 'Manual'), COALESCE(ls.source_key, 'manual'), COALESCE(ls.source_type, 'manual')
        ORDER BY total DESC, source_name
        """,
        organization_id,
    )
    followups = await connection.fetch(
        """
        SELECT
            lf.id,
            lf.lead_id,
            l.name AS lead_name,
            l.phone AS lead_phone,
            lf.followup_type,
            lf.status,
            lf.title,
            lf.notes,
            lf.due_at,
            u.full_name AS assigned_to
        FROM lead_followups lf
        JOIN leads l ON l.id = lf.lead_id
        LEFT JOIN users u ON u.id = lf.assigned_to
        WHERE lf.organization_id = $1
        ORDER BY
            CASE WHEN lf.status = 'pending' THEN 0 ELSE 1 END,
            lf.due_at
        LIMIT 30
        """,
        organization_id,
    )
    activities = await connection.fetch(
        """
        SELECT
            la.id,
            la.lead_id,
            l.name AS lead_name,
            la.activity_type,
            la.notes,
            la.created_at,
            u.full_name AS created_by
        FROM lead_activities la
        JOIN leads l ON l.id = la.lead_id
        LEFT JOIN users u ON u.id = la.created_by
        WHERE la.organization_id = $1
        ORDER BY la.created_at DESC
        LIMIT 30
        """,
        organization_id,
    )
    call_summary = await connection.fetch(
        """
        SELECT lead_id, COUNT(*) AS total_calls, MAX(created_at) AS last_call_at
        FROM call_sessions
        WHERE organization_id = $1
        GROUP BY lead_id
        """,
        organization_id,
    )
    calls_by_lead = {row["lead_id"]: row for row in call_summary}
    default_platforms = [
        {"name": "99acres", "key": "99acres", "type": "portal"},
        {"name": "NoBroker", "key": "nobroker", "type": "portal"},
        {"name": "MagicBricks", "key": "magicbricks", "type": "portal"},
        {"name": "Housing", "key": "housing", "type": "portal"},
        {"name": "Meta Ads", "key": "meta_ads", "type": "meta_ads"},
        {"name": "Google Ads", "key": "google_ads", "type": "google_ads"},
        {"name": "Website", "key": "website", "type": "website"},
        {"name": "WhatsApp", "key": "whatsapp", "type": "whatsapp"},
    ]
    configured_keys = {row["source_key"] for row in lead_sources}
    return {
        "sources": [
            {
                **dict(row),
                "config": json.loads(row["config"]) if isinstance(row["config"], str) else row["config"],
            }
            for row in lead_sources
        ],
        "users": [dict(row) for row in users],
        "projects": [dict(row) for row in projects],
        "statusCounts": {row["status"]: row["total"] for row in status_counts},
        "priorityCounts": {row["priority"]: row["total"] for row in priority_counts},
        "sourcePerformance": [
            {
                "name": row["source_name"],
                "key": row["source_key"],
                "type": row["source_type"],
                "total": row["total"],
                "won": row["won"],
                "lost": row["lost"],
                "active": row["active"],
                "overdue": row["overdue"],
                "avgBudget": money(row["avg_budget"]),
            }
            for row in source_performance
        ],
        "integrations": [
            {
                "name": source["name"],
                "key": source["key"],
                "type": source["type"],
                "connected": source["key"] in configured_keys,
            }
            for source in default_platforms
        ],
        "followups": [
            {
                "id": row["id"],
                "leadId": row["lead_id"],
                "lead": row["lead_name"],
                "phone": row["lead_phone"],
                "type": row["followup_type"],
                "status": row["status"],
                "title": row["title"],
                "notes": row["notes"],
                "dueAt": row["due_at"],
                "assignedTo": row["assigned_to"],
            }
            for row in followups
        ],
        "activities": [
            {
                "id": row["id"],
                "leadId": row["lead_id"],
                "lead": row["lead_name"],
                "type": row["activity_type"],
                "notes": row["notes"],
                "createdAt": row["created_at"],
                "createdBy": row["created_by"],
            }
            for row in activities
        ],
        "items": [
            {
                "id": row["id"],
                "code": row["lead_code"],
                "name": row["name"],
                "phone": row["phone"],
                "alternatePhone": row["alternate_phone"],
                "email": row["email"],
                "status": row["status"],
                "priority": row["priority"],
                "budgetMin": money(row["budget_min"]),
                "budgetMax": money(row["budget_max"]),
                "requirements": json.loads(row["requirements"])
                if isinstance(row["requirements"], str)
                else row["requirements"],
                "project": row["project_name"],
                "projectId": row["project_id"],
                "source": row["source_name"] or row["source"],
                "sourceKey": row["source_key"],
                "sourceType": row["source_type"],
                "assignedTo": row["assigned_to"],
                "assignedToId": row["assigned_to_id"],
                "lastContactedAt": row["last_contacted_at"],
                "nextFollowUpAt": row["next_follow_up_at"],
                "createdAt": row["created_at"],
                "totalCalls": calls_by_lead.get(row["id"], {}).get("total_calls", 0),
                "lastCallAt": calls_by_lead.get(row["id"], {}).get("last_call_at"),
            }
            for row in rows
        ],
    }


async def fetch_customers(connection: asyncpg.Connection, organization_id: int) -> dict:
    summary = await connection.fetchrow(
        """
        SELECT
            COUNT(*) AS total_customers,
            COUNT(*) FILTER (WHERE kyc_status = 'verified') AS verified_customers,
            COUNT(*) FILTER (WHERE kyc_status = 'pending') AS pending_customers,
            COUNT(*) FILTER (WHERE kyc_status = 'rejected') AS rejected_customers,
            (
                SELECT COUNT(DISTINCT customer_id)
                FROM booking_applicants
                WHERE organization_id = $1 AND applicant_role = 'co_applicant'
            ) AS co_applicants,
            (
                SELECT COUNT(DISTINCT customer_id)
                FROM booking_applicants
                WHERE organization_id = $1
            ) AS booked_customers
        FROM customers
        WHERE organization_id = $1
        """,
        organization_id,
    )
    rows = await connection.fetch(
        """
        SELECT
            c.id,
            c.customer_code,
            c.full_name,
            c.phone,
            c.email,
            c.pan_no,
            c.aadhaar_no,
            c.address,
            c.kyc_status,
            COUNT(DISTINCT ba.booking_id) AS booking_count,
            COALESCE(SUM(b.booking_amount), 0) AS booking_value,
            MAX(b.booking_code) FILTER (WHERE ba.is_primary = TRUE) AS booking_code,
            MAX(b.booking_status) FILTER (WHERE ba.is_primary = TRUE) AS booking_status,
            MAX(ie.entity_code) FILTER (WHERE ba.is_primary = TRUE) AS unit_code,
            MAX(ba.applicant_role) AS applicant_role
        FROM customers c
        LEFT JOIN booking_applicants ba ON ba.customer_id = c.id
        LEFT JOIN bookings b ON b.id = ba.booking_id
        LEFT JOIN inventory_entities ie ON ie.id = b.inventory_entity_id
        WHERE c.organization_id = $1
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT 40
        """,
        organization_id,
    )
    applicants = await connection.fetch(
        """
        SELECT
            ba.id,
            ba.applicant_role,
            ba.ownership_percentage,
            ba.is_primary,
            c.full_name,
            c.phone,
            c.email,
            c.kyc_status,
            b.booking_code,
            b.booking_status,
            b.booking_amount,
            ie.entity_code AS unit_code
        FROM booking_applicants ba
        JOIN customers c ON c.id = ba.customer_id
        JOIN bookings b ON b.id = ba.booking_id
        JOIN inventory_entities ie ON ie.id = b.inventory_entity_id
        WHERE ba.organization_id = $1
        ORDER BY b.created_at DESC, ba.is_primary DESC, ba.applicant_role
        LIMIT 50
        """,
        organization_id,
    )
    brokers = await connection.fetch(
        """
        SELECT
            br.id,
            br.broker_code,
            br.full_name,
            br.company_name,
            br.phone,
            br.kyc_status,
            COUNT(bb.id) AS deal_count,
            COALESCE(SUM(bb.commission_amount), 0) AS commission_value
        FROM brokers br
        LEFT JOIN booking_brokers bb ON bb.broker_id = br.id
        WHERE br.organization_id = $1
        GROUP BY br.id
        ORDER BY deal_count DESC, br.full_name
        LIMIT 12
        """,
        organization_id,
    )
    return {
        "summary": {
            "total": summary["total_customers"],
            "verified": summary["verified_customers"],
            "pending": summary["pending_customers"],
            "rejected": summary["rejected_customers"],
            "coApplicants": summary["co_applicants"],
            "bookedCustomers": summary["booked_customers"],
        },
        "items": [
            {
                "id": row["id"],
                "code": row["customer_code"],
                "name": row["full_name"],
                "phone": row["phone"],
                "email": row["email"],
                "panNo": row["pan_no"],
                "aadhaarNo": row["aadhaar_no"],
                "address": row["address"],
                "kycStatus": row["kyc_status"],
                "bookingCode": row["booking_code"],
                "bookingStatus": row["booking_status"],
                "unitCode": row["unit_code"],
                "applicantRole": row["applicant_role"],
                "bookingCount": row["booking_count"],
                "bookingValue": money(row["booking_value"]),
            }
            for row in rows
        ],
        "applicants": [
            {
                "id": row["id"],
                "role": row["applicant_role"],
                "ownership": money(row["ownership_percentage"]),
                "isPrimary": row["is_primary"],
                "name": row["full_name"],
                "phone": row["phone"],
                "email": row["email"],
                "kycStatus": row["kyc_status"],
                "bookingCode": row["booking_code"],
                "bookingStatus": row["booking_status"],
                "bookingAmount": money(row["booking_amount"]),
                "unitCode": row["unit_code"],
            }
            for row in applicants
        ],
        "brokers": [
            {
                "id": row["id"],
                "code": row["broker_code"],
                "name": row["full_name"],
                "company": row["company_name"],
                "phone": row["phone"],
                "kycStatus": row["kyc_status"],
                "dealCount": row["deal_count"],
                "commissionValue": money(row["commission_value"]),
            }
            for row in brokers
        ],
    }


async def fetch_finance(connection: asyncpg.Connection, organization_id: int) -> dict:
    summary = await connection.fetchrow(
        """
        SELECT
            COALESCE(SUM(bs.amount), 0) AS demand,
            COALESCE(SUM(bs.paid_amount), 0) AS collected,
            COALESCE(SUM(bs.remaining_amount), 0) AS outstanding,
            (SELECT COUNT(*) FROM bookings WHERE organization_id = $1
                AND booking_status IN ('reserved', 'confirmed')) AS active_bookings
        FROM booking_stages bs
        WHERE bs.organization_id = $1
        """,
        organization_id,
    )
    plans = await connection.fetch(
        """
        SELECT pp.id, pp.name, pp.plan_type, COUNT(pps.id) AS stages
        FROM payment_plans pp
        LEFT JOIN payment_plan_stages pps ON pps.payment_plan_id = pp.id
        WHERE pp.organization_id = $1
        GROUP BY pp.id
        ORDER BY pp.name
        """,
        organization_id,
    )
    payments = await connection.fetch(
        """
        SELECT
            py.id,
            py.payment_code,
            py.amount,
            py.payment_mode,
            py.transaction_type,
            py.payment_status,
            py.paid_at,
            b.booking_code,
            c.full_name AS customer_name
        FROM payments py
        JOIN bookings b ON b.id = py.booking_id
        LEFT JOIN customers c ON c.id = py.customer_id
        WHERE py.organization_id = $1
        ORDER BY py.created_at DESC
        LIMIT 12
        """,
        organization_id,
    )
    bookings = await connection.fetch(
        """
        SELECT
            b.id,
            b.booking_code,
            b.booking_status,
            b.booking_amount,
            pp.name AS payment_plan,
            ie.entity_code AS unit_code,
            c.full_name AS customer_name
        FROM bookings b
        JOIN inventory_entities ie ON ie.id = b.inventory_entity_id
        LEFT JOIN payment_plans pp ON pp.id = b.payment_plan_id
        LEFT JOIN booking_applicants ba ON ba.booking_id = b.id AND ba.is_primary = TRUE
        LEFT JOIN customers c ON c.id = ba.customer_id
        WHERE b.organization_id = $1
        ORDER BY b.created_at DESC
        LIMIT 12
        """,
        organization_id,
    )
    stages = await connection.fetch(
        """
        SELECT
            bs.id,
            bs.stage_name,
            bs.stage_status,
            bs.stage_type,
            bs.requires_payment,
            bs.amount,
            bs.paid_amount,
            bs.remaining_amount,
            bs.due_date,
            b.booking_code,
            c.full_name AS customer_name,
            ie.entity_code AS unit_code
        FROM booking_stages bs
        JOIN bookings b ON b.id = bs.booking_id
        JOIN inventory_entities ie ON ie.id = b.inventory_entity_id
        LEFT JOIN booking_applicants ba ON ba.booking_id = b.id AND ba.is_primary = TRUE
        LEFT JOIN customers c ON c.id = ba.customer_id
        WHERE bs.organization_id = $1
        ORDER BY bs.due_date NULLS LAST, bs.sequence_no
        LIMIT 40
        """,
        organization_id,
    )
    collection_modes = await connection.fetch(
        """
        SELECT payment_mode, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
        FROM payments
        WHERE organization_id = $1 AND payment_status = 'completed'
        GROUP BY payment_mode
        ORDER BY amount DESC
        """,
        organization_id,
    )
    payment_status = await connection.fetch(
        """
        SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
        FROM payments
        WHERE organization_id = $1
        GROUP BY payment_status
        ORDER BY count DESC
        """,
        organization_id,
    )
    booking_status = await connection.fetch(
        """
        SELECT booking_status, COUNT(*) AS count, COALESCE(SUM(booking_amount), 0) AS amount
        FROM bookings
        WHERE organization_id = $1
        GROUP BY booking_status
        ORDER BY count DESC
        """,
        organization_id,
    )
    customers = await connection.fetch(
        """
        SELECT id, customer_code, full_name, phone, kyc_status
        FROM customers
        WHERE organization_id = $1
        ORDER BY full_name
        LIMIT 100
        """,
        organization_id,
    )
    return {
        "summary": {
            "demand": money(summary["demand"]),
            "collected": money(summary["collected"]),
            "outstanding": money(summary["outstanding"]),
            "activeBookings": summary["active_bookings"],
        },
        "plans": [
            {
                "id": row["id"],
                "name": row["name"],
                "type": row["plan_type"],
                "stages": row["stages"],
            }
            for row in plans
        ],
        "payments": [
            {
                "id": row["id"],
                "code": row["payment_code"],
                "amount": money(row["amount"]),
                "mode": row["payment_mode"],
                "type": row["transaction_type"],
                "status": row["payment_status"],
                "paidAt": row["paid_at"],
                "bookingCode": row["booking_code"],
                "customer": row["customer_name"],
            }
            for row in payments
        ],
        "bookings": [
            {
                "id": row["id"],
                "code": row["booking_code"],
                "status": row["booking_status"],
                "amount": money(row["booking_amount"]),
                "plan": row["payment_plan"],
                "unitCode": row["unit_code"],
                "customer": row["customer_name"],
            }
            for row in bookings
        ],
        "stages": [
            {
                "id": row["id"],
                "stage": row["stage_name"],
                "status": row["stage_status"],
                "type": row["stage_type"],
                "requiresPayment": row["requires_payment"],
                "amount": money(row["amount"]),
                "paid": money(row["paid_amount"]),
                "remaining": money(row["remaining_amount"]),
                "dueAt": row["due_date"],
                "bookingCode": row["booking_code"],
                "customer": row["customer_name"],
                "unitCode": row["unit_code"],
            }
            for row in stages
        ],
        "collectionModes": [
            {
                "mode": row["payment_mode"],
                "amount": money(row["amount"]),
                "count": row["count"],
            }
            for row in collection_modes
        ],
        "paymentStatus": [
            {
                "status": row["payment_status"],
                "amount": money(row["amount"]),
                "count": row["count"],
            }
            for row in payment_status
        ],
        "bookingStatus": [
            {
                "status": row["booking_status"],
                "amount": money(row["amount"]),
                "count": row["count"],
            }
            for row in booking_status
        ],
        "customers": [
            {
                "id": row["id"],
                "code": row["customer_code"],
                "name": row["full_name"],
                "phone": row["phone"],
                "kycStatus": row["kyc_status"],
            }
            for row in customers
        ],
    }


async def fetch_hrms(connection: asyncpg.Connection, organization_id: int) -> dict:
    await seed_permissions(connection)
    await assign_all_permissions_to_system_admins(connection, organization_id)
    users = await connection.fetch(
        """
        SELECT
            u.id,
            u.full_name,
            u.username,
            u.email,
            u.phone,
            u.is_active,
            u.is_super_admin,
            u.last_login_at,
            COALESCE(string_agg(r.name, ', ' ORDER BY r.name), 'No role') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.organization_id = $1
        GROUP BY u.id
        ORDER BY u.full_name
        """,
        organization_id,
    )
    attendance = await connection.fetch(
        """
        SELECT ar.attendance_date, ar.status, ar.check_in_at, ar.check_out_at, u.full_name
        FROM attendance_records ar
        JOIN users u ON u.id = ar.user_id
        WHERE ar.organization_id = $1
        ORDER BY ar.attendance_date DESC, u.full_name
        LIMIT 12
        """,
        organization_id,
    )
    roles = await connection.fetch(
        """
        SELECT
            r.id,
            r.name,
            r.description,
            r.is_system,
            COALESCE(
                json_agg(p.permission_key ORDER BY p.permission_key)
                FILTER (WHERE p.permission_key IS NOT NULL),
                '[]'::json
            ) AS permissions
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE r.organization_id = $1
        GROUP BY r.id
        ORDER BY r.name
        """,
        organization_id,
    )
    permissions = await connection.fetch(
        "SELECT id, permission_key, module, description FROM permissions ORDER BY module, permission_key"
    )
    role_coverage = await connection.fetch(
        """
        SELECT r.id, r.name, COUNT(ur.user_id) AS users_count, r.is_system
        FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
        WHERE r.organization_id = $1
        GROUP BY r.id
        ORDER BY users_count DESC, r.name
        """,
        organization_id,
    )
    attendance_summary = await connection.fetch(
        """
        SELECT status, COUNT(*) AS count
        FROM attendance_records
        WHERE organization_id = $1
          AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY status
        ORDER BY count DESC
        """,
        organization_id,
    )
    active_sessions = await connection.fetchval(
        """
        SELECT COUNT(*)
        FROM auth_sessions
        WHERE organization_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        """,
        organization_id,
    )
    return {
        "summary": {
            "users": len(users),
            "activeUsers": sum(1 for row in users if row["is_active"]),
            "inactiveUsers": sum(1 for row in users if not row["is_active"]),
            "roles": len(roles),
            "permissions": len(permissions),
            "activeSessions": active_sessions,
        },
        "users": [
            {
                "id": row["id"],
                "name": row["full_name"],
                "username": row["username"],
                "email": row["email"],
                "phone": row["phone"],
                "active": row["is_active"],
                "superAdmin": row["is_super_admin"],
                "roles": row["roles"],
                "lastLoginAt": row["last_login_at"],
            }
            for row in users
        ],
        "attendance": [
            {
                "date": row["attendance_date"],
                "status": row["status"],
                "checkInAt": row["check_in_at"],
                "checkOutAt": row["check_out_at"],
                "user": row["full_name"],
            }
            for row in attendance
        ],
        "roles": [dict(row) for row in roles],
        "permissions": [dict(row) for row in permissions],
        "roleCoverage": [dict(row) for row in role_coverage],
        "attendanceSummary": [dict(row) for row in attendance_summary],
    }


async def fetch_communication(connection: asyncpg.Connection, organization_id: int) -> dict:
    summary = await connection.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM call_sessions WHERE organization_id = $1) AS total_calls,
            (SELECT COUNT(*) FROM call_sessions WHERE organization_id = $1 AND status = 'queued') AS queued_calls,
            (SELECT COUNT(*) FROM call_sessions WHERE organization_id = $1 AND status IN ('completed', 'answered')) AS completed_calls,
            (SELECT COUNT(*) FROM outbound_messages WHERE organization_id = $1) AS total_messages,
            (SELECT COUNT(*) FROM outbound_messages WHERE organization_id = $1 AND status = 'queued') AS queued_messages,
            (SELECT COUNT(*) FROM outbound_messages WHERE organization_id = $1 AND status IN ('sent', 'delivered')) AS sent_messages
        """,
        organization_id,
    )
    calls = await connection.fetch(
        """
        SELECT
            cs.id,
            cs.trigger_source,
            cs.status,
            cs.disposition,
            cs.started_at,
            cs.ended_at,
            l.name AS lead_name,
            l.phone AS lead_phone,
            u.full_name AS employee_name
        FROM call_sessions cs
        LEFT JOIN leads l ON l.id = cs.lead_id
        LEFT JOIN users u ON u.id = cs.assigned_user_id
        WHERE cs.organization_id = $1
        ORDER BY cs.created_at DESC
        LIMIT 30
        """,
        organization_id,
    )
    messages = await connection.fetch(
        """
        SELECT
            om.id,
            om.channel,
            om.recipient_phone,
            om.recipient_email,
            om.content,
            om.status,
            om.sent_at,
            l.name AS lead_name,
            c.full_name AS customer_name,
            u.full_name AS sent_by_name
        FROM outbound_messages om
        LEFT JOIN leads l ON l.id = om.lead_id
        LEFT JOIN customers c ON c.id = om.customer_id
        LEFT JOIN users u ON u.id = om.sent_by
        WHERE om.organization_id = $1
        ORDER BY om.created_at DESC
        LIMIT 30
        """,
        organization_id,
    )
    templates = await connection.fetch(
        """
        SELECT id, template_name, channel, content, is_active
        FROM message_templates
        WHERE organization_id = $1
        ORDER BY is_active DESC, template_name
        LIMIT 30
        """,
        organization_id,
    )
    recipients = await connection.fetch(
        """
        SELECT 'lead' AS type, id, name, phone, email
        FROM leads
        WHERE organization_id = $1
        UNION ALL
        SELECT 'customer' AS type, id, full_name AS name, phone, email
        FROM customers
        WHERE organization_id = $1
        ORDER BY name
        LIMIT 100
        """,
        organization_id,
    )
    return {
        "summary": {
            "totalCalls": summary["total_calls"],
            "queuedCalls": summary["queued_calls"],
            "completedCalls": summary["completed_calls"],
            "totalMessages": summary["total_messages"],
            "queuedMessages": summary["queued_messages"],
            "sentMessages": summary["sent_messages"],
        },
        "calls": [
            {
                "id": str(row["id"]),
                "trigger": row["trigger_source"],
                "status": row["status"],
                "disposition": row["disposition"],
                "startedAt": row["started_at"],
                "endedAt": row["ended_at"],
                "lead": row["lead_name"],
                "leadPhone": row["lead_phone"],
                "employee": row["employee_name"],
            }
            for row in calls
        ],
        "messages": [
            {
                "id": row["id"],
                "channel": row["channel"],
                "recipient": row["recipient_phone"] or row["recipient_email"],
                "person": row["lead_name"] or row["customer_name"],
                "content": row["content"],
                "status": row["status"],
                "sentAt": row["sent_at"],
                "sentBy": row["sent_by_name"],
            }
            for row in messages
        ],
        "templates": [
            {
                "id": row["id"],
                "name": row["template_name"],
                "channel": row["channel"],
                "content": row["content"],
                "active": row["is_active"],
            }
            for row in templates
        ],
        "recipients": [
            {
                "type": row["type"],
                "id": row["id"],
                "name": row["name"],
                "phone": row["phone"],
                "email": row["email"],
            }
            for row in recipients
        ],
    }


async def fetch_activity(connection: asyncpg.Connection, organization_id: int) -> dict:
    summary_rows = await connection.fetch(
        """
        SELECT entity_type, COUNT(*) AS count
        FROM activities
        WHERE organization_id = $1
        GROUP BY entity_type
        ORDER BY count DESC
        LIMIT 8
        """,
        organization_id,
    )
    audit_summary_rows = await connection.fetch(
        """
        SELECT action, COUNT(*) AS count
        FROM audit_logs
        WHERE organization_id = $1
        GROUP BY action
        ORDER BY count DESC
        LIMIT 8
        """,
        organization_id,
    )
    activity_rows = await connection.fetch(
        """
        SELECT a.entity_type, a.activity_type, a.description, a.created_at, u.full_name
        FROM activities a
        LEFT JOIN users u ON u.id = a.created_by
        WHERE a.organization_id = $1
        ORDER BY a.created_at DESC
        LIMIT 20
        """,
        organization_id,
    )
    audit_rows = await connection.fetch(
        """
        SELECT al.entity_type, al.action, al.created_at, u.full_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.organization_id = $1
        ORDER BY al.created_at DESC
        LIMIT 20
        """,
        organization_id,
    )
    return {
        "summary": {
            "activities": sum(row["count"] for row in summary_rows),
            "auditLogs": sum(row["count"] for row in audit_summary_rows),
        },
        "entityCounts": [dict(row) for row in summary_rows],
        "auditActionCounts": [dict(row) for row in audit_summary_rows],
        "activities": [
            {
                "entityType": row["entity_type"],
                "type": row["activity_type"],
                "description": row["description"],
                "createdAt": row["created_at"],
                "user": row["full_name"],
            }
            for row in activity_rows
        ],
        "auditLogs": [
            {
                "entityType": row["entity_type"],
                "action": row["action"],
                "createdAt": row["created_at"],
                "user": row["full_name"],
            }
            for row in audit_rows
        ],
    }


async def fetch_settings(connection: asyncpg.Connection, organization_id: int) -> dict:
    organization = await connection.fetchrow(
        """
        SELECT name, slug, phone, email, address, is_active, created_at, updated_at
        FROM organizations
        WHERE id = $1
        """,
        organization_id,
    )
    roles = await connection.fetch(
        """
        SELECT
            r.id,
            r.name,
            r.description,
            r.is_system,
            COUNT(DISTINCT ur.user_id) AS users_count,
            COUNT(DISTINCT rp.permission_id) AS permissions_count
        FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        WHERE r.organization_id = $1
        GROUP BY r.id
        ORDER BY r.is_system DESC, r.name
        """,
        organization_id,
    )
    stats = await connection.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM users WHERE organization_id = $1) AS users,
            (SELECT COUNT(*) FROM projects WHERE organization_id = $1) AS projects,
            (SELECT COUNT(*) FROM inventory_entities WHERE organization_id = $1) AS inventory,
            (SELECT COUNT(*) FROM leads WHERE organization_id = $1) AS leads,
            (SELECT COUNT(*) FROM customers WHERE organization_id = $1) AS customers,
            (SELECT COUNT(*) FROM bookings WHERE organization_id = $1) AS bookings
        """,
        organization_id,
    )
    return {
        "organization": dict(organization) if organization else None,
        "roles": [dict(row) for row in roles],
        "stats": dict(stats) if stats else {},
    }


@router.get("/pages")
async def get_workspace_pages(
    project_id: int | None = Query(default=None),
    current_user: asyncpg.Record = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_db_pool),
) -> dict:
    organization_id = current_user["organization_id"]
    async with pool.acquire() as connection:
        await seed_permissions(connection)
        await assign_all_permissions_to_system_admins(connection, organization_id)
        pages = {}
        page_fetchers = {
            "dashboard": ("dashboard.view", lambda: fetch_metrics(connection, organization_id)),
            "inventory": ("inventory.view", lambda: fetch_inventory(connection, organization_id, project_id)),
            "leads": ("leads.view", lambda: fetch_leads(connection, organization_id)),
            "customer": ("customers.view", lambda: fetch_customers(connection, organization_id)),
            "finance": ("finance.view", lambda: fetch_finance(connection, organization_id)),
            "hrms": ("hrms.view", lambda: fetch_hrms(connection, organization_id)),
            "communication": ("communication.view", lambda: fetch_communication(connection, organization_id)),
            "activity": ("dashboard.view", lambda: fetch_activity(connection, organization_id)),
            "settings": ("settings.view", lambda: fetch_settings(connection, organization_id)),
        }
        for page, (permission, fetcher) in page_fetchers.items():
            try:
                await ensure_permission(connection, current_user, permission)
            except Exception:
                continue
            value = await fetcher()
            pages[page] = {"metrics": value} if page == "dashboard" else value
        return pages
