# TruClick Media — Inbound Leads Webhook Integration Guide

## Overview
When a user submits a form on TruClick Media's website, Facebook Lead Ad, or landing page, send an HTTP `POST` request to the webhook endpoint below.

Leads received will be instantly delivered and displayed separately on the **TruClick Media Leads** dashboard and to the main LMS organisation in real-time.

---

## Webhook Endpoint

```http
POST https://olivialms.cloud/api/webhook/truclick-leads
```

*(Alternative alias: `https://olivialms.cloud/api/webhook/leads`)*

---

## Authentication & Headers

Every request must include your unique `x-api-key`.

| Header | Value | Description |
|---|---|---|
| `x-api-key` | `<YOUR_TRUCLICK_API_KEY>` | Generated in Olivia LMS under Organization Management |
| `Content-Type` | `application/json` | Required |

*Note: You may also pass the key as `Authorization: Bearer <API_KEY>` or as a query parameter `?api_key=<API_KEY>`.*

> ⚠️ **Security Notice:** Keep the API key secure on your backend or webhook service.

---

## Flexible Data Acceptance

**The webhook accepts ANY data format and field naming conventions.** 

Whether you use camelCase (`firstName`, `totalDebtAmount`), snake_case (`first_name`, `total_debt_amount`), or standard names, all variations are automatically recognized and normalized. Any additional custom fields you send will be fully preserved in the lead's raw payload.

### Recognized Fields:

| Information | Accepted Field Names | Format / Examples |
|---|---|---|
| **Name** | `firstName`, `first_name`, `fname` + `lastName`, `last_name`, `lname`<br>— OR —<br>`name`, `fullName`, `full_name`, `contact_name` | `"John Doe"` or `"John"` / `"Doe"` |
| **Phone** | `phone`, `phoneNumber`, `phone_number`, `mobile`, `telephone`, `cell`, `contact_number` | `"5551234567"`, `"+1 (555) 123-4567"` |
| **Email** | `email`, `emailAddress`, `email_address`, `mail` | `"john.doe@example.com"` |
| **Debt / Amount** | `totalDebtAmount`, `total_debt_amount`, `debtAmount`, `debt_amount`, `debt`, `total_debt`, `loanAmount`, `amount` | `35000`, `"$35,000"`, `"25,000+"` |
| **Message / Notes** | `message`, `notes`, `comments`, `description`, `details`, `inquiry`, `remark` | `"Looking for debt consolidation"` |
| **Address** | `streetAddress`, `street_address`, `address`, `address1` | `"123 Main St"` |
| **City** | `city`, `town` | `"Dallas"` |
| **State** | `state`, `province`, `state_code` | `"TX"`, `"Texas"` |
| **ZIP Code** | `zipCode`, `zip_code`, `zip`, `postalCode`, `postal_code` | `"75001"` |
| **SMS Consent** | `smsOptIn`, `sms_opt_in`, `smsConsent`, `optIn` | `true` / `false` |
| **Preferred Contact** | `preferredContactDate`, `preferredContactSlot` (`"Morning"`, `"Afternoon"`, `"Evening"`), `preferredContactCustomTime` | `"2026-08-25"`, `"Morning"`, `"3:30 PM"` |
| **Custom Data** | Any other key/value pairs | Stored intact in full lead record |

---

## Code Examples

### 1. cURL / Webhook Automation (Zapier, Make, Pabbly)
```bash
curl -X POST https://olivialms.cloud/api/webhook/truclick-leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TRUCLICK_API_KEY" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "(555) 123-4567",
    "debt_amount": "$35,000",
    "street_address": "123 Main St",
    "city": "Dallas",
    "state": "TX",
    "zip_code": "75001",
    "sms_opt_in": true,
    "preferred_contact_slot": "Morning",
    "notes": "Looking for unsecured debt assistance"
  }'
```

### 2. Node.js (Axios / Fetch)
```javascript
const axios = require('axios');

async function sendTruClickLead(payload) {
  try {
    const response = await axios.post(
      'https://olivialms.cloud/api/webhook/truclick-leads',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'YOUR_TRUCLICK_API_KEY',
        },
      }
    );
    console.log('Lead delivered successfully:', response.data);
  } catch (error) {
    console.error('Delivery error:', error.response?.data || error.message);
  }
}
```

### 3. PHP / WordPress Contact Form 7 / Gravity Forms
```php
<?php
$leadData = array(
    'firstName'       => $_POST['first_name'] ?? '',
    'lastName'        => $_POST['last_name'] ?? '',
    'email'           => $_POST['email'] ?? '',
    'phone'           => $_POST['phone'] ?? '',
    'totalDebtAmount' => $_POST['debt_amount'] ?? '',
    'city'            => $_POST['city'] ?? '',
    'state'           => $_POST['state'] ?? '',
    'zipCode'         => $_POST['zip_code'] ?? '',
    'message'         => $_POST['message'] ?? '',
    'smsOptIn'        => true
);

$options = array(
    'http' => array(
        'header'  => "Content-Type: application/json\r\n" .
                     "x-api-key: YOUR_TRUCLICK_API_KEY\r\n",
        'method'  => 'POST',
        'content' => json_encode($leadData),
    ),
);

$context = stream_context_create($options);
$response = file_get_contents('https://olivialms.cloud/api/webhook/truclick-leads', false, $context);
?>
```

---

## Response

### Success (`201 Created`)
```json
{
  "success": true,
  "message": "Thank you! Your submission has been received.",
  "leadId": "66c56b829e0b123456789abc"
}
```

### Authentication Error (`401 Unauthorized`)
```json
{
  "success": false,
  "message": "Invalid or inactive API key."
}
```
