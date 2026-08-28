import re

with open('components/ExecutionWorkspace.tsx', 'r') as f:
    content = f.read()

# Add import
import_pattern = r"import \{\s*motion,\s*AnimatePresence\s*\} from \"framer-motion\";"
import_replacement = """import { motion, AnimatePresence } from "framer-motion";
import RoomProgressTracker from "./ops/RoomProgressTracker";"""
if "RoomProgressTracker" not in content:
    content = re.sub(import_pattern, import_replacement, content)

ui_target = r"(<button\s+type=\"button\"\s+onClick=\{[^}]+\}\s+className=\{`[^`]+`\}\s*>\s*<Check className=\{`[^`]+`\} />\s*<span>\{projectContext\?\.handoverDate \? 'Handed Over' : 'Mark Handover'\}</span>\s*</button>\s*</div>\s*</div>\s*</div>\s*</div>\s*</div>)"
ui_replacement = """\\1
      {/* Room Progress Sync Tool */}
      <RoomProgressTracker projectContext={projectContext} setProjectContext={setProjectContext} />"""
content = re.sub(ui_target, ui_replacement, content)

with open('components/ExecutionWorkspace.tsx', 'w') as f:
    f.write(content)
