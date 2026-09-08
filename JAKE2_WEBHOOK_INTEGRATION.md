# Jake 2 (Social Up Media 2) — Webhook Integration Guide

## Overview

When a user submits a form on Jake 2's website or funnel, your system should send a `POST` request to the webhook endpoint below. The lead data will be immediately routed and visible on Jake 2's dashboard with read-only access.

---

## 1. Webhook Endpoint

```http
POST https://olivialms.cloud/api/webhook/jake2-leads
```

*(Alternative alias: `https://olivialms.cloud/api/webhook/jake2` or `https://olivialms.cloud/api/webhook/inbound-leads`)*

---

## 2. Authentication & Headers

| Header | Value | Description |
|---|---|---|
| `x-api-key` | `3470d747236a64842432a6ae6252df02eea25a935854b01934d17ed15733d6d4` | Organization secret key |
| `Content-Type` | `application/json` | Request content type |

> ⚠️ **Security Notice:** Keep your API key confidential and make all webhook calls from your server backend.

---

## 3. Request Payload Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `firstName` | string | ✅ Yes | Lead's first name |
| `lastName` | string | ✅ Yes | Lead's last name |
| `phone` | string | ✅ Yes | 10-digit consumer phone number (e.g. `5551234567`) |
| `email` | string | Optional | Lead email address |
| `totalDebtAmount` | number / string | Optional | Total unsecured debt amount in USD (e.g. `25000` or `"$25,000"`) |
| `streetAddress` | string | Optional | Street address |
| `city` | string | Optional | City |
| `state` | string | Optional | 2-letter state code (e.g. `"PA"`, `"CA"`, `"TX"`) |
| `zipCode` | string | Optional | 5-digit ZIP code |
| `message` / `notes` | string | Optional | Inquiry message or qualification notes |
| `smsOptIn` | boolean | Optional | Whether the consumer consented to SMS (`true`/`false`) |
| `preferredContactDate` | string | Optional | Preferred contact date (e.g. `"2026-09-15"`) |
| `preferredContactSlot` | string | Optional | Preferred time slot (`"Morning"`, `"Afternoon"`, `"Evening"`) |

---

## 4. Code Examples

### cURL
```bash
curl -X POST https://olivialms.cloud/api/webhook/jake2-leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: 3470d747236a64842432a6ae6252df02eea25a935854b01934d17ed15733d6d4" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "5551234567",
    "email": "john.doe@example.com",
    "totalDebtAmount": 28500,
    "streetAddress": "500 Office Center Drive",
    "city": "Fort Washington",
    "state": "PA",
    "zipCode": "19034",
    "message": "Interested in debt relief options",
    "smsOptIn": true
  }'
```

---

### Node.js (Fetch / Axios)
```javascript
const axios = require('axios');

async function sendLead() {
  try {
    const response = await axios.post(
      'https://olivialms.cloud/api/webhook/jake2-leads',
      {
        firstName: 'John',
        lastName: 'Doe',
        phone: '5551234567',
        email: 'john.doe@example.com',
        totalDebtAmount: 28500,
        streetAddress: '500 Office Center Drive',
        city: 'Fort Washington',
        state: 'PA',
        zipCode: '19034',
        message: 'Interested in debt relief options',
        smsOptIn: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': '3470d747236a64842432a6ae6252df02eea25a935854b01934d17ed15733d6d4'
        }
      }
    );
    console.log('Lead submitted successfully:', response.data);
  } catch (error) {
    console.error('Error submitting lead:', error.response?.data || error.message);
  }
}

sendLead();
```

---

### Python (Requests)
```python
import requests

url = "https://olivialms.cloud/api/webhook/jake2-leads"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "3470d747236a64842432a6ae6252df02eea25a935854b01934d17ed15733d6d4"
}
payload = {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "5551234567",
    "email": "john.doe@example.com",
    "totalDebtAmount": 28500,
    "streetAddress": "500 Office Center Drive",
    "city": "Fort Washington",
    "state": "PA",
    "zipCode": "19034",
    "message": "Interested in debt relief options",
    "smsOptIn": True
}

response = requests.post(url, json=payload, headers=headers)
print(response.status_code, response.json())
```

---

### PHP (cURL)
```php
<?php
$payload = json_encode([
    'firstName'       => 'John',
    'lastName'        => 'Doe',
    'phone'           => '5551234567',
    'email'           => 'john.doe@example.com',
    'totalDebtAmount' => 28500,
    'streetAddress'   => '500 Office Center Drive',
    'city'            => 'Fort Washington',
    'state'           => 'PA',
    'zipCode'         => '19034',
    'message'         => 'Interested in debt relief options',
    'smsOptIn'        => true
]);

$ch = curl_init('https://olivialms.cloud/api/webhook/jake2-leads');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: 3470d747236a64842432a6ae6252df02eea25a935854b01934d17ed15733d6d4'
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>
```

---

## 5. Success & Error Responses

### Success Response (`201 Created` / `200 OK`)
```json
{
  "success": true,
  "message": "Thank you! Your submission has been received.",
  "leadId": "6aa0398f..."
}
```

### Error Responses
| HTTP Status | Reason | Fix |
|---|---|---|
| `401 Unauthorized` | Invalid or missing `x-api-key` header | Ensure valid API key is passed in `x-api-key` |
| `429 Too Many Requests` | Rate limit exceeded (100 requests per 15 min per IP) | Adjust submission interval |
| `500 Internal Server Error` | Server processing error | Contact LMS support |

---

## 6. Access & Permission Settings
- **User Account:** `jake2@socialupmedia.com`
- **Permissions:** **Read-only** access to leads for Socialupmedia 2. CSV downloading is disabled (`canDownloadLeads: false`), and lead modification across other organizations is restricted.
