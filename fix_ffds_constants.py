with open('constants.ts', 'r') as f:
    content = f.read()

content = content.replace("How FFDS takes you from ideas to a locked plan (before execution)", "How we take you from ideas to a locked plan (before execution)")
content = content.replace("At FFDS, design is not treated as an add-on. It is the framework that controls scope, cost overruns, and execution quality.", "For us, design is not treated as an add-on. It is the framework that controls scope, cost overruns, and execution quality.")
content = content.replace("whether FFDS should proceed", "whether we should proceed")

with open('constants.ts', 'w') as f:
    f.write(content)

with open('index.html', 'r') as f:
    content = f.read()

content = content.replace("FFDS BOQ Copilot", "Studio Copilot")

with open('index.html', 'w') as f:
    f.write(content)

with open('vite.config.ts', 'r') as f:
    content = f.read()

content = content.replace("'FFDS Execution Hub'", "'Studio Execution Hub'")
content = content.replace("'FFDS Hub'", "'Studio Hub'")

with open('vite.config.ts', 'w') as f:
    f.write(content)

with open('App.tsx', 'r') as f:
    content = f.read()

content = content.replace(" - FFDS Proposal", " - Proposal")

with open('App.tsx', 'w') as f:
    f.write(content)

with open('server.ts', 'r') as f:
    content = f.read()

content = content.replace("for FFDS BOQ Copilot, an interior design studio", "for an interior design studio")
content = content.replace("between a client and an interior design firm (FFDS)", "between a client and an interior design firm")
content = content.replace("between the design studio (FFDS) and the client", "between the design studio and the client")

with open('server.ts', 'w') as f:
    f.write(content)
