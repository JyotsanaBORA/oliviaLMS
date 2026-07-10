# Ben Website Leads — Webhook Integration Guide

## Overview

When a user submits a form on Ben's website, your frontend should send a `POST` request to the webhook endpoint below. The lead will be stored and immediately visible on the Ben admin dashboard.

---

## Endpoint

```
POST https://olivialms.cloud/api/webhook/ben-leads
```

---

## Required Headers

| Header | Value |
|--------|-------|
| `x-api-key` | `d30b9786ca66bb5326588e875c57ca3808e213880e30610ad0f67b7216cecae6` |
| `Content-Type` | `application/json` |

> ⚠️ **Keep the API key secret.** Do not expose it in frontend JavaScript. Always call this endpoint from your backend/server side.

---

## Request Body

Send a JSON object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `firstName` | string | ✅ Yes | Lead's first name |
| `lastName` | string | ✅ Yes | Lead's last name |
| `email` | string | No | Email address |
| `phone` | string | No | Phone number |
| `totalDebtAmount` | number | No | Total debt amount in USD (e.g. `25000`) |
| `message` | string | No | Message from the contact form |
| `streetAddress` | string | No | Street address |
| `city` | string | No | City |
| `state` | string | No | State (e.g. `"CA"`) |
| `zipCode` | string | No | ZIP / Postal code |
| `smsOptIn` | boolean | No | Whether the user consented to SMS (`true` / `false`) |
| `preferredContactDate` | string | No | Preferred contact date (e.g. `"2026-07-15"`) |
| `preferredContactSlot` | string | No | Time slot preference (`"Morning"`, `"Afternoon"`, `"Evening"`, `"Custom"`) |
| `preferredContactCustomTime` | string | No | Custom time if slot is `"Custom"` (e.g. `"3:30 PM"`) |

---

## Example Request

### Qualify Form (debt form)

```http
POST https://olivialms.cloud/api/webhook/ben-leads
Content-Type: application/json
x-api-key: d30b9786ca66bb5326588e875c57ca3808e213880e30610ad0f67b7216cecae6

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "5551234567",
  "totalDebtAmount": 25000,
  "streetAddress": "123 Main St",
  "city": "Los Angeles",
  "state": "CA",
  "zipCode": "90001",
  "smsOptIn": true,
  "preferredContactDate": "2026-07-15",
  "preferredContactSlot": "Morning"
}
```

### Contact Form (message form)

```http
POST https://olivialms.cloud/api/webhook/ben-leads
Content-Type: application/json
x-api-key: d30b9786ca66bb5326588e875c57ca3808e213880e30610ad0f67b7216cecae6

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "5559876543",
  "message": "I would like to learn more about your debt relief services.",
  "smsOptIn": false
}
```

---

## Success Response

```json
HTTP 201 Created

{
  "success": true,
  "message": "Thank you! Your submission has been received."
}
```

---

## Error Responses

| HTTP Status | Reason | Fix |
|-------------|--------|-----|
| `400 Bad Request` | `firstName` is missing or too short | Include `firstName` in the body |
| `401 Unauthorized` | Missing or invalid `x-api-key` header | Check the API key value |
| `429 Too Many Requests` | Rate limit exceeded (100 requests per 15 minutes per IP) | Slow down request rate |
| `500 Internal Server Error` | Server-side error | Contact the LMS team |

---

## Code Examples

### JavaScript / Node.js (fetch)

```javascript
const response = await fetch('https://olivialms.cloud/api/webhook/ben-leads', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'd30b9786ca66bb5326588e875c57ca3808e213880e30610ad0f67b7216cecae6'
  },
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '5551234567',
    totalDebtAmount: 25000,
    smsOptIn: true
  })
});

const data = await response.json();
console.log(data); // { success: true, message: "Thank you! ..." }
```

### PHP

```php
$payload = json_encode([
    'firstName'       => 'John',
    'lastName'        => 'Doe',
    'email'           => 'john@example.com',
    'phone'           => '5551234567',
    'totalDebtAmount' => 25000,
    'smsOptIn'        => true,
]);

$ch = curl_init('https://olivialms.cloud/api/webhook/ben-leads');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: d30b9786ca66bb5326588e875c57ca3808e213880e30610ad0f67b7216cecae6',
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
```

### Python

```python
import requests

response = requests.post(
    'https://olivialms.cloud/api/webhook/ben-leads',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': 'd30b9786ca66bb5326588e875c57ca3808e213880e30610ad0f67b7216cecae6'
    },
    json={
        'firstName': 'John',
        'lastName': 'Doe',
        'email': 'john@example.com',
        'phone': '5551234567',
        'totalDebtAmount': 25000,
        'smsOptIn': True
    }
)
print(response.json())
```

---

## Notes

- Leads submitted via this webhook are stored in a **separate collection** visible only to Ben's organisation and the main admin.
- The form type is automatically detected: if `message` is present → **Contact Form**; otherwise → **Qualify Form**.
- Phone numbers are automatically stripped of spaces, dashes, and brackets.
- Emails are automatically lowercased and sanitised.
- All leads appear in real-time on the **Ben Website Leads** panel of the admin dashboard.

---

## Support

For any integration issues, contact the LMS technical team.
