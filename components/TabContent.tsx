import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TabContentProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

const TabContent: React.FC<TabContentProps> = ({ id, activeTab, children, className = '' }) => {
  const isActive = id === activeTab;
  const MotionDiv = motion.div as any;
  return (
    <AnimatePresence>
      {isActive && (
        <MotionDiv
          id={id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className={className}
        >
          {children}
        </MotionDiv>
      )}
    </AnimatePresence>
  );
};

export default TabContent;