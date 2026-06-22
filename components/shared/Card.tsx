import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  titleIcon?: React.ReactNode;
  id?: string;
  noAnimation?: boolean;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, titleIcon, id, noAnimation = false, onClick }) => {
  const MotionDiv = motion.div as any;
  return (
    <MotionDiv 
        id={id} 
        initial={noAnimation ? {} : { opacity: 0, y: 15 }}
        whileInView={noAnimation ? {} : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`glass-light rounded-2xl p-6 hover:shadow-[0_15px_30px_-5px_rgba(0,0,0,0.08)] transition-shadow duration-300 ${className}`}
        onClick={onClick}
    >
        {title && (
            <div className="flex items-center gap-3 mb-6">
                {titleIcon && (
                    <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100 shadow-sm">
                        {titleIcon}
                    </div>
                )}
                <h4 className="text-lg font-bold text-slate-800 tracking-tight flex-1 w-full">
                    {title}
                </h4>
            </div>
        )}
      {children}
    </MotionDiv>
  );
};

export default Card;