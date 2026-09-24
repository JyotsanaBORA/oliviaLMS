# Primo Dialler ↔ LMS Integration Technical Specification
### Version 2.0 — 1-to-1 ViciDial Migration Specification

---

## 1. Overview & Architecture

This document defines the direct 1-to-1 technical integration specification between **Primo Dialler** and the **Olivia Lead Management System (LMS)** for live human call center operations.

* **Production Backend Base URL:** `https://olivialms.cloud/api`

 **all Primo endpoints are isolated under `/api/v2/primo/`**.

```
+---------------------------------------------------------------------------------------+
|                                  Primo Dialler Cloud                                  |
+---------------------------------------------------------------------------------------+
      | (1) POST https://olivialms.cloud/api/v2/primo/call-data (Connected)
      | (2) POST https://olivialms.cloud/api/v2/primo/call-ended (CDR & Rec URL)
      v                                                       ^ (3) Hang-up / Dispo API
+-------------------------------------------------------------| (4) Transfer API
|            Olivia LMS Backend (https://olivialms.cloud)     | (5) Add / Update Lead API
+---------------------------------------------------------------------------------------+
            | (Socket.IO Real-Time Push)
            v
+---------------------------------------------------------------------------------------+
|                          Agent Workstation Browser Interface                          |
|                       (Agent 1 Intake / Agent 2 Closer Dashboards)                    |
+---------------------------------------------------------------------------------------+
```

---

## 2. Call Recordings Policy

### Do we store audio files on our servers?
**No.** Audio recording files **remain securely hosted on Primo Dialler's cloud storage**.
- Primo provides the direct playback link (`recording_url`) in the post-call webhook.
- The LMS database only stores the URL string on the Lead / Call record.
- LMS Supervisors and Admins stream playback directly from Primo's URL inside the LMS dashboard.

---

## 3. Human Agent Workflows

### Flow 1: Real-Time Screen-Pop (Inbound & Outbound)
1. Call connects to an agent in Primo Dialler.
2. Primo fires a webhook: `POST https://olivialms.cloud/api/v2/primo/call-data`.
3. LMS matches `agent_id` with the logged-in agent and pushes the call event instantly via WebSocket (`Socket.IO`).
4. The agent's LMS screen automatically opens the lead intake form pre-filled with the caller's phone, name, DID, campaign, and source ID.

### Flow 2: Form Submission, Auto-Hangup & Disposition Sync
1. The agent finishes the call, selects a disposition, and clicks **Submit Lead**.
2. LMS saves the lead and immediately triggers Primo's **Hang-up & Disposition API** (`POST https://<PRIMO_API_URL>/api/hangup`).
3. Primo hangs up the call on the agent's webphone and applies the disposition code, freeing the agent for the next call without double-entry.

---

### Flow 3: Live Call Transfer (Two Routing Options)

In our LMS, **Agent 1 (Opener/Intake)** can transfer the call using either of two methods:

#### Option A: Transfer to "Any Available Closer" (Round-Robin / In-Group Queue)
* **Use Case:** Opener wants the next ready closer to take the call.
* **Flow:** 
  1. Opener selects **"Next Available Closer"** in LMS.
  2. LMS calls Primo Transfer API with `destination_type: "queue"` and `destination: "CLOSER_QUEUE"`.
  3. Primo automatically routes the customer to the longest-idle closer in that queue.

#### Option B: Transfer to a "Specific Designated Closer" (Direct Agent Assignment)
* **Use Case:** Opener wants a specific top performer or requested closer (e.g. Agent "John Smith - ID 4020") to handle the lead.
* **Flow:**
  1. Opener selects **"John Smith (4020)"** from the closer dropdown list in LMS.
  2. LMS calls Primo Transfer API with `destination_type: "agent"` and `destination: "4020"`.
  3. Primo routes the call directly to Agent `4020`'s webphone.
  4. *Fallback Rule:* If the specific closer is on another call or busy, Primo can automatically overflow to the general closer queue or notify the opener.

*When the closer answers (Option A or B), Primo fires a new screen-pop webhook (`POST https://olivialms.cloud/api/v2/primo/call-data`) containing `transfer_from_agent: "4013"` to auto-open the customer's form on the Closer's screen.*

