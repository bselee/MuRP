import { createLogger, logger } from '../logger';

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('should create a logger with context', () => {
      const contextLogger = createLogger('TestContext');
      contextLogger.info('test message');
      
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('TestContext')
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('test message')
      );
    });
  });

  describe('log levels', () => {
    it('should log debug messages', () => {
      logger.debug('debug message');
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      logger.info('info message');
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      logger.warn('warn message');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include metadata in logs', () => {
      const metadata = { userId: '123', action: 'test' };
      logger.info('test with metadata', metadata);
      
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"123"')
      );
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      logger.error('error occurred', error);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
    });
  });

  describe('structured logging', () => {
    it('should produce valid JSON output', () => {
      logger.info('test message');
      
      const callArg = consoleInfoSpy.mock.calls[0][0];
      expect(() => JSON.parse(callArg)).not.toThrow();
      
      const parsed = JSON.parse(callArg);
      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('message', 'test message');
      expect(parsed).toHaveProperty('timestamp');
    });
  });
});
