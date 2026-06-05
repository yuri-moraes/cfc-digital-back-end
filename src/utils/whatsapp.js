import { logger } from './logger.js';

export async function sendWhatsApp(phoneNumber, message) {
  if (!process.env.ZAPI_INSTANCE_ID) return;

  const url = `${process.env.ZAPI_BASE_URL}/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-text`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneNumber, message }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn({ phone: phoneNumber, status: response.status }, 'WhatsApp send failed');
    }
  } catch (err) {
    logger.warn({ phone: phoneNumber, err }, 'WhatsApp send error');
  } finally {
    clearTimeout(timeoutId);
  }
}
