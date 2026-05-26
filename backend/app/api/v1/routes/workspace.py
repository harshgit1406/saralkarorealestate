import json
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, Depends

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


async def fetch_inventory(connection: asyncpg.Connection, organization_id: int) -> dict:
    projects = await connection.fetch(
        """
        SELECT id, name, project_code, project_type, location, status
        FROM projects
        WHERE organization_id = $1
        ORDER BY created_at DESC
        """,
        organization_id,
    )
    selected_project_id = projects[0]["id"] if projects else None
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
                pr.final_price AS price
            FROM inventory_entities child
            JOIN inventory_entities parent ON parent.id = child.parent_id
            LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = child.id
            LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = child.id
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
        GROUP BY inventory_status
        """,
        organization_id,
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
            pr.final_price,
            pr.price_per_sqft
        FROM inventory_entities ie
        JOIN projects p ON p.id = ie.project_id
        LEFT JOIN inventory_dimensions dim ON dim.inventory_entity_id = ie.id
        LEFT JOIN inventory_pricing pr ON pr.inventory_entity_id = ie.id
        LEFT JOIN inventory_details d ON d.inventory_entity_id = ie.id
        WHERE ie.organization_id = $1
          AND ie.entity_type IN ('flat', 'plot', 'villa', 'shop', 'office')
        ORDER BY p.created_at DESC, p.name, ie.sort_order, ie.entity_code
        LIMIT 200
        """,
        organization_id,
    )
    return {
        "counts": {row["inventory_status"]: row["total"] for row in status_rows},
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
            }
            for row in units
        ],
    }


async def fetch_leads(connection: asyncpg.Connection, organization_id: int) -> dict:
    lead_sources = await connection.fetch(
        """
        SELECT id, source_name, source_key, source_type, is_active
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
            l.status,
            l.priority,
            l.budget_min,
            l.budget_max,
            p.name AS project_name,
            u.full_name AS assigned_to,
            l.next_follow_up_at
        FROM leads l
        LEFT JOIN projects p ON p.id = l.project_id
        LEFT JOIN users u ON u.id = l.assigned_to
        WHERE l.organization_id = $1
        ORDER BY l.created_at DESC
        LIMIT 20
        """,
        organization_id,
    )
    return {
        "sources": [dict(row) for row in lead_sources],
        "users": [dict(row) for row in users],
        "projects": [dict(row) for row in projects],
        "items": [
            {
                "id": row["id"],
                "code": row["lead_code"],
                "name": row["name"],
                "phone": row["phone"],
                "status": row["status"],
                "priority": row["priority"],
                "budgetMin": money(row["budget_min"]),
                "budgetMax": money(row["budget_max"]),
                "project": row["project_name"],
                "assignedTo": row["assigned_to"],
                "nextFollowUpAt": row["next_follow_up_at"],
            }
            for row in rows
        ],
    }


async def fetch_customers(connection: asyncpg.Connection, organization_id: int) -> dict:
    rows = await connection.fetch(
        """
        SELECT
            c.id,
            c.customer_code,
            c.full_name,
            c.phone,
            c.email,
            c.kyc_status,
            b.booking_code,
            b.booking_status,
            ie.entity_code AS unit_code
        FROM customers c
        LEFT JOIN booking_applicants ba ON ba.customer_id = c.id AND ba.is_primary = TRUE
        LEFT JOIN bookings b ON b.id = ba.booking_id
        LEFT JOIN inventory_entities ie ON ie.id = b.inventory_entity_id
        WHERE c.organization_id = $1
        ORDER BY c.created_at DESC
        LIMIT 20
        """,
        organization_id,
    )
    return {
        "items": [
            {
                "id": row["id"],
                "code": row["customer_code"],
                "name": row["full_name"],
                "phone": row["phone"],
                "email": row["email"],
                "kycStatus": row["kyc_status"],
                "bookingCode": row["booking_code"],
                "bookingStatus": row["booking_status"],
                "unitCode": row["unit_code"],
            }
            for row in rows
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
    return {
        "users": [
            {
                "id": row["id"],
                "name": row["full_name"],
                "username": row["username"],
                "email": row["email"],
                "phone": row["phone"],
                "active": row["is_active"],
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
    }


async def fetch_communication(connection: asyncpg.Connection, organization_id: int) -> dict:
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
        LIMIT 12
        """,
        organization_id,
    )
    messages = await connection.fetch(
        """
        SELECT om.channel, om.recipient_phone, om.recipient_email, om.content, om.status, om.sent_at
        FROM outbound_messages om
        WHERE om.organization_id = $1
        ORDER BY om.created_at DESC
        LIMIT 10
        """,
        organization_id,
    )
    return {
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
                "channel": row["channel"],
                "recipient": row["recipient_phone"] or row["recipient_email"],
                "content": row["content"],
                "status": row["status"],
                "sentAt": row["sent_at"],
            }
            for row in messages
        ],
    }


async def fetch_activity(connection: asyncpg.Connection, organization_id: int) -> dict:
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
        SELECT name, slug, phone, email, address, is_active
        FROM organizations
        WHERE id = $1
        """,
        organization_id,
    )
    roles = await connection.fetch(
        """
        SELECT name, description, is_system
        FROM roles
        WHERE organization_id = $1
        ORDER BY is_system DESC, name
        """,
        organization_id,
    )
    return {
        "organization": dict(organization) if organization else None,
        "roles": [dict(row) for row in roles],
    }


@router.get("/pages")
async def get_workspace_pages(
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
            "inventory": ("inventory.view", lambda: fetch_inventory(connection, organization_id)),
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
