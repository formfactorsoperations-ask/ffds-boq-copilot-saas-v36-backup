with open('./components/TimelineTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("- FFDS Team", "- ${orgData?.orgName || 'The Studio'} Team")

with open('./components/TimelineTab.tsx', 'w') as f:
    f.write(content)
