import React from 'react';
import * as LucideIcons from 'lucide-react';

export * from 'lucide-react';

export type IconProps = LucideIcons.LucideProps;
export type LucideIcon = LucideIcons.LucideIcon;
export type LucideProps = LucideIcons.LucideProps;
export type IconNode = any;
export type LucideIconNode = any;

export const CheckIcon: LucideIcons.LucideIcon = (LucideIcons as any).CheckIcon || LucideIcons.Check;
export const ShieldCheckIcon: LucideIcons.LucideIcon = (LucideIcons as any).ShieldCheckIcon || LucideIcons.ShieldCheck;
export const HelpCircleIcon: LucideIcons.LucideIcon = (LucideIcons as any).HelpCircleIcon || (LucideIcons as any).HelpCircle || (LucideIcons as any).CircleHelp;
export const FolderIcon: LucideIcons.LucideIcon = (LucideIcons as any).FolderIcon || LucideIcons.Folder;
export const XIcon: LucideIcons.LucideIcon = (LucideIcons as any).XIcon || LucideIcons.X;

export const Icon: React.FC<{ name: string } & LucideIcons.LucideProps> = ({ name, ...props }) => {
  const Comp =
    (LucideIcons as any)[name] ||
    (LucideIcons as any)[name + 'Icon'] ||
    (LucideIcons as any)[name.charAt(0).toUpperCase() + name.slice(1)] ||
    (LucideIcons as any).HelpCircle ||
    (LucideIcons as any).CircleHelp ||
    LucideIcons.Circle;
  return <Comp {...props} />;
};

export function createIcon(name: string): LucideIcons.LucideIcon {
  const Comp =
    (LucideIcons as any)[name] ||
    (LucideIcons as any)[name + 'Icon'] ||
    (LucideIcons as any)[name.charAt(0).toUpperCase() + name.slice(1)] ||
    (LucideIcons as any).HelpCircle ||
    (LucideIcons as any).CircleHelp ||
    LucideIcons.Circle;
  return Comp;
}
