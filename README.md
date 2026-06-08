# Agent Portal

## Purpose

Agent Portal is the user-facing web application for the Agent System.

The portal provides a centralized interface for monitoring, reviewing, and controlling agent workflows. It serves as the operational layer above the backend agents and allows users to interact with the platform through a browser rather than through Teams, email, or direct system access.

---

## Relationship to Agent System

### agent-system

The `agent-system` repository contains:

- Scheduling Agent
- Payables Agent
- Contact Agent
- Statement Reconciliation Agent
- Valuation Agent
- Shared services
- Integrations
- Worker infrastructure
- Business logic

### agent-portal

The `agent-portal` repository contains:

- Dashboard
- Review Queues
- Monitoring
- Job Submission
- User Management
- Administrative Tools
- Future Agent Interfaces

The portal does not perform heavy agent processing directly. Instead, it interacts with the shared database and job queues used by the Agent System.

---

## Architecture

User
  ↓
Agent Portal
  ↓
Database / Job Queue
  ↓
Agent System Workers
  ↓
External Systems


External systems include:

- Microsoft Graph
- Microsoft 365
- Outlook
- Teams
- QuickBooks
- Dropbox
- Real Estate APIs
- Future integrations

---

## Initial Scope (v1)

Version 1 focuses on operational visibility and control.

Planned features:

1. User Authentication
2. Agent Health Dashboard
3. Review Queue
4. Manual Job Creation
5. Job Status Tracking
6. Valuation Upload Interface
7. Administrative Dashboard

---

## Deployment

### Planned URL
agents.foundry-capital.co

### Planned Hosting

- Vercel
- Supabase
- Dropbox
- Agent System Worker Nodes

---

## Naming Standards

### Repository

agent-portal

### Related Repositories
agent-system
agent-config (future)
agent-docs (future)

---

## Status

### Current Phase


Architecture and Foundation
The repository currently contains the initial project structure and design framework for the future Agent Portal.