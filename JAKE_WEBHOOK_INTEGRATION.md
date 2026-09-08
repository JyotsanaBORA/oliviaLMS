# Team 1 / Jake (Social Up Media) — API & Webhook Integration Guide

## Overview

This guide explains how **Team 1 / Social Up Media** integrates with the Olivia Lead Management System (LMS) for:
1. ⚡ **Channel 1: Live Transfers** (Lead data posting + call transfer to DID `19162330004`)
2. 📞 **Channel 2: Direct Inbound Calls** (Routing calls directly to Inbound DID `19162330139`)

---

## 1. Credentials & Configuration

| Parameter | Value | Description |
|---|---|---|
| **Webhook Endpoint** | `https://olivialms.cloud/api/webhook/inbound-leads` | POST endpoint for live transfer lead data |
| **API Key Header** | `x-api-key: 87566494dedd723cea257b4a4489b2053a1927d6dc5a16572300103d1f8a4cad` | Secret authentication key |
| **⚡ Live Transfer DID** | `19162330004` | Transfer live qualified callers to this DID |
| **📞 Direct Inbound DID** | `19162330139` | Route direct advertising consumer calls to this DID |

> ⚠️ **Security Notice:** Keep your API key confidential and make all webhook calls from your server backend.

---

## 2. Channel 1: Live Transfers Setup

### Workflow:
1. When your agent qualifies a consumer, your backend server sends a `POST` request to the webhook with the consumer's details.
2. Your telephony system transfers the live caller to the **Live Transfer DID (`19162330004`)**.
3. The lead instantly appears on Jake's dashboard under the ⚡ **Live Transfers** view.

### Webhook Endpoint:
```http
POST https://olivialms.cloud/api/webhook/inbound-leads
Content-Type: application/json
x-api-key: 87566494dedd723cea257b4a4489b2053a1927d6dc5a16572300103d1f8a4cad
```

### Request Payload Fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` / `fullName` | string | ✅ Recommended | Lead full name (or provide `firstName` & `lastName`) |
| `firstName` | string | Optional | Lead's first name |
| `lastName` | string | Optional | Lead's last name |
| `phone` | string | ✅ Yes | 10-digit consumer phone number (e.g. `5551234567`) |
| `email` | string | Optional | Lead email address |
| `totalDebtAmount` | number / string | Optional | Unsecured debt amount in USD (e.g. `25000` or `"$25,000"`) |
| `streetAddress` | string | Optional | Street address |
| `city` | string | Optional | City |
| `state` | string | Optional | 2-letter state code (e.g. `"CA"`, `"TX"`) |
| `zipCode` | string | Optional | 5-digit ZIP code |
| `notes` | string | Optional | Qualification notes or transfer summary |
| `smsOptIn` | boolean | Optional | Whether the consumer consented to SMS (`true`/`false`) |

---

## 3. Channel 2: Direct Inbound Calls (Direct to DID)

For consumers calling in directly from digital, search, or TV campaigns:
* Route consumer calls directly to your assigned **Inbound DID: `19162330139`**.
* No prior API post is required for pure inbound DID calls — ViciDial captures the caller's phone and automatically attributes the lead to your 📞 **Inbound Calls** dashboard view.

---

## 4. Code Examples (Live Transfer Webhook)

### cURL
```bash
curl -X POST https://olivialms.cloud/api/webhook/inbound-leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: 87566494dedd723cea257b4a4489b2053a1927d6dc5a16572300103d1f8a4cad" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "5551234567",
    "email": "john.doe@example.com",
    "totalDebtAmount": 28500,
    "city": "Dallas",
    "state": "TX",
    "zipCode": "75001",
    "notes": "Live transfer - qualified for debt relief",
    "smsOptIn": true
  }'
```

---

### Node.js (Fetch / Axios)
```javascript
const axios = require('axios');

async function sendLiveTransferLead() {
  try {
    const response = await axios.post(
      'https://olivialms.cloud/api/webhook/inbound-leads',
      {
        firstName: 'John',
        lastName: 'Doe',
        phone: '5551234567',
        email: 'john.doe@example.com',
        totalDebtAmount: 28500,
        city: 'Dallas',
        state: 'TX',
        zipCode: '75001',
        notes: 'Live transfer - transferring now to 19162330004',
        smsOptIn: true
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': '87566494dedd723cea257b4a4489b2053a1927d6dc5a16572300103d1f8a4cad'
        }
      }
    );

    console.log('✅ Lead submitted successfully:', response.data);
  } catch (error) {
    console.error('❌ Submission failed:', error.response?.data || error.message);
  }
}

sendLiveTransferLead();
```

---

### Python (Requests)
```python
import requests

url = "https://olivialms.cloud/api/webhook/inbound-leads"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "87566494dedd723cea257b4a4489b2053a1927d6dc5a16572300103d1f8a4cad"
}
payload = {
    "firstName": "John",
    "lastName": "Doe",
    "phone": "5551234567",
    "email": "john.doe@example.com",
    "totalDebtAmount": 28500,
    "city": "Dallas",
    "state": "TX",
    "zipCode": "75001",
    "notes": "Live transfer - transferring to 19162330004",
    "smsOptIn": True
}

response = requests.post(url, json=payload, headers=headers)
print("Status Code:", response.status_code)
print("Response:", response.json())
```

---

### PHP (cURL)
```php
<?php
$data = [
    'firstName'       => 'John',
    'lastName'        => 'Doe',
    'phone'           => '5551234567',
    'email'           => 'john.doe@example.com',
    'totalDebtAmount' => 28500,
    'city'            => 'Dallas',
    'state'           => 'TX',
    'zipCode'         => '75001',
    'notes'           => 'Live transfer qualification',
    'smsOptIn'        => true
];

$ch = curl_init('https://olivialms.cloud/api/webhook/inbound-leads');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: 87566494dedd723cea257b4a4489b2053a1927d6dc5a16572300103d1f8a4cad'
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP Code: $httpCode\nResponse: $response\n";
?>
```

---

## 5. Responses

### Success Response (`201 Created`):
```json
{
  "success": true,
  "message": "Thank you! Your submission has been received.",
  "leadId": "6aa02638a3a2633e1762cb2e"
}
```

### Error Responses:
| HTTP Status | Reason | Fix |
|---|---|---|
| `401 Unauthorized` | Invalid or missing `x-api-key` header | Verify the API key header |
| `400 Bad Request` | Malformed payload | Check JSON structure |
| `429 Too Many Requests` | Rate limit exceeded | Slow down submission frequency |
| `500 Server Error` | Server processing error | Contact LMS technical support |
