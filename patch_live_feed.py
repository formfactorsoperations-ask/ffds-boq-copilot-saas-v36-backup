import re

with open('components/ClientPortal.tsx', 'r') as f:
    content = f.read()

# Target liveFeed dependency array
dep_pattern = r"\}\, \[siteUpdates, displayUpdates, milestones, decisions\]\);"
dep_replacement = "}, [siteUpdates, displayUpdates, milestones, decisions, context.momHistory]);"
content = re.sub(dep_pattern, dep_replacement, content)

# Target the end of decisions in liveFeed
insert_pattern = r"(// 4\. Client Decisions.*?\}\);\s*)(return feed\.sort)"
insert_replacement = """\\1
        // 5. Meeting Minutes (MOM)
        const momHistory = context.momHistory || [];
        momHistory.forEach((mom: any, idx: number) => {
            if (mom.status === 'published' || mom.status === 'completed' || !mom.status) {
                feed.push({
                    id: `mom-${mom.id || idx}`,
                    type: 'meeting',
                    title: `Meeting Notes: ${mom.title || mom.type || 'Discussion'}`,
                    date: new Date(mom.date || Date.now()),
                    description: mom.summary || mom.notes || 'Meeting details and action items logged.',
                    status: 'completed',
                    data: mom
                });
            }
        });

        \\2"""
content = re.sub(insert_pattern, insert_replacement, content, flags=re.DOTALL)

with open('components/ClientPortal.tsx', 'w') as f:
    f.write(content)
