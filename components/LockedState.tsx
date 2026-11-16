import React from 'react';
import { Lock, ArrowRight, CheckCircle2 } from '@/lib/lucide-shim';
import { EmptyState, Button, Chip } from './ui/kit';

interface LockedStateProps {
    title?: string;
    prerequisite?: string;
    why?: string;
    actionLabel?: string;
    onAction?: () => void;
    isEmptyState?: boolean;
    /** The icon in the chip; a lock when locked, a tick when empty. */
    icon?: React.ElementType;
    className?: string;
}

/*
  A screen that is locked, or has nothing in it yet. It used to be a hero of
  its own (a 64px circle, a 24px title, a pill button, half the viewport
  tall), a fifth way of saying "nothing here" next to the dashed boxes and
  plain sentences other screens used. It is now the screen kit's EmptyState
  (DESIGN.md "Screen kit", standardisation PR 7): the icon chip, a title,
  one line and one button. A locked screen says what opens it in an amber chip.
*/
export default function LockedState({
    title = "Module Locked",
    prerequisite = "Prerequisite Required",
    why = "Please complete the preceding steps to unlock this module.",
    actionLabel = "Go to Prerequisite",
    onAction,
    isEmptyState = false,
    icon,
    className,
}: LockedStateProps) {
    return (
        <EmptyState
            icon={icon || (isEmptyState ? CheckCircle2 : Lock)}
            title={title}
            className={`bg-white ${className || ''}`}
            text={
                <>
                    {why}
                    {!isEmptyState && prerequisite && (
                        <span className="block mt-2"><Chip tone="warn"><Lock className="w-3 h-3" aria-hidden /> Opens after {prerequisite}</Chip></span>
                    )}
                </>
            }
            action={onAction ? (
                <Button size="sm" variant={isEmptyState ? 'primary' : 'secondary'} icon={isEmptyState ? undefined : ArrowRight} onClick={onAction}>
                    {actionLabel}
                </Button>
            ) : undefined}
        />
    );
}
