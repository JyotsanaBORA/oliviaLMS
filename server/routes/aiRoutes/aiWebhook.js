const express = require('express');
const router = express.Router();
const Lead = require('../../models/Lead');
const { getEasternNow } = require('../../utils/timeFilters');
// const axios = require('axios'); // For hitting Vicidial if needed

// POST /api/webhook/ai-voice
router.post('/ai-voice', async (req, res) => {
    try {
        const { vicidial_lead_id, phone, ai_disposition, collected_data } = req.body;

        console.log(`[AI Webhook] Received call data for ${phone} with status: ${ai_disposition}`);

        // 1. Check if the lead already exists in MongoDB, or create a new one
        // Search by phone, ignoring non-numeric characters if needed, but exact match for now
        let lead = await Lead.findOne({ phone: phone });
        
        let isNewLead = false;
        if (!lead) {
            // Create a brand new lead profile if it doesn't exist
            lead = new Lead({
                phone: phone,
                source: "AI Voice Platform",
                createdAt: getEasternNow(),
                // Use the custom field we often use for source references or notes
                clientId: vicidial_lead_id ? vicidial_lead_id.toString() : undefined
            });
            isNewLead = true;
        }

        // 2. Update the Lead with the AI's disposition and gathered data
        lead.leadProgressStatus = ai_disposition;
        lead.disposition1 = ai_disposition;
        
        // Mark as disposed so it clears out of active lists
        lead.isDisposed = true; 
        lead.status = "Dead"; // Typically Dead for disposed leads in this LMS
        lead.lastUpdatedAt = getEasternNow();
        lead.lastUpdatedBy = "AI Voice Platform";
        
        // Save the dynamic answers the AI collected (debt amount, etc.)
        if (collected_data) {
            if (collected_data.total_debt) {
                lead.totalDebtAmount = collected_data.total_debt;
            }
            if (collected_data.employment_status) {
                const empNote = `Employment: ${collected_data.employment_status}`;
                lead.notes = lead.notes ? `${lead.notes}\n${empNote}` : empNote;
            }
            // Add any other fields you want to save from the AI's conversation
        }

        await lead.save();

        // 3. Emit real-time update to dashboards so LMS users see it instantly
        if (req.io) {
            if (isNewLead) {
                req.io.emit('leadCreated', { lead, createdBy: "AI Voice Platform" });
            } else {
                req.io.emit('leadUpdated', { lead, updatedBy: "AI Voice Platform" });
            }
        }

        // 4. (Optional) Fire Vicidial Non-Agent API to update reporting
        // If your business needs Vicidial to know the disposition, you can hit it here
        /*
        await axios.get(`http://your-vicidial/vicidial/non_agent_api.php`, {
            params: {
                source: 'api',
                user: '6666',
                pass: '1234',
                function: 'update_lead',
                lead_id: vicidial_lead_id,
                status: ai_disposition
            }
        });
        */

        // 5. Respond to the AI with a 200 OK so it knows the webhook was received
        return res.status(200).json({ success: true, message: "Lead updated successfully" });

    } catch (error) {
        console.error("[AI Webhook Error]", error);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

module.exports = router;
