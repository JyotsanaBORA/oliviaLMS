# Olivia LMS — ViciDial Inbound Call Query-Parameter Integration

## Developer Configuration Specification

---

### 1. Objective

Configure ViciDial to send inbound call information to Olivia LMS using URL query parameters. The endpoint accepts query parameters for both `GET` and `POST` requests, allowing ViciDial to send the required data directly in the URL.

---

### 2. Endpoint

* **URL**: `https://olivialms.cloud/api/inbound/call-data`
* **Supported Methods**: `GET` and `POST`
* Query parameters are accepted directly by the endpoint.

---

### 3. Exact ViciDial URL Template

Configure ViciDial with the following URL:

```text
https://olivialms.cloud/api/inbound/call-data?campaign_name=--A--campaign--B--&did=--A--did_id--B--&phone_number=--A--phone_number--B--&agent_id=--A--user--B--&caller_name=--A--first_name--B--+--A--last_name--B--&status=--A--dispo--B--
```

---

### 4. Query Parameter Mapping

| Parameter | Required | ViciDial Placeholder | Description |
|---|---|---|---|
| `phone_number` | **Yes** | `--A--phone_number--B--` | Caller's phone number |
| `did` | **Yes** | `--A--did_id--B--` OR `--A--phone_number--B--` | Inbound DID dialed by the customer |
| `campaign_name` | **Yes** | `--A--campaign--B--` | Campaign / In-Group name |
| `agent_id` | Optional | `--A--user--B--` | Agent ID who answered |
| `caller_name` | Optional | `--A--first_name--B--` + `--A--last_name--B--` | Caller's name |
| `status` | Optional | `--A--dispo--B--` | Call status / disposition |

---

### 5. Critical DID / Phone Number Distinction

* `phone_number` = the customer's incoming phone number
* `did` = the DID number that the customer called

**Example:**
* Customer phone number: `5550001111`
* DID dialed: `19162330139`

---

### 6. Minimum Required Data

The following parameters are required:
* `phone_number`
* `did`
* `campaign_name`

*(agent_id, caller_name, and status may be omitted when unavailable).*

---

### 7. Example Request

```text
https://olivialms.cloud/api/inbound/call-data?campaign_name=SALES_INBOUND&did=19162330139&phone_number=5550001111&agent_id=1001&caller_name=John+Smith&status=RECEIVED
```

---

### 8. URL Encoding

ViciDial should URL-encode dynamic values where required. For example: `John Smith` → `John+Smith` or `John%20Smith`.

---

### 9. Test Request

#### Browser:
```text
https://olivialms.cloud/api/inbound/call-data?campaign_name=TEST_CAMPAIGN&did=19162330139&phone_number=5550001111&caller_name=TEST_CALLER
```

#### cURL:
```bash
curl -X GET "https://olivialms.cloud/api/inbound/call-data?campaign_name=TEST_CAMPAIGN&did=19162330139&phone_number=5550001111&caller_name=TEST_CALLER"
```

---

### 10. Expected Successful Response

**HTTP 200 OK**
```json
{
  "success": true,
  "message": "Inbound call recorded successfully",
  "id": "6aa25f4ef05dd4c5f61336e3",
  "organization": "Social Up Media LLC",
  "did": "19162330139"
}
```

---

### 11. Processing

1. Reads query parameters from the request.
2. Combines query parameters with request body data when applicable.
3. Matches the supplied DID to the relevant organization.
4. Records the inbound call data.
5. Makes the inbound information available to the relevant LMS dashboards in real time.

---

### 12. ViciDial Developer Checklist

- [ ] Configure the Olivia LMS URL as the inbound webhook / URL trigger.
- [ ] Use the exact parameter names in this document.
- [ ] Send the customer's phone as `phone_number`.
- [ ] Send the dialed DID as `did`.
- [ ] Send campaign / In-Group as `campaign_name`.
- [ ] Send agent ID when available.
- [ ] Send caller first and last name when available.
- [ ] Send status/disposition when available.
- [ ] URL-encode dynamic values when required.
- [ ] Perform a live inbound test.
- [ ] Confirm HTTP 200 from Olivia LMS.
- [ ] Confirm the correct organization is identified from the DID.

---

### 13. Confirmation Required

* Configured ViciDial trigger/event.
* Final URL generated during a test call.
* Actual DID and phone_number sent.
* HTTP response received from Olivia LMS.
* Confirmation that the inbound record appears in Olivia LMS.

---

### Production Endpoint Summary

* **URL**: `https://olivialms.cloud/api/inbound/call-data`
* **Supported**: `GET` and `POST` with URL query parameters
* **Required**: `phone_number`, `did`, `campaign_name`
* **Optional**: `agent_id`, `caller_name`, `status`
