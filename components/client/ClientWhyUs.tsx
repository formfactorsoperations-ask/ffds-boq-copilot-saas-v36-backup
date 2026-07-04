
import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheckIcon, CheckBadgeIcon, SparklesIcon, TrophyIcon } from '../Icons';
import { useOrg } from '../../contexts/OrgContext';

const features = [
    {
        title: "Minimal Design, Maximum Impact",
        desc: "Our core philosophy. We believe in decluttered spaces where every element serves a purpose, ensuring your home feels open, serene, and sophisticated.",
        icon: <SparklesIcon className="w-6 h-6 text-emerald-600" />
    },
    {
        title: "Bespoke Craftsmanship",
        desc: "We specialize in custom, on-site joinery. Unlike factory-made modules, our furniture is tailored to the exact millimetre of your space's unique quirks.",
        icon: <TrophyIcon className="w-6 h-6 text-emerald-600" />
    },
    {
        title: "Brand Warranty Protection",
        desc: "We use only genuine materials from trusted brands like Hettich, Merino, and Asian Paints. All manufacturer warranties are passed directly to you.",
        icon: <ShieldCheckIcon className="w-6 h-6 text-emerald-600" />
    },
    {
        title: "Transparent Commercials",
        desc: "No hidden costs. The price you see in the final detailed BOQ is the price you pay. We value integrity over upselling.",
        icon: <CheckBadgeIcon className="w-6 h-6 text-emerald-600" />
    }
];

const ClientWhyUs: React.FC = () => {
    const MotionDiv = motion.div as any;
    const { orgData } = useOrg();

    return (
        <section className="py-20 px-6 md:px-20 bg-indigo-950 text-white print-section">
            <div className="max-w-5xl mx-auto">
                <div className="mb-12 md:text-center max-w-3xl mx-auto">
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">The {orgData?.orgName ? orgData.orgName.split(' ')[0] : 'Studio'} Approach</p>
                    <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">Designed for Life. Built to Last.</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Interior design is more than just aesthetics; it's about solving problems elegantly. 
                        Here is how we ensure your journey is as refined as the destination.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {features.map((feature, idx) => (
                        <MotionDiv 
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-white/5 border border-white/10 p-6 rounded-2xl flex gap-5 items-start hover:bg-white/10 transition-colors"
                        >
                            <div className="p-3 bg-indigo-900 rounded-xl border border-slate-700 shrink-0">
                                {feature.icon}
                            </div>
                            <div>
                                <h4 className="font-bold text-lg mb-2">{feature.title}</h4>
                                <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
                            </div>
                        </MotionDiv>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ClientWhyUs;
