import React from "react";
import { FloatingDock } from "./ui/floating-dock";
import {
  Home,
  Terminal,
  Layers,
  Sparkles,
  GitBranch,
  Compass,
  FolderOpen
} from "lucide-react";

export default function FloatingDockDemo() {
  const links = [
    {
      title: "Home",
      icon: (
        <Home className="h-full w-full" />
      ),
      href: "#",
    },
    {
      title: "Ops Matrix",
      icon: (
        <Compass className="h-full w-full" />
      ),
      href: "#",
    },
    {
      title: "Documents",
      icon: (
        <FolderOpen className="h-full w-full" />
      ),
      href: "#",
    },
    {
      title: "Terminal",
      icon: (
        <Terminal className="h-full w-full" />
      ),
      href: "#",
    },
    {
      title: "Components",
      icon: (
        <Layers className="h-full w-full" />
      ),
      href: "#",
    },
    {
      title: "AI Studio",
      icon: (
        <Sparkles className="h-full w-full" />
      ),
      href: "#",
    },
    {
      title: "Changelog",
      icon: (
        <GitBranch className="h-full w-full" />
      ),
      href: "#",
    }
  ];

  return (
    <div className="flex items-center justify-center p-8 w-full">
      <FloatingDock
        mobileClassName="translate-y-0"
        items={links}
      />
    </div>
  );
}
