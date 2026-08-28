import React from 'react';
import { motion } from 'framer-motion';
import { CardContainer, CardBody, CardItem } from '../ui/3d-card';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  titleIcon?: React.ReactNode;
  id?: string;
  noAnimation?: boolean;
  hover3d?: boolean;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, titleIcon, id, noAnimation = false, hover3d = false, onClick }) => {
  const MotionDiv = motion.div as any;

  const innerContent = (
    <>
      {title && (
        <CardItem translateZ={20} className="flex items-center gap-3 mb-6 w-full">
          {titleIcon && (
            <div className="p-2 bg-sky-50 rounded-xl text-[#0066CC] border border-sky-100 shadow-sm">
              {titleIcon}
            </div>
          )}
          <h4 className="text-lg font-bold text-slate-800 tracking-tight flex-1 w-full">
            {title}
          </h4>
        </CardItem>
      )}
      <CardItem translateZ={10} className="w-full">
        {children}
      </CardItem>
    </>
  );

  if (hover3d) {
    return (
      <CardContainer containerClassName="w-full py-0" className="w-full h-full" onClick={onClick}>
        <CardBody className={`glass-light rounded-2xl p-6 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.12)] transition-all duration-300 w-full h-full ${className}`}>
          {innerContent}
        </CardBody>
      </CardContainer>
    );
  }

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
                    <div className="p-2 bg-sky-50 rounded-xl text-[#0066CC] border border-sky-100 shadow-sm">
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