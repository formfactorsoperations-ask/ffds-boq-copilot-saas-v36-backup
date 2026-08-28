with open('App.tsx', 'r') as f:
    content = f.read()

target = """                <MotionDiv
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >"""

replacement = """                <MotionDiv
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >"""

with open('App.tsx', 'w') as f:
    f.write(content.replace(target, replacement))

print("Fixed App.tsx")
