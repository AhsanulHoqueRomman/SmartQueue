# ⚡ SmartQueue — Multi-Tenant Appointment & Queue Management Platform

**SmartQueue** is a production-ready, multi-tenant Appointment and Serial-Based Queue Management Platform designed for healthcare clinics, wellness centers, and professional service organizations.

Built with **Django REST Framework** and **React + Vite**, SmartQueue replaces static, rigid time-slot scheduling with dynamic **serial token queues**, **live queue telemetry**, **readiness indicators**, and **cross-organization customer dashboards**.

---

## 🌟 Key Features & Problem Solved

### The Problem
Traditional appointment scheduling forces patients into fixed time slots (e.g., 10:00 AM, 10:15 AM). When consultations run over, waiting rooms overcrowd, patients experience anxiety due to unpredictable delays, and clinics suffer from front-desk operational bottlenecks.

### The SmartQueue Solution
- **Serial Token Queue Model**: Customers book a serial position for a given date rather than a fixed minute slot.
- **Fair Effective Ordering**: Queue sequence is strictly ordered by `-is_urgent, serial_number` (urgent cases prioritized, then ordered by serial number).
- **Live Telemetry & ETA Windows**: Dynamic computation of *Your Serial*, *Now Serving*, *People Ahead*, *Estimated Service Time Range*, and *Recommended Arrival Time*.
- **Readiness States**: Guidance states (`Turn Now`, `Be Ready`, `Get Ready`, `Not Yet`) inform customers when to head to the facility.
- **Cross-Clinic Customer Dashboard**: Customers manage bookings across multiple independent clinics in a unified interface.
- **Transactional Lifecycle Synchronization**: Cancelling an appointment automatically updates its linked queue token.
- **Multi-Role Governance**: Role-specific portals tailored for Customers, Providers, Staff, Managers, and System Admins.

---

## 🏗 Architecture & Technology Stack

### Backend
- **Framework**: Python 3.12+ / Django 5+ / Django REST Framework (DRF)
- **Database**: PostgreSQL (Development fallback to SQLite)
- **Authentication**: JWT (JSON Web Tokens) via `djangorestframework-simplejwt`
- **API Documentation**: OpenAPI 3.0 via `drf-spectacular` (Swagger UI & ReDoc)

### Frontend
- **Framework**: React 18 / Vite
- **Routing**: React Router v6
- **HTTP Client**: Axios with centralized error handling & auth interceptors
- **Styling**: Vanilla CSS with custom CSS variables (Warm Sand & Espresso visual system)

### Polling Architecture Note
> [!NOTE]
> SmartQueue uses **HTTP polling** for live telemetry and notifications:
> - **Customer Dashboard**: ~10-second polling loop (`appointmentService.getCustomerDashboard()`)
> - **Notification Bell**: ~20-second centralized polling loop (`notificationService.getCustomerNotifications()`)
>
> WebSockets and third-party message brokers (e.g., Redis/Celery) are intentionally omitted to maintain a lightweight, deterministic, and easily deployable architecture.

---

## 👥 Role System & Access Control

| Role | Access Scope | Key Capabilities |
| :--- | :--- | :--- |
| **CUSTOMER** | Self-Scoped / Multi-Org | Cross-clinic dashboard, booking, check-in, live queue telemetry, notifications, appointment details, verified reviews for completed care. |
| **PROVIDER** | Profile-Scoped | Operational queue control (`Call Next`, `Start`, `Complete`, `Skip`), daily appointments, availability schedules, profile configuration. |
| **STAFF** | Organization-Scoped | Front-desk queue monitor, manual check-in, customer roster, service lookup. |
| **MANAGER** | Organization-Scoped | Services catalog, provider roster, staff management, reviews summary, analytics, audit logs, org settings. |
| **ADMIN** | System-Wide | System overview, organization verification/approval workflows, platform user management, system audit logs. |

---

## 🎨 Visual System & Aesthetic Direction

SmartQueue uses the **Warm Sand & Espresso** visual system designed for calm, trustworthy, healthcare-focused user experiences:

- **Background**: `#FAF8F3` (Warm Sand)
- **Primary / Espresso**: `#2F2520` (Dark Roasted Espresso)
- **Primary Text**: `#211C19` (Sepia Charcoal)
- **Secondary / Sage**: `#5F7A70` (Muted Sage Green)
- **Success**: `#4F7A5A` (Forest Green)
- **Warning**: `#B77932` (Warm Amber)
- **Danger**: `#B4534B` (Muted Crimson)

---

## 🚀 Getting Started & Setup Instructions

### Prerequisites
- Python 3.12+
- Node.js 18+ & npm

### 1. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create & activate virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install django djangorestframework djangorestframework-simplejwt django-cors-headers drf-spectacular pytest pytest-django

# Run migrations
python manage.py migrate

# Seed demo data (creates sample organizations, providers, services, and users)
python manage.py seed_demo_data

# Start Django development server (runs on http://127.0.0.1:8000)
python manage.py runserver
```

### 2. Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server (runs on http://localhost:5173)
npm run dev
```

---

## 🧪 Verification & Testing Commands

### Backend Verification
```bash
cd backend

# 1. Django System Diagnostic Check
python manage.py check

# 2. Check for missing migrations
python manage.py makemigrations --check

# 3. Run full automated backend test suite
pytest
```

### Frontend Build Verification
```bash
cd frontend

# Compile production Vite bundle
npm run build
```

---

## 🔒 Security & Tenant Isolation

- **Tenant Isolation**: Every organization request enforces organizational membership or ownership.
- **Cross-Customer Security**: Customers cannot view or mutate another customer's appointments, queue tokens, notifications, or reviews (`403 Forbidden` / `404 Not Found`).
- **Audit Logging**: Sensitive operations (`APPOINTMENT_BOOKED`, `QUEUE_CALLED`, `QUEUE_SKIPPED`, `REVIEW_CREATED`) emit immutable audit logs.
