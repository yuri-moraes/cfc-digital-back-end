import { jest } from '@jest/globals';
import { sendWhatsApp } from '../src/utils/whatsapp.js';
import { logger } from '../src/utils/logger.js';

describe('sendWhatsApp', () => {
  let originalEnv;
  let loggerWarnSpy;

  beforeAll(() => {
    originalEnv = { ...process.env };
    // Spy on logger.warn and mock its implementation
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    loggerWarnSpy.mockRestore();
  });

  test('should return immediately (no-op) if ZAPI_INSTANCE_ID is unset', async () => {
    delete process.env.ZAPI_INSTANCE_ID;
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => {});

    await sendWhatsApp('5511999999999', 'Hello world');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('should call fetch when ZAPI_INSTANCE_ID is set', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst-123';
    process.env.ZAPI_BASE_URL = 'https://api.z-api.io';
    process.env.ZAPI_TOKEN = 'token-abc';

    const mockResponse = { ok: true };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    await sendWhatsApp('5511999999999', 'Hello world');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.z-api.io/inst-123/token/token-abc/send-text',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '5511999999999', message: 'Hello world' }),
      }
    );
    fetchSpy.mockRestore();
  });

  test('should log warning if response is not ok', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst-123';
    process.env.ZAPI_BASE_URL = 'https://api.z-api.io';
    process.env.ZAPI_TOKEN = 'token-abc';

    const mockResponse = { ok: false, status: 400 };
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    await sendWhatsApp('5511999999999', 'Hello world');

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      { phone: '5511999999999', status: 400 },
      'WhatsApp send failed'
    );
    fetchSpy.mockRestore();
  });

  test('should log error if fetch throws', async () => {
    process.env.ZAPI_INSTANCE_ID = 'inst-123';
    process.env.ZAPI_BASE_URL = 'https://api.z-api.io';
    process.env.ZAPI_TOKEN = 'token-abc';

    const error = new Error('Network failure');
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(error);

    await sendWhatsApp('5511999999999', 'Hello world');

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      { phone: '5511999999999', err: error },
      'WhatsApp send error'
    );
    fetchSpy.mockRestore();
  });
});
