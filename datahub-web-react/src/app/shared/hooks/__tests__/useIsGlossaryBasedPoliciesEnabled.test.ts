import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useIsGlossaryBasedPoliciesEnabled } from '@app/shared/hooks/useIsGlossaryBasedPoliciesEnabled';

// Mock useAppConfig so the hook can be tested in isolation
vi.mock('@app/useAppConfig', () => ({
    useAppConfig: vi.fn(),
}));

// Re-import after mock so we get the mocked version
import { useAppConfig } from '@app/useAppConfig';

const mockUseAppConfig = useAppConfig as ReturnType<typeof vi.fn>;

describe('useIsGlossaryBasedPoliciesEnabled', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when glossaryBasedPoliciesEnabled feature flag is true', () => {
        mockUseAppConfig.mockReturnValue({
            config: {
                featureFlags: {
                    glossaryBasedPoliciesEnabled: true,
                },
            },
        });

        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());

        expect(result.current).toBe(true);
    });

    it('returns false when glossaryBasedPoliciesEnabled feature flag is false', () => {
        mockUseAppConfig.mockReturnValue({
            config: {
                featureFlags: {
                    glossaryBasedPoliciesEnabled: false,
                },
            },
        });

        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());

        expect(result.current).toBe(false);
    });

    it('returns undefined when the feature flag is not set', () => {
        mockUseAppConfig.mockReturnValue({
            config: {
                featureFlags: {},
            },
        });

        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());

        expect(result.current).toBeUndefined();
    });

    it('reads the flag from config.featureFlags.glossaryBasedPoliciesEnabled', () => {
        mockUseAppConfig.mockReturnValue({
            config: {
                featureFlags: {
                    glossaryBasedPoliciesEnabled: true,
                    someOtherFlag: false,
                },
            },
        });

        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());

        // Should read only the specific flag, not other flags
        expect(result.current).toBe(true);
        expect(mockUseAppConfig).toHaveBeenCalledTimes(1);
    });
});
