
import React from 'react';
import { motion } from 'framer-motion';
import { useOrg } from '../../contexts/OrgContext';

const ClientTestimonials: React.FC = () => {
    const MotionDiv = motion.div as any;
    const { orgData } = useOrg();

    const currentOrgShortName = orgData?.orgName ? orgData.orgName.split(' ')[0] : 'The Studio';

    const reviews = [
        {
            text: `The transparency was refreshing. The BOQ was detailed, and the final look matched the renders perfectly. ${currentOrgShortName} handled society permissions and execution seamlessly.`,
            author: "Rahul & Priya",
            project: "3BHK, Hiranandani Estate"
        },
        {
            text: "We were worried about timelines, but the team delivered early. The custom joinery work is flawless—it feels like the furniture was born in the house.",
            author: "Mr. Deshpande",
            project: "2BHK, Luxury Apartments"
        }
    ];

    return (
        <section className="py-20 px-6 md:px-20 bg-white border-t border-slate-100 print-section">
            <div className="max-w-4xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
                    {reviews.map((review, idx) => (
                        <MotionDiv 
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.2 }}
                            className="relative pl-6 border-l-2 border-slate-200"
                        >
                            <p className="text-slate-600 italic text-base leading-relaxed mb-4 font-serif">
                                "{review.text}"
                            </p>
                            <div>
                                <p className="font-bold text-slate-900 text-sm">{review.author}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{review.project}</p>
                            </div>
                        </MotionDiv>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ClientTestimonials;
