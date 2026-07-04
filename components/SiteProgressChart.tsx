import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { FullProjectData } from '../types';

interface ProgressData {
    date: Date;
    progress: number;
}

export function SiteProgressChart({ project }: { project?: FullProjectData }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 300, height: 200 });

    useEffect(() => {
        if (!wrapperRef.current) return;
        
        const resizeObserver = new ResizeObserver(entries => {
            if (!Array.isArray(entries) || !entries.length) return;
            const { width } = entries[0].contentRect;
            setDimensions(prev => ({ ...prev, width }));
        });
        
        resizeObserver.observe(wrapperRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (!svgRef.current || !wrapperRef.current) return;

        const now = new Date();
        const data: ProgressData[] = [];
        
        let completionPct = 45; // default 45%
        if (project?.activeProject?.executionData?.bundles) {
            const totalBundles = project.activeProject.executionData.bundles.length;
            const completedBundles = project.activeProject.executionData.bundles.filter((b: any) => b.status === 'completed').length;
            completionPct = totalBundles > 0 ? (completedBundles / totalBundles) * 100 : 45;
        }

        let p = 0;
        for(let i=30; i>=0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            
            // Randomly increase progress, keeping it somewhat linear/s-curve like
            if (i > 0) {
                p += Math.random() * (completionPct / 20); 
            } else {
                p = completionPct; // ensure last point hits exact completion
            }
            if(p > completionPct) p = completionPct;
            
            data.push({date, progress: p});
        }

        const width = dimensions.width || 300;
        const height = dimensions.height;
        const margin = { top: 20, right: 20, bottom: 30, left: 30 };

        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Clear previous SVG contents
        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current)
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleTime()
            .domain(d3.extent(data, d => d.date) as [Date, Date])
            .range([0, innerWidth]);

        const y = d3.scaleLinear()
            .domain([0, 100])
            .range([innerHeight, 0]);

        // Add axes
        const xAxis = d3.axisBottom(x)
            .ticks(5)
            .tickFormat((d) => d3.timeFormat('%d %b')(d as Date));
            
        const yAxis = d3.axisLeft(y)
            .ticks(5)
            .tickFormat(d => `${d}%`);

        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .attr('color', '#94a3b8')
            .call(xAxis)
            .call(g => g.select(".domain").attr("stroke", "#e2e8f0"))
            .selectAll('text')
            .attr('fill', '#64748b')
            .style('font-size', '10px');

        g.append('g')
            .attr('color', '#94a3b8')
            .call(yAxis)
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").attr("stroke", "#f1f5f9").attr("x2", innerWidth))
            .selectAll('text')
            .attr('fill', '#64748b')
            .style('font-size', '10px');

        // Create line
        const line = d3.line<ProgressData>()
            .x(d => x(d.date))
            .y(d => y(d.progress))
            .curve(d3.curveMonotoneX);

        // Add area under line
        const area = d3.area<ProgressData>()
            .x(d => x(d.date))
            .y0(innerHeight)
            .y1(d => y(d.progress))
            .curve(d3.curveMonotoneX);

        // Define gradient
        const defs = svg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'area-gradient')
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');
        
        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', '#4f46e5') // indigo-600
            .attr('stop-opacity', 0.15);
            
        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', '#4f46e5')
            .attr('stop-opacity', 0);

        // Draw area
        g.append('path')
            .datum(data)
            .attr('fill', 'url(#area-gradient)')
            .attr('d', area);

        // Draw line
        g.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', '#4f46e5') // indigo-600
            .attr('stroke-width', 2.5)
            .attr('d', line);

        // Add circle at the end
        const lastPoint = data[data.length - 1];
        if (lastPoint) {
            g.append('circle')
                .attr('cx', x(lastPoint.date))
                .attr('cy', y(lastPoint.progress))
                .attr('r', 4)
                .attr('fill', '#ffffff')
                .attr('stroke', '#4f46e5')
                .attr('stroke-width', 2);
        }

    }, [project, dimensions]);

    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Site Progress vs Time</h3>
            <div ref={wrapperRef} className="w-full flex-1 min-h-[200px]">
                <svg ref={svgRef} className="w-full h-full overflow-visible"></svg>
            </div>
        </div>
    );
}
