import { config } from '../config';

interface VapiCallResponse {
  id: string;
  status: string;
  /** Additional Vapi response fields */
  [key: string]: unknown;
}

/**
 * Trigger a welcome call via Vapi.ai after user signup.
 *
 * Vapi outbound call API:
 * POST https://api.vapi.ai/call
 * Body: { phoneNumberId?, customer: { number: "+1234567890" }, assistantId: "..." }
 */
export async function triggerWelcomeCall(phone: string, firstName: string): Promise<void> {
  if (!config.vapi.apiKey || !config.vapi.agentId) {
    console.log(`[VAPI] Vapi not configured. Would call ${phone} to welcome ${firstName}`);
    return;
  }

  // Normalize phone to E.164 format
  let normalizedPhone = phone.replace(/[^+\d]/g, '');
  if (!normalizedPhone.startsWith('+')) {
    // If US number without +1, add it
    if (normalizedPhone.length === 10) {
      normalizedPhone = `+1${normalizedPhone}`;
    } else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
      normalizedPhone = `+${normalizedPhone}`;
    } else {
      normalizedPhone = `+${normalizedPhone}`;
    }
  }

  try {
    const response = await fetch(`${config.vapi.baseUrl}/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.vapi.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: config.vapi.agentId,
        customer: {
          number: normalizedPhone,
        },
        // Pass user context so the AI agent can personalize the call
        metadata: {
          firstName,
          source: 'mediconnect-signup',
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[VAPI] API error ${response.status}: ${errBody}`);
      return;
    }

    const data: VapiCallResponse = await response.json();
    console.log(`[VAPI] Welcome call initiated: id=${data.id}, status=${data.status}, to=${normalizedPhone}`);
  } catch (error) {
    console.error('[VAPI] Failed to trigger welcome call:', error);
    // Don't throw — Vapi failure shouldn't block registration
  }
}
