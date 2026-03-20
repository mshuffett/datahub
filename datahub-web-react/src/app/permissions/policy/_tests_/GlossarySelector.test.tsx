import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import GlossarySelector from '@app/permissions/policy/GlossarySelector';
import { render } from '@utils/test-utils/customRender';

import { EntityType, PolicyMatchCondition, ResourceFilter } from '@types';

// Mock the GraphQL lazy query
const mockSearchGlossaryEntities = vi.fn();
vi.mock('@graphql/search.generated', () => ({
    useGetSearchResultsForMultipleLazyQuery: () => [
        mockSearchGlossaryEntities,
        { data: undefined },
    ],
}));

// Mock GlossaryBrowser — it has deep GraphQL dependencies
vi.mock('@app/glossaryV2/GlossaryBrowser/GlossaryBrowser', () => ({
    default: ({ selectTerm, selectNode }: { selectTerm: (urn: string, name: string) => void; selectNode: (urn: string, name: string) => void }) => (
        <div data-testid="glossary-browser">
            <button
                type="button"
                data-testid="select-term-btn"
                onClick={() => selectTerm('urn:li:glossaryTerm:test', 'Test Term')}
            >
                Select Term
            </button>
            <button
                type="button"
                data-testid="select-node-btn"
                onClick={() => selectNode('urn:li:glossaryNode:testGroup', 'Test Group')}
            >
                Select Node
            </button>
        </div>
    ),
}));

// Mock ClickOutside — just render children
vi.mock('@app/shared/ClickOutside', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock BrowserWrapper
vi.mock('@app/shared/tags/AddTagsTermsModal', () => ({
    BrowserWrapper: ({ children, isHidden }: { children: React.ReactNode; isHidden: boolean }) => (
        <div style={{ display: isHidden ? 'none' : 'block' }}>{children}</div>
    ),
}));

// Mock entity registry
const mockGetDisplayName = vi.fn().mockImplementation((_type, entity) => entity?.properties?.name || entity?.urn || 'Unknown');
vi.mock('@app/useEntityRegistry', () => ({
    useEntityRegistry: () => ({
        getDisplayName: mockGetDisplayName,
    }),
}));

// Mock policyUtils
vi.mock('@app/permissions/policy/policyUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@app/permissions/policy/policyUtils')>();
    return {
        ...actual,
        getFieldValues: vi.fn().mockReturnValue([]),
        setFieldValues: vi.fn().mockReturnValue({ criteria: [] }),
        createCriterionValueWithEntity: vi.fn().mockImplementation((urn, entity) => ({ value: urn, entity })),
    };
});

const emptyResources: ResourceFilter = {
    filter: {
        criteria: [],
    },
};

const resourcesWithGlossaryTerm: ResourceFilter = {
    filter: {
        criteria: [
            {
                field: 'GLOSSARY',
                values: [
                    {
                        value: 'urn:li:glossaryTerm:existing',
                        entity: {
                            urn: 'urn:li:glossaryTerm:existing',
                            type: EntityType.GlossaryTerm,
                        },
                    },
                ],
                condition: PolicyMatchCondition.Equals,
            },
        ],
    },
};

describe('GlossarySelector', () => {
    const mockSetResources = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders without crashing', () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows the policy description text', () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        expect(
            screen.getByText(/The policy will apply to resources with the chosen glossary terms/),
        ).toBeInTheDocument();
    });

    it('shows placeholder text on the Select input', () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        expect(
            screen.getByText('Select glossary terms or term groups to apply to specific resources.'),
        ).toBeInTheDocument();
    });

    it('calls searchGlossaryEntities when user types in search input', async () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'rev' } });

        await waitFor(() => {
            expect(mockSearchGlossaryEntities).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        input: expect.objectContaining({
                            types: [EntityType.GlossaryTerm, EntityType.GlossaryNode],
                            query: 'rev',
                        }),
                    }),
                }),
            );
        });
    });

    it('shows the GlossaryBrowser when input is focused and empty', async () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        const input = screen.getByRole('combobox');
        fireEvent.focus(input);

        await waitFor(() => {
            expect(screen.getByTestId('glossary-browser')).toBeInTheDocument();
        });
    });

    it('calls setResources with the selected term when selectTerm is triggered from browser', async () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        // Focus to show the browser
        const input = screen.getByRole('combobox');
        fireEvent.focus(input);

        await waitFor(() => {
            expect(screen.getByTestId('select-term-btn')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('select-term-btn'));

        expect(mockSetResources).toHaveBeenCalledWith(
            expect.objectContaining({
                filter: expect.any(Object),
            }),
        );
    });

    it('calls setResources when selectNode is triggered from browser', async () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        const input = screen.getByRole('combobox');
        fireEvent.focus(input);

        await waitFor(() => {
            expect(screen.getByTestId('select-node-btn')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('select-node-btn'));

        expect(mockSetResources).toHaveBeenCalled();
    });

    it('uses short query wildcard when search text is 2 characters or fewer', async () => {
        render(
            <BrowserRouter>
                <GlossarySelector resources={emptyResources} setResources={mockSetResources} />
            </BrowserRouter>,
        );

        const input = screen.getByRole('combobox');
        fireEvent.change(input, { target: { value: 'ab' } });

        await waitFor(() => {
            expect(mockSearchGlossaryEntities).toHaveBeenCalledWith(
                expect.objectContaining({
                    variables: expect.objectContaining({
                        input: expect.objectContaining({
                            query: '*',
                        }),
                    }),
                }),
            );
        });
    });
});
