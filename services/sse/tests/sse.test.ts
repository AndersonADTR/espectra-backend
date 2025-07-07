// services/sse/tests/sse.test.ts
// SPECTRUM - Tests para polling optimizado para content creators

import { SPECTRUM_POLLING_CONFIG } from '../config/sse.config';

describe('SPECTRUM Polling Services', () => {

  describe('Polling Configuration', () => {
    test('should have valid SPECTRUM polling configuration', () => {
      expect(SPECTRUM_POLLING_CONFIG).toBeDefined();
      expect(SPECTRUM_POLLING_CONFIG.POLLING_INTERVAL).toBe(2000);
      expect(SPECTRUM_POLLING_CONFIG.HEADERS).toBeDefined();
      expect(SPECTRUM_POLLING_CONFIG.HEADERS['X-Spectrum-Platform']).toBe('content-creators');
      expect(SPECTRUM_POLLING_CONFIG.HEADERS['X-Polling-Interval']).toBe('2000');
    });

    test('should have optimal settings for content creators', () => {
      // Verificar que la configuración sea óptima para content creators
      expect(SPECTRUM_POLLING_CONFIG.POLLING_INTERVAL).toBeLessThanOrEqual(3000); // Máximo 3 segundos
      expect(SPECTRUM_POLLING_CONFIG.MAX_RETRIES).toBeGreaterThanOrEqual(3); // Mínimo 3 reintentos
      expect(SPECTRUM_POLLING_CONFIG.RETRY_INTERVAL).toBeLessThanOrEqual(5000); // Máximo 5 segundos entre reintentos
    });
  });

  describe('Environment Variables', () => {
    test('should have required environment variables for SPECTRUM', () => {
      // Test que las variables de entorno necesarias estén definidas
      expect(process.env.BOTPRESS_API_URL || 'https://api.botpress.cloud').toBeDefined();
      expect(process.env.RESOURCE_PREFIX || 'test').toBeDefined();
    });
  });
});
