import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

# Add </AnimatePresence> after </motion.div>\n          )}
content = content.replace("          )}\n          </div>", "          )}\n      </AnimatePresence>\n          </div>")

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
