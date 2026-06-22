import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test } from 'vitest';

// We import the component but provide a mock for OrgContext
import ProjectContextCard from '../../components/ProjectContextCard';
import { OrgProvider } from '../../contexts/OrgContext';

test('ProjectContextCard area parsing does not multiply by 10 (1200 -> 1200)', () => {
    
    const Wrapper = () => {
        const [context, setContext] = useState({ area: 0, rooms: [] } as any);
        return (
            <OrgProvider>
                <ProjectContextCard projectContext={context} setProjectContext={setContext} aiStrategy="balanced" />
                <div data-testid="output">{context.area}</div>
            </OrgProvider>
        );
    }

    render(<Wrapper />);
    const areaInput = screen.getByDisplayValue('0') as HTMLInputElement;
    fireEvent.change(areaInput, { target: { value: '1200' } });
    
    expect(screen.getByTestId('output').textContent).toBe('1200');
});