---

### Flow 4: Outbound Lead Injection
1. Incoming web leads or affiliate leads enter LMS.
2. LMS deduplicates and calls Primo's **Add Lead API** to inject the contact into the outbound campaign list.

---

## 4. Complete Production Disposition Matrix

The table below lists all **23 active dispositions** currently used across our frontend and backend:

| # | LMS UI Label | Primo Short Code | Category | Dialler Next Action |
| :---: | :--- | :--- | :--- | :--- |
| 1 | **SALE - Sale Made** | `SALE` | Positive / Closed | Do not redial (Enrolled) |
| 2 | **CALLBK - Call Back** | `CALLBK` | Follow-up | Schedule callback for agent |
| 3 | **HLCB - Hot Lead Callback** | `HLCB` | Priority Follow-up | Priority queue callback |
| 4 | **HLEAD - Hot Lead** | `HLEAD` | High Priority | Keep active for priority outreach |
| 5 | **XFER - Call Transferred** | `XFER` | Transfer | Transferred to closer queue |
| 6 | **Loan - LOAN** | `Loan` | Product Route | Route to loan department |
| 7 | **NI - Not Interested** | `NI` | Negative | Do not redial |
| 8 | **NIAP - Not Interested After Pitch** | `NIAP` | Negative | Do not redial |
| 9 | **NIBP - Not Interested Before Pitch** | `NIBP` | Negative | Do not redial |
| 10 | **DEC - Declined Sale** | `DEC` | Negative | Archive lead |
| 11 | **NQ - Not Qualified** | `NQ` | Unqualified | Do not redial (under debt threshold) |
| 12 | **ND - No Debt** | `ND` | Unqualified | Do not redial |
| 13 | **NP - No Pitch No Price** | `NP` | Unqualified | Do not redial |
| 14 | **LB - Language Barrier** | `LB` | Routing | Route to Spanish/bilingual list |
| 15 | **DNC - DO NOT CALL** | `DNC` | Compliance | Add to global DNC list |
| 16 | **A - Answering Machine** | `A` | No Contact | Recycle in dialer campaign |
| 17 | **N - No Answer** | `N` | No Contact | Recycle in dialer campaign |
| 18 | **B - Busy** | `B` | No Contact | Redial after set interval |
| 19 | **Ring - Ringing** | `Ring` | No Contact | Redial after set interval |
| 20 | **DAIR - Dead Air** | `DAIR` | Call Drop | Redial after set interval |
| 21 | **HU - Hangup** | `HU` | Customer Drop | Recycle in dialer campaign |
| 22 | **DC - Disconnected Number** | `DC` | Bad Data | Mark dead number |
| 23 | **WNU - Wrong Number** | `WNU` | Bad Data | Mark dead number |

---

## 5. Webhook Specifications (Primo → LMS)

### 5.1. Live Connected Call Webhook (Screen-Pop)
- **URL Endpoint:** `POST https://olivialms.cloud/api/v2/primo/call-data`
- **Fallback URL (GET):** `GET https://olivialms.cloud/api/v2/primo/call-data?...`
- **Content-Type:** `application/json` (or `application/x-www-form-urlencoded`)

#### Request Payload:
```json
{
  "event": "call_answered",
  "call_id": "PR-20260921-99881234",
  "agent_id": "4013",
  "phone_number": "9876543210",
  "call_type": "inbound",
  "did": "8005550199",
  "campaign_id": "CAMP_DEBT_01",
  "campaign_name": "Debt Relief Inbound",
  "list_id": "1001",
  "source_id": "GTI_AFF_01",
  "first_name": "John",
  "last_name": "Doe",
  "email": "johndoe@example.com",
  "address1": "123 Main St",
  "city": "Dallas",
  "state": "TX",
  "postal_code": "75001",
  "transfer_from_agent": "4013",
  "timestamp": "2026-09-21T15:04:05Z"
}
```

#### LMS Response:
```json
{
  "success": true,
  "message": "Call data received and pushed to agent",
  "callId": "650c82f9d8a1234bce99999",
  "agentMapped": true
}
```

---

### 5.2. Post-Call CDR & Recording Webhook
- **URL Endpoint:** `POST https://olivialms.cloud/api/v2/primo/call-ended`
- **Content-Type:** `application/json`

