import { LazyEnvValidator } from '../lazyEnvValidator';

describe('LazyEnvValidator Telemetry Silence Suite', () => {
    let validator: LazyEnvValidator;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        validator = new LazyEnvValidator();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('should completely suppress warnings when process.env.NODE_ENV matches production', () => {
        process.env.NODE_ENV = 'production';
        
        // Trigger implicit lookup fallback sequence
        validator.get('ENABLE_DEBUG_LOGS');
        
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should permit diagnostic traces inside development domains if debug mode is active', () => {
        process.env.NODE_ENV = 'development';
        process.env.ENABLE_DEBUG_LOGS = 'true';
        
        validator.get('ENABLE_DEBUG_LOGS');
        
        // Assert pipeline visibility diagnostics are running normally in debug mode
        expect(warnSpy).toHaveBeenCalledDefined();
    });
});