#### Request Payload:
```json
{
  "event": "call_ended",
  "call_id": "PR-20260921-99881234",
  "agent_id": "4013",
  "phone_number": "9876543210",
  "call_duration": 245,
  "talk_duration": 210,
  "disposition": "SALE",
  "recording_url": "https://recordings.primodialler.com/rec_99881234.mp3",
  "hangup_cause": "NORMAL_CLEARING",
  "ended_at": "2026-09-21T15:08:10Z"
}
```

---

## 6. API Endpoints Required from Primo (LMS → Primo)

### 6.1. Hang-up & Disposition API
Triggered when an agent clicks **Submit / Dispose Lead** in the LMS.

- **Method:** `POST`
- **Payload:**
```json
{
  "agent_id": "4013",
  "call_id": "PR-20260921-99881234",
  "disposition": "SALE"
}
```

---

### 6.2. Live Call Transfer API

Triggered when an intake agent initiates a transfer to a Closer Queue or Specific Closer.

- **Endpoint:** `POST https://<PRIMO_API_URL>/api/v2/call/transfer`
- **Headers:** `Authorization: Bearer <PRIMO_API_KEY>`, `Content-Type: application/json`

#### Example 1: Transfer to Any Available Closer (Queue)
```json
{
  "agent_id": "4013",
  "call_id": "PR-20260921-99881234",
  "transfer_type": "blind",
  "destination_type": "queue",
  "destination": "CLOSER_QUEUE_01",
  "custom_notes": "Intake verified lead - $25k debt"
}
```

#### Example 2: Transfer to a Specific Named Closer (Direct Agent)
```json
{
  "agent_id": "4013",
  "call_id": "PR-20260921-99881234",
  "transfer_type": "blind",
  "destination_type": "agent",
  "destination": "4020",
  "custom_notes": "Routing to John Smith (Senior Closer)"
}
```

#### Parameter Reference:
| Parameter | Type | Required | Values / Description |
| :--- | :--- | :--- | :--- |
| `agent_id` | String | **Yes** | The originating agent's login ID in Primo |
| `call_id` | String | **Yes** | The active call identifier to be transferred |
| `transfer_type` | String | **Yes** | `blind` (immediate handoff) or `warm` / `attended` (consult first) |
| `destination_type` | String | **Yes** | `queue` (Any available closer) or `agent` (Specific closer ID) |
| `destination` | String | **Yes** | In-Group/Queue ID (`CLOSER_QUEUE_01`) or Specific Agent ID (`4020`) |
| `custom_notes` | String | No | Lead notes forwarded with the transfer |

#### Expected Primo API Response:
```json
{
  "success": true,
  "message": "Call transfer initiated successfully",
  "call_id": "PR-20260921-99881234",
  "transfer_status": "in_progress"
}
```

---

### 6.3. Lead Injection API (Add API)
Triggered to inject website/affiliate leads into Primo dialer lists.

- **Method:** `POST`
- **Payload:**
```json
{
  "list_id": "1001",
  "phone_number": "9876543210",
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "janesmith@example.com",
  "address": "456 Elm St",
  "city": "Miami",
  "state": "FL",
  "postal_code": "33101",
  "custom_fields": {
    "totalDebtAmount": 35000,
    "leadSource": "Website_Optin",
    "lmsLeadId": "650c82f9d8a1234bce99999"
  }
}
```

---

### 6.4. Update Lead API
- **Method:** `POST` or `PUT`
- **Payload:**
```json
{
  "lead_id": "123456",
  "phone_number": "9876543210",
  "disposition": "CALLBK",
  "callback_time": "2026-09-22T10:00:00Z"
}
```

---

## 7. Multi-Tenant & Routing Rules

1. **DID Matching:** Inbound DIDs must be passed in the `did` field to attribute calls to specific client organizations (e.g., GTI).
2. **Agent ID Mapping:** Primo `agent_id` is linked 1-to-1 with the LMS user profile (`User.primoAgentId`).
3. **Safety Fallback:** All Primo routes use the `/api/v2/primo/` prefix. The existing `/api/vicidial/` routes remain untouched so you can fall back to ViciDial at any time without any code rollbacks.
